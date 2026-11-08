-- Planning Tivoli : modification depuis le lien public. N'importe qui ayant
-- le lien peut corriger une case d'une semaine validée ; chaque changement
-- est écrit dans un historique (qui permet de revenir en arrière depuis le
-- module). Seule la clé de service (route serveur qui vérifie le jeton)
-- appelle la fonction.

create table public.planning_tivoli_cell_edits (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references public.planning_tivoli_weeks (id) on delete cascade,
  day date not null,
  label text not null,
  old_value text not null default '',
  new_value text not null default '',
  created_at timestamptz not null default now()
);
create index planning_tivoli_cell_edits_created_idx on public.planning_tivoli_cell_edits (created_at desc);

alter table public.planning_tivoli_cell_edits enable row level security;
create policy planning_tivoli_cell_edits_module_access on public.planning_tivoli_cell_edits
  for select to authenticated using ((select public.has_module_access('planning-tivoli')));
grant select on public.planning_tivoli_cell_edits to authenticated;

-- Une case d'un jour d'une semaine validée, de façon atomique (deux
-- modifications simultanées de cases différentes ne s'écrasent pas).
create or replace function public.planning_tivoli_set_cell(p_day date, p_label text, p_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.planning_tivoli_weeks%rowtype;
  old text;
begin
  select * into w from public.planning_tivoli_weeks
    where status = 'validated' and cells ? p_day::text
    order by week_start desc limit 1;
  if not found then
    return false;
  end if;
  old := coalesce(w.cells -> p_day::text ->> p_label, '');
  if old = p_value then
    return true;
  end if;
  update public.planning_tivoli_weeks
    set cells = jsonb_set(cells, array[p_day::text, p_label], to_jsonb(p_value), true)
    where id = w.id;
  insert into public.planning_tivoli_cell_edits (week_id, day, label, old_value, new_value)
    values (w.id, p_day, p_label, old, p_value);
  return true;
end $$;
revoke all on function public.planning_tivoli_set_cell(date, text, text) from public, anon, authenticated;
grant execute on function public.planning_tivoli_set_cell(date, text, text) to service_role;
