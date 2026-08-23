-- Per-household-member display preferences + personal read-only link.
-- Household members (a_table_household_members) are lightweight profiles
-- the account owner maintains, not separate hub accounts — so "each person
-- manages their own display preferences" is implemented the same way the
-- rest of this module handles non-authenticated household interaction
-- (vote, today-widget): an opaque per-member token gating a public,
-- read-only personal page where that member can tweak how it looks for
-- them, without touching the shared meal-planning data.
alter table public.a_table_household_members add column access_token uuid null unique;
alter table public.a_table_household_members add column display_prefs jsonb not null default '{}'::jsonb;
