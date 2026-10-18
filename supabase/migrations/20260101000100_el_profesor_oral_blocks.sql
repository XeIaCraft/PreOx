-- Préparation de l'oral (octobre 2026) : deux types de blocs de plus.
--   * 'historique'  — comment on faisait avant, pourquoi on a changé (quelle
--     étude, quel accident, quelle recommandation), quand ;
--   * 'etudes_cles' — les études et auteurs qui fondent la pratique actuelle
--     ou ancienne, en tableau (étude, année, ce qu'elle a montré, ce que ça a
--     changé, référence PubMed/DOI).
-- Rarement dans les livres : surtout ajoutés lors de « Vérifier
-- l'actualité » (PubMed, Consensus), et repris par la fusion de livres quand
-- les sources en parlent.

alter table public.el_profesor_fiche_blocks drop constraint if exists el_profesor_fiche_blocks_block_type_check;
alter table public.el_profesor_fiche_blocks
  add constraint el_profesor_fiche_blocks_block_type_check check (
    block_type in (
      'definition_mecanisme', 'valeurs_seuils', 'tableau_comparatif', 'protocole_paliers',
      'mnemotechnique', 'perle_clinique', 'piege_erreur', 'formule', 'texte_libre',
      'divergence', 'a_retenir', 'historique', 'etudes_cles'
    )
  );
