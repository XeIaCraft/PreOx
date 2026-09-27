-- Préop : listes personnelles du plan et du bloc (cibles, monitorage et
-- matériel, fiches de monitorage, procédures d'urgence, complications,
-- ordre des sections du bloc). Rangées avec les catalogues (une ligne de
-- type « plan_lists » par utilisateur). Aucune donnée patient.

alter table public.preop_catalogs drop constraint if exists preop_catalogs_kind_check;
alter table public.preop_catalogs add constraint preop_catalogs_kind_check
  check (kind in ('conditions', 'allergens', 'surgeries', 'medications', 'drugClasses', 'values', 'service', 'plan_lists'));
