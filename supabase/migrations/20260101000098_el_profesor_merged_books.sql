-- Fusion de livres (refonte des Notions, octobre 2026).
--
-- Une « notion » devient un livre fusionné : l'administrateur choisit des
-- livres de la bibliothèque, une IA (Gemini ou Claude, au choix) bâtit une
-- nouvelle table des matières pensée pour l'apprentissage (parties,
-- sous-parties, chapitres, fiches) puis fusionne, fiche par fiche, les
-- fiches des livres sources qui traitent du même sujet — sans perte
-- d'information, en citant chaque livre quand ils divergent.
--
-- Le livre fusionné vit dans les mêmes tables que les livres (chapitres,
-- sous-entités, fiches, blocs, flashcards) : lecture, révision FSRS,
-- édition, illustrations, cache hors ligne et synchronisation fonctionnent
-- donc à l'identique. Ce qui s'ajoute :
--   * books.kind = 'merged' et la liste des livres sources ;
--   * chapters : partie et sous-partie (table des matières à 4 niveaux) et
--     un source_kind 'merged' (pas de PDF propre : chaque citation pointe
--     vers le chapitre source et sa page) ;
--   * sub_entities.source_fiche_ids : les fiches sources fusionnées ;
--   * deux types de blocs : 'divergence' (ce que dit chaque livre quand ils
--     se contredisent) et 'a_retenir' (points à savoir par cœur) ;
--   * une suggestion d'illustration par bloc (quoi, et où la trouver) ;
--   * flashcards : cartes sources fusionnées, et statut 'replaced' pour une
--     carte source remplacée par une carte fusionnée publiée (elle sort de
--     toutes les files de révision, qui ne lisent que 'published') ;
--   * la file de travail de la fusion (jobs et tâches), relancée chaque
--     minute par pg_cron tant qu'une fusion est en cours (plusieurs passages
--     peuvent se chevaucher : chaque tâche est réservée avant d'être traitée).

-- ---------------------------------------------------------------------------
-- Livres, chapitres, fiches
-- ---------------------------------------------------------------------------

alter table public.el_profesor_books
  add column if not exists kind text not null default 'book' check (kind in ('book', 'merged')),
  add column if not exists source_book_ids uuid[] not null default '{}';

alter table public.el_profesor_chapters
  add column if not exists part_title text,
  add column if not exists sub_part_title text;

alter table public.el_profesor_chapters drop constraint if exists el_profesor_chapters_source_kind_check;
alter table public.el_profesor_chapters
  add constraint el_profesor_chapters_source_kind_check check (source_kind in ('pdf', 'docx', 'pptx', 'merged'));

alter table public.el_profesor_chapters drop constraint if exists el_profesor_chapters_source_check;
alter table public.el_profesor_chapters
  add constraint el_profesor_chapters_source_check check (
    (source_kind = 'pdf' and pdf_storage_path is not null) or
    (source_kind in ('docx', 'pptx') and source_text is not null) or
    source_kind = 'merged'
  );

alter table public.el_profesor_sub_entities
  add column if not exists source_fiche_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Blocs : deux nouveaux types, suggestion d'illustration
-- ---------------------------------------------------------------------------

alter table public.el_profesor_fiche_blocks drop constraint if exists el_profesor_fiche_blocks_block_type_check;
alter table public.el_profesor_fiche_blocks
  add constraint el_profesor_fiche_blocks_block_type_check check (
    block_type in (
      'definition_mecanisme', 'valeurs_seuils', 'tableau_comparatif', 'protocole_paliers',
      'mnemotechnique', 'perle_clinique', 'piege_erreur', 'formule', 'texte_libre',
      'divergence', 'a_retenir'
    )
  );

-- {"what": "...", "chapterId": "...", "page": 12} — ce qu'il serait utile
-- d'illustrer et la page source où une figure existe déjà (si elle existe).
alter table public.el_profesor_fiche_blocks
  add column if not exists suggested_image jsonb;

-- ---------------------------------------------------------------------------
-- Flashcards : provenance et remplacement
-- ---------------------------------------------------------------------------

alter table public.el_profesor_flashcards
  add column if not exists source_flashcard_ids uuid[] not null default '{}',
  add column if not exists replaced_by_flashcard_id uuid references public.el_profesor_flashcards (id) on delete set null;

create index if not exists el_profesor_flashcards_replaced_by_idx
  on public.el_profesor_flashcards (replaced_by_flashcard_id)
  where replaced_by_flashcard_id is not null;

alter table public.el_profesor_flashcards drop constraint if exists el_profesor_flashcards_status_check;
alter table public.el_profesor_flashcards
  add constraint el_profesor_flashcards_status_check check (status in ('draft', 'published', 'replaced'));

-- Supprimer une carte fusionnée (ou tout le livre fusionné) rend leurs
-- cartes aux livres sources : jamais de carte orpheline hors révision.
create or replace function public.el_profesor_restore_replaced_flashcards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.el_profesor_flashcards
  set status = 'published', replaced_by_flashcard_id = null
  where replaced_by_flashcard_id = old.id;
  return old;
end;
$$;

drop trigger if exists el_profesor_restore_replaced_flashcards on public.el_profesor_flashcards;
create trigger el_profesor_restore_replaced_flashcards
  before delete on public.el_profesor_flashcards
  for each row execute function public.el_profesor_restore_replaced_flashcards();

-- ---------------------------------------------------------------------------
-- File de travail de la fusion
-- ---------------------------------------------------------------------------

create table if not exists public.el_profesor_merge_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.el_profesor_books (id) on delete cascade,
  source_book_ids uuid[] not null,
  include_drafts boolean not null default true,
  provider text not null check (provider in ('gemini', 'claude')),
  model text not null,
  -- plan (parties, sous-parties) → assign (fiches → sous-parties) →
  -- chapters (chapitres et fiches de chaque sous-partie) → fiches → repair → done
  stage text not null default 'plan' check (stage in ('plan', 'assign', 'chapters', 'fiches', 'repair', 'done', 'failed', 'canceled')),
  -- Squelette de la table des matières (parties, sous-parties, chapitres).
  plan jsonb,
  -- Compteurs affichés : fiches sources, fiches fusionnées, blocs non repris...
  stats jsonb not null default '{}',
  error text,
  -- Verrou court pendant le passage d'une étape à la suivante (plusieurs
  -- passages de la file peuvent se chevaucher).
  locked_until timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists el_profesor_merge_jobs_stage_idx on public.el_profesor_merge_jobs (stage);

create table if not exists public.el_profesor_merge_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.el_profesor_merge_jobs (id) on delete cascade,
  stage text not null check (stage in ('plan', 'assign', 'chapter', 'fiche', 'repair')),
  -- 'plan', 'assign:0000', 'chapter:0000' (une sous-partie), 'fiche:…', 'repair:…'
  ref_key text not null,
  input jsonb not null default '{}',
  output jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'running', 'submitted', 'done', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  -- Identifiant du lot Claude (Message Batches) quand la tâche y a été soumise.
  claude_batch_id text,
  error text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, ref_key)
);

create index if not exists el_profesor_merge_tasks_due_idx on public.el_profesor_merge_tasks (job_id, stage, status, next_attempt_at);
create index if not exists el_profesor_merge_tasks_batch_idx on public.el_profesor_merge_tasks (claude_batch_id) where claude_batch_id is not null;

drop trigger if exists set_el_profesor_merge_jobs_updated_at on public.el_profesor_merge_jobs;
create trigger set_el_profesor_merge_jobs_updated_at
  before update on public.el_profesor_merge_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists set_el_profesor_merge_tasks_updated_at on public.el_profesor_merge_tasks;
create trigger set_el_profesor_merge_tasks_updated_at
  before update on public.el_profesor_merge_tasks
  for each row execute function public.set_updated_at();

alter table public.el_profesor_merge_jobs enable row level security;
alter table public.el_profesor_merge_tasks enable row level security;

drop policy if exists "el_profesor_merge_jobs_admin" on public.el_profesor_merge_jobs;
create policy "el_profesor_merge_jobs_admin" on public.el_profesor_merge_jobs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "el_profesor_merge_tasks_admin" on public.el_profesor_merge_tasks;
create policy "el_profesor_merge_tasks_admin" on public.el_profesor_merge_tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.el_profesor_merge_jobs to authenticated;
grant select, insert, update, delete on public.el_profesor_merge_tasks to authenticated;

-- Catalogue des fiches sources d'une fusion, en une requête : une ligne par
-- fiche active (non remplacée par une fusion de doublons), avec ce qu'il
-- faut pour bâtir le plan et estimer le coût (nombre de blocs, de cartes,
-- volume de texte) sans rapatrier tout le contenu.
create or replace function public.el_profesor_merge_source_fiches(p_book_ids uuid[], p_include_drafts boolean)
returns table (
  fiche_id uuid,
  book_id uuid,
  chapter_id uuid,
  chapter_title text,
  chapter_order integer,
  sub_entity_order integer,
  title text,
  summary text,
  fiche_status text,
  block_count integer,
  card_count integer,
  chars integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    f.id,
    c.book_id,
    c.id,
    c.title,
    c.order_index,
    se.order_index,
    f.title,
    se.summary,
    f.status,
    coalesce(b.n, 0)::integer,
    coalesce(k.n, 0)::integer,
    (coalesce(b.chars, 0) + coalesce(k.chars, 0))::integer
  from public.el_profesor_fiches f
  join public.el_profesor_sub_entities se on se.id = f.sub_entity_id
  join public.el_profesor_chapters c on c.id = se.chapter_id
  left join lateral (
    select count(*) as n, sum(length(fb.content::text)) as chars
    from public.el_profesor_fiche_blocks fb
    where fb.fiche_id = f.id and (p_include_drafts or fb.status = 'published')
  ) b on true
  left join lateral (
    select count(*) as n, sum(length(fc.front::text) + length(fc.back::text)) as chars
    from public.el_profesor_flashcards fc
    where fc.fiche_id = f.id and fc.status <> 'replaced' and (p_include_drafts or fc.status = 'published')
  ) k on true
  where c.book_id = any(p_book_ids)
    and f.superseded_by_fiche_id is null
    and (p_include_drafts or f.status = 'published')
$$;

revoke all on function public.el_profesor_merge_source_fiches(uuid[], boolean) from public, anon;
grant execute on function public.el_profesor_merge_source_fiches(uuid[], boolean) to authenticated, service_role;

-- Publication d'un chapitre fusionné : ses cartes remplacent les cartes
-- sources publiées qu'elles fusionnent (statut 'replaced', hors de toutes
-- les révisions) et chaque lecteur garde sur la carte fusionnée son
-- historique le plus avancé parmi ces sources (plus grande stabilité, puis
-- plus de répétitions) — en une seule requête, quel que soit le nombre de
-- cartes. Appelée par le serveur (rôle service) après chaque publication.
create or replace function public.el_profesor_replace_source_cards(p_fiche_ids uuid[])
returns table (replaced integer, histories integer)
language sql
volatile
security invoker
set search_path = public
as $$
  with map as (
    select distinct on (s.source_id) s.source_id, m.id as merged_id
    from public.el_profesor_flashcards m
    cross join lateral unnest(m.source_flashcard_ids) as s(source_id)
    where m.fiche_id = any(p_fiche_ids) and m.status = 'published' and s.source_id <> m.id
    order by s.source_id, m.created_at, m.id
  ),
  copied as (
    insert into public.el_profesor_review_state
      (user_id, flashcard_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review)
    select distinct on (rs.user_id, map.merged_id)
      rs.user_id, map.merged_id, rs.due, rs.stability, rs.difficulty, rs.elapsed_days, rs.scheduled_days, rs.reps, rs.lapses, rs.state, rs.last_review
    from map
    join public.el_profesor_flashcards src on src.id = map.source_id and src.status = 'published'
    join public.el_profesor_review_state rs on rs.flashcard_id = map.source_id
    order by rs.user_id, map.merged_id, rs.stability desc, rs.reps desc
    on conflict (user_id, flashcard_id) do nothing
    returning 1
  ),
  replaced as (
    update public.el_profesor_flashcards src
    set status = 'replaced', replaced_by_flashcard_id = map.merged_id
    from map
    where src.id = map.source_id and src.status = 'published'
    returning 1
  )
  select (select count(*) from replaced)::integer, (select count(*) from copied)::integer;
$$;

revoke all on function public.el_profesor_replace_source_cards(uuid[]) from public, anon, authenticated;
grant execute on function public.el_profesor_replace_source_cards(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Relance toutes les minutes tant qu'une fusion est en cours (même
-- principe que la file Gemini, migration 092 : secrets lus dans le Vault).
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.el_profesor_merge_tick()
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
    select 1 from public.el_profesor_merge_jobs
    where stage in ('plan', 'assign', 'chapters', 'fiches', 'repair')
  ) then
    return;
  end if;
  select decrypted_secret into site from vault.decrypted_secrets where name = 'preox_site_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'preox_cron_secret' limit 1;
  if site is null or secret is null then
    raise warning 'El Profesor : secrets preox_site_url / preox_cron_secret absents du Vault, fusion non relancée.';
    return;
  end if;
  perform net.http_get(
    url := rtrim(site, '/') || '/api/cron/el-profesor-merge',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.el_profesor_merge_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'el-profesor-merge';
select cron.schedule('el-profesor-merge', '* * * * *', $$select public.el_profesor_merge_tick()$$);
