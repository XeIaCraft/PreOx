-- Ties the two features added in the same session together (explicit
-- request 2026-08-24: "que l'ensemble des fonctions fonctionne entre
-- elle") — the admin "Lots Claude récents" panel could not show a cost
-- estimate per batch because the job row never recorded which model was
-- used nor how many tokens it consumed, even though that data is already
-- available (client.messages.batches.results usage) at the moment the
-- cron poller marks a job completed.

alter table public.el_profesor_batch_jobs
  add column model text,
  add column prompt_tokens integer,
  add column candidates_tokens integer;
