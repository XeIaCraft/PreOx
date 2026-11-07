-- Module « Planning Tivoli » : le planning du bloc (image publiée chaque
-- semaine) lu par OCR, vérifié puis validé, et exporté vers l'onglet
-- « Planning » du Google Sheet « Premed Tivoli » (=IMPORTDATA par jeton).
--
-- Données partagées entre les comptes qui ont accès au module (pas de
-- user_id : c'est le planning du service) ; aucune donnée patient, seulement
-- des initiales et des noms de soignants. Seule la route d'export par jeton,
-- côté serveur (clé de service), passe outre la RLS.

-- Salles : libellé de la colonne dans l'image (« SALLE 1 », « END »,
-- « H.B. »…), ordre d'export vers le Sheet, active ou non. Une salle du
-- Sheet sans colonne correspondante dans l'image (image_label vide) exporte
-- des colonnes vides, pour garder l'alignement.
create table public.planning_tivoli_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_label text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Correspondance initiales → nom tel qu'écrit dans le Sheet.
create table public.planning_tivoli_people (
  id uuid primary key default gen_random_uuid(),
  initials text not null check (length(trim(initials)) between 1 and 8),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Comparaison insensible à la casse et aux espaces.
create unique index planning_tivoli_people_initials_idx on public.planning_tivoli_people (lower(regexp_replace(initials, '\s', '', 'g')));

-- Erreurs de lecture apprises des corrections (« hc » lu → « He »).
create table public.planning_tivoli_ocr_fixes (
  read text primary key,
  fixed text not null,
  hits integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Une semaine du planning : l'image lue, ce que l'OCR y a lu, les cases
-- telles que vérifiées (initiales brutes, résolues en noms seulement à
-- l'affichage et à l'export), et sa validation. Seules les semaines
-- validées sont exportées.
create table public.planning_tivoli_weeks (
  id uuid primary key default gen_random_uuid(),
  -- Lundi de la semaine ; null tant que la période du titre n'a pas pu être lue (demandée à l'écran).
  week_start date unique,
  status text not null default 'draft' check (status in ('draft', 'validated')),
  source text not null default 'web' check (source in ('web', 'upload')),
  image_hash text not null,
  image_type text not null default 'image/png',
  image_base64 text not null,
  image_width integer,
  image_height integer,
  -- Lecture OCR : colonnes, jours, cases (texte, confiance, position), avertissements.
  ocr jsonb not null default '{}',
  -- Cases vérifiées : { "2026-11-09": { "SALLE 1": "Ze-He", … }, … }.
  cells jsonb not null default '{}',
  -- Une nouvelle image a été lue après la validation : à revoir (l'export garde la version validée).
  changed_since_validation boolean not null default false,
  validated_at timestamptz,
  validated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Réglages du module (une seule ligne) : page publiée lue, jeton d'export
-- (haché : le jeton lui-même n'est montré qu'une fois), dernière vérification.
create table public.planning_tivoli_settings (
  id boolean primary key default true check (id),
  source_url text not null default 'https://docs.google.com/presentation/d/e/2PACX-1vR-_0tGo1DSNj633U9nIImN_fdT-689bgEQ84V7L1TUCVsXeFsPTKwtvg0QnAOSlZgrEpx6JnP2N-Qw/pub',
  export_token_hash text,
  last_checked_at timestamptz,
  last_image_hash text,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.planning_tivoli_settings (id) values (true) on conflict do nothing;

create trigger planning_tivoli_rooms_updated_at before update on public.planning_tivoli_rooms
  for each row execute function public.set_updated_at();
create trigger planning_tivoli_people_updated_at before update on public.planning_tivoli_people
  for each row execute function public.set_updated_at();
create trigger planning_tivoli_ocr_fixes_updated_at before update on public.planning_tivoli_ocr_fixes
  for each row execute function public.set_updated_at();
create trigger planning_tivoli_weeks_updated_at before update on public.planning_tivoli_weeks
  for each row execute function public.set_updated_at();
create trigger planning_tivoli_settings_updated_at before update on public.planning_tivoli_settings
  for each row execute function public.set_updated_at();

-- Lecture et modification : les comptes qui ont accès au module (et les administrateurs).
do $$
declare t text;
begin
  foreach t in array array['planning_tivoli_rooms', 'planning_tivoli_people', 'planning_tivoli_ocr_fixes', 'planning_tivoli_weeks', 'planning_tivoli_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.has_module_access(''planning-tivoli''))) with check ((select public.has_module_access(''planning-tivoli'')))',
      t || '_module_access', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- Pas de suppression de la ligne de réglages.
revoke delete on public.planning_tivoli_settings from authenticated;

-- Salles par défaut : celles du Sheet (SALLE 1 … SALLE 10, ENDO C24, ENDO 3,
-- HB), puis les autres colonnes de l'image, inactives. La correspondance
-- ENDO C24 / ENDO 3 avec une colonne de l'image reste à décider.
insert into public.planning_tivoli_rooms (name, image_label, sort_order, active) values
  ('Salle 1', 'SALLE 1', 1, true),
  ('Salle 2', 'SALLE 2', 2, true),
  ('Salle 3', 'SALLE 3', 3, true),
  ('Salle 4', 'SALLE 4', 4, true),
  ('Salle 5', 'SALLE 5', 5, true),
  ('Salle 6', 'SALLE 6', 6, true),
  ('Salle 7', 'SALLE 7', 7, true),
  ('Salle 8', 'SALLE 8', 8, true),
  ('Salle 9', 'SALLE 9', 9, true),
  ('Salle 10', 'SALLE 10', 10, true),
  ('Endo C24', '', 11, true),
  ('Endo 3', '', 12, true),
  ('HB', 'H.B.', 13, true),
  ('D+', 'D+', 14, false),
  ('Endo (END)', 'END', 15, false),
  ('Consultation (CON)', 'CON', 16, false),
  ('Garde', 'Garde', 17, false),
  ('E40', 'E40', 18, false);

insert into public.apps (slug, name, description, icon, status, route, sort_order, is_active)
values (
  'planning-tivoli',
  'Planning Tivoli',
  'Le planning du bloc lu dans l''image publiée (OCR), vérifié, puis exporté vers le Google Sheet des prémédications.',
  'calendar-days',
  'available',
  '/apps/planning-tivoli',
  6,
  true
)
on conflict (slug) do update set status = excluded.status, route = excluded.route, description = excluded.description, icon = excluded.icon;
