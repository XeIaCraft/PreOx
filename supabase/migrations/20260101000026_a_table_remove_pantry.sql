-- Removes the "garde-manger" (pantry) concept — it was redundant with
-- "aliments temporaires" (a_table_temporary_ingredients), which already
-- covers "what I have on hand right now". Existing pantry rows are
-- migrated into temporary ingredients (no expiry date, since pantry items
-- never had one) rather than silently dropped.

insert into public.a_table_temporary_ingredients (user_id, name, quantity, unit, note, date_limit, status, created_at)
select user_id, name, quantity, unit, '', '', 'active', created_at
from public.a_table_pantry_items;

drop table public.a_table_pantry_items;
