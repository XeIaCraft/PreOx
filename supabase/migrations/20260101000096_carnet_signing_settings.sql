-- Carnet de stage : réglage « signing » (qui signe le relevé des prestations
-- et quel nom figure dans la colonne tuteur du PDF) — superviseur du jour
-- ou maître de stage du stage.

alter table public.carnet_settings drop constraint if exists carnet_settings_key_check;
alter table public.carnet_settings add constraint carnet_settings_key_check check (key in ('pay', 'signing'));
