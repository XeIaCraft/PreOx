-- Piste d'amélioration 2026-08-24 ("recommandations officielles rattachées
-- aux notions") : un lien manuel vers une source officielle (HAS, SPILF,
-- société savante...) pour une notion transversale — jamais un texte
-- généré par IA. L'IA n'écrit jamais de contenu clinique dans cette table :
-- seul un admin ajoute un lien + un intitulé, la recommandation elle-même
-- reste sur le site de l'organisme source. Même lecture ouverte /
-- écriture admin que le reste du système de notions
-- (el_profesor_notions_read).
create table public.el_profesor_notion_recommendations (
  id uuid primary key default gen_random_uuid(),
  notion_id uuid not null references public.el_profesor_notions (id) on delete cascade,
  title text not null,
  url text not null,
  source text not null default '',
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index el_profesor_notion_recommendations_notion_idx on public.el_profesor_notion_recommendations (notion_id);

alter table public.el_profesor_notion_recommendations enable row level security;

create policy "el_profesor_notion_recommendations_read" on public.el_profesor_notion_recommendations
  for select to authenticated
  using (public.has_module_access('el-profesor'));

create policy "el_profesor_notion_recommendations_admin_write" on public.el_profesor_notion_recommendations
  for insert to authenticated
  with check (public.is_admin());

create policy "el_profesor_notion_recommendations_admin_update" on public.el_profesor_notion_recommendations
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "el_profesor_notion_recommendations_admin_delete" on public.el_profesor_notion_recommendations
  for delete to authenticated
  using (public.is_admin());
