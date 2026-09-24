"use client";

// Local computation of due/free review queues and due/mastery counts (piste
// 2026-09-24 — correctif du bug "à jour" / "module 100% local"). Root cause
// of the bug this fixes: the dashboard's due-count badge used to read a
// snapshot frozen at last sync, only ever nudged by small deltas after each
// local review (patchDashboardCountsForReview, now removed) — while the
// live review queue (getDueQueue, dal/review.ts) was computed completely
// independently on the server. The two numbers could silently drift apart.
// The fix: compute the queue AND the counts from the exact same cached data
// with the exact same function every time they're needed, so they can never
// disagree again — computeLocalDueCounts literally calls
// computeLocalDueQueue under the hood, see below.
//
// activeFlashcards/shuffle are duplicated verbatim from dal/shared.ts
// (unexported logic, and that file starts with `import "server-only"`
// anyway, so it can't be imported into a client bundle). Every other
// function here mirrors dal/review.ts's getDueQueue/getFreeReviewQueue/
// getDueCountsByChapter/getMasteryCountsByChapter exactly — see each
// function's comment for the server-side function it mirrors.
import {
  getAllCachedChapterContent,
  getAllCachedReviewStates,
  getCachedChapterContent,
  getCachedSuspendedFlashcardIds,
  getAllPendingWrites,
  type PendingWrite,
} from "./local-db";
import type { Flashcard, ReviewState } from "./types";
import type { SubEntityWithFiche, ChapterDueCounts, ChapterMasteryCounts } from "./dal";

function activeFlashcards(content: SubEntityWithFiche[]): Flashcard[] {
  return content.flatMap((s) => (s.fiche && !s.fiche.supersededByFicheId ? s.fiche.flashcards : []));
}

/** Same "active" scope as activeFlashcards, one level up — the fiche ids getReadProgressByChapter (dal/progress.ts) averages over. */
function activeFicheIds(content: SubEntityWithFiche[]): string[] {
  return content.flatMap((s) => (s.fiche && !s.fiche.supersededByFicheId ? [s.fiche.id] : []));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Mirrors getDueQueue's exact filter + stable sort (dal/review.ts). */
export function computeLocalDueQueue(
  content: SubEntityWithFiche[],
  reviewStates: Map<string, ReviewState>,
  suspendedIds: Set<string>,
  now: number = Date.now()
): Flashcard[] {
  const due = activeFlashcards(content)
    .filter((card) => !suspendedIds.has(card.id))
    .map((card) => ({ card, dueAt: reviewStates.get(card.id)?.due }))
    .filter(({ dueAt }) => !dueAt || new Date(dueAt).getTime() <= now);

  due.sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : now) - (b.dueAt ? new Date(b.dueAt).getTime() : now));
  return due.map(({ card }) => card);
}

/** Mirrors getFreeReviewQueue exactly (dal/review.ts) — no due-date filtering, fresh shuffle every call. */
export function computeLocalFreeQueue(content: SubEntityWithFiche[], suspendedIds: Set<string>): Flashcard[] {
  return shuffle(activeFlashcards(content).filter((c) => !suspendedIds.has(c.id)));
}

/**
 * Mirrors getDueCountsByChapter's semantics, but implemented as
 * `computeLocalDueQueue(...).length` rather than a separately-derived
 * count — this is the actual fix for the "à jour" bug: the badge and the
 * queue can no longer disagree because they're the same computation.
 */
export function computeLocalDueCounts(
  contentByChapterId: Map<string, SubEntityWithFiche[]>,
  reviewStates: Map<string, ReviewState>,
  suspendedIds: Set<string>,
  now: number = Date.now()
): ChapterDueCounts {
  const counts: ChapterDueCounts = {};
  for (const [chapterId, content] of contentByChapterId) {
    counts[chapterId] = computeLocalDueQueue(content, reviewStates, suspendedIds, now).length;
  }
  return counts;
}

/** Mirrors getMasteryCountsByChapter's exact bucketing (dal/review.ts): no review-state row -> "new", state "review" -> "acquired", "learning"/"relearning" -> "learning". */
export function computeLocalMasteryCounts(
  contentByChapterId: Map<string, SubEntityWithFiche[]>,
  reviewStates: Map<string, ReviewState>
): ChapterMasteryCounts {
  const counts: ChapterMasteryCounts = {};
  for (const [chapterId, content] of contentByChapterId) {
    const flashcards = activeFlashcards(content);
    const total = flashcards.length;
    if (total === 0) {
      counts[chapterId] = { total: 0, new: 0, learning: 0, acquired: 0 };
      continue;
    }
    let learning = 0;
    let acquired = 0;
    let known = 0;
    for (const card of flashcards) {
      const state = reviewStates.get(card.id)?.state;
      if (state) known++;
      if (state === "review") acquired++;
      else if (state === "learning" || state === "relearning") learning++;
    }
    counts[chapterId] = { total, new: total - known, learning, acquired };
  }
  return counts;
}

/**
 * Mirrors getReadProgressByChapter's exact formula (dal/progress.ts):
 * average read % across the chapter's own active (non-superseded) fiches —
 * piste 2026-09-24, suite au retour "le % de lecture par chapitre ne
 * s'actualise pas tant que je ne synchronise pas". Reading a fiche writes
 * its new percentage straight to the server (saveFicheReadProgress) but
 * that alone never touched the cached snapshot this per-chapter figure
 * comes from — patchCachedFicheReadProgress (local-db.ts), called right
 * alongside that same save, is what keeps ficheReadProgress in the cached
 * chapter content current, so this recomputes the correct percentage
 * immediately instead of showing a number frozen at the last "Synchroniser".
 */
export function computeLocalReadProgressByChapter(contentByChapterId: Map<string, SubEntityWithFiche[]>, ficheReadProgressByChapterId: Map<string, Record<string, number>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [chapterId, content] of contentByChapterId) {
    const ficheIds = activeFicheIds(content);
    if (ficheIds.length === 0) {
      result[chapterId] = 0;
      continue;
    }
    const ficheReadProgress = ficheReadProgressByChapterId.get(chapterId) ?? {};
    const sum = ficheIds.reduce((acc, id) => acc + (ficheReadProgress[id] ?? 0), 0);
    result[chapterId] = Math.round(sum / ficheIds.length);
  }
  return result;
}

/** Null when no chapter content is cached at all yet — callers should fall back to the snapshot's own (possibly stale) percentages in that case, rather than showing everything as 0%. */
export async function getLocalReadProgressByChapter(): Promise<Record<string, number> | null> {
  const allContent = await getAllCachedChapterContent();
  if (allContent.size === 0) return null;
  const contentByChapterId = new Map([...allContent].map(([chapterId, c]) => [chapterId, c.subEntities]));
  const ficheReadProgressByChapterId = new Map([...allContent].map(([chapterId, c]) => [chapterId, c.ficheReadProgress]));
  return computeLocalReadProgressByChapter(contentByChapterId, ficheReadProgressByChapterId);
}

/**
 * This user's currently-suspended flashcard ids, factoring in any
 * "exclude"/reinclude writes not yet flushed to the server — so a card
 * excluded while offline disappears from the locally-computed queue/counts
 * immediately, not just after the next sync. getAllPendingWrites() is
 * already sorted oldest-first, so applying them in order means the most
 * recent one wins for any given flashcard.
 */
export async function getEffectiveSuspendedFlashcardIds(): Promise<Set<string>> {
  const [cached, pending] = await Promise.all([getCachedSuspendedFlashcardIds(), getAllPendingWrites()]);
  return applyPendingExcludes(cached ?? [], pending);
}

/** Pure half of getEffectiveSuspendedFlashcardIds — for callers that already loaded the pending queue. */
export function applyPendingExcludes(cachedIds: string[], pending: PendingWrite[]): Set<string> {
  const suspended = new Set(cachedIds);
  for (const write of pending) {
    if (write.kind !== "exclude") continue;
    if (write.payload.excluded) suspended.add(write.payload.flashcardId);
    else suspended.delete(write.payload.flashcardId);
  }
  return suspended;
}

/** Null when this chapter's content isn't cached yet — callers should fall back to the server in that case. */
export async function getLocalDueQueue(chapterId: string): Promise<Flashcard[] | null> {
  const [content, reviewStates, suspendedIds] = await Promise.all([
    getCachedChapterContent(chapterId),
    getAllCachedReviewStates(),
    getEffectiveSuspendedFlashcardIds(),
  ]);
  if (!content) return null;
  return computeLocalDueQueue(content.subEntities, reviewStates, suspendedIds);
}

export async function getLocalFreeQueue(chapterId: string): Promise<Flashcard[] | null> {
  const [content, suspendedIds] = await Promise.all([getCachedChapterContent(chapterId), getEffectiveSuspendedFlashcardIds()]);
  if (!content) return null;
  return computeLocalFreeQueue(content.subEntities, suspendedIds);
}

/** Null when no chapter content is cached at all yet — callers should fall back to the snapshot's own (possibly stale) counts in that case, rather than showing everything as zero. */
export async function getLocalDueCounts(): Promise<ChapterDueCounts | null> {
  const allContent = await getAllCachedChapterContent();
  if (allContent.size === 0) return null;
  const [reviewStates, suspendedIds] = await Promise.all([getAllCachedReviewStates(), getEffectiveSuspendedFlashcardIds()]);
  const contentByChapterId = new Map([...allContent].map(([chapterId, c]) => [chapterId, c.subEntities]));
  return computeLocalDueCounts(contentByChapterId, reviewStates, suspendedIds);
}

export async function getLocalMasteryCounts(): Promise<ChapterMasteryCounts | null> {
  const allContent = await getAllCachedChapterContent();
  if (allContent.size === 0) return null;
  const reviewStates = await getAllCachedReviewStates();
  const contentByChapterId = new Map([...allContent].map(([chapterId, c]) => [chapterId, c.subEntities]));
  return computeLocalMasteryCounts(contentByChapterId, reviewStates);
}
