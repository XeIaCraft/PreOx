-- Image/schéma sur une flashcard, capturée depuis le PDF source (crop côté
-- client sur le canvas déjà rendu par pdfjs) ou envoyée manuellement (item
-- 23 de l'audit) — révision par association d'image plutôt qu'un pur
-- schéma cliquable à zones (hors scope pour cette itération) : l'image est
-- montrée avec le recto, la réponse reste au verso.
alter table public.el_profesor_flashcards
  add column image_url text,
  add column image_alt text;

insert into storage.buckets (id, name, public)
values ('el-profesor-flashcard-images', 'el-profesor-flashcard-images', true)
on conflict (id) do nothing;

create policy "el_profesor_flashcard_images_read" on storage.objects
  for select
  using (bucket_id = 'el-profesor-flashcard-images');

create policy "el_profesor_flashcard_images_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'el-profesor-flashcard-images' and public.is_admin());

create policy "el_profesor_flashcard_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'el-profesor-flashcard-images' and public.is_admin());

create policy "el_profesor_flashcard_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'el-profesor-flashcard-images' and public.is_admin());
