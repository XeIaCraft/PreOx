"use client";

import { useEffect, useState } from "react";
import { CloudDownload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ElProfesorBoard } from "@/components/el-profesor/board";
import { SyncModal } from "@/components/el-profesor/dialogs/sync-modal";
import { getCachedDashboard } from "@/lib/el-profesor/local-db";
import type { DashboardSnapshot, DashboardSecondaryData, DashboardAiConfigData, DashboardNotionViewData } from "@/lib/el-profesor/dashboard-types";

/** "il y a 3 min" / "il y a 2 h" / "il y a 5 j" — finer-grained than the day-only timeAgoLabel elsewhere in the module, since a sync can have just happened. */
function syncedAgoLabel(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

/**
 * Seam between the server-rendered dashboard and the local IndexedDB cache
 * (piste 2026-09-24 — "cache local + synchronisation manuelle"). Seeds its
 * state from the server's own snapshot (so the very first paint, and any
 * browser/session without a local cache yet, work exactly as before), then
 * on mount swaps in whatever's cached locally if present. ElProfesorBoard
 * itself is untouched — this only decides which snapshot it renders from.
 */
export function DashboardWithLocalCache({
  initialSnapshot,
  isAdmin,
  realIsAdmin,
  previewingAsUser,
  serverResumeChapterId,
  secondaryDataPromise,
  aiConfigPromise,
  notionViewDataPromise,
}: {
  initialSnapshot: DashboardSnapshot;
  isAdmin: boolean;
  realIsAdmin: boolean;
  previewingAsUser: boolean;
  serverResumeChapterId: string | null;
  secondaryDataPromise: Promise<DashboardSecondaryData>;
  aiConfigPromise: Promise<DashboardAiConfigData | null>;
  notionViewDataPromise: Promise<DashboardNotionViewData>;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [checkedCache, setCheckedCache] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCachedDashboard().then((cached) => {
      if (cancelled || !cached) {
        setCheckedCache(true);
        return;
      }
      const { syncedAt: cachedSyncedAt, ...cachedSnapshot } = cached;
      setSnapshot(cachedSnapshot);
      setSyncedAt(cachedSyncedAt);
      setCheckedCache(true);
    });
    return () => {
      cancelled = true;
    };
    // Runs once on mount only — a fresh sync updates state directly via
    // handleSynced below, no need to re-check the cache reactively.
  }, []);

  function handleSynced(newSnapshot: DashboardSnapshot, newSyncedAt: string) {
    setSnapshot(newSnapshot);
    setSyncedAt(newSyncedAt);
  }

  return (
    <>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-end gap-2 px-4 pt-4 text-xs text-foreground-subtle sm:px-6 xl:max-w-6xl">
        {checkedCache && !syncedAt && (
          <span className="text-accent">Aucune donnée locale — synchronisez pour un accès instantané la prochaine fois.</span>
        )}
        {syncedAt && <span>Synchronisé {syncedAgoLabel(syncedAt)}</span>}
        <Button variant="ghost" size="sm" onClick={() => setSyncOpen(true)}>
          {syncedAt ? <RefreshCw className="h-3.5 w-3.5" /> : <CloudDownload className="h-3.5 w-3.5" />} Synchroniser
        </Button>
      </div>

      <ElProfesorBoard
        books={snapshot.books}
        dueCounts={snapshot.dueCounts}
        needsReviewCounts={snapshot.needsReviewCounts}
        masteryCounts={snapshot.masteryCounts}
        difficultCounts={snapshot.difficultCounts}
        globalMastery={snapshot.globalMastery}
        readProgressByChapter={snapshot.readProgressByChapter}
        globalProgress={snapshot.globalProgress}
        hasGeminiKey={snapshot.hasGeminiKey}
        aiProvider={snapshot.aiProvider}
        isAdmin={isAdmin}
        realIsAdmin={realIsAdmin}
        previewingAsUser={previewingAsUser}
        serverResumeChapterId={serverResumeChapterId}
        secondaryDataPromise={secondaryDataPromise}
        aiConfigPromise={aiConfigPromise}
        notionViewDataPromise={notionViewDataPromise}
      />

      {syncOpen && <SyncModal onClose={() => setSyncOpen(false)} onSynced={handleSynced} />}
    </>
  );
}
