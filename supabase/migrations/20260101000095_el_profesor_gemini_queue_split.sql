-- File Gemini : division de chapitres en parties (mode « split »).
-- Les coupures suggérées par Gemini sont appliquées telles quelles (comme
-- la suggestion de la fenêtre « Diviser », sans relecture) ; until_complete
-- = enchaîner ensuite l'extraction des parties dans la même file.

alter table public.el_profesor_gemini_queue drop constraint if exists el_profesor_gemini_queue_mode_check;
alter table public.el_profesor_gemini_queue
  add constraint el_profesor_gemini_queue_mode_check check (mode in ('extraction', 'complementary', 'split'));
