-- El Profesor's Gemini API key was a raw server env var
-- (EL_PROFESOR_GEMINI_API_KEY) — the only piece of its AI config not
-- already editable from the admin UI (the model already lives in
-- el_profesor_settings, see 20260101000006). This moves the key into the
-- database too, encrypted at rest with the same AES-256-GCM scheme À
-- table already uses for its own per-user keys (src/lib/crypto.ts).
--
-- Kept as its own table rather than a column on el_profesor_settings:
-- el_profesor_settings has broad SELECT (any user with module access, for
-- the model name), and Postgres RLS can't restrict individual columns —
-- putting the ciphertext there would hand it to every non-admin user via
-- a direct PostgREST call. This table is admin-only end to end.
create table public.el_profesor_secrets (
  id boolean primary key default true,
  gemini_api_key_encrypted text,
  updated_at timestamptz not null default now(),
  constraint el_profesor_secrets_singleton check (id)
);

insert into public.el_profesor_secrets (id) values (true);

alter table public.el_profesor_secrets enable row level security;

create policy "el_profesor_secrets_admin_all" on public.el_profesor_secrets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.el_profesor_secrets to authenticated;
