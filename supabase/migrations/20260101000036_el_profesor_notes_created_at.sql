-- Notes only tracked updated_at, so "ce jour-là" (resurfacing an old note
-- written N months/years ago) had no reliable original-write date to work
-- from — editing a year-old note would make it look brand new. Existing
-- rows default to now() (best approximation available), new rows get an
-- accurate value from creation onward; the upsert in saveMyNote never
-- includes created_at, so it's untouched on later edits.
alter table public.el_profesor_notes
  add column created_at timestamptz not null default now();
