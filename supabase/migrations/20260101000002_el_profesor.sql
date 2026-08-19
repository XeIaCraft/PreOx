-- Module "El Profesor" — fiches et flashcards générées par IA à partir de
-- chapitres de livres (PDF), avec citation systématique de la source et
-- révision espacée (FSRS). Bibliothèque partagée en lecture entre tous les
-- utilisateurs ayant accès au module, import/édition réservés aux admins du
-- hub ; progression de révision strictement individuelle.

-- ============================================================================
-- has_module_access() — shared-read helper, first needed by this module
-- (À table's data is strictly per-user, so it never required this).
-- ============================================================================

create or replace function public.has_module_access(app_slug text, uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin(uid) or exists (
    select 1
    from public.user_app_access ua
    join public.apps a on a.id = ua.app_id
    where ua.user_id = uid and a.slug = app_slug
  );
$$;

grant execute on function public.has_module_access(text, uuid) to authenticated;

-- ============================================================================
-- Storage — private bucket for chapter PDFs. No storage.objects policy is
-- granted to authenticated/anon: every read/write goes through a Server
-- Action using the service-role client (bypasses RLS), which checks module
-- access and issues a short-lived signed URL. Never exposed publicly.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('el-profesor-pdfs', 'el-profesor-pdfs', false)
on conflict (id) do nothing;

-- ============================================================================
-- Tables
-- ============================================================================

create table public.el_profesor_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  edition text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.el_profesor_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.el_profesor_books (id) on delete cascade,
  title text not null,
  order_index integer not null default 0,
  pdf_storage_path text not null,
  pdf_page_count integer,
  status text not null default 'pending' check (
    status in ('pending', 'extracting', 'draft_ready', 'published', 'failed')
  ),
  extraction_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.el_profesor_sub_entities (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.el_profesor_chapters (id) on delete cascade,
  name text not null,
  order_index integer not null default 0,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create table public.el_profesor_fiches (
  id uuid primary key default gen_random_uuid(),
  sub_entity_id uuid not null references public.el_profesor_sub_entities (id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- content shape depends on block_type — e.g. {"text": "..."} for prose
-- blocks, {"headers": [...], "rows": [[...]]} for tableau_comparatif.
create table public.el_profesor_fiche_blocks (
  id uuid primary key default gen_random_uuid(),
  fiche_id uuid not null references public.el_profesor_fiches (id) on delete cascade,
  order_index integer not null default 0,
  block_type text not null check (
    block_type in (
      'definition_mecanisme', 'valeurs_seuils', 'tableau_comparatif', 'protocole_paliers',
      'mnemotechnique', 'perle_clinique', 'piege_erreur', 'formule', 'texte_libre'
    )
  ),
  content jsonb not null default '{}',
  citations jsonb not null default '[]',
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.el_profesor_flashcards (
  id uuid primary key default gen_random_uuid(),
  fiche_id uuid not null references public.el_profesor_fiches (id) on delete cascade,
  front jsonb not null default '{}',
  back jsonb not null default '{}',
  citations jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published')),
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (user, flashcard), created on first review. FSRS state.
create table public.el_profesor_review_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  flashcard_id uuid not null references public.el_profesor_flashcards (id) on delete cascade,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state text not null default 'new' check (state in ('new', 'learning', 'review', 'relearning')),
  last_review timestamptz,
  unique (user_id, flashcard_id)
);

-- Raw review history. Only 'scheduled' reviews affect el_profesor_review_state
-- (FSRS) — 'free' (on-demand, out-of-schedule) reviews are logged but never
-- change the memorization score, same principle as Anki's cram mode.
create table public.el_profesor_review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  flashcard_id uuid not null references public.el_profesor_flashcards (id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  rating text not null check (rating in ('again', 'good')),
  source text not null check (source in ('scheduled', 'free'))
);

-- One row per admin-triggered extraction run — audit trail + lets a failed
-- or re-run extraction be inspected without re-uploading the PDF.
create table public.el_profesor_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.el_profesor_chapters (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  raw_output jsonb,
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index el_profesor_chapters_book_id_idx on public.el_profesor_chapters (book_id, order_index);
create index el_profesor_sub_entities_chapter_id_idx on public.el_profesor_sub_entities (chapter_id, order_index);
create index el_profesor_fiches_sub_entity_id_idx on public.el_profesor_fiches (sub_entity_id);
create index el_profesor_fiche_blocks_fiche_id_idx on public.el_profesor_fiche_blocks (fiche_id, order_index);
create index el_profesor_flashcards_fiche_id_idx on public.el_profesor_flashcards (fiche_id);
create index el_profesor_review_state_user_due_idx on public.el_profesor_review_state (user_id, due);
create index el_profesor_review_log_user_id_idx on public.el_profesor_review_log (user_id, flashcard_id);
create index el_profesor_extraction_jobs_chapter_id_idx on public.el_profesor_extraction_jobs (chapter_id, created_at desc);

-- ============================================================================
-- updated_at maintenance (reuses public.set_updated_at() from the hub migration)
-- ============================================================================

create trigger set_el_profesor_books_updated_at
  before update on public.el_profesor_books
  for each row execute function public.set_updated_at();

create trigger set_el_profesor_chapters_updated_at
  before update on public.el_profesor_chapters
  for each row execute function public.set_updated_at();

create trigger set_el_profesor_fiches_updated_at
  before update on public.el_profesor_fiches
  for each row execute function public.set_updated_at();

create trigger set_el_profesor_fiche_blocks_updated_at
  before update on public.el_profesor_fiche_blocks
  for each row execute function public.set_updated_at();

create trigger set_el_profesor_flashcards_updated_at
  before update on public.el_profesor_flashcards
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.el_profesor_books enable row level security;
alter table public.el_profesor_chapters enable row level security;
alter table public.el_profesor_sub_entities enable row level security;
alter table public.el_profesor_fiches enable row level security;
alter table public.el_profesor_fiche_blocks enable row level security;
alter table public.el_profesor_flashcards enable row level security;
alter table public.el_profesor_review_state enable row level security;
alter table public.el_profesor_review_log enable row level security;
alter table public.el_profesor_extraction_jobs enable row level security;

-- Library — shared read for anyone granted the module, write reserved to admins.

create policy "el_profesor_books_select" on public.el_profesor_books
  for select to authenticated using (public.has_module_access('el-profesor'));
create policy "el_profesor_books_admin_write" on public.el_profesor_books
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "el_profesor_chapters_select" on public.el_profesor_chapters
  for select to authenticated using (public.has_module_access('el-profesor'));
create policy "el_profesor_chapters_admin_write" on public.el_profesor_chapters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "el_profesor_sub_entities_select" on public.el_profesor_sub_entities
  for select to authenticated using (public.has_module_access('el-profesor'));
create policy "el_profesor_sub_entities_admin_write" on public.el_profesor_sub_entities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "el_profesor_fiches_select" on public.el_profesor_fiches
  for select to authenticated using (public.has_module_access('el-profesor'));
create policy "el_profesor_fiches_admin_write" on public.el_profesor_fiches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "el_profesor_fiche_blocks_select" on public.el_profesor_fiche_blocks
  for select to authenticated using (public.has_module_access('el-profesor'));
create policy "el_profesor_fiche_blocks_admin_write" on public.el_profesor_fiche_blocks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "el_profesor_flashcards_select" on public.el_profesor_flashcards
  for select to authenticated using (public.has_module_access('el-profesor'));
create policy "el_profesor_flashcards_admin_write" on public.el_profesor_flashcards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Review progress — strictly per user, no admin override (mirrors a_table_*).

create policy "el_profesor_review_state_own_rows" on public.el_profesor_review_state
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "el_profesor_review_log_own_rows" on public.el_profesor_review_log
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Extraction jobs — internal diagnostics (raw Gemini output), admin only.

create policy "el_profesor_extraction_jobs_admin_only" on public.el_profesor_extraction_jobs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Grants (RLS still applies on top of these)
-- ============================================================================

grant select, insert, update, delete on public.el_profesor_books to authenticated;
grant select, insert, update, delete on public.el_profesor_chapters to authenticated;
grant select, insert, update, delete on public.el_profesor_sub_entities to authenticated;
grant select, insert, update, delete on public.el_profesor_fiches to authenticated;
grant select, insert, update, delete on public.el_profesor_fiche_blocks to authenticated;
grant select, insert, update, delete on public.el_profesor_flashcards to authenticated;
grant select, insert, update, delete on public.el_profesor_review_state to authenticated;
grant select, insert, update, delete on public.el_profesor_review_log to authenticated;
grant select, insert, update, delete on public.el_profesor_extraction_jobs to authenticated;
