-- Questions-réponses sous une fiche, visibles par tous (item 28 de
-- l'audit). Deux tables plates (pas de fils imbriqués) : une question,
-- ses réponses. Modération légère et autonome plutôt qu'un rattachement
-- au système el_profesor_flags existant — celui-ci est câblé spécifiquement
-- pour marquer needs_review sur un bloc/flashcard admin-only et n'a aucune
-- surface d'admin listant les signalements ouverts ; une question/réponse
-- n'a rien à "corriger", juste à être retirée si inappropriée, donc un
-- simple booléen "flagged" (visible par l'auteur/l'admin comme un badge,
-- pas une file à part) suffit et reste cohérent avec le reste du module.
create table public.el_profesor_fiche_questions (
  id uuid primary key default gen_random_uuid(),
  fiche_id uuid not null references public.el_profesor_fiches (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.el_profesor_fiche_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.el_profesor_fiche_questions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index el_profesor_fiche_questions_fiche_idx on public.el_profesor_fiche_questions (fiche_id, created_at);
create index el_profesor_fiche_answers_question_idx on public.el_profesor_fiche_answers (question_id, created_at);

alter table public.el_profesor_fiche_questions enable row level security;
alter table public.el_profesor_fiche_answers enable row level security;

create policy "el_profesor_fiche_questions_read" on public.el_profesor_fiche_questions
  for select to authenticated
  using (public.has_module_access('el-profesor'));

create policy "el_profesor_fiche_questions_insert" on public.el_profesor_fiche_questions
  for insert to authenticated
  with check (author_id = auth.uid() and public.has_module_access('el-profesor'));

create policy "el_profesor_fiche_questions_delete" on public.el_profesor_fiche_questions
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "el_profesor_fiche_answers_read" on public.el_profesor_fiche_answers
  for select to authenticated
  using (public.has_module_access('el-profesor'));

create policy "el_profesor_fiche_answers_insert" on public.el_profesor_fiche_answers
  for insert to authenticated
  with check (author_id = auth.uid() and public.has_module_access('el-profesor'));

create policy "el_profesor_fiche_answers_delete" on public.el_profesor_fiche_answers
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());
