-- Suite à la demande explicite de l'utilisateur après la livraison de
-- l'item 23 : (1) l'extraction elle-même doit repérer quand un schéma/une
-- image du PDF vaut la peine d'être associé à une flashcard, pour que
-- l'admin n'ait plus à deviner où chercher ; (2) une image de flashcard
-- doit pouvoir servir de question directe (« qu'est-ce que c'est ? » —
-- déjà couvert, front+image+back) ou d'exercice de légende masquée
-- (« retrouve la légende » — nouveau : zones nommées sur l'image, cachées
-- au recto, révélées au verso).
alter table public.el_profesor_flashcards
  add column suggested_image_page integer,
  add column suggested_image_hint text,
  add column image_occlusions jsonb not null default '[]'::jsonb;
