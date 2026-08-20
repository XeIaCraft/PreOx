-- Admin activity log: who invited/removed a user, changed a role, granted
-- or revoked module access, or touched the apps registry. Admin-only in
-- both directions (read and write) — this is hub-administration audit
-- trail, not user-facing data, and unrelated to the "no admin override on
-- personal module data" principle used elsewhere (a_table_*, el_profesor_
-- review_state): those protect a user's own activity inside a module: this
-- logs the *admin's* own actions on the hub's shared user/app registry.

create table public.hub_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_label text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index hub_activity_log_created_at_idx on public.hub_activity_log (created_at desc);

alter table public.hub_activity_log enable row level security;

create policy "hub_activity_log_admin_only" on public.hub_activity_log
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert on public.hub_activity_log to authenticated;
