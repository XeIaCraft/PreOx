-- Illustrations sur les blocs de fiche en général (2026-08-27, demandé
-- suite au retour sur la synthèse : "on reprendrait juste les
-- illustrations des livres, qui seraient en fait sur la fiche de base")
-- — jusqu'ici seules les flashcards pouvaient avoir une image (item 23).
-- Même pattern : upload manuel admin, jamais généré par IA, montré avec
-- le contenu du bloc en consultation. La synthèse de notion reprend
-- ensuite l'image d'un bloc source quand un bloc de synthèse en dérive
-- (jamais générée pour la synthèse elle-même, toujours reprise d'un bloc
-- déjà illustré).
alter table public.el_profesor_fiche_blocks
  add column image_url text,
  add column image_alt text;

alter table public.el_profesor_notion_synthesis_blocks
  add column image_url text,
  add column image_alt text;

insert into storage.buckets (id, name, public)
values ('el-profesor-block-images', 'el-profesor-block-images', true)
on conflict (id) do nothing;

create policy "el_profesor_block_images_read" on storage.objects
  for select
  using (bucket_id = 'el-profesor-block-images');

create policy "el_profesor_block_images_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'el-profesor-block-images' and public.is_admin());

create policy "el_profesor_block_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'el-profesor-block-images' and public.is_admin());

create policy "el_profesor_block_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'el-profesor-block-images' and public.is_admin());
