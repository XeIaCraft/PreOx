-- Piste d'amélioration 2026-08-24 ("flashcards à trous (cloze)") : un
-- deuxième mode de flashcard, à côté du recto/verso classique. Rangée
-- vide (défaut) = carte classique, comportement strictement inchangé —
-- cloze_ranges non vide bascule le rendu en révision (voir
-- flashcard-reviewer.tsx). Positions calculées côté client par
-- parseClozeText (cloze.ts) à partir d'une saisie {{...}}, jamais
-- persistées avec le marquage lui-même — front.text reste le texte brut
-- sans accolades, ranges pointe vers ses positions à masquer.
alter table public.el_profesor_flashcards add column cloze_ranges jsonb not null default '[]'::jsonb;
