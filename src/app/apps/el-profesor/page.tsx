import { getCurrentProfile } from "@/lib/auth/dal";
import {
  getLibrary,
  getDueCountsByChapter,
  getNeedsReviewCounts,
  getMasteryCountsByChapter,
  getElProfesorGeminiModel,
  getGlobalDueQueue,
  getDifficultQueue,
  getDifficultCountsByChapter,
  getReviewActivitySummary,
  getUpcomingReviewForecast,
  getMostDifficultFlashcardsGlobal,
  getDailyCard,
  getBookmarkedEntities,
  getGlobalChapterMasteryPercentages,
  getStaleChaptersForAdmin,
  getReviewTimeStats,
  getFlagStatsByBlockType,
  hasElProfesorGeminiKey,
  getElProfesorGeminiExtraKeyCount,
  getElProfesorGeminiFallbackModel,
  getGeminiUsageStats,
  getElProfesorAiProvider,
  hasElProfesorClaudeKey,
  getElProfesorClaudeModel,
  getReadingPosition,
  getOnThisDayNote,
  getRecommendedNextBook,
  getDueBlocksForUser,
} from "@/lib/el-profesor/dal";
import { getBatchJobs } from "@/app/apps/el-profesor/actions/batches";
import { ElProfesorBoard } from "@/components/el-profesor/board";
import { ToastProvider } from "@/components/ui/toast";
import { recordAppVisit } from "@/app/actions/discovery";

export default async function ElProfesorPage() {
  const profile = (await getCurrentProfile())!;
  const isAdmin = profile.role === "admin";
  await recordAppVisit("el-profesor");
  const libraryBooks = (await getLibrary()).filter((b) => !b.archivedAt);
  // Non-admins never see a chapter still being imported/reviewed — only
  // admins need visibility into the pipeline's in-progress state.
  const books = isAdmin ? libraryBooks : libraryBooks.map((b) => ({ ...b, chapters: b.chapters.filter((c) => c.status === "published") }));
  const allChapters = books.flatMap((b) => b.chapters);
  const [
    dueCounts,
    needsReviewCounts,
    masteryCounts,
    geminiModel,
    globalDue,
    difficult,
    difficultCounts,
    activity,
    forecast,
    mostDifficultGlobal,
    dailyCard,
    bookmarks,
    globalMastery,
    staleChapters,
    reviewTimeStats,
    flagStatsByBlockType,
    hasGeminiKey,
    geminiExtraKeyCount,
    geminiFallbackModel,
    geminiUsageStats,
    aiProvider,
    hasClaudeKey,
    claudeModel,
    readingPosition,
    onThisDayNote,
    bookRecommendation,
    dueBlocks,
    batchJobs,
  ] = await Promise.all([
    getDueCountsByChapter(profile.id, allChapters),
    isAdmin ? getNeedsReviewCounts(allChapters.map((c) => c.id)) : Promise.resolve({}),
    getMasteryCountsByChapter(profile.id, allChapters),
    isAdmin ? getElProfesorGeminiModel() : Promise.resolve(null),
    getGlobalDueQueue(profile.id, allChapters),
    getDifficultQueue(profile.id, allChapters),
    getDifficultCountsByChapter(profile.id, allChapters),
    getReviewActivitySummary(profile.id),
    getUpcomingReviewForecast(profile.id, allChapters),
    isAdmin ? getMostDifficultFlashcardsGlobal() : Promise.resolve([]),
    getDailyCard(profile.id, allChapters),
    getBookmarkedEntities(profile.id),
    getGlobalChapterMasteryPercentages(allChapters),
    isAdmin ? getStaleChaptersForAdmin(allChapters, libraryBooks) : Promise.resolve([]),
    getReviewTimeStats(profile.id),
    isAdmin ? getFlagStatsByBlockType() : Promise.resolve([]),
    isAdmin ? hasElProfesorGeminiKey() : Promise.resolve(false),
    isAdmin ? getElProfesorGeminiExtraKeyCount() : Promise.resolve(0),
    isAdmin ? getElProfesorGeminiFallbackModel() : Promise.resolve(null),
    isAdmin ? getGeminiUsageStats() : Promise.resolve(null),
    isAdmin ? getElProfesorAiProvider() : Promise.resolve("gemini" as const),
    isAdmin ? hasElProfesorClaudeKey() : Promise.resolve(false),
    isAdmin ? getElProfesorClaudeModel() : Promise.resolve(""),
    getReadingPosition(profile.id),
    getOnThisDayNote(profile.id),
    getRecommendedNextBook(profile.id, books),
    getDueBlocksForUser(profile.id),
    isAdmin ? getBatchJobs() : Promise.resolve([]),
  ]);

  return (
    <ToastProvider>
      <ElProfesorBoard
        books={books}
        dueCounts={dueCounts}
        needsReviewCounts={needsReviewCounts}
        masteryCounts={masteryCounts}
        isAdmin={isAdmin}
        geminiModel={geminiModel}
        globalDueCount={globalDue.length}
        difficultCount={difficult.length}
        difficultCounts={difficultCounts}
        activity={activity}
        forecast={forecast}
        mostDifficultGlobal={mostDifficultGlobal}
        dailyCard={dailyCard}
        bookmarks={bookmarks}
        globalMastery={globalMastery}
        staleChapters={staleChapters}
        reviewTimeStats={reviewTimeStats}
        flagStatsByBlockType={flagStatsByBlockType}
        hasGeminiKey={hasGeminiKey}
        geminiExtraKeyCount={geminiExtraKeyCount}
        geminiFallbackModel={geminiFallbackModel}
        geminiUsageStats={geminiUsageStats}
        aiProvider={aiProvider}
        hasClaudeKey={hasClaudeKey}
        claudeModel={claudeModel}
        serverResumeChapterId={readingPosition?.chapterId ?? null}
        onThisDayNote={onThisDayNote}
        bookRecommendation={bookRecommendation}
        dueBlocks={dueBlocks}
        batchJobs={batchJobs}
      />
    </ToastProvider>
  );
}
