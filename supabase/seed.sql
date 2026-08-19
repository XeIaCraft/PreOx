-- PreOx — modules de démonstration
-- Ces 5 modules illustrent la structure du hub. Ils sont marqués
-- "coming_soon" car leur contenu métier sera développé ultérieurement ;
-- la logique d'accès (RBAC) est en revanche pleinement fonctionnelle dès
-- cette version.

insert into public.apps (slug, name, description, icon, status, sort_order, is_active)
values
  ('cas-cliniques', 'Cas cliniques', 'Des situations pratiques pour raisonner et s''entraîner.', 'stethoscope', 'coming_soon', 1, true),
  ('fiches', 'Fiches', 'Des synthèses claires, organisées et faciles à consulter.', 'file-text', 'coming_soon', 2, true),
  ('checklists', 'Checklists', 'Des protocoles étape par étape pour ne rien oublier.', 'clipboard-check', 'coming_soon', 3, true),
  ('revision', 'Révision', 'Des parcours de révision structurés et progressifs.', 'graduation-cap', 'coming_soon', 4, true),
  ('outils-specialises', 'Outils spécialisés', 'Des utilitaires ciblés pour des besoins spécifiques.', 'flask-conical', 'coming_soon', 5, true)
on conflict (slug) do nothing;
