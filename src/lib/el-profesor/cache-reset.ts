"use client";

// "Réinitialiser le cache local" (piste 2026-09-24 — demandé pour repartir
// d'un état propre après des modifications ou un bug) — wipes everything El
// Profesor keeps on this device, then reloads so the next render starts from
// the server again. Never touches server-side data.
import { clearLocalCache } from "./local-db";
import { flushAllPendingWrites, countUnsentPendingWrites } from "./sync-queue";

/** Same name as OFFLINE_CACHE_NAME in public/sw.js — visited pages and static chunks cached for offline use. */
const SERVICE_WORKER_OFFLINE_CACHE = "preox-el-profesor-offline-v1";
const AUTO_SYNC_AFTER_RESET_KEY = "el-profesor:auto-sync-after-reset";

/** Delivers whatever local changes still can be, and reports how many would be lost by clearing now (0 = nothing at risk). */
export async function flushBeforeReset(): Promise<number> {
  await flushAllPendingWrites();
  return countUnsentPendingWrites();
}

/** Clears IndexedDB and the service worker's offline copy of the module, flags a sync for right after the reload, then reloads. */
export async function resetLocalCacheAndReload(): Promise<void> {
  await clearLocalCache();
  try {
    if ("caches" in window) await caches.delete(SERVICE_WORKER_OFFLINE_CACHE);
  } catch {
    // Best-effort — pages cached for offline use are refreshed on their next online visit anyway.
  }
  try {
    sessionStorage.setItem(AUTO_SYNC_AFTER_RESET_KEY, "1");
  } catch {
    // Without it the user simply clicks "Synchroniser" themselves.
  }
  window.location.reload();
}

/** True once, right after a reset's reload — the dashboard then starts a sync by itself so the device is usable again without a second click. */
export function consumeAutoSyncAfterReset(): boolean {
  try {
    const flagged = sessionStorage.getItem(AUTO_SYNC_AFTER_RESET_KEY) === "1";
    if (flagged) sessionStorage.removeItem(AUTO_SYNC_AFTER_RESET_KEY);
    return flagged;
  } catch {
    return false;
  }
}
