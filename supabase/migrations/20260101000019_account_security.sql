-- Compte & sécurité : sessions actives + révocation, historique de
-- connexion (pour l'historique ET la détection de nouvel appareil), et
-- l'accès à auth.sessions nécessaire pour la 2FA/gestion de session.
--
-- `auth.sessions` est un schéma interne de Supabase Auth (GoTrue), non
-- exposé par l'API REST auto-générée. Il n'y a pas d'équivalent public
-- dans supabase-js pour "lister mes sessions actives" ou "en révoquer une
-- précisément" — la technique standard (documentée par la communauté
-- Supabase) est une fonction `security definer` dans le schéma `public`
-- qui lit/écrit `auth.sessions` avec les privilèges du propriétaire de la
-- fonction (postgres), tout en restant strictement filtrée sur
-- `auth.uid()` côté appelant. Si Supabase change ce schéma interne, ces
-- deux fonctions devront être adaptées.

create or replace function public.list_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    s.id,
    s.created_at,
    s.updated_at,
    s.user_agent,
    s.ip::text,
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
  order by s.updated_at desc;
$$;

comment on function public.list_my_sessions() is 'Lists the calling user''s own active Auth sessions (device/IP, most-recent-first). Reads auth.sessions directly since supabase-js has no public API for this.';

grant execute on function public.list_my_sessions() to authenticated;

create or replace function public.revoke_my_session(target_session_id uuid)
returns void
language sql
security definer
set search_path = public, auth
volatile
as $$
  delete from auth.sessions
  where id = target_session_id
    and user_id = auth.uid()
    and id <> nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

comment on function public.revoke_my_session(uuid) is 'Deletes one of the calling user''s own OTHER sessions (never the current one — use normal sign-out for that), invalidating its refresh token.';

grant execute on function public.revoke_my_session(uuid) to authenticated;

-- Notre propre journal de connexion (indépendant de auth.audit_log_entries,
-- dont le champ ip_address est documenté comme peu fiable côté GoTrue, et
-- qui ne stocke pas le user_agent) : alimenté par la Server Action de
-- connexion elle-même, sert à la fois l'historique affiché à l'utilisateur
-- et la détection "nouvel appareil" pour l'alerte email.
create table public.user_login_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

comment on table public.user_login_log is 'Own login history, written by the login Server Action — used for the "historique de connexion" UI and new-device detection.';

create index user_login_log_user_id_created_at_idx on public.user_login_log (user_id, created_at desc);

alter table public.user_login_log enable row level security;

create policy "user_login_log_select_own"
  on public.user_login_log for select to authenticated
  using (auth.uid() = user_id);

create policy "user_login_log_insert_own"
  on public.user_login_log for insert to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.user_login_log to authenticated;
