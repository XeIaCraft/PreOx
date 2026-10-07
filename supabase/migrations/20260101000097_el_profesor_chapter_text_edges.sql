-- El Profesor : début et fin du texte de chaque chapitre PDF, gardés en base.
-- Le contexte des parties voisines (file Gemini) les lit ici au lieu de
-- retélécharger deux PDF à chaque passe — c'était l'essentiel de la bande
-- passante Supabase (« Cached Egress ») consommée par la file.

alter table public.el_profesor_chapters
  add column if not exists text_head text,
  add column if not exists text_tail text;
