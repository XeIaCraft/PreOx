-- Lets a user exclude a flashcard from their own reviews (scheduled queue,
-- global due queue, carnet d'erreurs, carte du jour, free review) without
-- affecting anyone else or deleting the card itself. Mirrors
-- el_profesor_review_state: strictly per-user, no admin override.
create table public.el_profesor_suspended_flashcards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  flashcard_id uuid not null references public.el_profesor_flashcards (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

alter table public.el_profesor_suspended_flashcards enable row level security;

create policy "el_profesor_suspended_flashcards_own_rows" on public.el_profesor_suspended_flashcards
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.el_profesor_suspended_flashcards to authenticated;
