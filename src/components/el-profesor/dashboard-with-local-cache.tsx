"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudDownload, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ElProfesorBoard } from "@/components/el-profesor/board";
import { SyncModal } from "@/components/el-profesor/dialogs/sync-modal";
import { ResetCacheModal } from "@/components/el-profesor/dialogs/reset-cache-modal";
import { getCachedNotionViewData, getCachedAiConfigData, setCachedAiConfigData } from "@/lib/el-profesor/local-db";
import { loadLocalDashboardView, type LocalDashboardView } from "@/lib/el-profesor/local-dashboard";
import { runBackgroundSync, type SyncOutcome } from "@/lib/el-profesor/sync-runner";
import { fetchDashboardSnapshot } from "@/lib/el-profesor/sync-api";
import { consumeAutoSyncAfterReset } from "@/lib/el-profesor/cache-reset";
import type { DashboardSnapshot, DashboardAiConfigData, DashboardNotionViewData } from "@/lib/el-profesor/dashboard-types";

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
 * The dashboard, rendered from the local cache (piste 2026-09-24 — "module
 * 100 % local", then "widgets en local"). Everything shown — the library,
 * every per-chapter figure and every widget — is computed on the device by
 * loadLocalDashboardView (local-dashboard.ts) from what "Synchroniser"
 * stored, and recomputed whenever this mounts, the tab comes back into view
 * or a sync finishes: a review, a bookmark or a read fiche shows up here
 * immediately, never "after the next sync". The server is only asked for
 * the whole dashboard when nothing is cached on this device yet (first
 * visit, or right after a cache reset).
 */
export function DashboardWithLocalCache({
  isAdmin,
  realIsAdmin,
  previewingAsUser,
  serverResumeChapterId,
  onCacheMiss,
}: {
  isAdmin: boolean;
  realIsAdmin: boolean;
  previewingAsUser: boolean;
  serverResumeChapterId: string | null;
  /** Set by the local nav shell (local-nav-shell.tsx): on a cache miss it falls back to a real Next.js navigation instead of fetching the snapshot itself. */
  onCacheMiss?: () => void;
}) {
  const [local, setLocal] = useState<LocalDashboardView | null>(null);
  const [serverSnapshot, setServerSnapshot] = useState<DashboardSnapshot | null>(null);
  const [serverSnapshotFailed, setServerSnapshotFailed] = useState(false);
  const [checkedCache, setCheckedCache] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [autoStartSync, setAutoStartSync] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [notionViewData, setNotionViewData] = useState<DashboardNotionViewData | null>(null);
  const [aiConfigData, setAiConfigData] = useState<DashboardAiConfigData | null>(null);

  const loadLocal = useCallback(() => Promise.all([loadLocalDashboardView(isAdmin), getCachedNotionViewData(), getCachedAiConfigData(isAdmin)]), [isAdmin]);

  const applyLocal = useCallback(
    ([view, notionView, aiConfig]: [LocalDashboardView | null, DashboardNotionViewData | null, { value: DashboardAiConfigData | null } | null]) => {
      setNotionViewData(notionView);
      setAiConfigData(aiConfig?.value ?? null);
      if (view) setLocal(view);
      return view;
    },
    []
  );

  const reloadLocal = useCallback(() => {
    loadLocal()
      .then(applyLocal)
      .catch(() => {});
  }, [loadLocal, applyLocal]);

  useEffect(() => {
    let cancelled = false;
    loadLocal().then((result) => {
      if (cancelled) return;
      const view = applyLocal(result);
      setCheckedCache(true);
      if (consumeAutoSyncAfterReset()) {
        setAutoStartSync(true);
        setSyncOpen(true);
      }
      if (view) return;
      if (onCacheMiss) {
        onCacheMiss();
        return;
      }
      fetchDashboardSnapshot()
        .then((snapshot) => {
          if (!cancelled) setServerSnapshot(snapshot);
        })
        .catch(() => {
          if (!cancelled) setServerSnapshotFailed(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [loadLocal, applyLocal, onCacheMiss]);

  // Coming back to this tab (e.g. after reviewing in another one, or the
  // next morning when more cards have come due) recomputes everything from
  // the cache — cheap, and keeps due counts honest as time passes.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") reloadLocal();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [reloadLocal]);

  function handleSynced(outcome: SyncOutcome) {
    reloadLocal();
    // Cross-user stats, the notion view and admin settings follow in the
    // background — the dashboard is already complete without them, and
    // picks them up as soon as they land.
    setBackgroundSyncing(true);
    runBackgroundSync(outcome.snapshot.effectiveIsAdmin).finally(() => {
      setBackgroundSyncing(false);
      reloadLocal();
    });
  }

  const handleAiConfigChange = useCallback(
    (config: DashboardAiConfigData) => {
      setAiConfigData(config);
      setCachedAiConfigData(isAdmin, config).catch(() => {});
    },
    [isAdmin]
  );

  // Keeps the rendered books in step with a local admin reorder the instant
  // it persists to the cache (handleMoveBook/handleMoveChapter in board.tsx)
  // — otherwise ElProfesorBoard's useOptimistic override would revert to a
  // stale prop the moment its transition resolves, flashing the old order.
  function handleLocalBooksChange(books: DashboardSnapshot["books"]) {
    setLocal((l) => (l ? { ...l, snapshot: { ...l.snapshot, books } } : l));
    setServerSnapshot((s) => (s ? { ...s, books } : s));
  }

  const snapshot = local?.snapshot ?? serverSnapshot;

  return (
    <>
      {!snapshot ? (
        serverSnapshotFailed ? (
          <p className="mx-auto max-w-4xl px-4 py-8 text-sm text-foreground-muted sm:px-6">
            Impossible de charger le tableau de bord — vérifiez votre connexion, puis synchronisez ou rechargez la page.
          </p>
        ) : (
          <DashboardSkeleton />
        )
      ) : (
        <>
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-end gap-2 px-4 pt-4 text-xs text-foreground-subtle sm:px-6 xl:max-w-6xl">
            {checkedCache && !local && <span className="text-accent">Aucune donnée locale — synchronisez pour un accès instantané et hors ligne.</span>}
            {local?.historyMissing && <span className="text-accent">Statistiques de révision incomplètes — synchronisez pour les compléter.</span>}
            {backgroundSyncing && <span>Mise à jour des statistiques…</span>}
            {local && <span>Synchronisé {syncedAgoLabel(local.syncedAt)}</span>}
            <Button variant="ghost" size="sm" onClick={() => setSyncOpen(true)}>
              {local ? <RefreshCw className="h-3.5 w-3.5" /> : <CloudDownload className="h-3.5 w-3.5" />} Synchroniser
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetOpen(true)}
              title="Vider les données El Profesor enregistrées sur cet appareil et les retélécharger"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser le cache
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
            secondaryData={local?.widgets ?? null}
            aiConfigData={aiConfigData}
            notionViewData={notionViewData}
            onLocalBooksChange={handleLocalBooksChange}
            onAiConfigChange={handleAiConfigChange}
          />
        </>
      )}

      {syncOpen && (
        <SyncModal
          autoStart={autoStartSync}
          onClose={() => {
            setSyncOpen(false);
            setAutoStartSync(false);
          }}
          onSynced={handleSynced}
        />
      )}
      {resetOpen && <ResetCacheModal onClose={() => setResetOpen(false)} />}
    </>
  );
}
