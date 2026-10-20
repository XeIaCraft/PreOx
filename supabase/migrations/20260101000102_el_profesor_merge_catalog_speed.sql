-- Fusion de livres : lister les fiches sources prenait 2 à 12 s par page de
-- 1 000 (8 000 fiches : la page Notions expirait). En cause, deux sous-
-- requêtes par fiche qui relisaient le contenu complet de chaque bloc et de
-- chaque carte pour en mesurer la longueur.
--   * Les volumes sont agrégés en une passe par table, avec la taille
--     stockée (pg_column_size, sans relire le contenu) : à 2 % près la
--     longueur du texte sur la bibliothèque réelle.
--   * el_profesor_merge_source_catalog renvoie toute la liste en un seul
--     appel (un tableau JSON), au lieu d'une page de 1 000 à la fois qui
--     recalculait tout à chaque page.

create or replace function public.el_profesor_merge_source_fiches(p_book_ids uuid[], p_include_drafts boolean)
returns table (
  fiche_id uuid,
  book_id uuid,
  chapter_id uuid,
  chapter_title text,
  chapter_order integer,
  sub_entity_order integer,
  title text,
  summary text,
  fiche_status text,
  block_count integer,
  card_count integer,
  chars integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select fb.fiche_id, count(*) as n, sum(pg_column_size(fb.content)) as chars
    from public.el_profesor_fiche_blocks fb
    where p_include_drafts or fb.status = 'published'
    group by fb.fiche_id
  ),
  k as (
    select fc.fiche_id, count(*) as n, sum(pg_column_size(fc.front) + pg_column_size(fc.back)) as chars
    from public.el_profesor_flashcards fc
    where fc.status <> 'replaced' and (p_include_drafts or fc.status = 'published')
    group by fc.fiche_id
  )
  select
    f.id,
    c.book_id,
    c.id,
    c.title,
    c.order_index,
    se.order_index,
    f.title,
    se.summary,
    f.status,
    coalesce(b.n, 0)::integer,
    coalesce(k.n, 0)::integer,
    (coalesce(b.chars, 0) + coalesce(k.chars, 0))::integer
  from public.el_profesor_fiches f
  join public.el_profesor_sub_entities se on se.id = f.sub_entity_id
  join public.el_profesor_chapters c on c.id = se.chapter_id
  left join b on b.fiche_id = f.id
  left join k on k.fiche_id = f.id
  where c.book_id = any(p_book_ids)
    and f.superseded_by_fiche_id is null
    and (p_include_drafts or f.status = 'published')
$$;

create or replace function public.el_profesor_merge_source_catalog(p_book_ids uuid[], p_include_drafts boolean)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(s) order by s.book_id, s.chapter_order, s.sub_entity_order, s.fiche_id),
    '[]'::jsonb
  )
  from public.el_profesor_merge_source_fiches(p_book_ids, p_include_drafts) s
$$;

revoke all on function public.el_profesor_merge_source_catalog(uuid[], boolean) from public, anon;
grant execute on function public.el_profesor_merge_source_catalog(uuid[], boolean) to authenticated, service_role;
