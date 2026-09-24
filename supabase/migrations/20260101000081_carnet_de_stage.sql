-- Module "Carnet de stage" — carnet de stage officiel de la Commission
-- d'agrément en Anesthésie-Réanimation (Fédération Wallonie-Bruxelles),
-- saisi en continu au lieu du papier. Données strictement personnelles :
-- chaque table est isolée par user_id via RLS, seul le candidat lit/écrit.
-- Les superviseurs n'ont pas de compte : ils signent sur l'appareil du
-- candidat (signature tactile stockée en image, horodatée).

-- ============================================================================
-- Identification (1 ligne par utilisateur)
-- ============================================================================

create table public.carnet_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_name text not null default '',
  first_name text not null default '',
  nationality text not null default '',
  birth_place text not null default '',
  birth_date date,
  -- [{ "address": "...", "since": "YYYY-MM-DD" | null }], la plus récente en dernier
  addresses jsonb not null default '[]',
  email text not null default '',
  phone text not null default '',
  university text not null default '',
  graduation_year integer,
  pre_training_activities text not null default '',
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Référentiel des superviseurs (tuteurs, maîtres de stage, chefs de service)
-- ============================================================================

create table public.carnet_supervisors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_name text not null,
  first_name text not null default '',
  role text not null default '',
  usual_hospital text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Stages (une période dans un lieu)
-- ============================================================================

create table public.carnet_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hospital text not null,
  city text not null default '',
  sector text not null default '',
  activity text not null default '',
  coordinator_id uuid references public.carnet_supervisors (id) on delete set null,
  training_year integer not null check (training_year between 1 and 8),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Évaluation personnelle du stage par le candidat (page "Evaluation personnelle")
create table public.carnet_stage_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stage_id uuid not null unique references public.carnet_stages (id) on delete cascade,
  global_impression text not null default '',
  liked text not null default '',
  disliked text not null default '',
  would_change text not null default '',
  would_return boolean,
  score_interest integer check (score_interest between 0 and 10),
  score_clinical_guidance integer check (score_clinical_guidance between 0 and 10),
  score_atmosphere integer check (score_atmosphere between 0 and 10),
  score_theoretical_guidance integer check (score_theoretical_guidance between 0 and 10),
  score_responsibilities integer check (score_responsibilities between -5 and 5),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Signatures groupées (un superviseur signe une fois pour un lot de cas/gardes)
-- ============================================================================

create table public.carnet_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  supervisor_id uuid references public.carnet_supervisors (id) on delete set null,
  -- Nom tel qu'affiché au moment de la signature — reste lisible même si
  -- le superviseur est renommé ou supprimé du référentiel ensuite.
  supervisor_name text not null,
  -- Image PNG (data URL) du tracé
  image text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Relevé des prestations (log de cas)
-- ============================================================================

create table public.carnet_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stage_id uuid not null references public.carnet_stages (id) on delete restrict,
  case_date date not null,
  patient_initials text not null default '',
  operation text not null,
  -- Catégorie chirurgicale du carnet : A..L (J1 gynéco, J2 uro), X = autres procédures
  operation_category text not null,
  pediatric_under_4 boolean not null default false,
  general_anesthesia boolean not null default false,
  regional_type text,
  technical_act text,
  participation smallint not null check (participation between 1 and 3),
  tutor_id uuid references public.carnet_supervisors (id) on delete set null,
  signature_id uuid references public.carnet_signatures (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (general_anesthesia or regional_type is not null or technical_act is not null)
);

-- ============================================================================
-- Journal de gardes
-- ============================================================================

create table public.carnet_duties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stage_id uuid not null references public.carnet_stages (id) on delete restrict,
  duty_date date not null,
  duty_type text not null default 'on_site' check (duty_type in ('on_site', 'on_call')),
  institution text not null default '',
  city text not null default '',
  head_of_department text not null default '',
  supervisor_id uuid references public.carnet_supervisors (id) on delete set null,
  signature_id uuid references public.carnet_signatures (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Activités connexes, cours, séminaires, publications
-- ============================================================================

create table public.carnet_related_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  nature text not null,
  institution text not null default '',
  city text not null default '',
  start_date date,
  end_date date,
  appraisal text not null default '',
  responsible text not null default '',
  created_at timestamptz not null default now()
);

create table public.carnet_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('course', 'seminar')),
  start_date date,
  end_date date,
  city text not null default '',
  institution text not null default '',
  subject text not null,
  exam_result text not null default '',
  teacher text not null default '',
  created_at timestamptz not null default now()
);

create table public.carnet_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  details text not null default '',
  pub_date date,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Par année de formation : absences (A..F) et autres domaines d'activité
-- du rapport d'activité (soins intensifs, SMUR, échographies...)
-- ============================================================================

create table public.carnet_years (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  training_year integer not null check (training_year between 1 and 8),
  absences jsonb not null default '{}',
  activity_counts jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, training_year)
);

-- ============================================================================
-- Index, updated_at, RLS, grants
-- ============================================================================
-- RLS = propriétaire uniquement (même principe que "À table") ; l'accès au
-- module lui-même (droits du hub, groupes compris) est vérifié côté
-- application par requireCarnetAccess.

create index carnet_supervisors_user_idx on public.carnet_supervisors (user_id);
create index carnet_stages_user_idx on public.carnet_stages (user_id, start_date);
create index carnet_cases_user_idx on public.carnet_cases (user_id, case_date);
create index carnet_cases_stage_idx on public.carnet_cases (stage_id);
create index carnet_cases_signature_idx on public.carnet_cases (signature_id);
create index carnet_duties_user_idx on public.carnet_duties (user_id, duty_date);
create index carnet_signatures_user_idx on public.carnet_signatures (user_id);

create trigger set_carnet_profiles_updated_at before update on public.carnet_profiles for each row execute function public.set_updated_at();
create trigger set_carnet_supervisors_updated_at before update on public.carnet_supervisors for each row execute function public.set_updated_at();
create trigger set_carnet_stages_updated_at before update on public.carnet_stages for each row execute function public.set_updated_at();
create trigger set_carnet_stage_reviews_updated_at before update on public.carnet_stage_reviews for each row execute function public.set_updated_at();
create trigger set_carnet_cases_updated_at before update on public.carnet_cases for each row execute function public.set_updated_at();
create trigger set_carnet_duties_updated_at before update on public.carnet_duties for each row execute function public.set_updated_at();
create trigger set_carnet_years_updated_at before update on public.carnet_years for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array[
    'carnet_profiles', 'carnet_supervisors', 'carnet_stages', 'carnet_stage_reviews', 'carnet_signatures',
    'carnet_cases', 'carnet_duties', 'carnet_related_activities', 'carnet_courses', 'carnet_publications', 'carnet_years'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own_rows', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ============================================================================
-- Enregistrement du module dans le hub
-- ============================================================================

insert into public.apps (slug, name, description, icon, status, route, sort_order, is_active)
values (
  'carnet-de-stage',
  'Carnet de stage',
  'Relevé des prestations, gardes, signatures des superviseurs et export du carnet officiel d''anesthésie-réanimation.',
  'clipboard-list',
  'available',
  '/apps/carnet-de-stage',
  3,
  true
)
on conflict (slug) do update set status = excluded.status, route = excluded.route, description = excluded.description, icon = excluded.icon;
