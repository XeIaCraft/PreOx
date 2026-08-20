-- Hub admin batch: user groups (bulk access grants), permission presets are
-- pure client-side convenience over the existing setAppAccess action (no
-- schema needed for those).

create table public.user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.user_groups is 'Named groups of users, granted access to a set of modules together — an alternative to toggling access one user at a time.';

create table public.user_group_members (
  group_id uuid not null references public.user_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.user_group_app_access (
  group_id uuid not null references public.user_groups (id) on delete cascade,
  app_id uuid not null references public.apps (id) on delete cascade,
  primary key (group_id, app_id)
);

create index user_group_members_user_id_idx on public.user_group_members (user_id);

alter table public.user_groups enable row level security;
alter table public.user_group_members enable row level security;
alter table public.user_group_app_access enable row level security;

-- Admin-managed shared content: same pattern as `apps` itself.
create policy "user_groups_select" on public.user_groups for select to authenticated using (true);
create policy "user_groups_admin_write" on public.user_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "user_group_members_select" on public.user_group_members for select to authenticated using (true);
create policy "user_group_members_admin_write" on public.user_group_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "user_group_app_access_select" on public.user_group_app_access for select to authenticated using (true);
create policy "user_group_app_access_admin_write" on public.user_group_app_access for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.user_groups to authenticated;
grant select, insert, update, delete on public.user_group_members to authenticated;
grant select, insert, update, delete on public.user_group_app_access to authenticated;
