-- El Profesor — lets an admin manually reorder books on the dashboard
-- (previously only ever sorted by created_at, with no way to change it).

alter table public.el_profesor_books add column order_index integer not null default 0;

-- Backfill: preserve today's created_at ordering so nothing visually jumps
-- around for existing libraries once this ships.
with ordered as (
  select id, row_number() over (order by created_at asc) - 1 as rn
  from public.el_profesor_books
)
update public.el_profesor_books
set order_index = ordered.rn
from ordered
where public.el_profesor_books.id = ordered.id;
