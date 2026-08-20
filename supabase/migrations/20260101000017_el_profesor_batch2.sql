-- Second wave of El Profesor improvements: review duration tracking, an
-- admin content-edit history log, and a free-text theme/specialty tag on
-- books for library filtering.

-- Time spent per review (front revealed -> rated), captured client-side in
-- flashcard-reviewer.tsx. Nullable: older rows and any future insert path
-- that doesn't measure it (there is none today, but nothing should ever
-- require it) simply omit it.
alter table public.el_profesor_review_log add column duration_ms integer;

-- Admin-only audit trail of edits to fiche blocks/flashcards (who changed
-- what, when) — mirrors hub_activity_log's shape and admin-only RLS, but
-- scoped to El Profesor content edits rather than hub user/app administration.
create table public.el_profesor_content_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index el_profesor_content_log_target_idx on public.el_profesor_content_log (target_type, target_id);
create index el_profesor_content_log_created_at_idx on public.el_profesor_content_log (created_at desc);

alter table public.el_profesor_content_log enable row level security;

create policy "el_profesor_content_log_admin_only" on public.el_profesor_content_log
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert on public.el_profesor_content_log to authenticated;

-- Free-text specialty/theme per book (e.g. "Cardiologie", "Pédiatrie"),
-- admin-set, used for library filter chips. Nullable/free text rather than
-- an enum: the set of specialties is open-ended and admin-defined in practice.
alter table public.el_profesor_books add column theme text;
