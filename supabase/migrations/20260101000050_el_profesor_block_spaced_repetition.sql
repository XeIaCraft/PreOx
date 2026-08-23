-- Répétition espacée par bloc de contenu, pas seulement par flashcard
-- (item 16 de l'audit). Un mécanisme volontairement séparé et minimal —
-- pas de FSRS, pas touché au moteur de flashcards existant — puisqu'un
-- bloc n'a pas de "réponse" à noter comme une flashcard : seulement un
-- rappel "je m'en souviens encore" / "à revoir", avec un espacement simple
-- (intervalle qui double si retenu, retombe à 1 jour sinon).
create table public.el_profesor_block_review_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  block_id uuid not null references public.el_profesor_fiche_blocks (id) on delete cascade,
  interval_days integer not null default 1,
  last_reviewed_at timestamptz not null default now(),
  next_due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, block_id)
);

create index el_profesor_block_review_state_due_idx on public.el_profesor_block_review_state (user_id, next_due_at);

alter table public.el_profesor_block_review_state enable row level security;

create policy "el_profesor_block_review_state_own" on public.el_profesor_block_review_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
