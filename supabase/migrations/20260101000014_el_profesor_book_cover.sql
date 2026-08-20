-- Cover image per book — public-within-the-hub bucket (any authenticated
-- user with module access reads it, same as the book/chapter rows
-- themselves), writes restricted to admins only, mirroring
-- el_profesor_flashcards_admin_write and friends.

alter table public.el_profesor_books add column cover_url text;

insert into storage.buckets (id, name, public)
values ('el-profesor-covers', 'el-profesor-covers', true)
on conflict (id) do nothing;

create policy "el_profesor_covers_read" on storage.objects
  for select
  using (bucket_id = 'el-profesor-covers');

create policy "el_profesor_covers_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'el-profesor-covers' and public.is_admin());

create policy "el_profesor_covers_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'el-profesor-covers' and public.is_admin());

create policy "el_profesor_covers_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'el-profesor-covers' and public.is_admin());
