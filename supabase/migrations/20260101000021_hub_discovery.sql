-- Hub discovery batch: pinned modules, recently-visited tracking, and an
-- admin-authored changelog ("Nouveautés").

alter table public.profiles add column pinned_app_ids uuid[] not null default '{}';

create table public.user_recent_apps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid not null references public.apps (id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, app_id)
);

comment on table public.user_recent_apps is 'Last-visit timestamp per user per module, for the "recently visited" row on /apps.';

alter table public.user_recent_apps enable row level security;

create policy "user_recent_apps_select_own" on public.user_recent_apps for select to authenticated using (auth.uid() = user_id);
create policy "user_recent_apps_upsert_own" on public.user_recent_apps for insert to authenticated with check (auth.uid() = user_id);
create policy "user_recent_apps_update_own" on public.user_recent_apps for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.user_recent_apps to authenticated;

create table public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  app_id uuid references public.apps (id) on delete set null,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.changelog_entries is 'Admin-authored "what''s new" entries, shown on /nouveautes and folded into the personal digest on /apps.';

create index changelog_entries_published_at_idx on public.changelog_entries (published_at desc);

alter table public.changelog_entries enable row level security;

create policy "changelog_entries_select" on public.changelog_entries for select to authenticated using (true);
create policy "changelog_entries_admin_write" on public.changelog_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.changelog_entries to authenticated;
