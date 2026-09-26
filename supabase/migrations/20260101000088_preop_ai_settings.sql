-- Préop : réglages de l'assistant IA (Consensus pour chercher les sources,
-- Gemini pour rédiger une proposition de règle). Les clés sont chiffrées
-- par le serveur (AES-256-GCM, comme À table) ; seules des questions
-- générales, sans donnée patient, sont envoyées. Le compteur Consensus
-- permet de rester dans le quota mensuel de l'abonnement.

create table public.preop_ai_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gemini_api_key_encrypted text,
  gemini_model text not null default 'gemini-3.1-flash-lite',
  consensus_api_key_encrypted text,
  consensus_monthly_limit integer not null default 30 check (consensus_monthly_limit between 0 and 100000),
  -- { "2026-09": 4 } : appels Consensus par mois
  consensus_usage jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger preop_ai_settings_updated_at before update on public.preop_ai_settings
  for each row execute function public.set_updated_at();

alter table public.preop_ai_settings enable row level security;
create policy preop_ai_settings_own_row on public.preop_ai_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.preop_ai_settings to authenticated;
