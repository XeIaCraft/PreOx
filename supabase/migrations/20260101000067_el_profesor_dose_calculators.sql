-- Piste d'amélioration 2026-08-24 ("calculateur de doses contextuel") :
-- un admin saisit une posologie rapportée au poids (mg/kg, dose maximale
-- optionnelle) rattachée à une notion — jamais une valeur générée par IA.
-- Le calcul côté client n'est qu'une multiplication et un plafond
-- (min(dose_par_kg * poids, dose_max)) : aucune expression arbitraire,
-- aucun moteur de formule, pour rester strictement prévisible sur un
-- outil qui affiche une posologie. Même lecture ouverte / écriture admin
-- que le reste du système de notions.
create table public.el_profesor_dose_calculators (
  id uuid primary key default gen_random_uuid(),
  notion_id uuid not null references public.el_profesor_notions (id) on delete cascade,
  label text not null,
  dose_per_kg numeric not null check (dose_per_kg > 0),
  dose_unit text not null default 'mg',
  max_dose numeric check (max_dose is null or max_dose > 0),
  frequency text not null default '',
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index el_profesor_dose_calculators_notion_idx on public.el_profesor_dose_calculators (notion_id);

alter table public.el_profesor_dose_calculators enable row level security;

create policy "el_profesor_dose_calculators_read" on public.el_profesor_dose_calculators
  for select to authenticated
  using (public.has_module_access('el-profesor'));

create policy "el_profesor_dose_calculators_admin_write" on public.el_profesor_dose_calculators
  for insert to authenticated
  with check (public.is_admin());

create policy "el_profesor_dose_calculators_admin_update" on public.el_profesor_dose_calculators
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "el_profesor_dose_calculators_admin_delete" on public.el_profesor_dose_calculators
  for delete to authenticated
  using (public.is_admin());
