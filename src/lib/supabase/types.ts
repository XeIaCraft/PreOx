export type UserRole = "admin" | "user";
export type AppStatus = "available" | "coming_soon";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type AppModule = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  route: string | null;
  status: AppStatus;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserAppAccess = {
  user_id: string;
  app_id: string;
  granted_at: string;
  granted_by: string | null;
};

// -- "À table" module tables -------------------------------------------------
// Loosely typed jsonb/array columns (Json/string[]) here on purpose: the
// precise domain shapes live in src/lib/a-table/types.ts, applied via
// explicit casts where the data is read (src/lib/a-table/dal.ts). Keeping
// this file's row types generic avoids coupling the low-level Supabase
// client typings to one feature module's evolving domain model.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ATableRecipeRow = {
  id: string;
  user_id: string;
  title: string;
  source_kind: string;
  is_favorite: boolean;
  is_archived: boolean;
  servings: number;
  cooking_minutes: number | null;
  tags: string[];
  ingredients: Json;
  steps: string[];
  step_labels: string[];
  notes: string;
  nutrition: Json;
  image_url: string | null;
  image_alt: string;
  image_status: "missing" | "found";
  image_reference: string | null;
  price_per_serving: number | null;
  last_cooked_at: string | null;
  times_cooked: number;
  ratings: Json;
  created_at: string;
  updated_at: string;
};

export type ATableMealCardRow = {
  id: string;
  user_id: string;
  recipe_id: string;
  status: "active" | "cooked" | "removed";
  placement: string;
  position: number;
  servings: number;
  created_at: string;
  updated_at: string;
};

export type ATableHistoryRow = {
  id: string;
  user_id: string;
  meal_card_id: string | null;
  recipe_id: string | null;
  cooked_at: string;
  servings: number;
};

export type ATableDraftRow = {
  id: string;
  user_id: string;
  created_at: string;
  proposals: Json;
};

export type ATableTemporaryIngredientRow = {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string;
  note: string;
  date_limit: string;
  status: string;
  created_at: string;
};

export type ATableGuestMenuRow = {
  id: string;
  user_id: string;
  created_at: string;
  guests: number;
  notes: string;
  course_keys: string[];
  composed_keys: string[];
  composed_counts: Json;
  courses: Json;
  wine_pairings: Json;
};

export type ATableSettingsRow = {
  user_id: string;
  preferences: Json;
  generation_rules: Json;
  shopping_list_checked: Json;
  shopping_list_exported_recipe_ids: string[];
  gemini_api_key_encrypted: string | null;
  gemini_model: string;
  pexels_api_key_encrypted: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      apps: {
        Row: AppModule;
        Insert: Partial<AppModule> & { slug: string; name: string };
        Update: Partial<AppModule>;
        Relationships: [];
      };
      user_app_access: {
        Row: UserAppAccess;
        Insert: Partial<UserAppAccess> & { user_id: string; app_id: string };
        Update: Partial<UserAppAccess>;
        Relationships: [];
      };
      a_table_recipes: {
        Row: ATableRecipeRow;
        Insert: Partial<ATableRecipeRow> & { user_id: string; title: string };
        Update: Partial<ATableRecipeRow>;
        Relationships: [];
      };
      a_table_meal_cards: {
        Row: ATableMealCardRow;
        Insert: Partial<ATableMealCardRow> & { user_id: string; recipe_id: string; placement: string };
        Update: Partial<ATableMealCardRow>;
        Relationships: [];
      };
      a_table_history: {
        Row: ATableHistoryRow;
        Insert: Partial<ATableHistoryRow> & { user_id: string };
        Update: Partial<ATableHistoryRow>;
        Relationships: [];
      };
      a_table_drafts: {
        Row: ATableDraftRow;
        Insert: Partial<ATableDraftRow> & { user_id: string };
        Update: Partial<ATableDraftRow>;
        Relationships: [];
      };
      a_table_temporary_ingredients: {
        Row: ATableTemporaryIngredientRow;
        Insert: Partial<ATableTemporaryIngredientRow> & { user_id: string; name: string };
        Update: Partial<ATableTemporaryIngredientRow>;
        Relationships: [];
      };
      a_table_guest_menus: {
        Row: ATableGuestMenuRow;
        Insert: Partial<ATableGuestMenuRow> & { user_id: string; guests: number };
        Update: Partial<ATableGuestMenuRow>;
        Relationships: [];
      };
      a_table_settings: {
        Row: ATableSettingsRow;
        Insert: Partial<ATableSettingsRow> & { user_id: string };
        Update: Partial<ATableSettingsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
