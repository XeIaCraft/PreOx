import "server-only";

// Server side of the local-cache sync (piste 2026-09-24 — "cache local +
// synchronisation manuelle", then "module 100 % local"). Plain server
// functions, deliberately NOT Server Actions: the browser reaches them
// through the route handler in app/api/el-profesor/sync/[part]/route.ts
// with ordinary fetch() calls. That's the actual fix for "la
// synchronisation est hyper lente" and "Réglages IA ne s'ouvre plus": Next.js
// dispatches Server Actions ONE AT A TIME per client (see
// node_modules/next/dist/docs/01-app/02-guides/server-actions.md — "do not
// rely on Promise.all to parallelize Server Actions from the client … use a
// Route Handler for non-mutation requests"), so every read the sync or the
// settings dialog made used to wait in line behind every other queued
// action, including each background write flush and the full page re-render
// its revalidatePath() triggered. Route handlers have no such queue: these
// run truly in parallel, and never re-render a page.
//
// The server pages (page.tsx, chapters/[chapterId]/page.tsx, notions/…)
// import the same functions directly for their first-visit render, so the
// live path and the cached path can never compute anything differently.
import { createClient } from "@/lib/supabase/server";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import {
  requireElProfesorAccess,
  requireElProfesorAdmin,
  selectAllPages,
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
  getChapterLastModifiedTimestamps,
  getMostDifficultFlashcardsGlobal,
  getLeechFlashcards,
  getStaleChaptersForAdmin,
  getFlagStatsByBlockType,
  getRecommendedNextBook,
  getGlossary,
  getNotionCategories,
  getNotionReadiness,
  getNotionRecommendations,
  getDoseCalculators,
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
  getElProfesorGeminiModel,
  getElProfesorGeminiExtraKeyCount,
  getElProfesorGeminiFallbackModel,
  getGeminiUsageStats,
  getAiSpendCapUsd,
  getCurrentMonthAiSpendUsd,
  hasElProfesorClaudeKey,
  getElProfesorClaudeModel,
  type BookWithChapters,
  type BlockReviewState,
} from "@/lib/el-profesor/dal";
import { toReviewState } from "@/lib/el-profesor/dal/shared";
import { getBatchJobs } from "@/app/apps/el-profesor/actions/batches";
import type {
  DashboardSnapshot,
  ChapterContentSnapshot,
  DashboardAiConfigData,
  DashboardNotionViewData,
  NotionsPageSnapshot,
  NotionSynthesisSnapshot,
  SyncManifest,
  UserSyncData,
  ReviewHistoryDelta,
  ReviewDayStats,
  DashboardExtras,
} from "@/lib/el-profesor/dashboard-types";
import type { ElProfesorReviewStateRow } from "@/lib/supabase/types";

/**
 * Isolates one independent query inside a bundle, so a single slow or
 * failing one degrades to its own empty default instead of taking every
 * other value in the same Promise.all down with it.
 */
function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

/** Shared by every loader below, so all of them see the exact same book/chapter visibility rules. */
async function getVisibleLibrary(isAdmin: boolean): Promise<{ books: BookWithChapters[]; libraryBooks: BookWithChapters[] }> {
  const allLibraryBooks = await getLibrary();
  const libraryBooks = allLibraryBooks.filter((b) => !b.archivedAt);
  const books = isAdmin ? libraryBooks : libraryBooks.map((b) => ({ ...b, chapters: b.chapters.filter((c) => c.status === "published") }));
  return { books, libraryBooks };
}

export interface SyncContext {
  profileId: string;
  realIsAdmin: boolean;
  isAdmin: boolean;
  previewingAsUser: boolean;
}

/** Auth + effective admin/preview state, resolved once per request. Throws Next's own redirect/notFound control-flow errors exactly like any page would — the route handler turns those into a 307/404 response. */
export async function resolveSyncContext(): Promise<SyncContext> {
  const profile = await requireElProfesorAccess();
  const realIsAdmin = profile.role === "admin";
  const { effectiveIsAdmin, previewingAsUser } = await getEffectiveIsAdmin(realIsAdmin);
  return { profileId: profile.id, realIsAdmin, isAdmin: effectiveIsAdmin, previewingAsUser };
}

/**
 * Full dashboard snapshot, per-user aggregates included — only fetched when
 * nothing is cached on this device yet (first visit, or right after a cache
 * reset). Once synced, the dashboard computes those aggregates itself from
 * the cached content (local-dashboard.ts), and the sync only fetches the
 * server-side fields (loadSyncManifest below). Deliberately no longer
 * computed by page.tsx on every render: that render also runs inside every
 * Server Action response on the dashboard (revalidatePath re-renders the
 * current page), so each settings save or admin action used to pay for a
 * whole-library aggregation nobody displayed.
 */
export async function getElProfesorDashboardSnapshot(ctx?: SyncContext): Promise<DashboardSnapshot> {
  const { profileId, realIsAdmin, isAdmin, previewingAsUser } = ctx ?? (await resolveSyncContext());
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
    getDueCountsByChapter(profileId, allChapters),
    isAdmin ? getNeedsReviewCounts(allChapters.map((c) => c.id)) : Promise.resolve({}),
    getMasteryCountsByChapter(profileId, allChapters),
    getDifficultCountsByChapter(profileId, allChapters),
    getGlobalChapterMasteryPercentages(allChapters),
    isAdmin ? hasElProfesorGeminiKey() : Promise.resolve(false),
    isAdmin ? getElProfesorAiProvider() : Promise.resolve("gemini" as const),
    getReadProgressByChapter(profileId, allChapters),
    getGlobalProgressSummary(profileId),
    getUserFsrsRetention(profileId),
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

/**
 * The essential, always-fast part of "Synchroniser": the library structure,
 * the few genuinely server-side dashboard fields, this user's excluded
 * cards and every published chapter's last-modified timestamp (the delta
 * sync's input). Deliberately leaves out every per-user aggregate the old
 * full snapshot computed server-side (due/mastery/difficult counts, read
 * progress, global progress — a few hundred chunked queries across the
 * whole library on every sync): the device computes all of those itself
 * from the content and progress it already has cached.
 */
export async function loadSyncManifest(ctx: SyncContext): Promise<SyncManifest> {
  const { books } = await getVisibleLibrary(ctx.isAdmin);
  const allChapters = books.flatMap((b) => b.chapters);
  const publishedChapterIds = allChapters.filter((c) => c.status === "published").map((c) => c.id);
  const supabase = await createClient();

  const [needsReviewCounts, hasGeminiKey, aiProvider, fsrsRetention, suspendedRows, lastModified] = await Promise.all([
    ctx.isAdmin ? settled(getNeedsReviewCounts(allChapters.map((c) => c.id)), {}) : Promise.resolve({}),
    ctx.isAdmin ? hasElProfesorGeminiKey() : Promise.resolve(false),
    ctx.isAdmin ? getElProfesorAiProvider() : Promise.resolve("gemini" as const),
    getUserFsrsRetention(ctx.profileId),
    // Paged and throwing on error (unlike getSuspendedFlashcardIds): an
    // error must fail the sync, never be cached as "nothing excluded".
    selectAllPages((from, to) =>
      supabase.from("el_profesor_suspended_flashcards").select("flashcard_id").eq("user_id", ctx.profileId).order("flashcard_id").range(from, to)
    ),
    getChapterLastModifiedTimestamps(publishedChapterIds),
  ]);

  return {
    snapshot: {
      books,
      dueCounts: {},
      needsReviewCounts,
      masteryCounts: {},
      difficultCounts: {},
      globalMastery: {},
      readProgressByChapter: {},
      globalProgress: { readPct: 0, mastery: { total: 0, acquired: 0, learning: 0 } },
      hasGeminiKey,
      aiProvider,
      fsrsRetention,
      effectiveIsAdmin: ctx.isAdmin,
      realIsAdmin: ctx.realIsAdmin,
      previewingAsUser: ctx.previewingAsUser,
    },
    suspendedIds: suspendedRows.map((r) => r.flashcard_id),
    lastModified,
  };
}

/**
 * This user's own small per-entity data, each list fetched in full with one
 * paged, user-scoped query — no library-wide id list involved (the old sync
 * sent every one of the library's ~8000 flashcard ids and every fiche id
 * back to the server just to ask for this user's rows). See UserSyncData's
 * doc comment for why this is cached separately from chapter content.
 */
export async function loadUserSyncData(profileId: string): Promise<UserSyncData> {
  const supabase = await createClient();
  const [stateRows, readRows, bookmarkRows, blockRows, noteRows] = await Promise.all([
    selectAllPages((from, to) => supabase.from("el_profesor_review_state").select("*").eq("user_id", profileId).order("flashcard_id").range(from, to)),
    selectAllPages((from, to) =>
      supabase.from("el_profesor_fiche_read_progress").select("fiche_id, progress_pct").eq("user_id", profileId).order("fiche_id").range(from, to)
    ),
    selectAllPages((from, to) =>
      supabase
        .from("el_profesor_bookmarks")
        .select("sub_entity_id, tags, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
        .order("sub_entity_id")
        .range(from, to)
    ),
    selectAllPages((from, to) =>
      supabase.from("el_profesor_block_review_state").select("block_id, interval_days, next_due_at").eq("user_id", profileId).order("block_id").range(from, to)
    ),
    selectAllPages((from, to) =>
      supabase.from("el_profesor_notes").select("sub_entity_id, content, share_token, created_at").eq("user_id", profileId).order("sub_entity_id").range(from, to)
    ),
  ]);

  const ficheReadProgress: Record<string, number> = {};
  for (const row of readRows) ficheReadProgress[row.fiche_id] = row.progress_pct;
  const blockReviewStates: Record<string, BlockReviewState> = {};
  for (const row of blockRows) blockReviewStates[row.block_id] = { intervalDays: row.interval_days, nextDueAt: row.next_due_at };

  return {
    reviewStates: (stateRows as ElProfesorReviewStateRow[]).map(toReviewState),
    ficheReadProgress,
    bookmarks: bookmarkRows.map((b) => ({ subEntityId: b.sub_entity_id, tags: b.tags ?? [], createdAt: b.created_at })),
    blockReviewStates,
    notes: noteRows.map((n) => ({ subEntityId: n.sub_entity_id, content: n.content, shareToken: n.share_token, createdAt: n.created_at })),
  };
}

/**
 * Per-UTC-day aggregates of this user's review log — everything the
 * streak/heatmap, time-invested and overconfidence widgets need. `sinceIso`
 * makes it a delta: the client passes the start of the day it last fetched,
 * so a routine sync only reads today's handful of rows instead of the whole
 * history; the very first sync (no `since`) reads it all once.
 */
export async function loadReviewHistory(profileId: string, sinceIso: string | null): Promise<ReviewHistoryDelta> {
  const supabase = await createClient();
  const rows = await selectAllPages((from, to) => {
    let query = supabase.from("el_profesor_review_log").select("id, reviewed_at, duration_ms, rating, confidence").eq("user_id", profileId);
    if (sinceIso) query = query.gte("reviewed_at", sinceIso);
    return query.order("reviewed_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
  });

  const days: Record<string, ReviewDayStats> = {};
  for (const row of rows) {
    const day = new Date(row.reviewed_at).toISOString().slice(0, 10);
    const stats = (days[day] ??= { count: 0, ms: 0, sureMisses: 0 });
    stats.count++;
    if (row.duration_ms != null) stats.ms += row.duration_ms;
    if (row.confidence === "sure" && row.rating === "again") stats.sureMisses++;
  }
  return { days };
}

/** The few widgets that aggregate OTHER users' data and so can't be computed on this device — see DashboardExtras. Fetched in the background after a sync; every value isolated so one failing never hides the others. */
export async function loadDashboardExtras(ctx: SyncContext): Promise<DashboardExtras> {
  const { books, libraryBooks } = await getVisibleLibrary(ctx.isAdmin);
  const allChapters = books.flatMap((b) => b.chapters);
  const [globalMastery, bookRecommendation, mostDifficultGlobal, leechFlashcards, flagStatsByBlockType, staleChapters] = await Promise.all([
    settled(getGlobalChapterMasteryPercentages(allChapters), {}),
    settled(getRecommendedNextBook(ctx.profileId, books), null),
    ctx.isAdmin ? settled(getMostDifficultFlashcardsGlobal(), []) : Promise.resolve([]),
    ctx.isAdmin ? settled(getLeechFlashcards(), []) : Promise.resolve([]),
    ctx.isAdmin ? settled(getFlagStatsByBlockType(), []) : Promise.resolve([]),
    ctx.isAdmin ? settled(getStaleChaptersForAdmin(allChapters, libraryBooks), []) : Promise.resolve([]),
  ]);
  return { globalMastery, bookRecommendation, mostDifficultGlobal, leechFlashcards, flagStatsByBlockType, staleChapters };
}

function pick<T>(map: Record<string, T>, ids: string[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const id of ids) if (id in map) result[id] = map[id];
  return result;
}

/**
 * Full per-chapter content (same shape chapters/[chapterId]/page.tsx
 * renders) for many chapters at once. The sync asks for it in chunks of ~25
 * ids, and only for chapters whose content actually changed since they were
 * last cached (delta sync).
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
    // from the library structure already fetched above — landing at the
    // top of the neighboring chapter rather than resolving a specific
    // "entry sub-entity" on it (which would mean fetching its content too).
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

export async function loadNotionViewData(profileId: string): Promise<DashboardNotionViewData> {
  const notions = await getGlossary();
  const notionIds = notions.map((n) => n.notion.id);
  const [categories, readiness, recommendations, doseCalculators, progress] = await Promise.all([
    settled(getNotionCategories(), []),
    settled(getNotionReadiness(profileId, notions), {}),
    settled(getNotionRecommendations(notionIds), {}),
    settled(getDoseCalculators(notionIds), {}),
    settled(getNotionProgressBatch(profileId, notionIds), {}),
  ]);
  return { notions, categories, readiness, recommendations, doseCalculators, progress };
}

/** Admin-only — callers must check SyncContext.isAdmin first (getBatchJobs re-checks the real role on its own). */
export async function loadAiConfigData(): Promise<DashboardAiConfigData> {
  const [geminiModel, geminiExtraKeyCount, geminiFallbackModel, geminiUsageStats, aiSpendCapUsd, currentMonthAiSpendUsd, hasClaudeKey, claudeModel, batchJobs] =
    await Promise.all([
      settled(getElProfesorGeminiModel(), null),
      settled(getElProfesorGeminiExtraKeyCount(), 0),
      settled(getElProfesorGeminiFallbackModel(), null),
      settled(getGeminiUsageStats(), null),
      settled(getAiSpendCapUsd(), null),
      settled(getCurrentMonthAiSpendUsd(), 0),
      settled(hasElProfesorClaudeKey(), false),
      settled(getElProfesorClaudeModel(), ""),
      settled(getBatchJobs(), []),
    ]);
  return { geminiModel, geminiExtraKeyCount, geminiFallbackModel, geminiUsageStats, aiSpendCapUsd, currentMonthAiSpendUsd, hasClaudeKey, claudeModel, batchJobs };
}

/** Same data notions/page.tsx renders — admin-only diagnostic + browsing screen, cached as one blob (see NotionsPageSnapshot). */
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

/** Same data notions/[notionId]/page.tsx renders — cached in local-db.ts's generic `entities` store, keyed by notionId. Returns null if the notion doesn't exist (mirrors that page's notFound()). */
export async function getElProfesorNotionSynthesis(notionId: string): Promise<NotionSynthesisSnapshot | null> {
  const { profileId, isAdmin } = await resolveSyncContext();

  const supabase = await createClient();
  const { data: notion } = await supabase.from("el_profesor_notions").select("id, name").eq("id", notionId).maybeSingle();
  if (!notion) return null;

  const [synthesis, fiches, adjacentNotions, readProgress, masteryProgress] = await Promise.all([
    getNotionSynthesis(notionId, isAdmin),
    getNotionFiches(notionId),
    getAdjacentNotions(notionId),
    getNotionReadProgress(profileId, notionId),
    getNotionMasteryProgress(profileId, notionId),
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
