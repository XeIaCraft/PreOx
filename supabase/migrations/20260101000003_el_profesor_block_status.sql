-- El Profesor — per-block draft/published status, and a real RLS fix for
-- the module's shared-read tables.
--
-- 1. Fiche blocks previously had no status of their own: visibility was
--    governed only by their parent fiche's status. That breaks once a
--    fiche can be re-opened for a "complementary extraction" pass (fills
--    gaps in an already-published fiche) — new blocks appended to an
--    already-published fiche must stay hidden until reviewed, even though
--    the fiche itself is already 'published'.
-- 2. The original select policies on el_profesor_fiches/fiche_blocks/
--    flashcards only checked module access, never `status = 'published'`
--    for non-admins — draft content was only hidden by application-level
--    filtering (src/lib/el-profesor/dal.ts), not by RLS. This closes that
--    gap: a non-admin querying the table directly now only ever sees
--    published rows, matching the "mandatory human review before
--    publication" guarantee the module is built around.

alter table public.el_profesor_fiche_blocks
  add column status text not null default 'published' check (status in ('draft', 'published'));

create index el_profesor_fiche_blocks_status_idx on public.el_profesor_fiche_blocks (fiche_id, status);

drop policy if exists "el_profesor_fiches_select" on public.el_profesor_fiches;
create policy "el_profesor_fiches_select" on public.el_profesor_fiches
  for select to authenticated
  using ((status = 'published' or public.is_admin()) and public.has_module_access('el-profesor'));

drop policy if exists "el_profesor_fiche_blocks_select" on public.el_profesor_fiche_blocks;
create policy "el_profesor_fiche_blocks_select" on public.el_profesor_fiche_blocks
  for select to authenticated
  using ((status = 'published' or public.is_admin()) and public.has_module_access('el-profesor'));

drop policy if exists "el_profesor_flashcards_select" on public.el_profesor_flashcards;
create policy "el_profesor_flashcards_select" on public.el_profesor_flashcards
  for select to authenticated
  using ((status = 'published' or public.is_admin()) and public.has_module_access('el-profesor'));
