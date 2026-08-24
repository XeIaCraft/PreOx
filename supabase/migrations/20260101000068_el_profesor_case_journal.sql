-- Piste d'amélioration 2026-08-24 ("journal de cas relié aux notions") :
-- journal personnel de cas cliniques rencontrés (stage, garde...), que
-- l'utilisateur relie librement à une notion transversale pour resurgir au
-- même endroit que ses fiches/flashcards sur le sujet. Entièrement privé
-- (même politique RLS que el_profesor_notes) — jamais partagé, jamais lu
-- par un admin, jamais généré par IA.
create table public.el_profesor_case_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notion_id uuid references public.el_profesor_notions (id) on delete set null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index el_profesor_case_journal_entries_user_idx on public.el_profesor_case_journal_entries (user_id, created_at desc);
create index el_profesor_case_journal_entries_notion_idx on public.el_profesor_case_journal_entries (notion_id);

create trigger set_el_profesor_case_journal_entries_updated_at
  before update on public.el_profesor_case_journal_entries
  for each row execute function public.set_updated_at();

alter table public.el_profesor_case_journal_entries enable row level security;

create policy "el_profesor_case_journal_entries_own_rows" on public.el_profesor_case_journal_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.el_profesor_case_journal_entries to authenticated;
