-- Hub feedback widget: users can report a bug / leave feedback from
-- anywhere in the hub; admins review it in one place.

create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  page_url text,
  created_at timestamptz not null default now()
);

comment on table public.feedback_reports is 'User-submitted bug reports / feedback from the header widget.';

alter table public.feedback_reports enable row level security;

create policy "feedback_reports_insert_own" on public.feedback_reports for insert to authenticated with check (auth.uid() = user_id);
create policy "feedback_reports_select_own_or_admin" on public.feedback_reports for select to authenticated using (auth.uid() = user_id or public.is_admin());

grant select, insert on public.feedback_reports to authenticated;
