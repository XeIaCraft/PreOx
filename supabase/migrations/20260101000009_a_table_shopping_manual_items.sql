-- Lets users add ad-hoc items to the shopping list (e.g. household staples)
-- that aren't derived from any recipe or guest menu. Stored the same way
-- shopping_list_checked already is: one jsonb blob on the per-user settings
-- row, not a separate table (there's nothing relational about it).
alter table public.a_table_settings
  add column shopping_list_manual_items jsonb not null default '[]';
