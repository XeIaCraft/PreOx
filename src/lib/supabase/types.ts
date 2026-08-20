export type UserRole = "admin" | "user";
export type AppStatus = "available" | "coming_soon";

export type HubActivityLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_label: string | null;
  detail: Json;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
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
  locked: boolean;
  created_at: string;
  updated_at: string;
};

export type ATablePantryItemRow = {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string;
  created_at: string;
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

export type ATableCollectionRow = {
  id: string;
  user_id: string;
  name: string;
  recipe_ids: string[];
  created_at: string;
  updated_at: string;
};

export type ATableSettingsRow = {
  user_id: string;
  preferences: Json;
  generation_rules: Json;
  shopping_list_checked: Json;
  shopping_list_exported_recipe_ids: string[];
  shopping_list_manual_items: Json;
  gemini_api_key_encrypted: string | null;
  gemini_model: string;
  pexels_api_key_encrypted: string | null;
  created_at: string;
  updated_at: string;
};

// -- "El Profesor" module tables ---------------------------------------------
// Same convention as "À table": jsonb columns typed as Json here, precise
// domain shapes (block content, citations, front/back) live in
// src/lib/el-profesor/types.ts.

export type ElProfesorChapterStatus = "pending" | "extracting" | "draft_ready" | "published" | "failed";
export type ElProfesorContentStatus = "draft" | "published";
export type ElProfesorReviewRating = "again" | "good";
export type ElProfesorReviewSource = "scheduled" | "free";

export type ElProfesorBookRow = {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  cover_url: string | null;
  order_index: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ElProfesorChapterRow = {
  id: string;
  book_id: string;
  title: string;
  order_index: number;
  pdf_storage_path: string;
  pdf_page_count: number | null;
  status: ElProfesorChapterStatus;
  extraction_error: string | null;
  estimated_remaining_passes: number | null;
  created_at: string;
  updated_at: string;
};

export type ElProfesorSubEntityRow = {
  id: string;
  chapter_id: string;
  name: string;
  order_index: number;
  summary: string;
  created_at: string;
};

export type ElProfesorFicheRow = {
  id: string;
  sub_entity_id: string;
  title: string;
  status: ElProfesorContentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ElProfesorFicheBlockRow = {
  id: string;
  fiche_id: string;
  order_index: number;
  block_type: string;
  content: Json;
  citations: Json;
  needs_review: boolean;
  status: ElProfesorContentStatus;
  created_at: string;
  updated_at: string;
};

export type ElProfesorFlashcardRow = {
  id: string;
  fiche_id: string;
  front: Json;
  back: Json;
  citations: Json;
  status: ElProfesorContentStatus;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};

export type ElProfesorReviewStateRow = {
  id: string;
  user_id: string;
  flashcard_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review" | "relearning";
  last_review: string | null;
};

export type ElProfesorReviewLogRow = {
  id: string;
  user_id: string;
  flashcard_id: string;
  reviewed_at: string;
  rating: ElProfesorReviewRating;
  source: ElProfesorReviewSource;
};

export type ElProfesorExtractionJobRow = {
  id: string;
  chapter_id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  raw_output: Json | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
};

export type ElProfesorFlagRow = {
  id: string;
  target_type: "block" | "flashcard";
  target_id: string;
  flagged_by: string;
  reason: string;
  status: "open" | "resolved";
  created_at: string;
};

export type ElProfesorSettingsRow = {
  id: boolean;
  gemini_model: string;
  updated_at: string;
};

export type ElProfesorBookmarkRow = {
  id: string;
  user_id: string;
  sub_entity_id: string;
  created_at: string;
};

export type ElProfesorNoteRow = {
  id: string;
  user_id: string;
  sub_entity_id: string;
  content: string;
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
      hub_activity_log: {
        Row: HubActivityLogRow;
        Insert: Partial<HubActivityLogRow> & { action: string };
        Update: Partial<HubActivityLogRow>;
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
      a_table_pantry_items: {
        Row: ATablePantryItemRow;
        Insert: Partial<ATablePantryItemRow> & { user_id: string; name: string };
        Update: Partial<ATablePantryItemRow>;
        Relationships: [];
      };
      a_table_guest_menus: {
        Row: ATableGuestMenuRow;
        Insert: Partial<ATableGuestMenuRow> & { user_id: string; guests: number };
        Update: Partial<ATableGuestMenuRow>;
        Relationships: [];
      };
      a_table_collections: {
        Row: ATableCollectionRow;
        Insert: Partial<ATableCollectionRow> & { user_id: string; name: string };
        Update: Partial<ATableCollectionRow>;
        Relationships: [];
      };
      a_table_settings: {
        Row: ATableSettingsRow;
        Insert: Partial<ATableSettingsRow> & { user_id: string };
        Update: Partial<ATableSettingsRow>;
        Relationships: [];
      };
      el_profesor_books: {
        Row: ElProfesorBookRow;
        Insert: Partial<ElProfesorBookRow> & { title: string };
        Update: Partial<ElProfesorBookRow>;
        Relationships: [];
      };
      el_profesor_chapters: {
        Row: ElProfesorChapterRow;
        Insert: Partial<ElProfesorChapterRow> & { book_id: string; title: string; pdf_storage_path: string };
        Update: Partial<ElProfesorChapterRow>;
        Relationships: [];
      };
      el_profesor_sub_entities: {
        Row: ElProfesorSubEntityRow;
        Insert: Partial<ElProfesorSubEntityRow> & { chapter_id: string; name: string };
        Update: Partial<ElProfesorSubEntityRow>;
        Relationships: [];
      };
      el_profesor_fiches: {
        Row: ElProfesorFicheRow;
        Insert: Partial<ElProfesorFicheRow> & { sub_entity_id: string; title: string };
        Update: Partial<ElProfesorFicheRow>;
        Relationships: [];
      };
      el_profesor_fiche_blocks: {
        Row: ElProfesorFicheBlockRow;
        Insert: Partial<ElProfesorFicheBlockRow> & { fiche_id: string; block_type: string };
        Update: Partial<ElProfesorFicheBlockRow>;
        Relationships: [];
      };
      el_profesor_flashcards: {
        Row: ElProfesorFlashcardRow;
        Insert: Partial<ElProfesorFlashcardRow> & { fiche_id: string };
        Update: Partial<ElProfesorFlashcardRow>;
        Relationships: [];
      };
      el_profesor_review_state: {
        Row: ElProfesorReviewStateRow;
        Insert: Partial<ElProfesorReviewStateRow> & { user_id: string; flashcard_id: string };
        Update: Partial<ElProfesorReviewStateRow>;
        Relationships: [];
      };
      el_profesor_review_log: {
        Row: ElProfesorReviewLogRow;
        Insert: Partial<ElProfesorReviewLogRow> & {
          user_id: string;
          flashcard_id: string;
          rating: ElProfesorReviewRating;
          source: ElProfesorReviewSource;
        };
        Update: Partial<ElProfesorReviewLogRow>;
        Relationships: [];
      };
      el_profesor_extraction_jobs: {
        Row: ElProfesorExtractionJobRow;
        Insert: Partial<ElProfesorExtractionJobRow> & { chapter_id: string };
        Update: Partial<ElProfesorExtractionJobRow>;
        Relationships: [];
      };
      el_profesor_flags: {
        Row: ElProfesorFlagRow;
        Insert: Partial<ElProfesorFlagRow> & { target_type: "block" | "flashcard"; target_id: string; flagged_by: string };
        Update: Partial<ElProfesorFlagRow>;
        Relationships: [];
      };
      el_profesor_settings: {
        Row: ElProfesorSettingsRow;
        Insert: Partial<ElProfesorSettingsRow>;
        Update: Partial<ElProfesorSettingsRow>;
        Relationships: [];
      };
      el_profesor_bookmarks: {
        Row: ElProfesorBookmarkRow;
        Insert: Partial<ElProfesorBookmarkRow> & { user_id: string; sub_entity_id: string };
        Update: Partial<ElProfesorBookmarkRow>;
        Relationships: [];
      };
      el_profesor_notes: {
        Row: ElProfesorNoteRow;
        Insert: Partial<ElProfesorNoteRow> & { user_id: string; sub_entity_id: string };
        Update: Partial<ElProfesorNoteRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
