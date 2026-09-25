-- Préop : nouvelle liste paramétrable « valeurs à signaler » (seuils des
-- constantes et de la biologie : PA, FC, SpO2, plaquettes, INR, HbA1c…).
-- Même principe que les autres catalogues : seuls les changements de
-- l'utilisateur sont stockés. Aucune donnée patient.

alter table public.preop_catalogs drop constraint if exists preop_catalogs_kind_check;
alter table public.preop_catalogs add constraint preop_catalogs_kind_check
  check (kind in ('conditions', 'allergens', 'surgeries', 'medications', 'drugClasses', 'values'));
