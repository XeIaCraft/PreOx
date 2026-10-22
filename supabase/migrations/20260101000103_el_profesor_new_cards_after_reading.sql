-- Cartes neuves après lecture : une carte jamais révisée n'entre dans les
-- révisions qu'une fois sa fiche lue (80 %). Réglage par lecteur, activé par
-- défaut ; une ligne absente vaut « activé ».

alter table public.el_profesor_user_fsrs_params
  add column if not exists new_cards_after_reading boolean not null default true;
