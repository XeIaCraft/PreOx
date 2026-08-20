-- Two independent additions:
-- 1. A permanent pantry inventory, distinct from a_table_temporary_ingredients
--    (which models "use this up soon" leftovers, not a standing stock list).
-- 2. A "locked" flag on meal cards so a card can opt out of bulk operations
--    (currently: "Vider la semaine") without the user having to remember to
--    re-place it afterwards.

create table public.a_table_pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text not null default '',
  created_at timestamptz not null default now()
);

create index a_table_pantry_items_user_id_idx on public.a_table_pantry_items (user_id);

alter table public.a_table_pantry_items enable row level security;

create policy "a_table_pantry_items_own_rows" on public.a_table_pantry_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.a_table_pantry_items to authenticated;

alter table public.a_table_meal_cards add column locked boolean not null default false;
