-- Piste d'amélioration 2026-08-24 ("mode urgence / bloc") : marque un bloc
-- de fiche déjà publié et relu par un admin comme référence d'urgence,
-- pour le regrouper dans une vue dédiée à la consultation rapide. Pas de
-- nouveau contenu ici — seulement une étiquette posée à la main sur du
-- contenu qui a déjà traversé le circuit de relecture normal. L'IA n'a
-- jamais accès à cette colonne : aucune action serveur ne l'écrit à
-- partir d'une génération.
alter table public.el_profesor_fiche_blocks
  add column is_emergency boolean not null default false;

create index el_profesor_fiche_blocks_emergency_idx on public.el_profesor_fiche_blocks (is_emergency) where is_emergency;
