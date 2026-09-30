-- File Gemini : les passes « Compléter » passent aussi par la file serveur.
-- mode = extraction (première extraction) ou complementary (combler les
-- trous d'un chapitre déjà extrait, jusqu'à couverture si until_complete).
-- Le statut d'un chapitre déjà extrait n'est pas touché pendant l'attente
-- (un chapitre publié reste visible) ; seul extraction_error porte la note.

alter table public.el_profesor_gemini_queue
  add column if not exists mode text not null default 'extraction',
  add column if not exists until_complete boolean not null default true,
  -- Passes de complément déjà faites (une passe par tour de file, pour rester sous la durée max d'une fonction).
  add column if not exists passes_done integer not null default 0,
  -- Statut du chapitre à remettre après un complément (draft_ready ou published).
  add column if not exists original_status text;

alter table public.el_profesor_gemini_queue drop constraint if exists el_profesor_gemini_queue_mode_check;
alter table public.el_profesor_gemini_queue
  add constraint el_profesor_gemini_queue_mode_check check (mode in ('extraction', 'complementary'));
