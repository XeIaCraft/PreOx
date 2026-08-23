-- Test de formulations de flashcards, laquelle retient le mieux (item 47
-- de l'audit). "variants" porte des reformulations alternatives du recto
-- (le verso ne change jamais — seule la façon de poser la question est
-- testée) ; chaque révision loggée garde la trace de la formulation
-- effectivement montrée (variant_id null = formulation d'origine), ce qui
-- permet de comparer le taux de réussite par formulation dans
-- el_profesor_review_log sans toucher au moteur FSRS lui-même.
alter table public.el_profesor_flashcards
  add column variants jsonb not null default '[]'::jsonb;

alter table public.el_profesor_review_log
  add column variant_id text;
