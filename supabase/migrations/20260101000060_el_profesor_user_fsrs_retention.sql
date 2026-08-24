-- Piste d'amélioration 2026-08-24 ("paramètres FSRS ajustés à chaque
-- utilisateur") : personnalise le seul levier FSRS prévu pour ça —
-- request_retention, la probabilité de rappel visée à chaque révision
-- planifiée — plutôt que de tenter d'ajuster les 19 poids de l'algorithme
-- depuis zéro (ça demande un vrai optimiseur par descente de gradient,
-- validé contre une implémentation de référence, pas quelque chose à
-- improviser). Voir maybeRecomputeUserFsrsRetention dans dal.ts pour la
-- formule de recalcul.
create table public.el_profesor_user_fsrs_params (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  request_retention double precision not null default 0.9,
  reviews_at_last_update integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.el_profesor_user_fsrs_params enable row level security;

create policy "el_profesor_user_fsrs_params_own_rows" on public.el_profesor_user_fsrs_params
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.el_profesor_user_fsrs_params to authenticated;
