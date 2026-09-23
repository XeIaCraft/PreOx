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

const DB_NAME = "el-profesor-cache";
const DB_VERSION = 1;
const DASHBOARD_STORE = "dashboard";
const CHAPTER_CONTENT_STORE = "chapterContent";
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

export async function clearLocalCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([DASHBOARD_STORE, CHAPTER_CONTENT_STORE], "readwrite");
        tx.objectStore(DASHBOARD_STORE).clear();
        tx.objectStore(CHAPTER_CONTENT_STORE).clear();
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
