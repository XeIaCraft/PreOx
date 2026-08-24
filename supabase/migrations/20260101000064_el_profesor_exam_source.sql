-- Piste d'amélioration 2026-08-24 ("examens blancs chronométrés") : une
-- troisième valeur pour el_profesor_review_log.source, à côté de
-- 'scheduled' (planifiée, met à jour FSRS) et 'free' (libre, jamais
-- planifiée) — 'exam' se comporte comme 'free' (jamais de mise à jour FSRS,
-- une simulation chronométrée ne doit pas fausser la planification) mais
-- reste distinguable dans le journal.
alter table public.el_profesor_review_log drop constraint el_profesor_review_log_source_check;
alter table public.el_profesor_review_log add constraint el_profesor_review_log_source_check check (source in ('scheduled', 'free', 'exam'));
