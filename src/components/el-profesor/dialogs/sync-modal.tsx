"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  getElProfesorDashboardSnapshot,
  getElProfesorChapterContentBatch,
  getElProfesorReviewStateBatch,
  getElProfesorSuspendedFlashcardIds,
  getElProfesorChapterLastModified,
  getElProfesorSecondaryDashboardData,
  getElProfesorNotionViewData,
  getElProfesorAiConfigData,
  getElProfesorNotionsPageData,
  getElProfesorCaseJournalData,
} from "@/app/apps/el-profesor/actions/offline-sync";
import {
  setCachedDashboard,
  setCachedChapterContentBatch,
  setCachedReviewStateBatch,
  setCachedSuspendedFlashcardIds,
  setCachedSecondaryDashboardData,
  setCachedNotionViewData,
  setCachedAiConfigData,
  setCachedNotionsPage,
  setCachedCaseJournal,
  getCachedDashboard,
  getCachedChapterLastModifiedTimestamps,
  getAllCachedChapterContent,
  pruneChapterContent,
  pruneReviewState,
} from "@/lib/el-profesor/local-db";
import { flushPendingWrites } from "@/lib/el-profesor/sync-queue";
import type { DashboardSnapshot } from "@/lib/el-profesor/dashboard-types";

// Small enough that the progress bar advances visibly chapter-batch by
// chapter-batch instead of sitting still then jumping to 100%, large enough
// that a big library still only takes a handful of round trips.
const CHUNK_SIZE = 25;

type Phase = "idle" | "flush" | "dashboard" | "content" | "done" | "error";

function pick<T>(map: Record<string, T>, ids: string[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const id of ids) if (id in map) result[id] = map[id];
  return result;
}

/**
 * Manual "Synchroniser" flow (piste 2026-09-24 — "cache local +
 * synchronisation manuelle", puis "synchronisation delta"): pulls the whole
 * library + this user's progress from Supabase into IndexedDB (local-db.ts),
 * so the dashboard and every chapter render from there afterward instead of
 * hitting the network on every navigation. Deliberately manual, not a
 * background sync, per the explicit request to keep this simple — the
 * "dernière synchro" indicator next to the button (see
 * DashboardWithLocalCache) is what keeps staleness visible instead of
 * silent.
 *
 * Delta: chapter CONTENT (fiches/blocks/flashcards — by far the biggest
 * payload) is only re-downloaded for chapters whose server-side
 * last-modified timestamp (getElProfesorChapterLastModified, a single
 * grouped SQL query) is newer than what's already cached — an unchanged
 * library re-syncs in the time it takes to check timestamps, not
 * re-transfer everything. Review state (this user's own FSRS progress) is
 * small and can change on any chapter from another device at any time
 * regardless of content edits, so it's always fully refreshed for every
 * flashcard in the library, not just the changed chapters'.
 */
export function SyncModal({
  onClose,
  onSynced,
}: {
  onClose: () => void;
  onSynced: (snapshot: DashboardSnapshot, syncedAt: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [totalChapters, setTotalChapters] = useState(0);
  const [syncedChapters, setSyncedChapters] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function runSync() {
    setErrorMessage(null);
    setSyncedChapters(0);
    setTotalChapters(0);
    // Flush the local-first write queue (piste 2026-09-24 — "écriture locale
    // automatique") before pulling anything fresh — otherwise a review
    // answered offline could get overwritten by the snapshot this sync is
    // about to download, since that snapshot was computed before the queued
    // write ever reached the server. flushPendingWrites is a no-op if
    // there's nothing queued or a flush is already running.
    setPhase("flush");
    await flushPendingWrites();

    setPhase("dashboard");

    let snapshot: DashboardSnapshot;
    try {
      const [dashboardSnapshot, suspendedIds] = await Promise.all([getElProfesorDashboardSnapshot(), getElProfesorSuspendedFlashcardIds()]);
      snapshot = dashboardSnapshot;
      // Suspended-flashcard ids (piste 2026-09-24 — correctif du bug "à
      // jour") — needed by local-review-queue.ts to compute due/free queues
      // and due/mastery counts fully locally, with the same "excluded"
      // semantics getDueQueue/getFreeReviewQueue apply server-side.
      await setCachedSuspendedFlashcardIds(suspendedIds);
    } catch {
      setErrorMessage("Impossible de récupérer le tableau de bord — vérifiez votre connexion et réessayez.");
      setPhase("error");
      return;
    }
    await setCachedDashboard(snapshot);

    // Dashboard secondary widgets (activity, notions, AI config/batch jobs —
    // piste 2026-09-24 — widgets hors ligne) — best-effort, cached
    // independently of the chapter content below so one failing here never
    // blocks the rest of the sync; a shell-driven dashboard render just
    // falls back to its own live fetch if this didn't manage to cache
    // anything yet.
    try {
      const [secondaryData, notionViewData, aiConfigData, caseJournalData, notionsPageData] = await Promise.all([
        getElProfesorSecondaryDashboardData(),
        getElProfesorNotionViewData(),
        snapshot.effectiveIsAdmin ? getElProfesorAiConfigData() : Promise.resolve(null),
        getElProfesorCaseJournalData(),
        snapshot.effectiveIsAdmin ? getElProfesorNotionsPageData() : Promise.resolve(null),
      ]);
      await Promise.all([
        setCachedSecondaryDashboardData(snapshot.effectiveIsAdmin, secondaryData),
        setCachedNotionViewData(notionViewData),
        setCachedAiConfigData(snapshot.effectiveIsAdmin, aiConfigData),
        setCachedCaseJournal(caseJournalData),
        notionsPageData ? setCachedNotionsPage(notionsPageData) : Promise.resolve(),
      ]);
    } catch {
      // Best-effort — the widgets/journal/notions screens simply keep
      // showing whatever was cached before (or their loading state, on a
      // first-ever sync).
    }

    // Only published chapters are ever opened via la lecture d'un chapitre —
    // no point downloading content for one still en cours d'extraction.
    const chapterIds = snapshot.books.flatMap((b) => b.chapters.filter((c) => c.status === "published").map((c) => c.id));
    // Drops cached content for chapters that no longer exist (deleted,
    // unpublished, or their book archived) before writing fresh content —
    // otherwise old chapters' data would just pile up in IndexedDB forever.
    await pruneChapterContent(chapterIds);

    // Delta: only re-download chapters whose content actually changed since
    // they were last cached. A chapter never synced before (not in
    // cachedLastModified) or missing a fresh server timestamp (fails open —
    // re-download rather than risk skipping something real) is treated as
    // changed too.
    let changedChapterIds = chapterIds;
    try {
      const [freshLastModified, cachedLastModified] = await Promise.all([
        getElProfesorChapterLastModified(chapterIds),
        getCachedChapterLastModifiedTimestamps(),
      ]);
      changedChapterIds = chapterIds.filter((id) => {
        const fresh = freshLastModified[id];
        const cached = cachedLastModified[id];
        if (!fresh || !cached) return true;
        return new Date(fresh).getTime() > new Date(cached).getTime();
      });

      setTotalChapters(changedChapterIds.length);
      setPhase("content");

      let failed = 0;
      for (let i = 0; i < changedChapterIds.length; i += CHUNK_SIZE) {
        const chunk = changedChapterIds.slice(i, i + CHUNK_SIZE);
        try {
          const contentByChapter = await getElProfesorChapterContentBatch(chunk);
          await setCachedChapterContentBatch(contentByChapter, pick(freshLastModified, chunk));
        } catch {
          failed += chunk.length;
        }
        setSyncedChapters((n) => n + chunk.length);
      }

      // Review state (piste 2026-09-24 — "écriture locale automatique"):
      // refreshed for every flashcard across the whole library (changed
      // chapters just wrote fresh content above; unchanged ones already have
      // theirs cached) rather than only the chapters re-downloaded this
      // time — a review logged from another device can update any
      // flashcard's state regardless of whether its chapter's content
      // changed at all.
      const allCachedContent = await getAllCachedChapterContent();
      const allFlashcardIds = chapterIds.flatMap(
        (id) => allCachedContent.get(id)?.subEntities.flatMap((s) => s.fiche?.flashcards.map((f) => f.id) ?? []) ?? []
      );
      const reviewStates = await getElProfesorReviewStateBatch(allFlashcardIds);
      await setCachedReviewStateBatch(reviewStates);
      await pruneReviewState(allFlashcardIds);

      const cached = await getCachedDashboard();
      setPhase("done");
      if (cached) onSynced(cached, cached.syncedAt);
      if (failed > 0) {
        setErrorMessage(
          `${failed} chapitre${failed > 1 ? "s" : ""} n'${failed > 1 ? "ont" : "a"} pas pu être synchronisé${failed > 1 ? "s" : ""} — relancez la synchronisation plus tard pour les récupérer.`
        );
      }
    } catch {
      setErrorMessage("Impossible de synchroniser le contenu des chapitres — vérifiez votre connexion et réessayez.");
      setPhase("error");
    }
  }

  const progressPct =
    phase === "flush"
      ? 2
      : phase === "dashboard"
        ? 5
        : phase === "content" && totalChapters > 0
          ? 5 + Math.round((syncedChapters / totalChapters) * 95)
          : phase === "done"
            ? 100
            : 0;

  return (
    <Modal title="Synchroniser les données locales" onClose={onClose} size="sm">
      {phase === "idle" && (
        <>
          <p className="text-sm text-foreground-muted">
            Télécharge la bibliothèque (livres, chapitres, fiches, flashcards) et votre progression dans le navigateur, pour un accès
            instantané ensuite, sans attendre le réseau à chaque page. Seuls les chapitres modifiés depuis la dernière synchronisation
            sont retéléchargés — les autres restent tels quels.
          </p>
          <div className="mt-5 flex justify-end">
            <Button onClick={runSync}>Synchroniser</Button>
          </div>
        </>
      )}

      {(phase === "flush" || phase === "dashboard" || phase === "content") && (
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">
            {phase === "flush"
              ? "Envoi de votre progression en attente…"
              : phase === "dashboard"
                ? "Tableau de bord et statistiques…"
                : totalChapters > 0
                  ? `Contenu des chapitres modifiés (${syncedChapters} / ${totalChapters})…`
                  : "Bibliothèque déjà à jour…"}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {phase === "done" && !errorMessage && (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> Synchronisation terminée — la bibliothèque est disponible hors ligne.
        </div>
      )}

      {errorMessage && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {errorMessage}
        </p>
      )}

      {(phase === "done" || phase === "error") && (
        <div className="mt-5 flex justify-end gap-2">
          {phase === "error" && <Button onClick={runSync}>Réessayer</Button>}
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      )}
    </Modal>
  );
}
