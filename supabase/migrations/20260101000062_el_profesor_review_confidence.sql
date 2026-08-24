-- Piste d'amélioration 2026-08-24 ("calibration de la confiance en
-- révision") : la notation correct/incorrect actuelle ne distingue pas
-- l'état le plus dangereux en pratique clinique — être sûr de soi et se
-- tromper quand même. Nullable : les révisions déjà enregistrées, ou
-- celles où l'utilisateur n'a pas encore mis à jour son client, restent
-- valides sans confiance renseignée.
alter table public.el_profesor_review_log
  add column confidence text check (confidence in ('sure', 'unsure'));
