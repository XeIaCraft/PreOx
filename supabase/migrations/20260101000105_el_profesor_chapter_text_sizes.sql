-- How much each chapter of a book holds, for the book export
-- (src/lib/el-profesor/export): tomes are cut by their number of pages, and
-- the merged book's parts differ too much in density (5,000 to 10,000
-- characters a fiche) for the number of fiches to stand for it. One pass
-- over the book's published blocks (≈ 10 s on the merged book).
create or replace function public.el_profesor_chapter_text_sizes(p_book_id uuid)
returns table (chapter_id uuid, fiches integer, chars bigint)
language sql
stable
set search_path = public
as $$
  select c.id, count(distinct s.id)::integer, coalesce(sum(length(b.content::text)), 0)::bigint
  from public.el_profesor_chapters c
  join public.el_profesor_sub_entities s on s.chapter_id = c.id
  join public.el_profesor_fiches f on f.sub_entity_id = s.id and f.status = 'published'
  left join public.el_profesor_fiche_blocks b on b.fiche_id = f.id and b.status = 'published'
  where c.book_id = p_book_id
  group by c.id;
$$;

-- Called by the export route with the service role only.
revoke all on function public.el_profesor_chapter_text_sizes(uuid) from public, anon, authenticated;
grant execute on function public.el_profesor_chapter_text_sizes(uuid) to service_role;
