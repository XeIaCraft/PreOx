-- El Profesor : file d'extraction Gemini traitée côté serveur (la fenêtre
-- peut être fermée). Chaque chapitre mis en file est extrait tour à tour ;
-- un refus de quota du free tier (429) reporte simplement l'essai.
--
-- Déclencheur : pg_cron appelle toutes les 5 minutes la route
-- /api/cron/el-profesor-gemini-queue (pg_net), seulement si un chapitre
-- attend. L'URL du site et le secret CRON_SECRET sont lus dans le Vault :
--   select vault.create_secret('https://pre-ox.vercel.app', 'preox_site_url');
--   select vault.create_secret('<valeur de CRON_SECRET sur Vercel>', 'preox_cron_secret');

create table if not exists public.el_profesor_gemini_queue (
  chapter_id uuid primary key references public.el_profesor_chapters (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'running', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists el_profesor_gemini_queue_due_idx on public.el_profesor_gemini_queue (status, next_attempt_at, created_at);

alter table public.el_profesor_gemini_queue enable row level security;

drop policy if exists "el_profesor_gemini_queue_admin_only" on public.el_profesor_gemini_queue;
create policy "el_profesor_gemini_queue_admin_only" on public.el_profesor_gemini_queue
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.el_profesor_gemini_queue to authenticated;

-- Déclencheur toutes les 5 minutes (sans effet tant que la file est vide).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.el_profesor_gemini_queue_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  site text;
  secret text;
begin
  if not exists (
    select 1 from public.el_profesor_gemini_queue
    where (status = 'waiting' and next_attempt_at <= now())
       or (status = 'running' and started_at < now() - interval '10 minutes')
  ) then
    return;
  end if;
  select decrypted_secret into site from vault.decrypted_secrets where name = 'preox_site_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'preox_cron_secret' limit 1;
  if site is null or secret is null then
    raise warning 'El Profesor : secrets preox_site_url / preox_cron_secret absents du Vault, file Gemini non déclenchée.';
    return;
  end if;
  perform net.http_get(
    url := rtrim(site, '/') || '/api/cron/el-profesor-gemini-queue',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.el_profesor_gemini_queue_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'el-profesor-gemini-queue';
select cron.schedule('el-profesor-gemini-queue', '*/5 * * * *', $$select public.el_profesor_gemini_queue_tick()$$);
