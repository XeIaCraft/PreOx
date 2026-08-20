-- Self-service profile page: avatar upload + a hardening trigger.
--
-- profiles_update_own_or_admin (see init migration) lets a user UPDATE their
-- own row with no column-level restriction — fine while the only self-service
-- writer was the handle_new_user() trigger, but this migration adds the first
-- user-facing profile edit surface, so it also closes the latent gap: without
-- this trigger a user could set role='admin' on themselves through the same
-- RLS-backed update path used for full_name/avatar_url.

alter table public.profiles add column avatar_url text;

create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger prevent_self_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

-- Public bucket (avatars are shown across the hub header) — writes scoped to
-- the owner's own folder, same pattern as a-table-recipe-photos.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
