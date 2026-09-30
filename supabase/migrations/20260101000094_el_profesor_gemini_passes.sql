-- El Profesor : nombre de passes Gemini selon le nombre de pages (Réglages IA).
-- Une passe (extraction ou complément) par gemini_pages_per_pass pages, au
-- plus gemini_max_passes au total ; la série s'arrête dès qu'une passe de
-- complément ajoute moins de gemini_min_added_per_pass éléments nouveaux.
-- Valeurs par défaut calibrées sur « Le livre de l'interne » (Gemini lite ≈
-- 25–30 éléments par appel, Claude ≈ 8 éléments par page sur le même livre).

alter table public.el_profesor_settings
  add column if not exists gemini_pages_per_pass numeric(4, 1) not null default 3,
  add column if not exists gemini_max_passes integer not null default 8,
  add column if not exists gemini_min_added_per_pass integer not null default 3;

-- File : nombre de passes de complément visé pour ce chapitre (null : selon les pages).
alter table public.el_profesor_gemini_queue
  add column if not exists target_passes integer;
