-- Planning multi-semaines (item 1 of the backlog): a weekday-placed card now
-- belongs to a specific week (its Monday, as a plain date — no timezone
-- concept needed, "the week" is a calendar label, not an instant). Backlog
-- cards stay week-agnostic (null) since "à cuisiner" is an evergreen queue,
-- not tied to any particular week.
alter table public.a_table_meal_cards add column week_start date null;

-- Backfill: existing active weekday cards had an implicit single week (the
-- real current week, there was no other option) — pin them there so nothing
-- silently vanishes from the (now week-scoped) board after this migration.
update public.a_table_meal_cards
set week_start = (current_date - ((extract(isodow from current_date)::int - 1)))
where status = 'active' and placement <> 'backlog' and week_start is null;

create index a_table_meal_cards_user_week_idx on public.a_table_meal_cards (user_id, week_start);
