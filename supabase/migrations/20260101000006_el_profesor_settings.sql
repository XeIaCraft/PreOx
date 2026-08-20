-- El Profesor — single-row app settings (currently just which Gemini model
-- powers extraction/complement/selection), editable by an admin without a
-- redeploy. Readable by anyone with module access: the "select passage ->
-- generate content" action is available to non-admin users and needs it
-- too. Writable by admins only.

create table public.el_profesor_settings (
  id boolean primary key default true,
  gemini_model text not null default 'gemini-flash-latest',
  updated_at timestamptz not null default now(),
  constraint el_profesor_settings_singleton check (id)
);

insert into public.el_profesor_settings (id) values (true);

alter table public.el_profesor_settings enable row level security;

create policy "el_profesor_settings_select" on public.el_profesor_settings
  for select to authenticated
  using (public.has_module_access('el-profesor'));

create policy "el_profesor_settings_admin_update" on public.el_profesor_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.el_profesor_settings to authenticated;
