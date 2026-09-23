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

  // recordAppVisit and getReadingPosition are single cheap indexed lookups
  // (analytics insert, one row by user id) — kept awaited, they were never
  // the slow part. getElProfesorDashboardSnapshot is the expensive one
  // (books + every batched dashboard stat): deliberately NOT awaited here.
  // Awaiting it would block this whole page behind it on every navigation,
  // which is exactly what made the local cache pointless — the client
  // never got a chance to render from IndexedDB before the slow server
  // round trip finished, since Next.js waits for the page's own response
  // either way. Passed down as a promise instead: DashboardWithLocalCache
  // renders instantly from its local cache when one exists, and only ever
  // waits on this promise when there isn't one yet (first visit).
  const [, readingPosition] = await Promise.all([recordAppVisit("el-profesor"), getReadingPosition(profile.id)]);
  const snapshotPromise = getElProfesorDashboardSnapshot();

  // Chained off snapshotPromise (needs its books/chapters) rather than
  // awaited directly — still never blocks this page, exactly like before.
  const secondaryDataPromise = snapshotPromise.then(async (snapshot) => {
    const allChapters = snapshot.books.flatMap((b) => b.chapters);
    const allLibraryBooks = await getLibrary();
    const libraryBooks = allLibraryBooks.filter((b) => !b.archivedAt);
    return loadSecondaryDashboardData(profile.id, isAdmin, allChapters, snapshot.books, libraryBooks);
  });
  const aiConfigPromise = isAdmin ? loadAiConfigData() : Promise.resolve(null);
  const notionViewDataPromise = loadNotionViewData(profile.id);

  return (
    <ToastProvider>
      <DashboardWithLocalCache
        initialSnapshotPromise={snapshotPromise}
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
