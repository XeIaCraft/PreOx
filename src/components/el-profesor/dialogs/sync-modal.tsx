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
} from "@/app/apps/el-profesor/actions/offline-sync";
import {
  setCachedDashboard,
  setCachedChapterContentBatch,
  setCachedReviewStateBatch,
  setCachedSuspendedFlashcardIds,
  getCachedDashboard,
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

/**
 * Manual "Synchroniser" flow (piste 2026-09-24 — "cache local +
 * synchronisation manuelle"): pulls the whole library + this user's
 * progress from Supabase into IndexedDB (local-db.ts), so the dashboard and
 * every chapter render from there afterward instead of hitting the network
 * on every navigation. Deliberately manual, not a background sync, per the
 * explicit request to keep this simple — the "dernière synchro" indicator
 * next to the button (see DashboardWithLocalCache) is what keeps staleness
 * visible instead of silent.
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

    // Only published chapters are ever opened via la lecture d'un chapitre —
    // no point downloading content for one still en cours d'extraction.
    const chapterIds = snapshot.books.flatMap((b) => b.chapters.filter((c) => c.status === "published").map((c) => c.id));
    // Drops cached content for chapters that no longer exist (deleted,
    // unpublished, or their book archived) before writing fresh content —
    // otherwise old chapters' data would just pile up in IndexedDB forever,
    // since the writes below only ever overwrite entries for chapterIds.
    await pruneChapterContent(chapterIds);
    setTotalChapters(chapterIds.length);
    setPhase("content");

    let failed = 0;
    const allFlashcardIds: string[] = [];
    for (let i = 0; i < chapterIds.length; i += CHUNK_SIZE) {
      const chunk = chapterIds.slice(i, i + CHUNK_SIZE);
      try {
        const contentByChapter = await getElProfesorChapterContentBatch(chunk);
        await setCachedChapterContentBatch(contentByChapter);

        // Review state (piste 2026-09-24 — "écriture locale automatique"):
        // synced alongside each chapter-content chunk so scheduleReview
        // (fsrs.ts) has a starting FSRS state to run against offline — same
        // chunking rationale as the content sync itself.
        const flashcardIds = Object.values(contentByChapter).flatMap((c) => c.subEntities.flatMap((s) => s.fiche?.flashcards.map((f) => f.id) ?? []));
        allFlashcardIds.push(...flashcardIds);
        const reviewStates = await getElProfesorReviewStateBatch(flashcardIds);
        await setCachedReviewStateBatch(reviewStates);
      } catch {
        failed += chunk.length;
      }
      setSyncedChapters((n) => n + chunk.length);
    }
    await pruneReviewState(allFlashcardIds);

    const cached = await getCachedDashboard();
    setPhase("done");
    if (cached) onSynced(cached, cached.syncedAt);
    if (failed > 0) {
      setErrorMessage(
        `${failed} chapitre${failed > 1 ? "s" : ""} n'${failed > 1 ? "ont" : "a"} pas pu être synchronisé${failed > 1 ? "s" : ""} — relancez la synchronisation plus tard pour les récupérer.`
      );
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
            Télécharge toute la bibliothèque (livres, chapitres, fiches, flashcards) et votre progression dans le navigateur, pour un
            accès instantané ensuite, sans attendre le réseau à chaque page. Chaque synchronisation retélécharge l&apos;intégralité —
            relancez-la après une modification importante (nouveau chapitre publié, réorganisation...).
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
                : `Contenu des chapitres (${syncedChapters} / ${totalChapters})…`}
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
