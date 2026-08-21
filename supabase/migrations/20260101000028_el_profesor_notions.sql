-- Cross-book/cross-fiche notion tagging + AI contradiction detection with
-- admin arbitration. Admin-only end to end (like el_profesor_flags): this is
-- a content-QA tool, not a user-facing feature, so no non-admin select policy.

create table public.el_profesor_notions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.el_profesor_notion_links (
  id uuid primary key default gen_random_uuid(),
  notion_id uuid not null references public.el_profesor_notions (id) on delete cascade,
  fiche_id uuid not null references public.el_profesor_fiches (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (notion_id, fiche_id)
);

create index el_profesor_notion_links_fiche_idx on public.el_profesor_notion_links (fiche_id);

create table public.el_profesor_contradictions (
  id uuid primary key default gen_random_uuid(),
  notion_id uuid references public.el_profesor_notions (id) on delete set null,
  fiche_id_a uuid not null references public.el_profesor_fiches (id) on delete cascade,
  fiche_id_b uuid not null references public.el_profesor_fiches (id) on delete cascade,
  explanation text not null,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'resolved')),
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  -- One open finding per fiche pair per notion — re-running detection won't spam duplicates.
  unique (notion_id, fiche_id_a, fiche_id_b)
);

create index el_profesor_contradictions_status_idx on public.el_profesor_contradictions (status);

alter table public.el_profesor_notions enable row level security;
alter table public.el_profesor_notion_links enable row level security;
alter table public.el_profesor_contradictions enable row level security;

create policy "el_profesor_notions_admin_all" on public.el_profesor_notions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "el_profesor_notion_links_admin_all" on public.el_profesor_notion_links
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "el_profesor_contradictions_admin_all" on public.el_profesor_contradictions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
