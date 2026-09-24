"use client";

// Local read cache for El Profesor (piste 2026-09-24 — "cache local +
// synchronisation manuelle"): opening the dashboard or a chapter was taking
// minutes even after fixing the N+1 query patterns server-side, which points
// to something slow on the infrastructure side that can't be diagnosed or
// fixed from here. Rather than keep guessing server-side, the library's full
// content is mirrored into the browser (IndexedDB — the data is well past
// localStorage's ~5MB ceiling) via a manually-triggered "Synchroniser" sync,
// and every read after that comes from here instead of the network. Same
// spirit as local-prefs.ts: every failure (private browsing, quota, SSR,
// browser without IndexedDB) is swallowed silently and falls back to
// whatever the server rendered — this is a performance cache, never a
// source of truth, so a failure here must never break the page.
import type { DashboardSnapshot, ChapterContentSnapshot } from "./dashboard-types";
import type { ReviewState, ReviewRating, ReviewSource } from "./types";
import type { ReviewConfidence } from "@/app/apps/el-profesor/actions/review";

const DB_NAME = "el-profesor-cache";
// Bumped for the local-first write queue (piste 2026-09-24 — "écriture
// locale automatique") — onupgradeneeded below only creates whichever
// stores don't exist yet, so a v1 database gains the two new ones without
// losing what's already cached.
const DB_VERSION = 2;
const DASHBOARD_STORE = "dashboard";
const CHAPTER_CONTENT_STORE = "chapterContent";
const REVIEW_STATE_STORE = "reviewState";
const PENDING_WRITES_STORE = "pendingWrites";
const DASHBOARD_KEY = "singleton";

type WithSyncedAt<T> = T & { syncedAt: string };

function isAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!isAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DASHBOARD_STORE)) db.createObjectStore(DASHBOARD_STORE);
        if (!db.objectStoreNames.contains(CHAPTER_CONTENT_STORE)) db.createObjectStore(CHAPTER_CONTENT_STORE);
        if (!db.objectStoreNames.contains(REVIEW_STATE_STORE)) db.createObjectStore(REVIEW_STATE_STORE);
        if (!db.objectStoreNames.contains(PENDING_WRITES_STORE)) db.createObjectStore(PENDING_WRITES_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getValue<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function putEntries(storeName: string, entries: [string, unknown][]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        for (const [key, value] of entries) store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
}

export async function getCachedDashboard(): Promise<WithSyncedAt<DashboardSnapshot> | null> {
  return getValue<WithSyncedAt<DashboardSnapshot>>(DASHBOARD_STORE, DASHBOARD_KEY);
}

export async function setCachedDashboard(snapshot: DashboardSnapshot): Promise<void> {
  await putEntries(DASHBOARD_STORE, [[DASHBOARD_KEY, { ...snapshot, syncedAt: new Date().toISOString() }]]);
}

export async function getCachedChapterContent(chapterId: string): Promise<WithSyncedAt<ChapterContentSnapshot> | null> {
  return getValue<WithSyncedAt<ChapterContentSnapshot>>(CHAPTER_CONTENT_STORE, chapterId);
}

export async function setCachedChapterContentBatch(entries: Record<string, ChapterContentSnapshot>): Promise<void> {
  const syncedAt = new Date().toISOString();
  await putEntries(
    CHAPTER_CONTENT_STORE,
    Object.entries(entries).map(([chapterId, snapshot]) => [chapterId, { ...snapshot, syncedAt }])
  );
}

export async function getLastSyncedAt(): Promise<string | null> {
  const dashboard = await getCachedDashboard();
  return dashboard?.syncedAt ?? null;
}

async function getAllKeys(storeName: string): Promise<string[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return await new Promise<string[]>((resolve) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAllKeys();
      request.onsuccess = () => resolve((request.result as string[] | undefined) ?? []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function getAllValues<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return await new Promise<T[]>((resolve) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve((request.result as T[] | undefined) ?? []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function deleteEntries(storeName: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        for (const key of keys) store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
}

/**
 * Removes cached content for chapters that no longer exist in the library
 * (deleted, unpublished, or their book archived since the last sync) —
 * setCachedChapterContentBatch only ever overwrites entries for the
 * chapters it's given, it never notices ones that dropped out, so without
 * this every full sync would leave old chapters' content piling up in
 * IndexedDB forever. Called with the fresh chapter id list before writing
 * new content, so a chapter that's still current keeps its previous cached
 * copy until its own chunk re-syncs, even if a later chunk fails.
 */
export async function pruneChapterContent(validChapterIds: string[]): Promise<void> {
  const validSet = new Set(validChapterIds);
  const existingKeys = await getAllKeys(CHAPTER_CONTENT_STORE);
  const staleKeys = existingKeys.filter((id) => !validSet.has(id));
  await deleteEntries(CHAPTER_CONTENT_STORE, staleKeys);
}

// ============================================================================
// Local-first writes (piste 2026-09-24 — "écriture locale automatique") —
// the "vue utilisateur" write surface only (review answers, bookmarks,
// notes, reading position): every one of these touches only the writing
// user's own data, so there's no cross-user conflict risk the way there
// would be for admin content edits (which stay server-direct, unchanged).
// ============================================================================

/** Raw per-flashcard FSRS state, synced in bulk alongside the chapter content sync — what scheduleReview (fsrs.ts) needs to compute a card's next state locally, the same way actions/review.ts does server-side. */
export async function getCachedReviewState(flashcardId: string): Promise<ReviewState | null> {
  return getValue<ReviewState>(REVIEW_STATE_STORE, flashcardId);
}

export async function setCachedReviewState(flashcardId: string, state: ReviewState): Promise<void> {
  await putEntries(REVIEW_STATE_STORE, [[flashcardId, state]]);
}

export async function setCachedReviewStateBatch(entries: Record<string, ReviewState>): Promise<void> {
  await putEntries(REVIEW_STATE_STORE, Object.entries(entries));
}

/** Drops a flashcard's cached review state entirely — used when undoing a review that turns out to have been the card's very first (no "previous state" to restore to). */
export async function deleteCachedReviewState(flashcardId: string): Promise<void> {
  await deleteEntries(REVIEW_STATE_STORE, [flashcardId]);
}

/** Same rationale as pruneChapterContent — a flashcard deleted since the last sync would otherwise keep its review state cached forever. */
export async function pruneReviewState(validFlashcardIds: string[]): Promise<void> {
  const validSet = new Set(validFlashcardIds);
  const existingKeys = await getAllKeys(REVIEW_STATE_STORE);
  const staleKeys = existingKeys.filter((id) => !validSet.has(id));
  await deleteEntries(REVIEW_STATE_STORE, staleKeys);
}

export interface PendingReviewPayload {
  flashcardId: string;
  /** Null for cross-chapter sessions (révision globale, carnet d'erreurs) — there's no single chapter whose cached dashboard counts to patch, so applyLocalReview (local-review.ts) skips that patch in that case and leaves it to the next full sync. */
  chapterId: string | null;
  rating: ReviewRating;
  source: ReviewSource;
  durationMs?: number;
  variantId: string | null;
  confidence: ReviewConfidence | null;
  previousState: ReviewState | null;
}

export interface PendingBookmarkPayload {
  subEntityId: string;
  bookmarked: boolean;
}

export interface PendingNotePayload {
  subEntityId: string;
  content: string;
}

export interface PendingReadingPositionPayload {
  chapterId: string;
  subEntityId: string | null;
}

export interface PendingExcludePayload {
  flashcardId: string;
  excluded: boolean;
}

/**
 * One entry per queued write, replayed in order by flushPendingWrites
 * (sync-queue.ts) against the same Server Actions the app already calls
 * when online. "review" entries are kept around (marked `flushed`, with the
 * server's own log id) for a while after flushing instead of being deleted
 * outright — undoing a review needs that id once it's no longer purely
 * local (see undoLocalReview in local-review.ts).
 */
export type PendingWrite =
  | ({ id: string; kind: "review"; createdAt: string; payload: PendingReviewPayload } & (
      | { flushed?: false; serverLogId?: undefined }
      | { flushed: true; serverLogId: string }
    ))
  | { id: string; kind: "bookmark"; createdAt: string; payload: PendingBookmarkPayload }
  | { id: string; kind: "note"; createdAt: string; payload: PendingNotePayload }
  | { id: string; kind: "readingPosition"; createdAt: string; payload: PendingReadingPositionPayload }
  | { id: string; kind: "exclude"; createdAt: string; payload: PendingExcludePayload };

export async function enqueuePendingWrite(write: PendingWrite): Promise<void> {
  await putEntries(PENDING_WRITES_STORE, [[write.id, write]]);
}

export async function getPendingWrite(id: string): Promise<PendingWrite | null> {
  return getValue<PendingWrite>(PENDING_WRITES_STORE, id);
}

/** Oldest first (createdAt) — flushPendingWrites replays in this order so a chapter reviewed twice before either flush replays the two answers in the sequence they actually happened. */
export async function getAllPendingWrites(): Promise<PendingWrite[]> {
  const all = await getAllValues<PendingWrite>(PENDING_WRITES_STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deletePendingWrite(id: string): Promise<void> {
  await deleteEntries(PENDING_WRITES_STORE, [id]);
}

/** Delta-patches one chapter's cached due/mastery counts after a local review — cheaper and just as correct as a full recompute, since only this one flashcard's bucket changed. Preserves the dashboard's existing syncedAt (this isn't a real sync). */
export async function patchDashboardCountsForReview(
  chapterId: string,
  dueDelta: number,
  masteryBucketFrom: "new" | "learning" | "acquired",
  masteryBucketTo: "new" | "learning" | "acquired"
): Promise<void> {
  const current = await getCachedDashboard();
  if (!current) return;

  const nextDueCounts = { ...current.dueCounts, [chapterId]: Math.max(0, (current.dueCounts[chapterId] ?? 0) + dueDelta) };

  const currentMastery = current.masteryCounts[chapterId] ?? { total: 0, new: 0, learning: 0, acquired: 0 };
  const nextMasteryForChapter = { ...currentMastery };
  if (masteryBucketFrom !== masteryBucketTo) {
    nextMasteryForChapter[masteryBucketFrom] = Math.max(0, nextMasteryForChapter[masteryBucketFrom] - 1);
    nextMasteryForChapter[masteryBucketTo] = nextMasteryForChapter[masteryBucketTo] + 1;
  }
  const nextMasteryCounts = { ...current.masteryCounts, [chapterId]: nextMasteryForChapter };

  await putEntries(DASHBOARD_STORE, [[DASHBOARD_KEY, { ...current, dueCounts: nextDueCounts, masteryCounts: nextMasteryCounts }]]);
}

export async function clearLocalCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([DASHBOARD_STORE, CHAPTER_CONTENT_STORE, REVIEW_STATE_STORE, PENDING_WRITES_STORE], "readwrite");
        tx.objectStore(DASHBOARD_STORE).clear();
        tx.objectStore(CHAPTER_CONTENT_STORE).clear();
        tx.objectStore(REVIEW_STATE_STORE).clear();
        tx.objectStore(PENDING_WRITES_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
}
