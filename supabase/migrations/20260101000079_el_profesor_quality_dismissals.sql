-- Persists admin decisions on the quality dashboard's live-computed
-- findings (duplicate flashcards, similar sub-entities, thin sub-entities)
-- so dismissing one ("non, on garde les deux") makes it stop reappearing
-- next time the dashboard recomputes — piste 2026-08-31. These findings
-- have no stable row of their own (they're recomputed fresh from live
-- data on every page load, see getBookQualityDashboard), so identity here
-- is a caller-built key rather than a foreign key: the two entity ids
-- involved (sorted, for a pair) or the single entity id (for a thin
-- sub-entity, which isn't a pair).
create table public.el_profesor_quality_dismissals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('duplicate_flashcard', 'similar_sub_entity', 'thin_sub_entity')),
  entity_key text not null,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid references public.profiles (id) on delete set null,
  unique (kind, entity_key)
);

alter table public.el_profesor_quality_dismissals enable row level security;

create policy "el_profesor_quality_dismissals_admin_all" on public.el_profesor_quality_dismissals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
