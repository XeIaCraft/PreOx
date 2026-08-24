-- Mise à jour d'une notion depuis une source externe (demande explicite du
-- 2026-08-24) : l'admin colle la réponse d'un outil de littérature médicale
-- (Consensus, OpenEvidence...) ou importe un article (PDF/Word/texte), le
-- système compare cette source à chaque fiche liée à la notion et propose
-- — jamais n'applique automatiquement — les ajouts/corrections nécessaires,
-- en brouillon, pour validation admin avant publication (même garantie que
-- toute autre génération IA du module).

alter table public.el_profesor_batch_jobs
  drop constraint el_profesor_batch_jobs_kind_check;
alter table public.el_profesor_batch_jobs
  add constraint el_profesor_batch_jobs_kind_check check (
    kind in ('extraction', 'complementary', 'notion_categorization', 'contradiction_check', 'notion_update_check')
  );

create table public.el_profesor_notion_update_proposals (
  id uuid primary key default gen_random_uuid(),
  notion_id uuid not null references public.el_profesor_notions (id) on delete cascade,
  fiche_id uuid not null references public.el_profesor_fiches (id) on delete cascade,
  source_kind text not null check (source_kind in ('pasted_text', 'article')),
  -- First ~500 chars of whatever was submitted (pasted answer or extracted
  -- article text) — admin traceability for "why was this proposed", not the
  -- full source (which can be large and isn't needed again once checked).
  source_excerpt text not null,
  explanation text not null,
  -- {blocks: ExtractedFicheBlock[], flashcards: ExtractedFlashcard[]} — same
  -- shape as a complementary addition, applied the same conservative way
  -- (appended as new draft/needs_review content, never an overwrite).
  additions jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create index el_profesor_notion_update_proposals_notion_idx on public.el_profesor_notion_update_proposals (notion_id);
create index el_profesor_notion_update_proposals_fiche_idx on public.el_profesor_notion_update_proposals (fiche_id);
create index el_profesor_notion_update_proposals_status_idx on public.el_profesor_notion_update_proposals (status);

alter table public.el_profesor_notion_update_proposals enable row level security;

create policy "el_profesor_notion_update_proposals_admin" on public.el_profesor_notion_update_proposals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
