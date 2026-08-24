-- Piste d'amélioration 2026-08-24 ("le socle", rang 1) : searchLibrary ne
-- matchait jusqu'ici que le titre des fiches et le nom des sous-entités
-- (ilike) — un terme présent uniquement dans un bloc ou une flashcard était
-- introuvable. search_vector est maintenu par trigger plutôt que dans la
-- couche applicative : le contenu jsonb change de forme selon block_type
-- (tableau, protocole, texte simple — même logique que blockToPlainText
-- côté TS), et un trigger garantit que l'index ne peut jamais dériver du
-- contenu réel quel que soit le chemin d'écriture (extraction, édition
-- admin, proposition de notion...) sans avoir à toucher chaque site
-- d'écriture actuel et futur.

alter table public.el_profesor_fiche_blocks add column search_vector tsvector;
alter table public.el_profesor_flashcards add column search_vector tsvector;

create function public.el_profesor_block_search_text(p_block_type text, p_content jsonb)
returns text
language sql
immutable
as $$
  select case p_block_type
    when 'tableau_comparatif' then
      coalesce((select string_agg(h, ' ') from jsonb_array_elements_text(p_content->'headers') h), '')
      || ' ' ||
      coalesce((select string_agg(cell, ' ') from jsonb_array_elements(p_content->'rows') row_, jsonb_array_elements_text(row_) cell), '')
    when 'protocole_paliers' then
      coalesce(
        (select string_agg(coalesce(step->>'label', '') || ' ' || coalesce(step->>'detail', ''), ' ')
         from jsonb_array_elements(p_content->'steps') step),
        ''
      )
    else coalesce(p_content->>'text', '')
  end;
$$;

create function public.el_profesor_fiche_block_search_trigger()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector('french', public.el_profesor_block_search_text(new.block_type, new.content));
  return new;
end;
$$;

create trigger el_profesor_fiche_blocks_search_vector
  before insert or update of content, block_type on public.el_profesor_fiche_blocks
  for each row execute function public.el_profesor_fiche_block_search_trigger();

create function public.el_profesor_flashcard_search_trigger()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector('french', coalesce(new.front->>'text', '') || ' ' || coalesce(new.back->>'text', ''));
  return new;
end;
$$;

create trigger el_profesor_flashcards_search_vector
  before insert or update of front, back on public.el_profesor_flashcards
  for each row execute function public.el_profesor_flashcard_search_trigger();

create index el_profesor_fiche_blocks_search_idx on public.el_profesor_fiche_blocks using gin (search_vector);
create index el_profesor_flashcards_search_idx on public.el_profesor_flashcards using gin (search_vector);

-- Backfill existing rows once — done with the updated_at trigger disabled
-- so this one-time maintenance write doesn't make every row look
-- freshly-edited.
alter table public.el_profesor_fiche_blocks disable trigger set_el_profesor_fiche_blocks_updated_at;
update public.el_profesor_fiche_blocks set search_vector = to_tsvector('french', public.el_profesor_block_search_text(block_type, content));
alter table public.el_profesor_fiche_blocks enable trigger set_el_profesor_fiche_blocks_updated_at;

alter table public.el_profesor_flashcards disable trigger set_el_profesor_flashcards_updated_at;
update public.el_profesor_flashcards set search_vector = to_tsvector('french', coalesce(front->>'text', '') || ' ' || coalesce(back->>'text', ''));
alter table public.el_profesor_flashcards enable trigger set_el_profesor_flashcards_updated_at;
