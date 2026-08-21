-- Personal tags on a favorite, so the "Mes favoris" list can be filtered —
-- item 35 of the backlog. Purely personal (no admin visibility needed),
-- same table as the bookmark itself rather than a separate join table:
-- a handful of short tags per bookmark, never queried independently of it.
alter table public.el_profesor_bookmarks
  add column tags text[] not null default '{}';
