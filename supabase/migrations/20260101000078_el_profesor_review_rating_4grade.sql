-- Widens el_profesor_review_log's rating check constraint from the binary
-- Correct/Incorrect self-grade to FSRS's standard 4-grade scale
-- (again/hard/good/easy) — piste 2026-08-31, "notation FSRS à 4 niveaux".
-- The underlying ts-fsrs scheduler already supports all four grades (see
-- fsrs.ts's RATING_MAP); only the app's own persisted check constraint was
-- narrowed to two. Existing 'again'/'good' rows remain valid as-is.
alter table public.el_profesor_review_log drop constraint el_profesor_review_log_rating_check;
alter table public.el_profesor_review_log add constraint el_profesor_review_log_rating_check
  check (rating in ('again', 'hard', 'good', 'easy'));
