-- Versionning d'un livre : une nouvelle édition sans perdre l'historique
-- (item 6 de l'audit). previous_edition_book_id chaîne la nouvelle édition
-- vers l'ancienne — même pattern pointeur+raison que superseded_by_fiche_id
-- sur les fiches (migration 20260101000047) plutôt qu'une table à part,
-- puisqu'il s'agit encore une fois d'un simple lien "remplacé par". La
-- création d'une nouvelle édition archive l'ancienne (mécanisme d'archivage
-- déjà existant, réversible) : rien n'est perdu, seulement retiré de la
-- bibliothèque active.
alter table public.el_profesor_books
  add column previous_edition_book_id uuid references public.el_profesor_books (id) on delete set null;
