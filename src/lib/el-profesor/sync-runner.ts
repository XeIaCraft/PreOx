"use client";

// "Synchroniser" (piste 2026-09-24 — "cache local + synchronisation
// manuelle", puis suite au retour "la synchronisation est hyper lente même
// s'il n'y a eu aucune modification"). Two parts:
//
// 1. runEssentialSync — what the modal waits for. Delivers the local write
//    queue, then fetches in PARALLEL (plain fetch() to the sync route
//    handler, no Server Action queue) the library manifest, this user's own
//    data (review states, read progress, bookmarks, notes, block re-reads)
//    and the review-history delta, then downloads content only for the
//    chapters that actually changed. With nothing changed that's three
//    small requests.
// 2. runBackgroundSync — everything the dashboard can live without for a
//    few seconds (cross-user extras, the notion view, admin AI settings,
//    the admin notions screen): started once the essential part is done,
//    never blocks the modal, each part isolated so one failing never
//    affects the others, and simply retried at the next sync.
import {
  setCachedDashboard,
  setCachedSuspendedFlashcardIds,
  setCachedChapterContentBatch,
  getCachedChapterLastModifiedTimestamps,
  pruneChapterContent,
  replaceCachedReviewStates,
  applyServerFicheReadProgress,
  setCachedUserBookmarks,
  setCachedUserNotes,
  setCachedBlockReviewStates,
  getCachedReviewHistory,
  setCachedReviewHistory,
  pruneLocalReviewEventsIncludedBefore,
  getAllLocalReviewEvents,
  getAllPendingWrites,
  getCachedDashboard,
  setCachedDashboardExtras,
  setCachedNotionViewData,
  setCachedAiConfigData,
  setCachedNotionsPage,
  type CachedReviewHistory,
} from "./local-db";
import { flushAllPendingWrites, countUnsentPendingWrites } from "./sync-queue";
import {
  fetchSyncManifest,
  fetchUserSyncData,
  fetchReviewHistory,
  fetchChapterContentBatch,
  fetchDashboardExtras,
  fetchNotionViewData,
  fetchAiConfigData,
  fetchNotionsPageData,
} from "./sync-api";
import type { DashboardSnapshot, ReviewHistoryDelta, UserSyncData } from "./dashboard-types";

// Small enough that one response stays well under the hosting platform's
// response-size limit (a few MB per function response) and the progress bar
// advances visibly; three requests in flight keep a full first sync quick.
const CHUNK_SIZE = 10;
const PARALLEL_CHUNKS = 3;

export type SyncPhase = "flush" | "dashboard" | "content";

export interface SyncProgress {
  phase: SyncPhase;
  totalChapters: number;
  syncedChapters: number;
}

export interface SyncOutcome {
  snapshot: DashboardSnapshot;
  syncedAt: string;
  failedChapters: number;
  /** Local changes still not delivered after the flush (offline, or a write the server keeps rejecting). */
  unsentWrites: number;
  historyFailed: boolean;
}

function startOfUtcDayIso(iso: string): string {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Cards/fiches changed on this device in a way the server's answer can't
 * include: reviews not delivered yet, or delivered after the user-data
 * request began, and read-progress writes still queued. Their local values
 * must survive the full overwrite below.
 */
async function locallyNewerIds(fetchStartedAt: string): Promise<{ flashcardIds: Set<string>; ficheIds: Set<string> }> {
  const [events, pending] = await Promise.all([getAllLocalReviewEvents(), getAllPendingWrites()]);
  const startedAt = new Date(fetchStartedAt).getTime();
  const flashcardIds = new Set(
    events.filter((e) => e.source === "scheduled" && (!e.flushedAt || new Date(e.flushedAt).getTime() >= startedAt)).map((e) => e.flashcardId)
  );
  const ficheIds = new Set(
    pending.flatMap((w) => (w.kind === "adminAction" && w.payload.action.startsWith("progress.") ? [String(w.payload.args[0])] : []))
  );
  return { flashcardIds, ficheIds };
}

async function applyUserData(userData: UserSyncData, fetchStartedAt: string): Promise<void> {
  const keep = await locallyNewerIds(fetchStartedAt);
  await Promise.all([
    replaceCachedReviewStates(userData.reviewStates, keep.flashcardIds),
    setCachedUserBookmarks(userData.bookmarks),
    setCachedUserNotes(userData.notes),
    setCachedBlockReviewStates(userData.blockReviewStates),
  ]);
  // After content is (re)written by the caller too — see runEssentialSync.
  await applyServerFicheReadProgress(userData.ficheReadProgress, keep.ficheIds);
}

/**
 * Where the history delta must start: the day of the previous fetch — and
 * earlier if a review still counted locally was answered before that day
 * (answered offline, delivered later: the server records it at the time it
 * was answered, see submitReview, so a delta starting at the previous
 * fetch's day would never pick it up). Null = never fetched: full history.
 */
async function reviewHistorySince(): Promise<string | null> {
  const [previous, events] = await Promise.all([getCachedReviewHistory(), getAllLocalReviewEvents()]);
  if (!previous) return null;
  const earliest = events.reduce((min, e) => Math.min(min, new Date(e.reviewedAt).getTime()), new Date(previous.fetchedAt).getTime());
  return startOfUtcDayIso(new Date(earliest).toISOString());
}

async function applyReviewHistory(previous: CachedReviewHistory | null, since: string | null, delta: ReviewHistoryDelta, fetchStartedAt: string): Promise<void> {
  const days = { ...(previous?.days ?? {}) };
  // The delta covers every day from `since` onward in full: replace those
  // days outright (a day whose reviews were all undone must go back to
  // zero, not keep its old count), keep everything older as it was.
  if (since) {
    const sinceDay = since.slice(0, 10);
    for (const day of Object.keys(days)) if (day >= sinceDay) delete days[day];
  }
  Object.assign(days, delta.days);
  await setCachedReviewHistory({ days, fetchedAt: fetchStartedAt });
  await pruneLocalReviewEventsIncludedBefore(fetchStartedAt);
}

async function downloadChangedChapters(
  chapterIds: string[],
  lastModified: Record<string, string>,
  onProgress: (synced: number, total: number) => void
): Promise<number> {
  const cachedLastModified = await getCachedChapterLastModifiedTimestamps();
  // A chapter never cached, or without a fresh server timestamp (fails
  // open), counts as changed.
  const changed = chapterIds.filter((id) => {
    const fresh = lastModified[id];
    const cached = cachedLastModified[id];
    return !fresh || !cached || new Date(fresh).getTime() > new Date(cached).getTime();
  });
  onProgress(0, changed.length);

  const chunks: string[][] = [];
  for (let i = 0; i < changed.length; i += CHUNK_SIZE) chunks.push(changed.slice(i, i + CHUNK_SIZE));
  let synced = 0;
  let failed = 0;
  async function worker() {
    for (let chunk = chunks.shift(); chunk; chunk = chunks.shift()) {
      try {
        const contentByChapter = await fetchChapterContentBatch(chunk);
        const lastModifiedForChunk: Record<string, string> = {};
        for (const id of chunk) if (lastModified[id]) lastModifiedForChunk[id] = lastModified[id];
        await setCachedChapterContentBatch(contentByChapter, lastModifiedForChunk);
      } catch {
        failed += chunk.length;
      }
      synced += chunk.length;
      onProgress(synced, changed.length);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_CHUNKS }, worker));
  return failed;
}

/** Throws (with a user-facing message) only when the essential data couldn't be fetched at all — anything partial is reported in the outcome instead. */
export async function runEssentialSync(onProgress: (progress: SyncProgress) => void): Promise<SyncOutcome> {
  onProgress({ phase: "flush", totalChapters: 0, syncedChapters: 0 });
  // Delivered BEFORE pulling anything: otherwise a review answered offline
  // could be overwritten by server data computed before it arrived.
  await flushAllPendingWrites();
  const unsentWrites = await countUnsentPendingWrites();

  onProgress({ phase: "dashboard", totalChapters: 0, syncedChapters: 0 });
  const historySince = await reviewHistorySince();
  const previousHistory = await getCachedReviewHistory();
  const fetchStartedAt = new Date().toISOString();
  const [manifestResult, userDataResult, historyResult] = await Promise.allSettled([
    fetchSyncManifest(),
    fetchUserSyncData(),
    fetchReviewHistory(historySince),
  ]);
  if (manifestResult.status === "rejected") throw manifestResult.reason;
  if (userDataResult.status === "rejected") throw userDataResult.reason;
  const manifest = manifestResult.value;

  await Promise.all([setCachedDashboard(manifest.snapshot), setCachedSuspendedFlashcardIds(manifest.suspendedIds)]);
  if (historyResult.status === "fulfilled") await applyReviewHistory(previousHistory, historySince, historyResult.value, fetchStartedAt);

  // Only published chapters are ever read — drop cached content for any
  // chapter that no longer is (deleted, unpublished, book archived).
  const chapterIds = manifest.snapshot.books.flatMap((b) => b.chapters.filter((c) => c.status === "published").map((c) => c.id));
  await pruneChapterContent(chapterIds);
  onProgress({ phase: "content", totalChapters: 0, syncedChapters: 0 });
  const failedChapters = await downloadChangedChapters(chapterIds, manifest.lastModified, (synced, total) =>
    onProgress({ phase: "content", totalChapters: total, syncedChapters: synced })
  );

  // Applied after the content download so freshly downloaded chapters get
  // the same, current per-user values as every other cached chapter.
  await applyUserData(userDataResult.value, fetchStartedAt);

  const cached = await getCachedDashboard();
  return {
    snapshot: manifest.snapshot,
    syncedAt: cached?.syncedAt ?? new Date().toISOString(),
    failedChapters,
    unsentWrites,
    historyFailed: historyResult.status === "rejected",
  };
}

/** Never throws. Resolves once every background part has settled — the caller refreshes the dashboard then. */
export async function runBackgroundSync(isAdmin: boolean): Promise<void> {
  await Promise.allSettled([
    fetchDashboardExtras().then((extras) => setCachedDashboardExtras(isAdmin, extras)),
    fetchNotionViewData().then((data) => setCachedNotionViewData(data)),
    isAdmin ? fetchAiConfigData().then((data) => setCachedAiConfigData(isAdmin, data)) : Promise.resolve(),
    isAdmin ? fetchNotionsPageData().then((data) => (data ? setCachedNotionsPage(data) : undefined)) : Promise.resolve(),
  ]);
}
