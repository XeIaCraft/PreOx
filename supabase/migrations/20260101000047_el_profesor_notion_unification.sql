-- Unification thématique inter-livres (chantier demandé le 2026-08-23,
-- items 51-56 de l'audit).

-- Bug found while scoping this: el_profesor_notions/notion_links only ever
-- had an admin-only policy, so getGlossary()/getRelatedFiches() — both
-- explicitly meant to be user-facing (see their docstrings) — silently
-- returned nothing for every non-admin user. Same read-only pattern as
-- el_profesor_fiches: any authenticated user with module access can read;
-- writes stay admin-only via the existing "..._admin_all" policies (OR'd
-- permissive policies only widen SELECT, never INSERT/UPDATE/DELETE).
create policy "el_profesor_notions_read" on public.el_profesor_notions
  for select to authenticated
  using (public.has_module_access('el-profesor'));

create policy "el_profesor_notion_links_read" on public.el_profesor_notion_links
  for select to authenticated
  using (public.has_module_access('el-profesor'));

-- Unifies items 52 ("fusion assistée de fiches quasi-doublons entre deux
-- livres") and 56 ("statut obsolète/remplacé par") behind one mechanism: a
-- fiche pointed at by superseded_by_fiche_id is excluded from every review
-- queue and shows a banner linking to its replacement, while the
-- replacement fiche shows the reverse "fusionnée depuis" list — same
-- column pair serves a genuine duplicate (reason='duplicate') and an
-- outdated recommendation (reason='outdated') identically.
alter table public.el_profesor_fiches
  add column superseded_by_fiche_id uuid references public.el_profesor_fiches (id) on delete set null;
alter table public.el_profesor_fiches
  add column superseded_reason text check (superseded_reason in ('duplicate', 'outdated'));
alter table public.el_profesor_fiches
  add column superseded_note text not null default '';

create index el_profesor_fiches_superseded_by_idx on public.el_profesor_fiches (superseded_by_fiche_id);
