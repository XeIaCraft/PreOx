import { getCurrentProfile } from "@/lib/auth/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";

// Server Actions invoked from this page (e.g. suggestBookChapters in
// actions/split-book.ts, which can process up to 2000 pages of a book PDF
// in one Gemini call) run under this page's function duration — the
// platform default is comfortably short for that, so raised explicitly as
// a safety margin.
export const maxDuration = 60;
import {
  getLibrary,
  getReviewActivitySummary,
  getOverconfidentMissCount,
  getUpcomingReviewForecast,
  getGlobalDueQueue,
  getDifficultQueue,
  getMostDifficultFlashcardsGlobal,
  getLeechFlashcards,
  getDailyCard,
  getBookmarkedEntities,
  getStaleChaptersForAdmin,
  getKnowledgeExpiryAlerts,
  getReviewTimeStats,
  getFlagStatsByBlockType,
  getElProfesorGeminiModel,
  getElProfesorGeminiExtraKeyCount,
  getElProfesorGeminiFallbackModel,
  getGeminiUsageStats,
  getAiSpendCapUsd,
  getCurrentMonthAiSpendUsd,
  hasElProfesorClaudeKey,
  getElProfesorClaudeModel,
  getReadingPosition,
  getOnThisDayNote,
  getRecommendedNextBook,
  getDueBlocksForUser,
  getGlossary,
  getNotionCategories,
  getNotionReadiness,
  getNotionRecommendations,
  getDoseCalculators,
  getCaseJournalCountsByNotion,
  getNotionProgressBatch,
  type BookWithChapters,
} from "@/lib/el-profesor/dal";
import { getBatchJobs } from "@/app/apps/el-profesor/actions/batches";
import { getElProfesorDashboardSnapshot } from "@/app/apps/el-profesor/actions/offline-sync";
import { DashboardWithLocalCache } from "@/components/el-profesor/dashboard-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";
import { recordAppVisit } from "@/app/actions/discovery";
import type { DashboardSecondaryData, DashboardAiConfigData, DashboardNotionViewData } from "@/lib/el-profesor/dashboard-types";

async function loadSecondaryDashboardData(
  profileId: string,
  isAdmin: boolean,
  allChapters: BookWithChapters["chapters"],
  books: BookWithChapters[],
  libraryBooks: BookWithChapters[]
): Promise<DashboardSecondaryData> {
  const [
    activity,
    overconfidentMissCount,
    forecast,
    globalDue,
    difficult,
    mostDifficultGlobal,
    leechFlashcards,
    dailyCard,
    bookmarks,
    staleChapters,
    knowledgeExpiryAlerts,
    reviewTimeStats,
    flagStatsByBlockType,
    onThisDayNote,
    bookRecommendation,
    dueBlocks,
  ] = await Promise.all([
    getReviewActivitySummary(profileId),
    getOverconfidentMissCount(profileId),
    getUpcomingReviewForecast(profileId, allChapters),
    getGlobalDueQueue(profileId, allChapters),
    getDifficultQueue(profileId, allChapters),
    isAdmin ? getMostDifficultFlashcardsGlobal() : Promise.resolve([]),
    isAdmin ? getLeechFlashcards() : Promise.resolve([]),
    getDailyCard(profileId, allChapters),
    getBookmarkedEntities(profileId),
    isAdmin ? getStaleChaptersForAdmin(allChapters, libraryBooks) : Promise.resolve([]),
    getKnowledgeExpiryAlerts(profileId, allChapters, libraryBooks),
    getReviewTimeStats(profileId),
    isAdmin ? getFlagStatsByBlockType() : Promise.resolve([]),
    getOnThisDayNote(profileId),
    getRecommendedNextBook(profileId, books),
    getDueBlocksForUser(profileId),
  ]);
  return {
    activity,
    overconfidentMissCount,
    forecast,
    globalDueCount: globalDue.length,
    difficultCount: difficult.length,
    mostDifficultGlobal,
    leechFlashcards,
    dailyCard,
    bookmarks,
    staleChapters,
    knowledgeExpiryAlerts,
    reviewTimeStats,
    flagStatsByBlockType,
    onThisDayNote,
    bookRecommendation,
    dueBlocks,
  };
}

async function loadNotionViewData(profileId: string): Promise<DashboardNotionViewData> {
  const notions = await getGlossary();
  const notionIds = notions.map((n) => n.notion.id);
  const [categories, readiness, recommendations, doseCalculators, caseCounts, progress] = await Promise.all([
    getNotionCategories(),
    getNotionReadiness(profileId, notions),
    getNotionRecommendations(notionIds),
    getDoseCalculators(notionIds),
    getCaseJournalCountsByNotion(profileId, notionIds),
    getNotionProgressBatch(profileId, notionIds),
  ]);
  return { notions, categories, readiness, recommendations, doseCalculators, caseCounts, progress };
}

async function loadAiConfigData(): Promise<DashboardAiConfigData> {
  const [geminiModel, geminiExtraKeyCount, geminiFallbackModel, geminiUsageStats, aiSpendCapUsd, currentMonthAiSpendUsd, hasClaudeKey, claudeModel, batchJobs] =
    await Promise.all([
      getElProfesorGeminiModel(),
      getElProfesorGeminiExtraKeyCount(),
      getElProfesorGeminiFallbackModel(),
      getGeminiUsageStats(),
      getAiSpendCapUsd(),
      getCurrentMonthAiSpendUsd(),
      hasElProfesorClaudeKey(),
      getElProfesorClaudeModel(),
      getBatchJobs(),
    ]);
  return { geminiModel, geminiExtraKeyCount, geminiFallbackModel, geminiUsageStats, aiSpendCapUsd, currentMonthAiSpendUsd, hasClaudeKey, claudeModel, batchJobs };
}

export default async function ElProfesorPage() {
  const profile = (await getCurrentProfile())!;
  const realIsAdmin = profile.role === "admin";
  const { effectiveIsAdmin: isAdmin, previewingAsUser } = await getEffectiveIsAdmin(realIsAdmin);

  // The book list + dashboard stats are computed by getElProfesorDashboardSnapshot
  // (actions/offline-sync.ts) — shared with the "Synchroniser" local-cache sync,
  // so this page and that action never duplicate the same batched queries.
  // libraryBooks (admin-inclusive, unfiltered) is fetched again here, only for
  // the Suspense-deferred secondary data below — cheap (one query) and keeps
  // the snapshot itself free of chapters a non-admin shouldn't ever cache.
  const [, snapshot, readingPosition, allLibraryBooks] = await Promise.all([
    recordAppVisit("el-profesor"),
    getElProfesorDashboardSnapshot(),
    getReadingPosition(profile.id),
    getLibrary(),
  ]);
  const { books } = snapshot;
  const libraryBooks = allLibraryBooks.filter((b) => !b.archivedAt);
  const allChapters = books.flatMap((b) => b.chapters);

  // Started here (server render), not awaited — passed down as a Promise
  // and unwrapped with React's use() only where each slice is actually
  // needed, streamed in behind a <Suspense> boundary once ready. See
  // src/lib/el-profesor/dashboard-types.ts for what each covers.
  const secondaryDataPromise = loadSecondaryDashboardData(profile.id, isAdmin, allChapters, books, libraryBooks);
  const aiConfigPromise = isAdmin ? loadAiConfigData() : Promise.resolve(null);
  const notionViewDataPromise = loadNotionViewData(profile.id);

  return (
    <ToastProvider>
      <DashboardWithLocalCache
        initialSnapshot={snapshot}
        isAdmin={isAdmin}
        realIsAdmin={realIsAdmin}
        previewingAsUser={previewingAsUser}
        serverResumeChapterId={readingPosition?.chapterId ?? null}
        secondaryDataPromise={secondaryDataPromise}
        aiConfigPromise={aiConfigPromise}
        notionViewDataPromise={notionViewDataPromise}
      />
    </ToastProvider>
  );
}
