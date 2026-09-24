"use client";

import { useEffect } from "react";
import { flushPendingWrites } from "@/lib/el-profesor/sync-queue";

const FLUSH_INTERVAL_MS = 30_000;

/**
 * Mounted once for the whole module (layout.tsx) — drives the automatic
 * background flush of the local-first write queue (piste 2026-09-24 —
 * "écriture locale automatique"). Renders nothing; a review answered,
 * bookmark toggled, note saved, or reading position recorded while this is
 * mounted eventually reaches the server without the user ever seeing a
 * "Synchroniser" button for it.
 */
export function SyncQueueRunner() {
  useEffect(() => {
    flushPendingWrites();
    const interval = setInterval(flushPendingWrites, FLUSH_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flushPendingWrites();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushPendingWrites);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushPendingWrites);
    };
  }, []);

  return null;
}
