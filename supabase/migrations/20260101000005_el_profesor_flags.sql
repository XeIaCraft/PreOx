-- El Profesor — lets any user with module access flag a published block or
-- flashcard they believe is wrong, closing the loop on errors that slip
-- past admin review. Users can never write directly to fiche_blocks/
-- flashcards (admin-only per existing RLS); instead they insert a flag row,
-- and a security-definer trigger propagates needs_review=true onto the
-- target so it surfaces in the existing admin "à vérifier" review filter.

create table public.el_profesor_flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('block', 'flashcard')),
  target_id uuid not null,
  flagged_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index el_profesor_flags_target_idx on public.el_profesor_flags (target_type, target_id);

create or replace function public.el_profesor_apply_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_type = 'block' then
    update public.el_profesor_fiche_blocks set needs_review = true where id = new.target_id;
  elsif new.target_type = 'flashcard' then
    update public.el_profesor_flashcards set needs_review = true where id = new.target_id;
  end if;
  return new;
end;
$$;

create trigger trg_el_profesor_apply_flag
  after insert on public.el_profesor_flags
  for each row execute function public.el_profesor_apply_flag();

alter table public.el_profesor_flags enable row level security;

create policy "el_profesor_flags_select" on public.el_profesor_flags
  for select to authenticated
  using (public.is_admin() or flagged_by = auth.uid());

create policy "el_profesor_flags_insert" on public.el_profesor_flags
  for insert to authenticated
  with check (flagged_by = auth.uid() and public.has_module_access('el-profesor'));

create policy "el_profesor_flags_admin_update" on public.el_profesor_flags
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.el_profesor_flags to authenticated;
