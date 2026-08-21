export type Placement =
  | "backlog"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type MealCardStatus = "active" | "cooked" | "removed";
export type ImageStatus = "missing" | "found";
export type Appetite = "low" | "normal" | "high";
export type TimeProfile = "quick" | "normal" | "chill";
export type Complexity = "simple" | "medium" | "free";

// `type` (not `interface`) for every shape embedded in a jsonb column: only
// type aliases get an implicit index signature, which is what makes them
// structurally assignable to the Supabase client's `Json` column type.

export type Ingredient = {
  name: string;
  quantity: number | null;
  unit: string;
};

export type Nutrition = {
  kcal?: number | null;
  protein_g?: number | null;
  carb_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
};

export type Rating = {
  date: string;
  liked: boolean;
  comment: string;
};

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  source_kind: string;
  is_favorite: boolean;
  is_archived: boolean;
  servings: number;
  cooking_minutes: number | null;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  step_labels: string[];
  notes: string;
  nutrition: Nutrition;
  image_url: string | null;
  image_alt: string;
  image_status: ImageStatus;
  image_reference: string | null;
  price_per_serving: number | null;
  last_cooked_at: string | null;
  times_cooked: number;
  ratings: Rating[];
  share_token: string | null;
  needs_defrost: boolean;
  created_at: string;
  updated_at: string;
}

export interface MealCard {
  id: string;
  user_id: string;
  recipe_id: string;
  status: MealCardStatus;
  placement: Placement;
  position: number;
  servings: number;
  locked: boolean;
  created_at: string;
  updated_at: string;
}


export interface HistoryEntry {
  id: string;
  user_id: string;
  meal_card_id: string | null;
  recipe_id: string | null;
  cooked_at: string;
  servings: number;
}

export type DraftProposal = {
  title: string;
  servings: number;
  cooking_minutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  step_labels: string[];
  notes: string;
  nutrition: Nutrition;
  tags: string[];
  price_per_serving: number | null;
  image_query?: string;
  image_url?: string | null;
  image_status?: ImageStatus;
};

export interface Draft {
  id: string;
  user_id: string;
  created_at: string;
  proposals: DraftProposal[];
}

export interface TemporaryIngredient {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string;
  note: string;
  date_limit: string;
  status: string;
  created_at: string;
}

export type GuestCourseKey = "aperitif" | "entree" | "plat" | "dessert";

export type GuestCourseDish = {
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  step_labels: string[];
  notes: string;
  nutrition: Nutrition;
  image_query?: string;
  image_url?: string | null;
  image_status?: ImageStatus;
};

export type GuestComposedCourse = {
  items: GuestCourseDish[];
};

export type GuestCourse = GuestCourseDish | GuestComposedCourse;

export type WinePairing = {
  style: string;
  description: string;
  producers: string[];
};

export interface GuestMenu {
  id: string;
  user_id: string;
  created_at: string;
  guests: number;
  notes: string;
  course_keys: GuestCourseKey[];
  composed_keys: GuestCourseKey[];
  composed_counts: Record<string, number>;
  courses: Record<string, GuestCourse>;
  wine_pairings: WinePairing[];
}

export type RecipeSourcesSettings = {
  enabled: boolean;
  allowed_domains: string[];
  use_as_inspiration: boolean;
  require_image_for_generated_recipes: boolean;
  show_source_in_ui: boolean;
};

export type MacroRatios = {
  protein_pct: number;
  carb_pct: number;
  fat_pct: number;
};

export type Preferences = {
  default_servings: number;
  default_recipe_count: number;
  appetite: Appetite;
  diets: string[];
  diet_other_text: string;
  allergies: string[];
  allergies_other_text: string;
  liked_ingredients: string[];
  disliked_ingredients: string[];
  available_equipment: string[];
  preferred_equipment: string | null;
  objectives: string[];
  budget_per_serving: number | null;
  target_kcal_per_serving: number | null;
  stove_levels: number | null;
  grocery_store: string;
  time_profile: TimeProfile;
  complexity: Complexity;
  history_days_for_generation: number;
  history_days_for_display: number;
  include_personal_recipes_in_context: boolean;
  custom_context: string;
  macro_ratios: MacroRatios;
  recipe_sources: RecipeSourcesSettings;
  /** Custom shopping-list category order (rayon keys); absent/empty falls back to the default. */
  shopping_category_order?: string[];
  /** Auto-fetch a Pexels illustration on every AI generation (drafts, menu invité). Absent = enabled (legacy default). */
  auto_illustrate?: boolean;
  /** Total weekly grocery budget (€); a banner warns when the planned week's cost exceeds it. Absent/null = no cap. */
  weekly_budget_cap?: number | null;
};

export type GenerationRules = {
  max_favorites: number;
  max_recurrence: number;
  min_new_recipes_pct: number;
  max_repeat_protein: number;
  max_repeat_starch: number;
  max_repeat_vegetable: number;
};

export interface ShoppingManualItem {
  key: string;
  name: string;
  quantity: number | null;
  unit: string;
}

export interface ATableSettings {
  user_id: string;
  preferences: Preferences;
  generation_rules: GenerationRules;
  shopping_list_checked: Record<string, boolean>;
  shopping_list_exported_recipe_ids: string[];
  shopping_list_manual_items: ShoppingManualItem[];
  has_gemini_key: boolean;
  gemini_model: string;
  has_pexels_key: boolean;
  updated_at: string;
}

export interface RecipeCollection {
  id: string;
  user_id: string;
  name: string;
  recipe_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface WeekTemplateItem {
  placement: Placement;
  recipe_id: string;
  servings: number;
}

export interface WeekTemplate {
  id: string;
  user_id: string;
  name: string;
  items: WeekTemplateItem[];
  created_at: string;
}

export interface ATableData {
  settings: ATableSettings;
  recipes: Recipe[];
  mealCards: MealCard[];
  drafts: Draft[];
  temporaryIngredients: TemporaryIngredient[];
  guestMenus: GuestMenu[];
  history: HistoryEntry[];
  collections: RecipeCollection[];
  weekTemplates: WeekTemplate[];
}
