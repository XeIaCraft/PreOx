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
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
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
} from "@/lib/el-profesor/dal";
import type { DashboardSnapshot, ChapterContentSnapshot } from "@/lib/el-profesor/dashboard-types";
import type { ReviewState } from "@/lib/el-profesor/types";

/** Same data page.tsx computes for its initial render — see that file for why each call is shaped this way (batched, no per-chapter loop). Exported so the page and the "Synchroniser" action share one implementation. */
export async function getElProfesorDashboardSnapshot(): Promise<DashboardSnapshot> {
  const profile = await requireElProfesorAccess();
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");

  const allLibraryBooks = await getLibrary();
  const libraryBooks = allLibraryBooks.filter((b) => !b.archivedAt);
  const books = isAdmin ? libraryBooks : libraryBooks.map((b) => ({ ...b, chapters: b.chapters.filter((c) => c.status === "published") }));
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
