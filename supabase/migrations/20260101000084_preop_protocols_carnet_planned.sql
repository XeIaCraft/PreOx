-- Préop, étape 2 — aucune donnée patient sur le serveur : les dossiers
-- patients restent chiffrés sur l'appareil. Cette migration ajoute :
--
-- 1. Carnet de stage : un cas peut être « planifié » (préparé la veille
--    dans Préop). Il n'apparaît dans le relevé, le rapport d'activité,
--    l'export et les signatures qu'une fois validé (« Fait ») ; « Pas
--    fait » le supprime. Les cas existants ne sont pas planifiés.
-- 2. Bibliothèque de protocoles d'anesthésie (réutilisables, sans patient).

alter table public.carnet_cases add column planned boolean not null default false;

create table public.preop_protocols (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Intervention visée (texte libre + catégorie A–L du carnet).
  surgery text not null default '',
  operation_category text not null default '',
  hospital text not null default '',
  -- Techniques, produits (dose fixe ou par kilo, poids de référence,
  -- réinjection), cibles, matériel, risques et conduite à tenir, post-op.
  content jsonb not null default '{}',
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index preop_protocols_user_idx on public.preop_protocols (user_id);

create trigger preop_protocols_updated_at before update on public.preop_protocols
  for each row execute function public.set_updated_at();

alter table public.preop_protocols enable row level security;
create policy preop_protocols_own_rows on public.preop_protocols for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.preop_protocols to authenticated;
