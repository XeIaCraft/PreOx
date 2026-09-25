-- Préop : catalogues paramétrables (antécédents, allergies, interventions,
-- traitements, classes de traitements). Les valeurs par défaut sont dans
-- l'application ; on ne stocke que les changements de l'utilisateur
-- (ajouts, modifications, éléments masqués), pour que les améliorations
-- des valeurs par défaut lui parviennent quand même. Aucune donnée patient.

create table public.preop_catalogs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('conditions', 'allergens', 'surgeries', 'medications', 'drugClasses')),
  -- { "added": [...], "edited": { id: item }, "hidden": [id] }
  overrides jsonb not null default '{"added": [], "edited": {}, "hidden": []}',
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create trigger preop_catalogs_updated_at before update on public.preop_catalogs
  for each row execute function public.set_updated_at();

alter table public.preop_catalogs enable row level security;
create policy preop_catalogs_own_rows on public.preop_catalogs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.preop_catalogs to authenticated;
