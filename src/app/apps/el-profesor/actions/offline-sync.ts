"use server";

// Server side of the local-cache sync (piste 2026-09-24 — "cache local +
// synchronisation manuelle"): opening the dashboard or a chapter was taking
// minutes even after fixing the N+1 patterns on the dashboard's own stats,
// which points at something slow on the infrastructure side rather than a
// remaining application bug. Rather than keep guessing, the whole library
// (read-only content + this user's own progress) is mirrored into the
// browser (see src/lib/el-profesor/local-db.ts) via a manually-triggered
// "Synchroniser" sync, and every read after that comes from there instead
// of the network. These two actions are the only two round trips that sync
// needs, however large the library: a per-chapter loop here would just be
// the same N+1 pattern moved into this file instead of fixed.
import { requireElProfesorAccess, requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { createClient } from "@/lib/supabase/server";
import {
  getLibrary,
  getDueCountsByChapter,
  getNeedsReviewCounts,
  getMasteryCountsByChapter,
  getDifficultCountsByChapter,
  getGlobalChapterMasteryPercentages,
  hasElProfesorGeminiKey,
  getElProfesorAiProvider,
  getReadProgressByChapter,
  getGlobalProgressSummary,
  getBookmarkedSubEntityIds,
  getBlockReviewStates,
  getFicheReadProgressBatch,
  getFicheMasteryProgressBatch,
  getChapterContentBatch,
  getUserFsrsRetention,
  getReviewStatesByFlashcardIds,
  getSuspendedFlashcardIdsForSync,
  getChapterLastModifiedTimestamps,
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
  getNotionSummaries,
  getContradictions,
  getCrossBookFlashcardDuplicates,
  getSupersededFiches,
  getNotionUpdateProposals,
  getNotionSynthesis,
  getNotionFiches,
  getAdjacentNotions,
  getNotionReadProgress,
  getNotionMasteryProgress,
  getCaseJournalEntries,
  getElProfesorGeminiModel,
  getElProfesorGeminiExtraKeyCount,
  getElProfesorGeminiFallbackModel,
  getGeminiUsageStats,
  getAiSpendCapUsd,
  getCurrentMonthAiSpendUsd,
  hasElProfesorClaudeKey,
  getElProfesorClaudeModel,
  type BookWithChapters,
} from "@/lib/el-profesor/dal";
import { getBatchJobs } from "@/app/apps/el-profesor/actions/batches";
import type {
  DashboardSnapshot,
  ChapterContentSnapshot,
  DashboardSecondaryData,
  DashboardAiConfigData,
  DashboardNotionViewData,
  NotionsPageSnapshot,
  NotionSynthesisSnapshot,
  CaseJournalSnapshot,
} from "@/lib/el-profesor/dashboard-types";
import type { ReviewState } from "@/lib/el-profesor/types";

/** Shared by getElProfesorDashboardSnapshot and the secondary-widgets actions below, so a client-invoked (shell-driven) render of any of them sees the exact same book/chapter visibility rules as the main snapshot. */
async function getVisibleLibrary(isAdmin: boolean): Promise<{ books: BookWithChapters[]; libraryBooks: BookWithChapters[] }> {
  const allLibraryBooks = await getLibrary();
  const libraryBooks = allLibraryBooks.filter((b) => !b.archivedAt);
  const books = isAdmin ? libraryBooks : libraryBooks.map((b) => ({ ...b, chapters: b.chapters.filter((c) => c.status === "published") }));
  return { books, libraryBooks };
}

/** Same data page.tsx computes for its initial render — see that file for why each call is shaped this way (batched, no per-chapter loop). Exported so the page and the "Synchroniser" action share one implementation. */
export async function getElProfesorDashboardSnapshot(): Promise<DashboardSnapshot> {
  const profile = await requireElProfesorAccess();
  const realIsAdmin = profile.role === "admin";
  const { effectiveIsAdmin: isAdmin, previewingAsUser } = await getEffectiveIsAdmin(realIsAdmin);

  const { books } = await getVisibleLibrary(isAdmin);
  const allChapters = books.flatMap((b) => b.chapters);

  const [
    dueCounts,
    needsReviewCounts,
    masteryCounts,
    difficultCounts,
    globalMastery,
    hasGeminiKey,
    aiProvider,
    readProgressByChapter,
    globalProgress,
    fsrsRetention,
  ] = await Promise.all([
    getDueCountsByChapter(profile.id, allChapters),
    isAdmin ? getNeedsReviewCounts(allChapters.map((c) => c.id)) : Promise.resolve({}),
    getMasteryCountsByChapter(profile.id, allChapters),
    getDifficultCountsByChapter(profile.id, allChapters),
    getGlobalChapterMasteryPercentages(allChapters),
    isAdmin ? hasElProfesorGeminiKey() : Promise.resolve(false),
    isAdmin ? getElProfesorAiProvider() : Promise.resolve("gemini" as const),
    getReadProgressByChapter(profile.id, allChapters),
    getGlobalProgressSummary(profile.id),
    getUserFsrsRetention(profile.id),
  ]);

  return {
    books,
    dueCounts,
    needsReviewCounts,
    masteryCounts,
    difficultCounts,
    globalMastery,
    readProgressByChapter,
    globalProgress,
    hasGeminiKey,
    aiProvider,
    fsrsRetention,
    effectiveIsAdmin: isAdmin,
    realIsAdmin,
    previewingAsUser,
  };
}

function pick<T>(map: Record<string, T>, ids: string[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const id of ids) if (id in map) result[id] = map[id];
  return result;
}

/**
 * Full per-chapter content (same shape chapters/[chapterId]/page.tsx builds)
 * for many chapters at once. The client calls this in chunks of ~25 ids
 * (see sync-modal.tsx) so a full-library sync makes a small, bounded number
 * of round trips instead of one per chapter, while still giving the
 * progress bar real per-chunk progress to report.
 */
export async function getElProfesorChapterContentBatch(chapterIds: string[]): Promise<Record<string, ChapterContentSnapshot>> {
  const profile = await requireElProfesorAccess();
  const result: Record<string, ChapterContentSnapshot> = {};
  if (chapterIds.length === 0) return result;

  const [contentByChapter, libraryBooks, bookmarkedIdSet] = await Promise.all([
    getChapterContentBatch(chapterIds, false),
    getLibrary(),
    getBookmarkedSubEntityIds(profile.id),
  ]);
  const bookmarkedIds = [...bookmarkedIdSet];

  const allSubEntities = [...contentByChapter.values()].flat();
  const allFicheIds = allSubEntities.flatMap((s) => (s.fiche ? [s.fiche.id] : []));
  const allBlockIds = allSubEntities.flatMap((s) => s.fiche?.blocks.map((b) => b.id) ?? []);

  const [blockReviewStates, ficheReadProgress, ficheMasteryProgress] = await Promise.all([
    getBlockReviewStates(profile.id, allBlockIds),
    getFicheReadProgressBatch(profile.id, allFicheIds),
    getFicheMasteryProgressBatch(profile.id, allFicheIds),
  ]);

  for (const chapterId of chapterIds) {
    const subEntities = contentByChapter.get(chapterId) ?? [];
    const ficheIds = subEntities.flatMap((s) => (s.fiche ? [s.fiche.id] : []));
    const blockIds = subEntities.flatMap((s) => s.fiche?.blocks.map((b) => b.id) ?? []);

    // Adjacent chapter for swipe-to-next-chapter navigation, derived purely
    // from the library structure already fetched above — no extra query per
    // chapter. Unlike getAdjacentChapters (the live single-chapter path),
    // this doesn't resolve a specific "entry sub-entity" on the neighbor
    // (that would mean fetching its content too); landing at the top of the
    // neighboring chapter instead is an acceptable simplification for the
    // offline-served version.
    const book = libraryBooks.find((b) => b.chapters.some((c) => c.id === chapterId));
    const chapterRow = book?.chapters.find((c) => c.id === chapterId);
    let adjacentChapters: ChapterContentSnapshot["adjacentChapters"] = { prev: null, next: null };
    if (book) {
      const publishedChapters = book.chapters.filter((c) => c.status === "published");
      const index = publishedChapters.findIndex((c) => c.id === chapterId);
      const prevChapter = index > 0 ? publishedChapters[index - 1] : undefined;
      const nextChapter = index !== -1 && index < publishedChapters.length - 1 ? publishedChapters[index + 1] : undefined;
      adjacentChapters = {
        prev: prevChapter ? { chapterId: prevChapter.id, chapterTitle: prevChapter.title, entrySubEntityId: null } : null,
        next: nextChapter ? { chapterId: nextChapter.id, chapterTitle: nextChapter.title, entrySubEntityId: null } : null,
      };
    }
    // Skipped (not an error) if the chapter vanished between the
    // getLibrary() call above and here — e.g. deleted mid-sync.
    if (!chapterRow) continue;

    result[chapterId] = {
      chapterTitle: chapterRow.title,
      sourceKind: chapterRow.sourceKind,
      sourceText: chapterRow.sourceText,
      subEntities,
      bookmarkedIds,
      blockReviewStates: pick(blockReviewStates, blockIds),
      ficheReadProgress: pick(ficheReadProgress, ficheIds),
      ficheMasteryProgress: pick(ficheMasteryProgress, ficheIds),
      adjacentChapters,
    };
  }

  return result;
}

/**
 * Batched el_profesor_review_state fetch for this user's own flashcards
 * (piste 2026-09-24 — "écriture locale automatique"). Called by sync-modal.tsx
 * in chunks alongside getElProfesorChapterContentBatch, so local-db.ts's
 * reviewState store has a starting FSRS state to run scheduleReview() against
 * offline — same batching rationale as the other actions in this file (a
 * per-flashcard loop here would just move the N+1 pattern client-side).
 */
export async function getElProfesorReviewStateBatch(flashcardIds: string[]): Promise<Record<string, ReviewState>> {
  const profile = await requireElProfesorAccess();
  if (flashcardIds.length === 0) return {};
  return getReviewStatesByFlashcardIds(profile.id, flashcardIds);
}

/**
 * This user's excluded-from-reviews flashcard ids (piste 2026-09-24 —
 * correctif du bug "à jour"): synced once per full sync so
 * local-review-queue.ts can compute due/free queues and due/mastery counts
 * fully locally, with the same "suspended" semantics getDueQueue/
 * getFreeReviewQueue apply server-side.
 */
export async function getElProfesorSuspendedFlashcardIds(): Promise<string[]> {
  const profile = await requireElProfesorAccess();
  return getSuspendedFlashcardIdsForSync(profile.id);
}

/**
 * Per-chapter "last modified" timestamp (piste 2026-09-24 — synchronisation
 * delta): the "Synchroniser" sync compares this against each cached
 * chapter's own lastModifiedAt (captured the last time its content was
 * downloaded) and only re-downloads the ones that actually changed —
 * instead of re-fetching the whole library's content on every sync.
 */
export async function getElProfesorChapterLastModified(chapterIds: string[]): Promise<Record<string, string>> {
  await requireElProfesorAccess();
  return getChapterLastModifiedTimestamps(chapterIds);
}

// ============================================================================
// Dashboard secondary widgets (piste 2026-09-24 — "module 100% local") —
// moved here from page.tsx (which still calls these, unchanged) so the local
// nav shell (local-nav-shell.tsx) can also call them directly when it
// renders the dashboard client-side. Without this, a shell-driven dashboard
// render had no way to get this data at all (no local cache exists for it
// yet — see the plan's risk notes) and the widgets were stuck showing their
// loading skeleton forever. Each wrapper below re-derives isAdmin/profile
// itself rather than trusting caller-supplied values, since an exported
// Server Action is reachable directly regardless of who "intends" to call
// it — never trust profileId/isAdmin as params on a public export.
// ============================================================================

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

/** Called by page.tsx (chained off its own already-fetched snapshot) and by the local nav shell (on a shell-driven dashboard render, where no snapshot promise exists to chain off — it re-derives its own visible-library view instead). */
export async function getElProfesorSecondaryDashboardData(): Promise<DashboardSecondaryData> {
  const profile = await requireElProfesorAccess();
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");
  const { books, libraryBooks } = await getVisibleLibrary(isAdmin);
  const allChapters = books.flatMap((b) => b.chapters);
  return loadSecondaryDashboardData(profile.id, isAdmin, allChapters, books, libraryBooks);
}

export async function getElProfesorNotionViewData(): Promise<DashboardNotionViewData> {
  const profile = await requireElProfesorAccess();
  return loadNotionViewData(profile.id);
}

export async function getElProfesorAiConfigData(): Promise<DashboardAiConfigData | null> {
  const profile = await requireElProfesorAccess();
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");
  if (!isAdmin) return null;
  return loadAiConfigData();
}

// ============================================================================
// Notions / journal de cas (piste 2026-09-24 — extension de "module 100%
// local" aux autres écrans) — same "one Server Action per screen, same shape
// the page itself builds" pattern as the dashboard/chapter actions above.
// ============================================================================

/** Same data notions/page.tsx builds — admin-only diagnostic + browsing screen, cached as one blob (see NotionsPageSnapshot). */
export async function getElProfesorNotionsPageData(): Promise<NotionsPageSnapshot> {
  await requireElProfesorAdmin();
  const [books, notionSummaries, categories, contradictions, crossBookDuplicates, supersededFiches, notionUpdateProposals] = await Promise.all([
    getLibrary(),
    getNotionSummaries(),
    getNotionCategories(),
    getContradictions(),
    getCrossBookFlashcardDuplicates(),
    getSupersededFiches(),
    getNotionUpdateProposals(),
  ]);
  const notionIds = notionSummaries.map((s) => s.notion.id);
  const [recommendations, doseCalculators] = await Promise.all([getNotionRecommendations(notionIds), getDoseCalculators(notionIds)]);
  const chapters = books.flatMap((book) =>
    book.chapters
      .filter((c) => c.status === "draft_ready" || c.status === "published")
      .map((c) => ({ id: c.id, title: c.title, bookTitle: book.title }))
  );
  return { chapters, notionSummaries, categories, recommendations, doseCalculators, contradictions, crossBookDuplicates, supersededFiches, notionUpdateProposals };
}

/** Same data notions/[notionId]/page.tsx builds — cached in local-db.ts's generic `entities` store, keyed by notionId. Returns null if the notion doesn't exist (mirrors that page's notFound()). */
export async function getElProfesorNotionSynthesis(notionId: string): Promise<NotionSynthesisSnapshot | null> {
  const profile = await requireElProfesorAccess();
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");

  const supabase = await createClient();
  const { data: notion } = await supabase.from("el_profesor_notions").select("id, name").eq("id", notionId).maybeSingle();
  if (!notion) return null;

  const [synthesis, fiches, adjacentNotions, readProgress, masteryProgress] = await Promise.all([
    getNotionSynthesis(notionId, isAdmin),
    getNotionFiches(notionId),
    getAdjacentNotions(notionId),
    getNotionReadProgress(profile.id, notionId),
    getNotionMasteryProgress(profile.id, notionId),
  ]);

  return {
    notionName: notion.name,
    synthesis,
    fiches,
    prevNotion: adjacentNotions.prev,
    nextNotion: adjacentNotions.next,
    readProgress,
    masteryProgress,
  };
}

/** Same data journal/page.tsx builds — this user's own case journal entries + the notion list used to filter/link them. getCaseJournalEntries relies on RLS alone (no internal auth check), so this export must gate access itself — an exported Server Action is reachable directly regardless of what a page-level guard elsewhere "intends". */
export async function getElProfesorCaseJournalData(): Promise<CaseJournalSnapshot> {
  await requireElProfesorAccess();
  const [entries, notionSummaries] = await Promise.all([getCaseJournalEntries(), getGlossary()]);
  return { entries, notions: notionSummaries.map((s) => ({ id: s.notion.id, name: s.notion.name })) };
}
