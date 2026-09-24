-- El Profesor — adds updated_at to sub_entities, matching books/chapters/
-- fiches/fiche_blocks/flashcards (see 20260101000002_el_profesor.sql). Needed
-- for delta sync (piste 2026-09-24 — "module 100% local"): reordering the
-- notions within a chapter only ever touches a sub_entity's order_index, and
-- without its own updated_at that change is invisible to a sync that only
-- compares max(updated_at) across a chapter's fiches/blocks/flashcards.

alter table public.el_profesor_sub_entities
  add column updated_at timestamptz not null default now();

create trigger set_el_profesor_sub_entities_updated_at
  before update on public.el_profesor_sub_entities
  for each row execute function public.set_updated_at();

-- Per-chapter "last modified" timestamp (piste 2026-09-24 — synchronisation
-- delta) — the max updated_at across the chapter's own row and everything
-- nested under it (sub-entities, fiches, blocks, flashcards). One grouped
-- query instead of N+1 round trips or deeply nested PostgREST embedding;
-- runs as the calling role (no security definer), so each table's existing
-- RLS policies still apply exactly as they do for a normal read.
create or replace function public.el_profesor_chapter_last_modified(p_chapter_ids uuid[])
returns table (chapter_id uuid, last_modified_at timestamptz)
language sql
stable
as $$
  select
    c.id as chapter_id,
    greatest(
      c.updated_at,
      coalesce(max(se.updated_at), c.updated_at),
      coalesce(max(f.updated_at), c.updated_at),
      coalesce(max(fb.updated_at), c.updated_at),
      coalesce(max(fc.updated_at), c.updated_at)
    ) as last_modified_at
  from public.el_profesor_chapters c
  left join public.el_profesor_sub_entities se on se.chapter_id = c.id
  left join public.el_profesor_fiches f on f.sub_entity_id = se.id
  left join public.el_profesor_fiche_blocks fb on fb.fiche_id = f.id
  left join public.el_profesor_flashcards fc on fc.fiche_id = f.id
  where c.id = any(p_chapter_ids)
  group by c.id, c.updated_at;
$$;

grant execute on function public.el_profesor_chapter_last_modified(uuid[]) to authenticated;
