-- Captures what was sent to the AI provider and what it sent back, for the
-- 5 most recent extraction attempts per chapter — requested 2026-08-25 after
-- two separate "empty generation, no error shown" reports that were
-- impossible to actually root-cause without seeing the raw exchange. Pruned
-- to the last 5 per chapter by the app (see actions/extraction.ts and
-- batch-poll.ts) rather than a DB trigger, to keep the prune logic in one
-- place alongside the insert it follows.
alter table public.el_profesor_extraction_jobs add column provider text;
alter table public.el_profesor_extraction_jobs add column model text;
alter table public.el_profesor_extraction_jobs add column request_prompt text;
alter table public.el_profesor_extraction_jobs add column raw_response text;
