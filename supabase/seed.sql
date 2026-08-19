-- PreOx — modules du hub.
-- "À table" est un module réel (portage de l'intégration Home Assistant du
-- même nom) : status='available' et route dédiée. Les 5 suivants sont des
-- modules de démonstration marqués "coming_soon" car leur contenu métier
-- sera développé ultérieurement ; la logique d'accès (RBAC) est en revanche
-- pleinement fonctionnelle dès cette version pour tous les modules.

insert into public.apps (slug, name, description, icon, status, route, sort_order, is_active)
values
  ('a-table', 'À table', 'Planifiez vos repas, générez des idées par IA, gérez vos courses.', 'utensils', 'available', '/apps/a-table', 1, true)
on conflict (slug) do update set status = excluded.status, route = excluded.route;

insert into public.apps (slug, name, description, icon, status, sort_order, is_active)
values
  ('cas-cliniques', 'Cas cliniques', 'Des situations pratiques pour raisonner et s''entraîner.', 'stethoscope', 'coming_soon', 2, true),
  ('fiches', 'Fiches', 'Des synthèses claires, organisées et faciles à consulter.', 'file-text', 'coming_soon', 3, true),
  ('checklists', 'Checklists', 'Des protocoles étape par étape pour ne rien oublier.', 'clipboard-check', 'coming_soon', 4, true),
  ('revision', 'Révision', 'Des parcours de révision structurés et progressifs.', 'graduation-cap', 'coming_soon', 5, true),
  ('outils-specialises', 'Outils spécialisés', 'Des utilitaires ciblés pour des besoins spécifiques.', 'flask-conical', 'coming_soon', 6, true)
on conflict (slug) do nothing;
