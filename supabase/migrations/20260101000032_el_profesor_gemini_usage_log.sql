-- Quota/consumption journal for El Profesor's Gemini calls (admin-visible
-- dashboard) — every generateContent call, success or failure, with token
-- counts when Gemini reports them. Admin-only, like every other El Profesor
-- diagnostic table (flags, extraction_jobs).
create table public.el_profesor_gemini_usage_log (
  id uuid primary key default gen_random_uuid(),
  called_at timestamptz not null default now(),
  model text not null,
  success boolean not null,
  status_code integer,
  prompt_tokens integer,
  candidates_tokens integer,
  total_tokens integer,
  error_message text
);

create index el_profesor_gemini_usage_log_called_at_idx on public.el_profesor_gemini_usage_log (called_at desc);

alter table public.el_profesor_gemini_usage_log enable row level security;

create policy "el_profesor_gemini_usage_log_admin_select" on public.el_profesor_gemini_usage_log
  for select to authenticated
  using (public.is_admin());
