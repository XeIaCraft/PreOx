-- Fusion de livres par lots, pour étaler les coûts :
--   1. la table des matières (plan, répartition, chapitres et fiches de
--      chaque sous-partie) est établie d'abord, puis la fusion s'arrête à
--      l'étape 'ready' : toutes les fiches fusionnées sont prévues, avec
--      leurs fiches sources, mais aucune n'est encore rédigée (tâches
--      'held') ;
--   2. l'administrateur choisit les chapitres à rédiger (un, plusieurs ou
--      tous) : leurs tâches passent en attente avec un numéro de lot
--      (round), la fusion repasse par fiches → repair pour ce lot seulement,
--      puis revient à 'ready' — ou à 'done' quand tout est rédigé.

alter table public.el_profesor_merge_jobs drop constraint if exists el_profesor_merge_jobs_stage_check;
alter table public.el_profesor_merge_jobs
  add constraint el_profesor_merge_jobs_stage_check
  check (stage in ('plan', 'assign', 'chapters', 'ready', 'fiches', 'repair', 'done', 'failed', 'canceled'));
alter table public.el_profesor_merge_jobs
  add column if not exists round integer not null default 0;

alter table public.el_profesor_merge_tasks drop constraint if exists el_profesor_merge_tasks_status_check;
alter table public.el_profesor_merge_tasks
  add constraint el_profesor_merge_tasks_status_check
  check (status in ('held', 'waiting', 'running', 'submitted', 'done', 'failed'));
alter table public.el_profesor_merge_tasks
  add column if not exists round integer not null default 0;

create index if not exists el_profesor_merge_tasks_round_idx on public.el_profesor_merge_tasks (job_id, stage, round);
