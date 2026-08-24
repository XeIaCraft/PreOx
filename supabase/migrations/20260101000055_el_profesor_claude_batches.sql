-- Claude Batches API integration (demande explicite) : la création de
-- fiches/flashcards, la catégorisation par notion et la détection de
-- contradictions passent par des lots Anthropic (Messages Batches API,
-- 50% moins cher, jusqu'à 100k requêtes par lot) plutôt que des appels
-- synchrones un par un — l'admin lance un lot puis peut quitter l'écran ;
-- un cron interroge Anthropic et applique les résultats dès qu'ils sont
-- prêts (voir /api/cron/el-profesor-batch-poll). Gemini reste disponible
-- en parallèle (choix conservé dans les réglages IA) pour l'usage
-- synchrone ponctuel (traduction, cas clinique, etc.) — seules les
-- opérations en masse basculent sur ce mécanisme quand Claude est
-- sélectionné.

alter table public.el_profesor_chapters
  drop constraint el_profesor_chapters_status_check;
alter table public.el_profesor_chapters
  add constraint el_profesor_chapters_status_check check (
    status in ('pending', 'queued', 'extracting', 'draft_ready', 'published', 'failed')
  );

create table public.el_profesor_batch_jobs (
  id uuid primary key default gen_random_uuid(),
  anthropic_batch_id text not null,
  kind text not null check (kind in ('extraction', 'complementary', 'notion_categorization', 'contradiction_check')),
  status text not null default 'submitted' check (status in ('submitted', 'completed', 'failed')),
  request_count integer not null default 0,
  succeeded_count integer not null default 0,
  errored_count integer not null default 0,
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.el_profesor_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_job_id uuid not null references public.el_profesor_batch_jobs (id) on delete cascade,
  custom_id text not null,
  -- Kind-specific payload the poller needs to apply this one result:
  -- {type:'chapter', chapterId} for extraction/complementary,
  -- {type:'fiche', ficheId} for notion_categorization,
  -- {type:'contradiction', notionId, ficheIdA, ficheIdB} for contradiction_check.
  target jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'errored', 'expired', 'canceled')),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index el_profesor_batch_jobs_status_idx on public.el_profesor_batch_jobs (status);
create index el_profesor_batch_items_job_idx on public.el_profesor_batch_items (batch_job_id);

alter table public.el_profesor_batch_jobs enable row level security;
alter table public.el_profesor_batch_items enable row level security;

-- Admin-only end to end — same audience as the extraction pipeline itself
-- (el_profesor_extraction_jobs has no broader policy either).
create policy "el_profesor_batch_jobs_admin" on public.el_profesor_batch_jobs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "el_profesor_batch_items_admin" on public.el_profesor_batch_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
