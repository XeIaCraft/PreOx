-- PreOx — modules du hub.
-- "À table" et "El Profesor" sont des modules réels : status='available' et
-- route dédiée. Les 3 suivants sont des modules de démonstration marqués
-- "coming_soon" car leur contenu métier sera développé ultérieurement ; la
-- logique d'accès (RBAC) est en revanche pleinement fonctionnelle dès cette
-- version pour tous les modules.

insert into public.apps (slug, name, description, icon, status, route, sort_order, is_active)
values
  ('a-table', 'À table', 'Planifiez vos repas, générez des idées par IA, gérez vos courses.', 'utensils', 'available', '/apps/a-table', 1, true),
  ('el-profesor', 'El Profesor', 'Fiches, flashcards et révision espacée générées par IA à partir de vos livres.', 'graduation-cap', 'available', '/apps/el-profesor', 2, true)
on conflict (slug) do update set status = excluded.status, route = excluded.route;

insert into public.apps (slug, name, description, icon, status, sort_order, is_active)
values
  ('cas-cliniques', 'Cas cliniques', 'Des situations pratiques pour raisonner et s''entraîner.', 'stethoscope', 'coming_soon', 3, true),
  ('checklists', 'Checklists', 'Des protocoles étape par étape pour ne rien oublier.', 'clipboard-check', 'coming_soon', 4, true),
  ('outils-specialises', 'Outils spécialisés', 'Des utilitaires ciblés pour des besoins spécifiques.', 'flask-conical', 'coming_soon', 5, true)
on conflict (slug) do nothing;
