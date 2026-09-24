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
  NotionProgressEntry,
  BookWithChapters,
  AdjacentChapterEntry,
  ChapterDueCounts,
  ChapterMasteryCounts,
  ChapterMasteryPercentile,
  BlockReviewState,
  GlobalProgressSummary,
  MasteryProgress,
  ElProfesorAiProvider,
  SubEntityWithFiche,
  AdjacentNotionEntry,
} from "@/lib/el-profesor/dal";
import type {
  Flashcard,
  NotionSummary,
  NotionRecommendation,
  DoseCalculator,
  NotionCategory,
  ChapterSourceKind,
  NotionSynthesis,
  NotionLinkedFiche,
  Contradiction,
  CrossBookDuplicateFlashcards,
  SupersededFicheEntry,
  NotionUpdateProposal,
  ReviewState,
} from "@/lib/el-profesor/types";
import type { ElProfesorBatchJobRow } from "@/lib/supabase/types";

/**
 * Everything ElProfesorBoard needs to render, grouped into one object
 * instead of ~10 separate props — the shape both page.tsx's initial SSR
 * render and the "Synchroniser" local-cache sync (dal/shared.ts's
 * loadDashboardSnapshot, lib/el-profesor/sync-data.ts, local-db.ts) produce, so
 * DashboardWithLocalCache can swap between a server-rendered snapshot and
 * a locally-cached one without either side needing its own shape.
 */
export interface DashboardSnapshot {
  books: BookWithChapters[];
  dueCounts: ChapterDueCounts;
  needsReviewCounts: ChapterDueCounts;
  masteryCounts: ChapterMasteryCounts;
  difficultCounts: ChapterDueCounts;
  globalMastery: Record<string, ChapterMasteryPercentile>;
  readProgressByChapter: Record<string, number>;
  globalProgress: GlobalProgressSummary;
  hasGeminiKey: boolean;
  aiProvider: ElProfesorAiProvider;
  /** getUserFsrsRetention's current value for this user — cached so a local review (local-review.ts) can call scheduleReview with the same personalized target the server would use. */
  fsrsRetention: number;
  /**
   * getEffectiveIsAdmin's result at sync time (piste 2026-09-24 — "module
   * 100% local") — lets the local nav shell (local-nav-shell.tsx) know
   * whether to render chapter/book/dashboard screens in their admin variant
   * without a server round trip. Can go briefly stale if the user's role or
   * preview-mode changes mid-session without a hard reload — harmless,
   * since it only ever affects which UI affordances show, never an actual
   * permission check (every Server Action still re-verifies server-side
   * regardless).
   */
  effectiveIsAdmin: boolean;
  realIsAdmin: boolean;
  previewingAsUser: boolean;
}

/**
 * Same idea as DashboardSnapshot, for one chapter's worth of what
 * ChapterView needs. Includes the chapter's own title/source fields (not
 * just its nested content) so ChapterViewWithLocalCache can render entirely
 * from cache without depending on the page's own per-visit chapter-row
 * fetch either.
 */
export interface ChapterContentSnapshot {
  chapterTitle: string;
  sourceKind: ChapterSourceKind;
  sourceText: string | null;
  subEntities: SubEntityWithFiche[];
  bookmarkedIds: string[];
  blockReviewStates: Record<string, BlockReviewState>;
  ficheReadProgress: Record<string, number>;
  ficheMasteryProgress: Record<string, MasteryProgress>;
  adjacentChapters: { prev: AdjacentChapterEntry | null; next: AdjacentChapterEntry | null };
}

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
 * This user's own small per-entity data, synced in full on every
 * "Synchroniser" (piste 2026-09-24 — suite au retour "pourquoi les widgets
 * ne fonctionnent pas en local ?") and cached as its own IndexedDB entries
 * instead of being frozen inside each chapter's content snapshot: the delta
 * sync only re-downloads a chapter when its CONTENT changed, but a bookmark,
 * a note, a block re-read or a review changes on its own schedule — tied to
 * chapter content it went stale forever. Each list is one paginated
 * user-scoped query server-side (no library-wide id list involved), so this
 * stays a small, fast payload however big the library is.
 */
export interface CachedBookmark {
  subEntityId: string;
  tags: string[];
  createdAt: string;
}

export interface CachedNote {
  subEntityId: string;
  content: string;
  shareToken: string | null;
  createdAt: string;
}

export interface UserSyncData {
  reviewStates: ReviewState[];
  ficheReadProgress: Record<string, number>;
  bookmarks: CachedBookmark[];
  blockReviewStates: Record<string, BlockReviewState>;
  notes: CachedNote[];
}

/** One UTC day of this user's review log, pre-aggregated — everything the streak/heatmap, time-invested and overconfidence widgets need, without shipping every individual review row to the browser. */
export interface ReviewDayStats {
  count: number;
  ms: number;
  /** Reviews marked "sûr(e)" then answered "again" — see getOverconfidentMissCount. */
  sureMisses: number;
}

/** Per-day aggregates for every review at or after `since` (or the whole history when the request had no `since`) — the client replaces those days in its cached history and keeps the older ones as they were. */
export interface ReviewHistoryDelta {
  days: Record<string, ReviewDayStats>;
}

/**
 * The few dashboard widgets that genuinely can't be computed on this device
 * because they aggregate OTHER users' data (anonymous cross-user stats,
 * admin content diagnostics) — fetched in the background after a sync,
 * never blocking it or the dashboard, and simply absent until the first
 * successful fetch. Everything else the dashboard shows is computed locally
 * (local-widgets.ts).
 */
export interface DashboardExtras {
  globalMastery: Record<string, ChapterMasteryPercentile>;
  bookRecommendation: BookRecommendation | null;
  mostDifficultGlobal: DifficultFlashcardStat[];
  leechFlashcards: LeechFlashcardStat[];
  flagStatsByBlockType: BlockTypeFlagStat[];
  staleChapters: StaleChapterAlert[];
}

/** Everything the essential part of "Synchroniser" needs in one round trip — see loadSyncManifest (sync-data.ts). */
export interface SyncManifest {
  /** Only the server-side fields are meaningful here — the per-user aggregates (due/mastery/difficult counts, read progress, global progress) are computed on the device from the cached content instead, see local-dashboard.ts. */
  snapshot: DashboardSnapshot;
  suspendedIds: string[];
  /** Per published chapter — compared against each cached chapter's own lastModifiedAt to decide what to re-download. */
  lastModified: Record<string, string>;
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
  categories: NotionCategory[];
  readiness: Record<string, NotionReadiness>;
  recommendations: Record<string, NotionRecommendation[]>;
  doseCalculators: Record<string, DoseCalculator[]>;
  /** Read % + FSRS mastery per notion (piste 2026-08-29 — visible directement sur chaque carte de notion). */
  progress: Record<string, NotionProgressEntry>;
}

/**
 * The /apps/el-profesor/notions admin screen's full data bundle (piste
 * 2026-09-24 — "module 100% local") — cached as one blob (like
 * DashboardSecondaryData) rather than per-entity, since it's already fetched
 * in one batch and isn't keyed the way chapter content is.
 */
export interface NotionsPageSnapshot {
  chapters: { id: string; title: string; bookTitle: string }[];
  notionSummaries: NotionSummary[];
  categories: NotionCategory[];
  recommendations: Record<string, NotionRecommendation[]>;
  doseCalculators: Record<string, DoseCalculator[]>;
  contradictions: Contradiction[];
  crossBookDuplicates: CrossBookDuplicateFlashcards[];
  supersededFiches: SupersededFicheEntry[];
  notionUpdateProposals: NotionUpdateProposal[];
}

/**
 * One notion's synthesis screen (/notions/[notionId]) — keyed by notionId in
 * the generic `entities` IndexedDB store (local-db.ts), the same "type:id"
 * shape the plan's Part B describes for per-entity screens beyond the
 * dashboard/chapter/review trio that already had their own dedicated stores.
 */
export interface NotionSynthesisSnapshot {
  notionName: string;
  synthesis: NotionSynthesis | null;
  fiches: NotionLinkedFiche[];
  prevNotion: AdjacentNotionEntry | null;
  nextNotion: AdjacentNotionEntry | null;
  readProgress: number;
  masteryProgress: MasteryProgress;
}
