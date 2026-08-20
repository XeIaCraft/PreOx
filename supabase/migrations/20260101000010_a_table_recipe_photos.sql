-- Lets users upload their own photo for a recipe (until now only Pexels
-- search-sourced images were supported). Public bucket — food photos carry
-- no sensitivity — but writes are still scoped to the uploader's own folder
-- via RLS, same "auth.uid() = user_id" spirit as every other a_table_* table.

insert into storage.buckets (id, name, public)
values ('a-table-recipe-photos', 'a-table-recipe-photos', true)
on conflict (id) do nothing;

create policy "a_table_recipe_photos_read" on storage.objects
  for select
  using (bucket_id = 'a-table-recipe-photos');

create policy "a_table_recipe_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'a-table-recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a_table_recipe_photos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'a-table-recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a_table_recipe_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'a-table-recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
