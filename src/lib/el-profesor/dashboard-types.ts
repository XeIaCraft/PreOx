import type {
  ReviewActivitySummary,
  UpcomingForecastDay,
  DifficultFlashcardStat,
  LeechFlashcardStat,
  BookmarkedEntity,
  StaleChapterAlert,
  KnowledgeExpiryAlert,
  BlockTypeFlagStat,
  GeminiUsageStats,
  OnThisDayNote,
  BookRecommendation,
  DueBlockEntry,
  NotionReadiness,
} from "@/lib/el-profesor/dal";
import type { Flashcard, NotionSummary, NotionRecommendation, DoseCalculator } from "@/lib/el-profesor/types";
import type { ElProfesorBatchJobRow } from "@/lib/supabase/types";

/**
 * Piste 2026-08-24 ("chargement progressif du tableau de bord") — everything
 * here is secondary to the book list (learning stats, admin diagnostics,
 * nudge banners): fetched by page.tsx without awaiting, streamed in behind
 * a <Suspense> boundary via React's use(), so the core book list never
 * waits on these heavier per-user/cross-user aggregation queries.
 */
export interface DashboardSecondaryData {
  activity: ReviewActivitySummary;
  overconfidentMissCount: number;
  forecast: UpcomingForecastDay[];
  globalDueCount: number;
  difficultCount: number;
  mostDifficultGlobal: DifficultFlashcardStat[];
  leechFlashcards: LeechFlashcardStat[];
  dailyCard: Flashcard | null;
  bookmarks: BookmarkedEntity[];
  staleChapters: StaleChapterAlert[];
  knowledgeExpiryAlerts: KnowledgeExpiryAlert[];
  reviewTimeStats: { totalMs: number; last7DaysMs: number };
  flagStatsByBlockType: BlockTypeFlagStat[];
  onThisDayNote: OnThisDayNote | null;
  bookRecommendation: BookRecommendation | null;
  dueBlocks: DueBlockEntry[];
}

/**
 * Admin-only Gemini/Claude provider config + usage stats — only ever read
 * from the settings dialog (opened on click) or the bulk-batch cost
 * estimate (shown only once chapters are selected), so it's streamed
 * separately from DashboardSecondaryData rather than blocking the page on
 * its own aggregation queries (usage stats, month-to-date spend, batch
 * job list) for every admin pageview.
 */
export interface DashboardAiConfigData {
  geminiModel: string | null;
  geminiExtraKeyCount: number;
  geminiFallbackModel: string | null;
  geminiUsageStats: GeminiUsageStats | null;
  aiSpendCapUsd: number | null;
  currentMonthAiSpendUsd: number;
  hasClaudeKey: boolean;
  claudeModel: string;
  batchJobs: ElProfesorBatchJobRow[];
}

/**
 * "Vue par notion" on the dashboard (requested repeatedly, added 2026-08-25)
 * — the same cross-book grouping already shown on the standalone /glossary
 * page, streamed separately so switching the dashboard's "Par livre / Par
 * notion" toggle never blocks on it before the toggle is actually used.
 */
export interface DashboardNotionViewData {
  notions: NotionSummary[];
  readiness: Record<string, NotionReadiness>;
  recommendations: Record<string, NotionRecommendation[]>;
  doseCalculators: Record<string, DoseCalculator[]>;
  caseCounts: Record<string, number>;
}
