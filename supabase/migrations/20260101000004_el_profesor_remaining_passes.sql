-- El Profesor — Gemini's own estimate of how many more "Compléter"
-- (gap-fill) passes a chapter likely still needs for near-exhaustive
-- coverage. Set by the initial extraction, re-estimated (not just
-- mechanically decremented) after every complementary pass — a long/dense
-- chapter may reasonably need several passes since a single read can't
-- always capture everything at once.

alter table public.el_profesor_chapters
  add column estimated_remaining_passes integer;
