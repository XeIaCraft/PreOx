-- Saved week layouts ("modèles de semaine"): a named snapshot of which
-- recipe sits on which weekday, reusable to repopulate a future week in one
-- click. `items` is a small jsonb array (placement/recipe_id/servings) —
-- same "entities in tables, small compound structures in jsonb" pattern as
-- guest menus, not worth a child table for at most 7 rows.
create table public.a_table_week_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index a_table_week_templates_user_id_idx on public.a_table_week_templates (user_id);

alter table public.a_table_week_templates enable row level security;

create policy "a_table_week_templates_own" on public.a_table_week_templates
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
