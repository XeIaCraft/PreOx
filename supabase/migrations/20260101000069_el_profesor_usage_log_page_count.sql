-- Demandé le 2026-08-24 : l'estimation de coût avant génération (item 84)
-- moyennait le coût de tous les appels Claude journalisés sans distinguer
-- la taille du PDF traité — un chapitre de 5 pages et un de 200 pages
-- recevaient la même estimation. Cette colonne, journalisée par appel dès
-- qu'il porte sur un chapitre (extraction/complément), permet de calculer
-- un coût moyen par page et d'estimer chaque chapitre selon son propre
-- nombre de pages plutôt qu'une moyenne globale.
alter table public.el_profesor_gemini_usage_log add column pdf_page_count integer;
