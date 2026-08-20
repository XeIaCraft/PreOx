-- El Profesor — lets a user bookmark a sub-entity (a specific fiche) for
-- quick access from the dashboard, independent of the FSRS review queue.

create table public.el_profesor_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sub_entity_id uuid not null references public.el_profesor_sub_entities (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, sub_entity_id)
);

create index el_profesor_bookmarks_user_id_idx on public.el_profesor_bookmarks (user_id);

alter table public.el_profesor_bookmarks enable row level security;

create policy "el_profesor_bookmarks_own_rows" on public.el_profesor_bookmarks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, delete on public.el_profesor_bookmarks to authenticated;
