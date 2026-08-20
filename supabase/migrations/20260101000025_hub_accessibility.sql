-- Hub accessibility & performance batch: high contrast, font scale, and a
-- lightweight perceived-performance log (real navigation timing, not
-- simulated — captured client-side via the Navigation Timing API).

alter table public.profiles add column high_contrast boolean not null default false;
alter table public.profiles add column font_scale text not null default 'normal' check (font_scale in ('normal', 'large', 'larger'));

create table public.page_performance_log (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  duration_ms integer not null,
  created_at timestamptz not null default now()
);

comment on table public.page_performance_log is 'Real client-side navigation timing (Performance API), sampled — feeds the admin "Usage & santé" perceived-performance view.';

create index page_performance_log_path_created_at_idx on public.page_performance_log (path, created_at desc);

alter table public.page_performance_log enable row level security;

-- Any authenticated user can log a timing sample for a page they're
-- visiting (no personal data in the row — just a path and a duration), but
-- only admins can read the aggregate.
create policy "page_performance_log_insert" on public.page_performance_log for insert to authenticated with check (true);
create policy "page_performance_log_select_admin" on public.page_performance_log for select to authenticated using (public.is_admin());

grant select, insert on public.page_performance_log to authenticated;
