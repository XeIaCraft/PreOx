-- Refonte de la synthèse de notion (2026-08-27) — la version précédente
-- produisait un simple enchaînement de blocs sans titre ni structure
-- ("une catastrophe" selon le retour utilisateur : pas de cohérence, pas
-- de repère de lecture, risque de perte d'information passé inaperçu).
-- Ajoute des sections titrées (le pendant, côté synthèse, des sous-entités
-- d'une extraction normale) et une trace explicite des blocs sources
-- qu'aucun bloc de synthèse n'a repris, pour rendre visible plutôt que
-- silencieuse toute perte de contenu lors de la fusion inter-livres.
alter table public.el_profesor_notion_synthesis_blocks
  add column section_title text;

alter table public.el_profesor_notion_syntheses
  add column uncovered_sources jsonb not null default '[]';
