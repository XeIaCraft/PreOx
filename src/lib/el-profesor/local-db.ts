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
import type {
  DashboardSnapshot,
  ChapterContentSnapshot,
  DashboardSecondaryData,
  DashboardNotionViewData,
  DashboardAiConfigData,
  NotionsPageSnapshot,
} from "./dashboard-types";
import type { ReviewState, ReviewRating, ReviewSource } from "./types";
import type { ReviewConfidence } from "@/app/apps/el-profesor/actions/review";

const DB_NAME = "el-profesor-cache";
// Bumped again for the notions/journal screens (piste 2026-09-24 — "module
// 100% local", extension aux autres écrans) — a generic `entities` store
// (Part B of the plan: "type:id" keys, for per-entity screens that don't
// warrant their own dedicated store the way dashboard/chapterContent do)
// plus two more single-blob stores for the notions admin screen and the
// case journal. onupgradeneeded below only creates whichever stores don't
// exist yet, so an older database gains the new ones without losing what's
// already cached.
const DB_VERSION = 5;
const DASHBOARD_STORE = "dashboard";
const CHAPTER_CONTENT_STORE = "chapterContent";
const REVIEW_STATE_STORE = "reviewState";
const PENDING_WRITES_STORE = "pendingWrites";
const SUSPENDED_FLASHCARD_IDS_STORE = "suspendedFlashcardIds";
const SECONDARY_DASHBOARD_STORE = "secondaryDashboard";
const NOTION_VIEW_DATA_STORE = "notionViewData";
const AI_CONFIG_DATA_STORE = "aiConfigData";
const NOTIONS_PAGE_STORE = "notionsPage";
const ENTITIES_STORE = "entities";
const DASHBOARD_KEY = "singleton";
const SUSPENDED_FLASHCARD_IDS_KEY = "singleton";
const SECONDARY_DASHBOARD_KEY = "singleton";
const NOTION_VIEW_DATA_KEY = "singleton";
const AI_CONFIG_DATA_KEY = "singleton";
const NOTIONS_PAGE_KEY = "singleton";

type WithSyncedAt<T> = T & { syncedAt: string };
/** lastModifiedAt is the *server's* timestamp for this chapter at download time (el_profesor_chapter_last_modified) — compared against a fresh server value on the next sync (piste 2026-09-24 — synchronisation delta) to decide whether this chapter needs re-downloading at all. Distinct from syncedAt, which is only ever "when did we last write this" from the client's own clock. */
type WithChapterSyncMeta<T> = T & { syncedAt: string; lastModifiedAt: string };

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
        if (!db.objectStoreNames.contains(SUSPENDED_FLASHCARD_IDS_STORE)) db.createObjectStore(SUSPENDED_FLASHCARD_IDS_STORE);
        if (!db.objectStoreNames.contains(SECONDARY_DASHBOARD_STORE)) db.createObjectStore(SECONDARY_DASHBOARD_STORE);
        if (!db.objectStoreNames.contains(NOTION_VIEW_DATA_STORE)) db.createObjectStore(NOTION_VIEW_DATA_STORE);
        if (!db.objectStoreNames.contains(AI_CONFIG_DATA_STORE)) db.createObjectStore(AI_CONFIG_DATA_STORE);
        if (!db.objectStoreNames.contains(NOTIONS_PAGE_STORE)) db.createObjectStore(NOTIONS_PAGE_STORE);
        if (!db.objectStoreNames.contains(ENTITIES_STORE)) db.createObjectStore(ENTITIES_STORE);
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

/**
 * Patches just the cached dashboard's `books` array in place (piste
 * 2026-09-24 — "module 100% local", admin reorder) — preserves the
 * existing `syncedAt` and every other field, unlike setCachedDashboard
 * (which always stamps a fresh sync time — this isn't a real sync, just a
 * local admin edit). Returns the updated books array, or null if there's
 * nothing cached yet to patch (caller should skip the local update and just
 * queue the write in that case). Same "preserve syncedAt" rationale as the
 * now-removed patchDashboardCountsForReview.
 */
export async function patchCachedDashboardBooks(
  updater: (books: DashboardSnapshot["books"]) => DashboardSnapshot["books"]
): Promise<DashboardSnapshot["books"] | null> {
  const current = await getCachedDashboard();
  if (!current) return null;
  const books = updater(current.books);
  await putEntries(DASHBOARD_STORE, [[DASHBOARD_KEY, { ...current, books }]]);
  return books;
}

export async function getCachedChapterContent(chapterId: string): Promise<WithChapterSyncMeta<ChapterContentSnapshot> | null> {
  return getValue<WithChapterSyncMeta<ChapterContentSnapshot>>(CHAPTER_CONTENT_STORE, chapterId);
}

/**
 * Patches one fiche's cached read-progress percentage in place (piste
 * 2026-09-24 — suite au retour "le % de lecture par chapitre ne s'actualise
 * pas") — called right alongside saveFicheReadProgress (a live, direct
 * server write) so the chapter's cached content agrees with what was just
 * saved instead of only catching up at the next "Synchroniser". No-ops if
 * this chapter isn't cached at all yet (nothing to patch). Never regresses,
 * matching getFicheReadProgressBatch's own "highest ever reached" semantics
 * server-side — a local update should never lower what was already there.
 */
export async function patchCachedFicheReadProgress(chapterId: string, ficheId: string, progressPct: number): Promise<void> {
  const current = await getCachedChapterContent(chapterId);
  if (!current) return;
  const existing = current.ficheReadProgress[ficheId] ?? 0;
  if (progressPct <= existing) return;
  await putEntries(CHAPTER_CONTENT_STORE, [[chapterId, { ...current, ficheReadProgress: { ...current.ficheReadProgress, [ficheId]: progressPct } }]]);
}

/** Every cached chapter's own lastModifiedAt, keyed by chapterId — what the delta sync (sync-modal.tsx) diffs a fresh getElProfesorChapterLastModified() call against to decide which chapters actually need re-downloading. */
export async function getCachedChapterLastModifiedTimestamps(): Promise<Record<string, string>> {
  const all = await getAllCachedChapterContent();
  const result: Record<string, string> = {};
  for (const [chapterId, content] of all) result[chapterId] = content.lastModifiedAt;
  return result;
}

export async function setCachedChapterContentBatch(entries: Record<string, ChapterContentSnapshot>, lastModifiedByChapterId: Record<string, string>): Promise<void> {
  const syncedAt = new Date().toISOString();
  await putEntries(
    CHAPTER_CONTENT_STORE,
    Object.entries(entries).map(([chapterId, snapshot]) => [chapterId, { ...snapshot, syncedAt, lastModifiedAt: lastModifiedByChapterId[chapterId] ?? syncedAt }])
  );
}

/**
 * Dashboard secondary widgets (activity, forecast, bookmarks, stale
 * chapters...) — cached alongside the main dashboard snapshot so a
 * shell-driven render (local-nav-shell.tsx) shows real last-synced data
 * instead of hanging behind Suspense forever when offline. See
 * DashboardWithLocalCache for the cache-first substitution.
 *
 * Keyed by isAdmin (piste 2026-09-24 — suite au code review): several
 * fields (staleChapters, flagStatsByBlockType, mostDifficultGlobal,
 * leechFlashcards) are admin-only. Without this key, a sync run while
 * actually admin would cache the admin variant, then get served back
 * unchanged during a later "preview as user" session — defeating the point
 * of that preview. Same rationale as NotionSynthesisWithLocalCache's
 * entity-id suffix.
 */
export async function getCachedSecondaryDashboardData(isAdmin: boolean): Promise<DashboardSecondaryData | null> {
  return getValue<DashboardSecondaryData>(SECONDARY_DASHBOARD_STORE, `${SECONDARY_DASHBOARD_KEY}:${isAdmin ? "admin" : "user"}`);
}

export async function setCachedSecondaryDashboardData(isAdmin: boolean, data: DashboardSecondaryData): Promise<void> {
  await putEntries(SECONDARY_DASHBOARD_STORE, [[`${SECONDARY_DASHBOARD_KEY}:${isAdmin ? "admin" : "user"}`, data]]);
}

export async function getCachedNotionViewData(): Promise<DashboardNotionViewData | null> {
  return getValue<DashboardNotionViewData>(NOTION_VIEW_DATA_STORE, NOTION_VIEW_DATA_KEY);
}

export async function setCachedNotionViewData(data: DashboardNotionViewData): Promise<void> {
  await putEntries(NOTION_VIEW_DATA_STORE, [[NOTION_VIEW_DATA_KEY, data]]);
}

/**
 * Wrapped in `{ value }` (rather than storing DashboardAiConfigData | null
 * directly) so a cached "not admin, no config" result (value: null) stays
 * distinguishable from "never cached at all" (getValue itself returning
 * null) — getCachedAiConfigData returning null must mean the latter, or
 * DashboardWithLocalCache could never tell whether to trust an empty cache
 * or fall back to the live promise. Keyed by isAdmin for the same reason as
 * getCachedSecondaryDashboardData above — this is entirely admin-only data,
 * so a real admin's cached config must never get served back during a
 * "preview as user" session.
 */
export async function getCachedAiConfigData(isAdmin: boolean): Promise<{ value: DashboardAiConfigData | null } | null> {
  return getValue<{ value: DashboardAiConfigData | null }>(AI_CONFIG_DATA_STORE, `${AI_CONFIG_DATA_KEY}:${isAdmin ? "admin" : "user"}`);
}

export async function setCachedAiConfigData(isAdmin: boolean, value: DashboardAiConfigData | null): Promise<void> {
  await putEntries(AI_CONFIG_DATA_STORE, [[`${AI_CONFIG_DATA_KEY}:${isAdmin ? "admin" : "user"}`, { value }]]);
}

/** The /apps/el-profesor/notions admin screen's full bundle — see NotionsPageSnapshot's doc comment. Admin-only, so a non-admin simply never has anything cached here. */
export async function getCachedNotionsPage(): Promise<NotionsPageSnapshot | null> {
  return getValue<NotionsPageSnapshot>(NOTIONS_PAGE_STORE, NOTIONS_PAGE_KEY);
}

export async function setCachedNotionsPage(data: NotionsPageSnapshot): Promise<void> {
  await putEntries(NOTIONS_PAGE_STORE, [[NOTIONS_PAGE_KEY, data]]);
}

/**
 * Generic "type:id" entity cache (piste 2026-09-24 — Partie B du plan) — for
 * per-entity screens that don't warrant their own dedicated store the way
 * dashboard/chapterContent do. Currently used for notion synthesis pages
 * (`type: "notionSynthesis"`); a future screen joins in by picking its own
 * type string, no new store needed.
 */
export async function getEntity<T>(type: string, id: string): Promise<WithSyncedAt<T> | null> {
  return getValue<WithSyncedAt<T>>(ENTITIES_STORE, `${type}:${id}`);
}

export async function setEntity<T>(type: string, id: string, data: T): Promise<void> {
  await putEntries(ENTITIES_STORE, [[`${type}:${id}`, { ...data, syncedAt: new Date().toISOString() }]]);
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

/** Single transaction, keys + values together — needed wherever the stored value doesn't already carry its own key (chapterContent's values don't embed a chapterId field), so a plain getAllValues() zip against a separately-fetched getAllKeys() could theoretically race across two transactions. */
async function getAllEntries<T>(storeName: string): Promise<[string, T][]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return await new Promise<[string, T][]>((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const keysRequest = store.getAllKeys();
        const valuesRequest = store.getAll();
        let keys: string[] | null = null;
        let values: T[] | null = null;
        function maybeResolve() {
          if (keys && values) resolve(keys.map((key, i) => [key, values![i]]));
        }
        keysRequest.onsuccess = () => {
          keys = (keysRequest.result as string[] | undefined) ?? [];
          maybeResolve();
        };
        valuesRequest.onsuccess = () => {
          values = (valuesRequest.result as T[] | undefined) ?? [];
          maybeResolve();
        };
        tx.onerror = () => resolve([]);
        tx.onabort = () => resolve([]);
      } catch {
        resolve([]);
      }
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

/** Every cached chapter's content at once, keyed by chapterId — needed to compute due/mastery counts across the whole library (local-review-queue.ts) without one IndexedDB read per chapter. */
export async function getAllCachedChapterContent(): Promise<Map<string, WithChapterSyncMeta<ChapterContentSnapshot>>> {
  const entries = await getAllEntries<WithChapterSyncMeta<ChapterContentSnapshot>>(CHAPTER_CONTENT_STORE);
  return new Map(entries);
}

/**
 * Drops specific chapters' cached content and their flashcards' cached
 * review state immediately (piste 2026-09-24 — "module 100% local", suite au
 * code review) — used right after a local-first admin delete
 * (local-admin-actions.ts) so a deleted chapter/book doesn't keep its old
 * content sitting in IndexedDB until the next full "Synchroniser" happens to
 * prune it (pruneChapterContent/pruneReviewState already do this, but only
 * as a side effect of a full sync's fresh id list).
 */
export async function purgeCachedChapterContent(chapterIds: string[]): Promise<void> {
  if (chapterIds.length === 0) return;
  const all = await getAllCachedChapterContent();
  const flashcardIds = chapterIds.flatMap((id) => all.get(id)?.subEntities.flatMap((s) => s.fiche?.flashcards.map((f) => f.id) ?? []) ?? []);
  await deleteEntries(CHAPTER_CONTENT_STORE, chapterIds);
  await deleteEntries(REVIEW_STATE_STORE, flashcardIds);
}

/** Every cached review state at once, keyed by flashcardId (each ReviewState already embeds its own flashcardId, so no key/value zip is needed here). */
export async function getAllCachedReviewStates(): Promise<Map<string, ReviewState>> {
  const all = await getAllValues<ReviewState>(REVIEW_STATE_STORE);
  return new Map(all.map((state) => [state.flashcardId, state]));
}

// ============================================================================
// Local-first writes (piste 2026-09-24 — "écriture locale automatique", puis
// "module 100% local"). Started as the "vue utilisateur" write surface only
// (review answers, bookmarks, notes, reading position — each touching only
// the writing user's own data, zero cross-user conflict risk) and now also
// covers simple, single-field admin mutations (reorder, rename, publish...)
// via the generic "adminAction" kind below, dispatched through
// action-registry.ts. Content editing with real conflict risk (fiches,
// blocks, AI extraction) stays server-direct for now — see the plan's
// staged rollout.
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

/** This user's excluded-from-reviews flashcard ids, synced alongside the rest of the library — local-review-queue.ts overlays not-yet-flushed "exclude" PendingWrites on top of this to compute due/free queues fully locally. */
export async function getCachedSuspendedFlashcardIds(): Promise<string[] | null> {
  return getValue<string[]>(SUSPENDED_FLASHCARD_IDS_STORE, SUSPENDED_FLASHCARD_IDS_KEY);
}

export async function setCachedSuspendedFlashcardIds(ids: string[]): Promise<void> {
  await putEntries(SUSPENDED_FLASHCARD_IDS_STORE, [[SUSPENDED_FLASHCARD_IDS_KEY, ids]]);
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
 * Generic escape hatch for admin mutations (piste 2026-09-24 — "module 100%
 * local", file d'action générique) — `action` is a key into
 * action-registry.ts's ACTION_REGISTRY, `args` its exact call arguments.
 * Lets a new admin action join the local-first queue by registering a
 * function + calling enqueuePendingWrite, without a bespoke Payload
 * interface/union member/switch case each time — unlike the five kinds
 * above, which need their own local-read integration (undo, effective
 * suspended-ids overlay) that a fully generic shape can't express.
 */
export interface PendingAdminActionPayload {
  action: string;
  args: unknown[];
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
  | { id: string; kind: "exclude"; createdAt: string; payload: PendingExcludePayload }
  | { id: string; kind: "adminAction"; createdAt: string; payload: PendingAdminActionPayload };

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

export async function clearLocalCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const stores = [
          DASHBOARD_STORE,
          CHAPTER_CONTENT_STORE,
          REVIEW_STATE_STORE,
          PENDING_WRITES_STORE,
          SUSPENDED_FLASHCARD_IDS_STORE,
          SECONDARY_DASHBOARD_STORE,
          NOTION_VIEW_DATA_STORE,
          AI_CONFIG_DATA_STORE,
          NOTIONS_PAGE_STORE,
          ENTITIES_STORE,
        ];
        const tx = db.transaction(stores, "readwrite");
        for (const store of stores) tx.objectStore(store).clear();
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
