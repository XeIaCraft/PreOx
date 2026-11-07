-- Planning Tivoli : une colonne de l'image peut servir deux salles. « END »
-- = Endo C24 et Endo 3 : un seul nom → Endo C24 ; deux noms → le premier en
-- Endo C24, le second en Endo 3 (quel que soit le séparateur). Une salle
-- prend alors une personne de la case (part 1 ou 2) au lieu de la case entière.
-- « H.B. » est l'Angio 2.

alter table public.planning_tivoli_rooms
  add column part smallint check (part in (1, 2));

update public.planning_tivoli_rooms set image_label = 'END', part = 1 where name = 'Endo C24' and image_label = '';
update public.planning_tivoli_rooms set image_label = 'END', part = 2 where name = 'Endo 3' and image_label = '';
-- La salle « END » entière (inactive) fait double emploi avec les deux salles ci-dessus.
delete from public.planning_tivoli_rooms where name = 'Endo (END)' and image_label = 'END' and part is null and not active;
update public.planning_tivoli_rooms set name = 'Angio 2 (HB)' where name = 'HB' and image_label = 'H.B.';
