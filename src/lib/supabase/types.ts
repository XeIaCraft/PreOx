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
  pinned_app_ids: string[];
  notify_email_digest: boolean;
  notify_push: boolean;
  accent_theme: "forest" | "slate";
  app_order: string[];
  density: "comfortable" | "compact";
  hidden_widgets: string[];
  high_contrast: boolean;
  font_scale: "normal" | "large" | "larger";
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
  share_token: string | null;
  needs_defrost: boolean;
  shared_at: string | null;
  recommended_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ATableRecipeCommentRow = {
  id: string;
  recipe_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
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
  week_start: string | null;
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
  photo_url: string | null;
};

export type ATableDraftRow = {
  id: string;
  user_id: string;
  created_at: string;
  proposals: Json;
  vote_token: string | null;
  votes: Json;
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

export type ATableWeekTemplateRow = {
  id: string;
  user_id: string;
  name: string;
  items: Json;
  created_at: string;
};

export type ATableHouseholdMemberRow = {
  id: string;
  user_id: string;
  name: string;
  allergies: string[];
  diet: string;
  access_token: string | null;
  display_prefs: Json;
  created_at: string;
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
  today_widget_token: string | null;
  api_token_hash: string | null;
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
  theme: string | null;
  order_index: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  previous_edition_book_id: string | null;
};

export type ElProfesorChapterSourceKind = "pdf" | "docx" | "pptx";

export type ElProfesorChapterRow = {
  id: string;
  book_id: string;
  title: string;
  order_index: number;
  pdf_storage_path: string | null;
  pdf_page_count: number | null;
  status: ElProfesorChapterStatus;
  extraction_error: string | null;
  estimated_remaining_passes: number | null;
  source_kind: ElProfesorChapterSourceKind;
  source_text: string | null;
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
  share_token: string | null;
  superseded_by_fiche_id: string | null;
  superseded_reason: "duplicate" | "outdated" | null;
  superseded_note: string;
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
  image_url: string | null;
  image_alt: string | null;
  variants: Json;
  suggested_image_page: number | null;
  suggested_image_hint: string | null;
  image_occlusions: Json;
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

export type ElProfesorBlockReviewStateRow = {
  id: string;
  user_id: string;
  block_id: string;
  interval_days: number;
  last_reviewed_at: string;
  next_due_at: string;
  created_at: string;
};

export type ElProfesorReviewLogRow = {
  id: string;
  user_id: string;
  flashcard_id: string;
  reviewed_at: string;
  rating: ElProfesorReviewRating;
  source: ElProfesorReviewSource;
  duration_ms: number | null;
  variant_id: string | null;
};

export type ElProfesorContentLogRow = {
  id: string;
  actor_id: string | null;
  target_type: string;
  target_id: string;
  action: string;
  detail: string | null;
  created_at: string;
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

export type ElProfesorFicheQuestionRow = {
  id: string;
  fiche_id: string;
  author_id: string;
  body: string;
  flagged: boolean;
  created_at: string;
};

export type ElProfesorFicheAnswerRow = {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  flagged: boolean;
  created_at: string;
};

export type ElProfesorGeminiUsageLogRow = {
  id: string;
  called_at: string;
  model: string;
  success: boolean;
  status_code: number | null;
  prompt_tokens: number | null;
  candidates_tokens: number | null;
  total_tokens: number | null;
  error_message: string | null;
};

export type ElProfesorSuspendedFlashcardRow = {
  user_id: string;
  flashcard_id: string;
  created_at: string;
};

export type ElProfesorSettingsRow = {
  id: boolean;
  gemini_model: string;
  gemini_fallback_model: string | null;
  ai_provider: "gemini" | "claude";
  claude_model: string;
  updated_at: string;
};

export type ElProfesorSecretsRow = {
  id: boolean;
  gemini_api_key_encrypted: string | null;
  gemini_extra_keys_encrypted: string[];
  claude_api_key_encrypted: string | null;
  updated_at: string;
};

export type ElProfesorBookmarkRow = {
  id: string;
  user_id: string;
  sub_entity_id: string;
  tags: string[];
  created_at: string;
};

export type ElProfesorReadingPositionRow = {
  user_id: string;
  chapter_id: string;
  sub_entity_id: string | null;
  updated_at: string;
};

export type ElProfesorNoteRow = {
  id: string;
  user_id: string;
  sub_entity_id: string;
  content: string;
  updated_at: string;
  created_at: string;
  share_token: string | null;
};

export type ElProfesorNotionRow = {
  id: string;
  name: string;
  created_at: string;
};

export type ElProfesorNotionLinkRow = {
  id: string;
  notion_id: string;
  fiche_id: string;
  created_at: string;
};

export type ElProfesorContradictionRow = {
  id: string;
  notion_id: string | null;
  fiche_id_a: string;
  fiche_id_b: string;
  explanation: string;
  status: "pending" | "dismissed" | "resolved";
  resolution_note: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type UserLoginLogRow = {
  id: string;
  user_id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
};

export type UserGroupRow = {
  id: string;
  name: string;
  created_at: string;
};

export type UserGroupMemberRow = {
  group_id: string;
  user_id: string;
  added_at: string;
};

export type UserGroupAppAccessRow = {
  group_id: string;
  app_id: string;
};

export type UserRecentAppRow = {
  user_id: string;
  app_id: string;
  visited_at: string;
};

export type ChangelogEntryRow = {
  id: string;
  title: string;
  body: string;
  app_id: string | null;
  published_at: string;
  created_by: string | null;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type FeedbackReportRow = {
  id: string;
  user_id: string;
  message: string;
  page_url: string | null;
  created_at: string;
};

export type PagePerformanceLogRow = {
  id: string;
  path: string;
  duration_ms: number;
  created_at: string;
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
      a_table_week_templates: {
        Row: ATableWeekTemplateRow;
        Insert: Partial<ATableWeekTemplateRow> & { user_id: string; name: string };
        Update: Partial<ATableWeekTemplateRow>;
        Relationships: [];
      };
      a_table_settings: {
        Row: ATableSettingsRow;
        Insert: Partial<ATableSettingsRow> & { user_id: string };
        Update: Partial<ATableSettingsRow>;
        Relationships: [];
      };
      a_table_household_members: {
        Row: ATableHouseholdMemberRow;
        Insert: Partial<ATableHouseholdMemberRow> & { user_id: string; name: string };
        Update: Partial<ATableHouseholdMemberRow>;
        Relationships: [];
      };
      a_table_recipe_comments: {
        Row: ATableRecipeCommentRow;
        Insert: Partial<ATableRecipeCommentRow> & { recipe_id: string; author_user_id: string; body: string };
        Update: Partial<ATableRecipeCommentRow>;
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
        Insert: Partial<ElProfesorChapterRow> & { book_id: string; title: string };
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
      el_profesor_block_review_state: {
        Row: ElProfesorBlockReviewStateRow;
        Insert: Partial<ElProfesorBlockReviewStateRow> & { user_id: string; block_id: string };
        Update: Partial<ElProfesorBlockReviewStateRow>;
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
      el_profesor_content_log: {
        Row: ElProfesorContentLogRow;
        Insert: Partial<ElProfesorContentLogRow> & { target_type: string; target_id: string; action: string };
        Update: Partial<ElProfesorContentLogRow>;
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
      el_profesor_fiche_questions: {
        Row: ElProfesorFicheQuestionRow;
        Insert: Partial<ElProfesorFicheQuestionRow> & { fiche_id: string; author_id: string; body: string };
        Update: Partial<ElProfesorFicheQuestionRow>;
        Relationships: [];
      };
      el_profesor_fiche_answers: {
        Row: ElProfesorFicheAnswerRow;
        Insert: Partial<ElProfesorFicheAnswerRow> & { question_id: string; author_id: string; body: string };
        Update: Partial<ElProfesorFicheAnswerRow>;
        Relationships: [];
      };
      el_profesor_gemini_usage_log: {
        Row: ElProfesorGeminiUsageLogRow;
        Insert: Partial<ElProfesorGeminiUsageLogRow> & { model: string; success: boolean };
        Update: Partial<ElProfesorGeminiUsageLogRow>;
        Relationships: [];
      };
      el_profesor_suspended_flashcards: {
        Row: ElProfesorSuspendedFlashcardRow;
        Insert: Partial<ElProfesorSuspendedFlashcardRow> & { user_id: string; flashcard_id: string };
        Update: Partial<ElProfesorSuspendedFlashcardRow>;
        Relationships: [];
      };
      el_profesor_notions: {
        Row: ElProfesorNotionRow;
        Insert: Partial<ElProfesorNotionRow> & { name: string };
        Update: Partial<ElProfesorNotionRow>;
        Relationships: [];
      };
      el_profesor_notion_links: {
        Row: ElProfesorNotionLinkRow;
        Insert: Partial<ElProfesorNotionLinkRow> & { notion_id: string; fiche_id: string };
        Update: Partial<ElProfesorNotionLinkRow>;
        Relationships: [];
      };
      el_profesor_contradictions: {
        Row: ElProfesorContradictionRow;
        Insert: Partial<ElProfesorContradictionRow> & { fiche_id_a: string; fiche_id_b: string; explanation: string };
        Update: Partial<ElProfesorContradictionRow>;
        Relationships: [];
      };
      el_profesor_settings: {
        Row: ElProfesorSettingsRow;
        Insert: Partial<ElProfesorSettingsRow>;
        Update: Partial<ElProfesorSettingsRow>;
        Relationships: [];
      };
      el_profesor_secrets: {
        Row: ElProfesorSecretsRow;
        Insert: Partial<ElProfesorSecretsRow>;
        Update: Partial<ElProfesorSecretsRow>;
        Relationships: [];
      };
      el_profesor_reading_position: {
        Row: ElProfesorReadingPositionRow;
        Insert: Partial<ElProfesorReadingPositionRow> & { user_id: string; chapter_id: string };
        Update: Partial<ElProfesorReadingPositionRow>;
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
      user_login_log: {
        Row: UserLoginLogRow;
        Insert: Partial<UserLoginLogRow> & { user_id: string };
        Update: Partial<UserLoginLogRow>;
        Relationships: [];
      };
      user_groups: {
        Row: UserGroupRow;
        Insert: Partial<UserGroupRow> & { name: string };
        Update: Partial<UserGroupRow>;
        Relationships: [];
      };
      user_group_members: {
        Row: UserGroupMemberRow;
        Insert: Partial<UserGroupMemberRow> & { group_id: string; user_id: string };
        Update: Partial<UserGroupMemberRow>;
        Relationships: [];
      };
      user_group_app_access: {
        Row: UserGroupAppAccessRow;
        Insert: UserGroupAppAccessRow;
        Update: Partial<UserGroupAppAccessRow>;
        Relationships: [];
      };
      user_recent_apps: {
        Row: UserRecentAppRow;
        Insert: Partial<UserRecentAppRow> & { user_id: string; app_id: string };
        Update: Partial<UserRecentAppRow>;
        Relationships: [];
      };
      changelog_entries: {
        Row: ChangelogEntryRow;
        Insert: Partial<ChangelogEntryRow> & { title: string; body: string };
        Update: Partial<ChangelogEntryRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow> & { user_id: string; title: string };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Partial<PushSubscriptionRow> & { user_id: string; endpoint: string; p256dh: string; auth: string };
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      feedback_reports: {
        Row: FeedbackReportRow;
        Insert: Partial<FeedbackReportRow> & { user_id: string; message: string };
        Update: Partial<FeedbackReportRow>;
        Relationships: [];
      };
      page_performance_log: {
        Row: PagePerformanceLogRow;
        Insert: Partial<PagePerformanceLogRow> & { path: string; duration_ms: number };
        Update: Partial<PagePerformanceLogRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      list_my_sessions: {
        Args: Record<string, never>;
        Returns: { id: string; created_at: string; updated_at: string; user_agent: string | null; ip: string | null; is_current: boolean }[];
      };
      revoke_my_session: {
        Args: { target_session_id: string };
        Returns: undefined;
      };
    };
  };
};
