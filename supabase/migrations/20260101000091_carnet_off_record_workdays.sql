-- Carnet de stage :
-- 1. Cas « hors carnet » : un journal personnel de gestes à garder (sans
--    technique d'anesthésie obligatoire), jamais compté dans le carnet
--    officiel — ni numérotation, ni relevé, ni rapport, ni export, ni
--    signatures.
-- 2. Journées de travail : amplitudes, gardes (sur place, appelables avec
--    rappels), congés, maladie, journées scientifiques — pour le temps de
--    travail légal (loi du 12 décembre 2010) et l'estimation de la
--    rémunération du médecin spécialiste en formation (statut sui generis).
-- 3. Réglages personnels (rémunération, cotisations, précompte) : versions
--    datées, modifiables quand la réglementation ou la convention change.

alter table public.carnet_cases
  add column off_record boolean not null default false;

alter table public.carnet_cases
  drop constraint if exists carnet_cases_technique_check;

alter table public.carnet_cases
  add constraint carnet_cases_technique_check
  check (off_record or general_anesthesia or cardinality(regional_types) > 0 or cardinality(technical_acts) > 0);

create table public.carnet_workdays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stage_id uuid references public.carnet_stages (id) on delete set null,
  work_date date not null,
  kind text not null default 'work' check (kind in ('work', 'on_site', 'on_call', 'leave', 'holiday', 'sick', 'scientific', 'course', 'recovery')),
  -- Heure locale « HH:MM » ; la fin peut tomber le lendemain (end_next_day).
  start_time text not null default '' check (start_time = '' or start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null default '' check (end_time = '' or end_time ~ '^\d{2}:\d{2}$'),
  end_next_day boolean not null default false,
  break_minutes integer not null default 0 check (break_minutes between 0 and 720),
  -- Garde appelable : périodes réellement prestées à l'hôpital [{start, end, next_day}].
  callouts jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index carnet_workdays_user_idx on public.carnet_workdays (user_id, work_date);
create trigger set_carnet_workdays_updated_at before update on public.carnet_workdays for each row execute function public.set_updated_at();

create table public.carnet_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (key in ('pay')),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create trigger set_carnet_settings_updated_at before update on public.carnet_settings for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['carnet_workdays', 'carnet_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own_rows', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
