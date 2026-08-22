-- Named household member profiles (item 3 of the backlog: "profils
-- multiples par foyer") — each with their own allergies, so the allergy
-- warning badge can account for more than just the account owner's single
-- allergies list. No auth of their own: these are lightweight labels the
-- account owner maintains, not separate hub users.
create table public.a_table_household_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  allergies text[] not null default '{}',
  diet text not null default '',
  created_at timestamptz not null default now()
);

create index a_table_household_members_user_id_idx on public.a_table_household_members (user_id);

alter table public.a_table_household_members enable row level security;

create policy "a_table_household_members_own" on public.a_table_household_members
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
