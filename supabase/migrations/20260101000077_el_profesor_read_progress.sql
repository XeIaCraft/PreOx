-- Persisted per-user reading progress for fiches and notion syntheses
-- (requested 2026-08-29 — "voir sa progression dans les fiches et
-- synthèse avec possibilité de la réinitialiser"). Distinct from
-- el_profesor_reading_position (which only tracks the single most recent
-- chapter/sub-entity visited, for the "resume" banner): this tracks how
-- far into a SPECIFIC fiche or notion synthesis the reader has ever
-- scrolled, one row per (user, item), visible even after navigating away
-- and synced across devices. progress_pct is the highest percentage ever
-- reached, not the current scroll position — scrolling back up to reread
-- something shouldn't make the tracked progress regress.

create table public.el_profesor_fiche_read_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  fiche_id uuid not null references public.el_profesor_fiches (id) on delete cascade,
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, fiche_id)
);

alter table public.el_profesor_fiche_read_progress enable row level security;

create policy "el_profesor_fiche_read_progress_own_rows" on public.el_profesor_fiche_read_progress
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.el_profesor_fiche_read_progress to authenticated;

create table public.el_profesor_notion_read_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  notion_id uuid not null references public.el_profesor_notions (id) on delete cascade,
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, notion_id)
);

alter table public.el_profesor_notion_read_progress enable row level security;

create policy "el_profesor_notion_read_progress_own_rows" on public.el_profesor_notion_read_progress
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.el_profesor_notion_read_progress to authenticated;
