-- Lets an admin manually reorder the notions list itself (requested
-- 2026-08-26, alongside per-notion fiche reordering added in the previous
-- migration) — until now notions were only ever listed alphabetically.
alter table public.el_profesor_notions add column position integer not null default 0;

with ranked as (
  select id, row_number() over (order by name asc) - 1 as rn
  from public.el_profesor_notions
)
update public.el_profesor_notions n
set position = ranked.rn
from ranked
where n.id = ranked.id;
