"use client";

// Builds everything the dashboard shows from the local cache alone (piste
// 2026-09-24 — "widgets en local"): the cached library snapshot with every
// per-user figure recomputed on the spot (due/mastery/difficult counts,
// read %, global progress), plus every widget (local-widgets.ts). Reads
// IndexedDB once per call — the chapter content store is by far the
// biggest read, and it used to be loaded three separate times per
// dashboard render — then computes synchronously.
import {
  getCachedDashboard,
  getAllCachedChapterContent,
  getAllCachedReviewStates,
  getCachedSuspendedFlashcardIds,
  getAllPendingWrites,
  getCachedUserBookmarks,
  getCachedUserNotes,
  getCachedBlockReviewStates,
  getCachedReviewHistory,
  getAllLocalReviewEvents,
  getCachedDashboardExtras,
} from "./local-db";
import { applyPendingExcludes, computeLocalDueCounts, computeLocalMasteryCounts, computeLocalReadProgressByChapter } from "./local-review-queue";
import {
  buildLocalLibrary,
  computeGlobalDueQueue,
  computeDifficultQueue,
  computeLocalWidgets,
  computeDifficultCountsByChapter,
  computeGlobalProgress,
  mergeReviewDays,
  applyPendingBookmarkWrites,
  applyPendingNoteWrites,
} from "./local-widgets";
import type { BlockReviewState } from "./dal";
import type { DashboardSnapshot, DashboardSecondaryData, CachedBookmark } from "./dashboard-types";
import type { Flashcard } from "./types";

export interface LocalDashboardView {
  snapshot: DashboardSnapshot;
  syncedAt: string;
  /** Null only when no chapter content is cached at all yet — nothing to compute widgets from. */
  widgets: DashboardSecondaryData | null;
  /** True until the first sync with this version has fetched the review history — the streak/time widgets would otherwise quietly show zeros. */
  historyMissing: boolean;
}

/** Null when nothing is cached yet (never synced on this device) — the caller falls back to the server-rendered snapshot. */
export async function loadLocalDashboardView(isAdmin: boolean, now: number = Date.now()): Promise<LocalDashboardView | null> {
  const cached = await getCachedDashboard();
  if (!cached) return null;
  const { syncedAt, ...snapshot } = cached;

  const [allContent, reviewStates, cachedSuspendedIds, pending, cachedBookmarks, cachedNotes, cachedBlockStates, history, localEvents, extras] = await Promise.all([
    getAllCachedChapterContent(),
    getAllCachedReviewStates(),
    getCachedSuspendedFlashcardIds(),
    getAllPendingWrites(),
    getCachedUserBookmarks(),
    getCachedUserNotes(),
    getCachedBlockReviewStates(),
    getCachedReviewHistory(),
    getAllLocalReviewEvents(),
    getCachedDashboardExtras(isAdmin),
  ]);

  const withExtras: DashboardSnapshot = { ...snapshot, globalMastery: extras?.globalMastery ?? snapshot.globalMastery };
  if (allContent.size === 0) return { snapshot: withExtras, syncedAt, widgets: null, historyMissing: !history };

  const suspendedIds = applyPendingExcludes(cachedSuspendedIds ?? [], pending);
  const contentByChapterId = new Map([...allContent].map(([chapterId, c]) => [chapterId, c.subEntities]));
  const readProgressByChapterId = new Map([...allContent].map(([chapterId, c]) => [chapterId, c.ficheReadProgress]));
  const library = buildLocalLibrary(snapshot.books, contentByChapterId);

  // Fallbacks for a cache written by an older version (before bookmarks and
  // block re-read states had their own entries): each chapter snapshot
  // carries its own copy — possibly stale, but better than nothing until
  // the next sync writes the real thing.
  const bookmarks: CachedBookmark[] =
    cachedBookmarks ?? [...new Set([...allContent.values()].flatMap((c) => c.bookmarkedIds))].map((subEntityId) => ({ subEntityId, tags: [], createdAt: "" }));
  const blockReviewStates: Record<string, BlockReviewState> =
    cachedBlockStates ?? Object.assign({}, ...[...allContent.values()].map((c) => c.blockReviewStates));

  const view: DashboardSnapshot = {
    ...withExtras,
    dueCounts: computeLocalDueCounts(contentByChapterId, reviewStates, suspendedIds, now),
    masteryCounts: computeLocalMasteryCounts(contentByChapterId, reviewStates),
    difficultCounts: computeDifficultCountsByChapter(library, reviewStates, suspendedIds),
    readProgressByChapter: computeLocalReadProgressByChapter(contentByChapterId, readProgressByChapterId),
    globalProgress: computeGlobalProgress(library, readProgressByChapterId, reviewStates),
  };

  const widgets = computeLocalWidgets(
    {
      library,
      reviewStates,
      suspendedIds,
      reviewDays: mergeReviewDays(history?.days ?? {}, localEvents),
      bookmarks: applyPendingBookmarkWrites(bookmarks, pending),
      notes: applyPendingNoteWrites(cachedNotes ?? {}, pending),
      blockReviewStates,
      now,
    },
    extras
  );

  return { snapshot: view, syncedAt, widgets, historyMissing: !history };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The cross-chapter review queue ("Révision globale" / "Carnet d'erreurs"),
 * computed from the cache with the exact same functions as the dashboard's
 * counts — so the number on the button and the session it opens always
 * agree. The carnet d'erreurs is shuffled, like getDifficultQueue. Null
 * when nothing is cached yet (the caller falls back to the server).
 */
export async function loadLocalGlobalReviewQueue(mode: "due" | "difficult", now: number = Date.now()): Promise<Flashcard[] | null> {
  const [cached, allContent, reviewStates, cachedSuspendedIds, pending] = await Promise.all([
    getCachedDashboard(),
    getAllCachedChapterContent(),
    getAllCachedReviewStates(),
    getCachedSuspendedFlashcardIds(),
    getAllPendingWrites(),
  ]);
  if (!cached || allContent.size === 0) return null;
  const library = buildLocalLibrary(cached.books, new Map([...allContent].map(([chapterId, c]) => [chapterId, c.subEntities])));
  const suspendedIds = applyPendingExcludes(cachedSuspendedIds ?? [], pending);
  return mode === "due" ? computeGlobalDueQueue(library, reviewStates, suspendedIds, now) : shuffle(computeDifficultQueue(library, reviewStates, suspendedIds));
}
