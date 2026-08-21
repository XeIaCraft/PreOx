-- Photo diary: lets users attach a photo of the finished dish to a history
-- entry. Reuses the existing a-table-recipe-photos bucket/RLS (path only
-- needs to start with the uploader's own user_id folder segment).
alter table public.a_table_history
  add column photo_url text;
