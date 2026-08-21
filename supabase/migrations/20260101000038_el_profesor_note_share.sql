-- Selective sharing of a personal note (item 27 of the backlog) — same
-- unguessable-token pattern already used for fiches and recipes
-- (share_token gates a public read-only page, not a session check).
alter table public.el_profesor_notes
  add column share_token text unique;
