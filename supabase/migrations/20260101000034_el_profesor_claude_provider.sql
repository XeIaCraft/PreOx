-- Lets an admin choose the Claude API instead of Gemini for the automated
-- extraction pipeline (initial extraction + complementary/gap-fill pass) —
-- another lever against Gemini quota exhaustion, alongside the existing
-- multi-key rotation and fallback model.
alter table public.el_profesor_settings
  add column ai_provider text not null default 'gemini' check (ai_provider in ('gemini', 'claude')),
  add column claude_model text not null default 'claude-sonnet-5';

alter table public.el_profesor_secrets
  add column claude_api_key_encrypted text;
