-- Module "À table" — planification de repas, portage natif de
-- l'intégration Home Assistant du même nom. Une table par collection
-- d'entités (pas un blob JSON unique par utilisateur — voir le plan) ;
-- isolation stricte par utilisateur via RLS.

-- ============================================================================
-- Tables
-- ============================================================================

create table public.a_table_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  source_kind text not null default 'personal_manual',
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  servings integer not null default 2,
  cooking_minutes integer,
  tags text[] not null default '{}',
  ingredients jsonb not null default '[]',
  steps text[] not null default '{}',
  step_labels text[] not null default '{}',
  notes text not null default '',
  nutrition jsonb not null default '{}',
  image_url text,
  image_alt text not null default '',
  image_status text not null default 'missing' check (image_status in ('missing', 'found')),
  image_reference text,
  price_per_serving numeric,
  last_cooked_at timestamptz,
  times_cooked integer not null default 0,
  ratings jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.a_table_meal_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.a_table_recipes (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'cooked', 'removed')),
  placement text not null check (
    placement in ('backlog', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  ),
  position integer not null default 0,
  servings integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.a_table_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  meal_card_id uuid references public.a_table_meal_cards (id) on delete set null,
  recipe_id uuid references public.a_table_recipes (id) on delete cascade,
  cooked_at timestamptz not null default now(),
  servings integer not null default 2
);

create table public.a_table_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  proposals jsonb not null default '[]'
);

create table public.a_table_temporary_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text not null default '',
  note text not null default '',
  date_limit text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.a_table_guest_menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  guests integer not null,
  notes text not null default '',
  course_keys text[] not null default '{}',
  composed_keys text[] not null default '{}',
  composed_counts jsonb not null default '{}',
  courses jsonb not null default '{}',
  wine_pairings jsonb not null default '[]'
);

create table public.a_table_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  preferences jsonb not null default '{
    "default_servings": 2,
    "default_recipe_count": 6,
    "appetite": "normal",
    "diets": [],
    "diet_other_text": "",
    "allergies": [],
    "allergies_other_text": "",
    "liked_ingredients": [],
    "disliked_ingredients": [],
    "available_equipment": [],
    "preferred_equipment": null,
    "objectives": [],
    "budget_per_serving": null,
    "target_kcal_per_serving": null,
    "stove_levels": null,
    "grocery_store": "",
    "time_profile": "normal",
    "complexity": "free",
    "history_days_for_generation": 20,
    "history_days_for_display": 20,
    "include_personal_recipes_in_context": true,
    "custom_context": "",
    "macro_ratios": {"protein_pct": 30, "carb_pct": 45, "fat_pct": 25},
    "recipe_sources": {
      "enabled": true,
      "allowed_domains": [],
      "use_as_inspiration": true,
      "require_image_for_generated_recipes": false,
      "show_source_in_ui": false
    }
  }'::jsonb,
  generation_rules jsonb not null default '{
    "max_favorites": 2,
    "max_recurrence": 1,
    "min_new_recipes_pct": 90,
    "max_repeat_protein": 2,
    "max_repeat_starch": 2,
    "max_repeat_vegetable": 2
  }'::jsonb,
  shopping_list_checked jsonb not null default '{}',
  shopping_list_exported_recipe_ids text[] not null default '{}',
  gemini_api_key_encrypted text,
  gemini_model text not null default 'gemini-3.1-flash-lite',
  pexels_api_key_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index a_table_recipes_user_id_idx on public.a_table_recipes (user_id);
create index a_table_meal_cards_user_id_idx on public.a_table_meal_cards (user_id, status, placement);
create index a_table_meal_cards_recipe_id_idx on public.a_table_meal_cards (recipe_id);
create index a_table_history_user_id_idx on public.a_table_history (user_id, cooked_at desc);
create index a_table_drafts_user_id_idx on public.a_table_drafts (user_id);
create index a_table_temporary_ingredients_user_id_idx on public.a_table_temporary_ingredients (user_id);
create index a_table_guest_menus_user_id_idx on public.a_table_guest_menus (user_id);

-- ============================================================================
-- updated_at maintenance (reuses public.set_updated_at() from the hub migration)
-- ============================================================================

create trigger set_a_table_recipes_updated_at
  before update on public.a_table_recipes
  for each row execute function public.set_updated_at();

create trigger set_a_table_meal_cards_updated_at
  before update on public.a_table_meal_cards
  for each row execute function public.set_updated_at();

create trigger set_a_table_settings_updated_at
  before update on public.a_table_settings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security — strict per-user isolation, no admin override.
-- ============================================================================

alter table public.a_table_recipes enable row level security;
alter table public.a_table_meal_cards enable row level security;
alter table public.a_table_history enable row level security;
alter table public.a_table_drafts enable row level security;
alter table public.a_table_temporary_ingredients enable row level security;
alter table public.a_table_guest_menus enable row level security;
alter table public.a_table_settings enable row level security;

create policy "a_table_recipes_own_rows" on public.a_table_recipes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "a_table_meal_cards_own_rows" on public.a_table_meal_cards
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "a_table_history_own_rows" on public.a_table_history
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "a_table_drafts_own_rows" on public.a_table_drafts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "a_table_temporary_ingredients_own_rows" on public.a_table_temporary_ingredients
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "a_table_guest_menus_own_rows" on public.a_table_guest_menus
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "a_table_settings_own_row" on public.a_table_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- Grants (RLS still applies on top of these)
-- ============================================================================

grant select, insert, update, delete on public.a_table_recipes to authenticated;
grant select, insert, update, delete on public.a_table_meal_cards to authenticated;
grant select, insert, update, delete on public.a_table_history to authenticated;
grant select, insert, update, delete on public.a_table_drafts to authenticated;
grant select, insert, update, delete on public.a_table_temporary_ingredients to authenticated;
grant select, insert, update, delete on public.a_table_guest_menus to authenticated;
grant select, insert, update, delete on public.a_table_settings to authenticated;
