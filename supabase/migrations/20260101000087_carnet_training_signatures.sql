-- Carnet de stage : les activités connexes, cours suivis et présentations
-- de séminaires se font signer (médecin responsable, chargé
-- d'enseignement, professeur), comme les cas et les gardes.

alter table public.carnet_related_activities
  add column signature_id uuid references public.carnet_signatures (id) on delete set null;

alter table public.carnet_courses
  add column signature_id uuid references public.carnet_signatures (id) on delete set null;
