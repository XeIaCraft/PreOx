-- PreOx — schéma initial du hub applicatif
-- Tables : profiles, apps, user_app_access
-- + fonctions, triggers et policies RLS associés.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- Tables
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Source of truth for role-based access.';

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text not null default 'layout-grid',
  route text,
  status text not null default 'coming_soon' check (status in ('available', 'coming_soon')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.apps is 'Registry of every module the hub can expose.';

create table public.user_app_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid not null references public.apps (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, app_id)
);

comment on table public.user_app_access is 'Per-user, per-module access grants — the core of the hub RBAC.';

create index user_app_access_user_id_idx on public.user_app_access (user_id);
create index user_app_access_app_id_idx on public.user_app_access (app_id);
create index apps_sort_order_idx on public.apps (sort_order);

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_apps_updated_at
  before update on public.apps
  for each row execute function public.set_updated_at();

-- ============================================================================
-- New auth user -> profile row
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- is_admin() helper — used throughout RLS policies
-- ============================================================================

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- Defense in depth: only an admin may change someone's role or email,
-- even though the update-own-row policy below would otherwise allow it.
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.email is distinct from old.email)
     and not public.is_admin() then
    raise exception 'Only an administrator can change role or email.';
  end if;
  return new;
end;
$$;

create trigger trg_protect_profile_sensitive_fields
  before update on public.profiles
  for each row execute function public.protect_profile_sensitive_fields();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.user_app_access enable row level security;

-- profiles ------------------------------------------------------------------

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Row inserts happen exclusively through the handle_new_user() trigger
-- (security definer), so no INSERT policy is granted to regular users.

-- apps ------------------------------------------------------------------

create policy "apps_select_authenticated"
  on public.apps for select
  to authenticated
  using (true);

create policy "apps_select_public_active"
  on public.apps for select
  to anon
  using (is_active = true);

create policy "apps_admin_write"
  on public.apps for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- user_app_access ------------------------------------------------------------------

create policy "user_app_access_select_own_or_admin"
  on public.user_app_access for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "user_app_access_admin_write"
  on public.user_app_access for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Table grants (RLS still applies on top of these)
-- ============================================================================

grant select, update on public.profiles to authenticated;
grant select on public.apps to authenticated, anon;
grant insert, update, delete on public.apps to authenticated;
grant select, insert, delete on public.user_app_access to authenticated;
