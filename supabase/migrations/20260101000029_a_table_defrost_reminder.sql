-- "Needs defrosting" marker on recipes, used by the new defrost-reminder
-- cron to push a heads-up the evening before that meal is planned.
alter table public.a_table_recipes
  add column needs_defrost boolean not null default false;
