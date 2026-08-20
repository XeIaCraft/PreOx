-- Personal, private annotations on a sub-entity's fiche — distinct from the
-- shared fiche content itself (admin-authored, same for every user) and from
-- flags (which report a content error to admins). One free-text note per
-- user per sub-entity, own-rows RLS only, same as review_state/bookmarks.

create table public.el_profesor_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sub_entity_id uuid not null references public.el_profesor_sub_entities (id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, sub_entity_id)
);

create index el_profesor_notes_user_id_idx on public.el_profesor_notes (user_id);

create trigger set_el_profesor_notes_updated_at
  before update on public.el_profesor_notes
  for each row execute function public.set_updated_at();

alter table public.el_profesor_notes enable row level security;

create policy "el_profesor_notes_own_rows" on public.el_profesor_notes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.el_profesor_notes to authenticated;
