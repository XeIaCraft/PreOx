"use client";

import { useEffect, useState } from "react";
import { CloudDownload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ElProfesorBoard } from "@/components/el-profesor/board";
import { SyncModal } from "@/components/el-profesor/dialogs/sync-modal";
import { getCachedDashboard } from "@/lib/el-profesor/local-db";
import { getLocalDueCounts, getLocalMasteryCounts } from "@/lib/el-profesor/local-review-queue";
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

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 px-4 py-8 sm:px-6 xl:max-w-6xl" aria-hidden="true">
      <div className="h-9 w-64 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
        ))}
      </div>
    </div>
  );
}

/**
 * Seam between the server-rendered dashboard and the local IndexedDB cache
 * (piste 2026-09-24 — "cache local + synchronisation manuelle"). Takes the
 * expensive dashboard snapshot as an un-awaited promise (see page.tsx) —
 * awaiting it server-side would block this whole page on every navigation,
 * which made the local cache pointless the first time this shipped: the
 * client never got a chance to render from IndexedDB before the slow server
 * round trip had already finished, since Next.js's navigation waits for the
 * page's own response either way. So: check the local cache first, and only
 * ever fall back to the server promise when there isn't one yet (first
 * visit, or a chapter/dashboard never synced). ElProfesorBoard itself is
 * untouched — this only decides which snapshot it renders from.
 */
export function DashboardWithLocalCache({
  initialSnapshotPromise,
  isAdmin,
  realIsAdmin,
  previewingAsUser,
  serverResumeChapterId,
  secondaryDataPromise,
  aiConfigPromise,
  notionViewDataPromise,
  onCacheMiss,
}: {
  /** Null when rendered by the local nav shell (local-nav-shell.tsx) rather than page.tsx directly — in that case onCacheMiss must be provided instead. */
  initialSnapshotPromise: Promise<DashboardSnapshot> | null;
  isAdmin: boolean;
  realIsAdmin: boolean;
  previewingAsUser: boolean;
  serverResumeChapterId: string | null;
  /** Always a real, resolving promise — page.tsx awaits none of these directly (same un-awaited-promise pattern as initialSnapshotPromise), and a shell-driven render (local-nav-shell.tsx) fetches them itself via the same Server Actions, just triggered client-side. */
  secondaryDataPromise: Promise<DashboardSecondaryData>;
  aiConfigPromise: Promise<DashboardAiConfigData | null>;
  notionViewDataPromise: Promise<DashboardNotionViewData>;
  /** Called instead of awaiting initialSnapshotPromise when there's no local cache and no server promise was supplied (shell-driven render with a genuine cache miss) — the caller falls back to a real Next.js navigation. */
  onCacheMiss?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [checkedCache, setCheckedCache] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCachedDashboard().then(async (cached) => {
      if (cancelled) return;
      if (cached) {
        const { syncedAt: cachedSyncedAt, ...cachedSnapshot } = cached;
        // Due/mastery counts are recomputed fresh from the cached chapter
        // content + review state (piste 2026-09-24 — correctif du bug "à
        // jour") rather than trusting the snapshot's own frozen numbers,
        // which only ever reflected the state at the last "Synchroniser"
        // and could silently drift from the live review queue. Falls back
        // to the snapshot's own values if nothing's cached yet to compute
        // from (e.g. dashboard synced once but no chapter content sync
        // completed).
        const [localDueCounts, localMasteryCounts] = await Promise.all([getLocalDueCounts(), getLocalMasteryCounts()]);
        if (cancelled) return;
        setSnapshot({
          ...cachedSnapshot,
          dueCounts: localDueCounts ?? cachedSnapshot.dueCounts,
          masteryCounts: localMasteryCounts ?? cachedSnapshot.masteryCounts,
        });
        setSyncedAt(cachedSyncedAt);
        setCheckedCache(true);
        return;
      }
      // No local cache yet.
      setCheckedCache(true);
      if (initialSnapshotPromise) {
        // This is the only case where we actually wait on the slow server
        // snapshot — page.tsx's hard-navigation path.
        initialSnapshotPromise.then((serverSnapshot) => {
          if (!cancelled) setSnapshot(serverSnapshot);
        });
      } else {
        onCacheMiss?.();
      }
    });
    return () => {
      cancelled = true;
    };
    // Runs once on mount only — a fresh sync updates state directly via
    // handleSynced below, no need to re-check the cache reactively.
  }, [initialSnapshotPromise, onCacheMiss]);

  function handleSynced(newSnapshot: DashboardSnapshot, newSyncedAt: string) {
    setSnapshot(newSnapshot);
    setSyncedAt(newSyncedAt);
  }

  if (!snapshot) return <DashboardSkeleton />;

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
