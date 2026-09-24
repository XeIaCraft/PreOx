-- Carnet de stage, v2 (retours d'utilisation) — aucune donnée perdue :
--
-- * Stages : « Secteur » et « Activité » ne font qu'un. Les deux valeurs
--   existantes sont fusionnées dans `sector` avant de supprimer `activity`.
--   Chaque stage reçoit son propre maître de stage (`supervisor_id`), qui
--   dépend de l'hôpital et du service, distinct du maître de stage
--   coordinateur (`coordinator_id`, le même pendant toute la formation sauf
--   changement).
-- * Prestations : plusieurs ALR et plusieurs actes techniques par cas
--   (tableaux), un libellé libre facultatif pour les choix « Autre »
--   (`other_labels`, par code), et un détail facultatif des produits et
--   procédures (`details`). Les valeurs uniques existantes sont reprises dans
--   les tableaux avant de supprimer les anciennes colonnes.

-- Stages ---------------------------------------------------------------------

update public.carnet_stages
set sector = case
  when btrim(sector) = '' then btrim(activity)
  when btrim(activity) = '' or lower(btrim(activity)) = lower(btrim(sector)) then sector
  else sector || ' – ' || activity
end;

alter table public.carnet_stages drop column activity;

alter table public.carnet_stages
  add column supervisor_id uuid references public.carnet_supervisors (id) on delete set null;

-- Prestations ----------------------------------------------------------------

alter table public.carnet_cases
  add column regional_types text[] not null default '{}',
  add column technical_acts text[] not null default '{}',
  add column other_labels jsonb not null default '{}',
  add column details jsonb not null default '{}';

update public.carnet_cases set regional_types = array[regional_type] where regional_type is not null;
update public.carnet_cases set technical_acts = array[technical_act] where technical_act is not null;

-- Supprime aussi l'ancienne contrainte « au moins une technique », qui portait sur ces colonnes.
alter table public.carnet_cases drop column regional_type, drop column technical_act;

alter table public.carnet_cases
  add constraint carnet_cases_technique_check
  check (general_anesthesia or cardinality(regional_types) > 0 or cardinality(technical_acts) > 0);

-- Profil ---------------------------------------------------------------------

-- Signature du candidat (image PNG dessinée une fois), reportée sur la
-- déclaration de la page 2 et le rapport d'activité du carnet exporté.
alter table public.carnet_profiles add column signature text not null default '';
