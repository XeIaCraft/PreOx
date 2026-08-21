-- Full book archival (item 49 of the backlog): an admin exports the book's
-- content + anonymized aggregate review stats, then marks it archived.
-- Deliberately a soft flag rather than deletion — reversible, and every
-- existing row (chapters, fiches, flashcards, per-user review history)
-- stays intact; archiving only removes the book from the active library
-- views computed in page.tsx.
alter table public.el_profesor_books
  add column archived_at timestamptz;
