-- Recipe exchange between hub users (items 24/25/29 of the backlog).
-- Deliberately anonymous: no cross-user read access to `profiles` is
-- introduced here — a shared recipe's author and a comment's author are
-- never resolved to a name, only shown as "a hub member", the same
-- prudent posture already used for El Profesor's collaborative signals.
alter table public.a_table_recipes add column shared_at timestamptz null;
alter table public.a_table_recipes add column recommended_by text null;

-- Second, SELECT-only permissive policy: multiple permissive policies for
-- the same command are OR'd together, so this only ever *widens* read
-- access to rows the owner opted to share — it does not touch INSERT/
-- UPDATE/DELETE, which remain governed solely by the existing
-- "a_table_recipes_own_rows" owner-only policy.
create policy "a_table_recipes_shared_read" on public.a_table_recipes
  for select to authenticated
  using (shared_at is not null);

create table public.a_table_recipe_comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.a_table_recipes (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index a_table_recipe_comments_recipe_id_idx on public.a_table_recipe_comments (recipe_id);

alter table public.a_table_recipe_comments enable row level security;

create policy "a_table_recipe_comments_read_on_shared" on public.a_table_recipe_comments
  for select to authenticated
  using (recipe_id in (select id from public.a_table_recipes where shared_at is not null));

create policy "a_table_recipe_comments_insert_own_on_shared" on public.a_table_recipe_comments
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and recipe_id in (select id from public.a_table_recipes where shared_at is not null)
  );

create policy "a_table_recipe_comments_delete_own" on public.a_table_recipe_comments
  for delete to authenticated
  using (author_user_id = auth.uid());

grant select, insert, delete on public.a_table_recipe_comments to authenticated;
