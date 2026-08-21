-- Multi-key rotation + model fallback for El Profesor's Gemini calls: on
-- quota (429) or capacity (503) errors, the caller now retries with the
-- next configured key, then the fallback model, before giving up.
alter table public.el_profesor_secrets
  add column gemini_extra_keys_encrypted jsonb not null default '[]'::jsonb;

alter table public.el_profesor_settings
  add column gemini_fallback_model text;
