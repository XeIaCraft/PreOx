-- Module « Préop » : consultation préopératoire et préparation de cas.
--
-- Cette première étape ne stocke que la bibliothèque de règles (aucune
-- donnée patient : la consultation n'est pas enregistrée pour l'instant).
-- Une règle est courte, structurée pour être appliquée par l'app
-- (conditions + action), et toujours liée à sa source, vérifiée par
-- l'utilisateur. Réservée à son auteur (RLS), comme le carnet de stage.

create table public.preop_rules (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  statement text not null,
  -- Conditions (toutes vraies) : médicament par code ATC, dose, indication,
  -- délai depuis l'événement, geste prévu, valeurs patient (clairance…).
  conditions jsonb not null default '[]',
  -- Délai d'arrêt, de reprise, condition à remplir, examen, information.
  action jsonb not null,
  -- Organisme, titre, année, DOI, PMID, citation exacte, grade, niveau (be_inst, be_soc, eu, int, article, local).
  source jsonb not null,
  divergences jsonb not null default '[]',
  explanations jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  version integer not null default 1 check (version >= 1),
  verified_at timestamptz,
  review_at date,
  question text not null default '',
  tool text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une règle n'est appliquée qu'une fois vérifiée.
  check (status <> 'active' or verified_at is not null)
);

create index preop_rules_user_idx on public.preop_rules (user_id, status);

create trigger preop_rules_updated_at before update on public.preop_rules
  for each row execute function public.set_updated_at();

alter table public.preop_rules enable row level security;
create policy preop_rules_own_rows on public.preop_rules for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.preop_rules to authenticated;

-- Module du hub : visible seulement pour les comptes qui y ont accès
-- (les administrateurs voient tout ; personne d'autre n'a d'accès par défaut).
insert into public.apps (slug, name, description, icon, status, route, sort_order, is_active)
values (
  'preop',
  'Préop',
  'Consultation préopératoire, scores, règles de gestion des traitements sourcées et préparation de cas.',
  'stethoscope',
  'available',
  '/apps/preop',
  4,
  true
)
on conflict (slug) do update set status = excluded.status, route = excluded.route, description = excluded.description, icon = excluded.icon;
