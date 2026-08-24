-- Piste d'amélioration 2026-08-24 ("plafond de dépense IA") : le tableau de
-- bord IA affiche déjà un coût estimé (item 48), mais rien n'empêche un
-- admin de continuer à lancer des générations une fois le budget mensuel
-- dépassé. Null = pas de plafond (comportement actuel, inchangé par
-- défaut).
alter table public.el_profesor_settings
  add column ai_spend_cap_usd numeric;
