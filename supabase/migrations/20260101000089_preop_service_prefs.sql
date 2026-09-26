-- Préop : préférences du service (halogéné, FiO2, débit de gaz frais,
-- sétron, dose de dexaméthasone), appliquées aux protocoles quand ils
-- deviennent le plan d'un patient. Rangées avec les catalogues (une ligne
-- de type « service » par utilisateur). Aucune donnée patient.

alter table public.preop_catalogs drop constraint if exists preop_catalogs_kind_check;
alter table public.preop_catalogs add constraint preop_catalogs_kind_check
  check (kind in ('conditions', 'allergens', 'surgeries', 'medications', 'drugClasses', 'values', 'service'));
