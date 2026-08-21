-- Server-side "where was I" per user, so the resume banner and the chapter
-- view's default sub-entity work across devices — the existing localStorage
-- version (src/lib/el-profesor/local-prefs.ts) only ever worked on the
-- device that set it. Kept alongside localStorage rather than replacing it:
-- localStorage still gives an instant client-side fallback before this
-- table's value reaches the page.
create table public.el_profesor_reading_position (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chapter_id uuid not null references public.el_profesor_chapters (id) on delete cascade,
  sub_entity_id uuid references public.el_profesor_sub_entities (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.el_profesor_reading_position enable row level security;

create policy "el_profesor_reading_position_own_rows" on public.el_profesor_reading_position
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.el_profesor_reading_position to authenticated;
