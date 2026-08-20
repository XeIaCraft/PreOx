-- Named recipe collections (e.g. "Repas de fête", "Semaine sans viande") —
-- a lighter grouping than tags, user-curated and ordered by the user rather
-- than derived from recipe content. recipe_ids is a plain uuid[] rather than
-- a join table: memberships are small, ordering matters, and there's no need
-- to query "which collections contain recipe X" independently of "what's in
-- collection Y" (same reasoning as this module's other small jsonb/array
-- fields — see shopping_list_manual_items).

create table public.a_table_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  recipe_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index a_table_collections_user_id_idx on public.a_table_collections (user_id);

create trigger set_a_table_collections_updated_at
  before update on public.a_table_collections
  for each row execute function public.set_updated_at();

alter table public.a_table_collections enable row level security;

create policy "a_table_collections_own_rows" on public.a_table_collections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.a_table_collections to authenticated;
