-- Lets an admin manually reorder the fiches listed under a notion (requested
-- 2026-08-26, alongside rename/merge for fiches). Backfilled from creation
-- order so existing notion groupings keep their current display order.
alter table public.el_profesor_notion_links add column position integer not null default 0;

with ranked as (
  select id, row_number() over (partition by notion_id order by created_at asc) - 1 as rn
  from public.el_profesor_notion_links
)
update public.el_profesor_notion_links l
set position = ranked.rn
from ranked
where l.id = ranked.id;
