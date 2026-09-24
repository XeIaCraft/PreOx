"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { runEssentialSync, type SyncOutcome, type SyncProgress } from "@/lib/el-profesor/sync-runner";

type Phase = "idle" | SyncProgress["phase"] | "done" | "error";

function plural(n: number, singular: string, pluralForm: string): string {
  return n > 1 ? pluralForm : singular;
}

/**
 * Manual "Synchroniser" flow (piste 2026-09-24 — "cache local +
 * synchronisation manuelle", puis "synchronisation delta") — the UI around
 * runEssentialSync (sync-runner.ts), which holds the actual logic: deliver
 * pending local changes, then fetch the library manifest, this user's own
 * data and the review-history delta in parallel, and re-download only the
 * chapters whose content changed. Everything secondary (cross-user stats,
 * notion view, AI settings) continues in the background once this closes,
 * so it never holds the modal up.
 */
export function SyncModal({
  onClose,
  onSynced,
  autoStart = false,
}: {
  onClose: () => void;
  onSynced: (outcome: SyncOutcome) => void;
  /** Starts right away instead of waiting for a click — used after a cache reset, so the device is usable again without a second step. */
  autoStart?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<SyncProgress>({ phase: "flush", totalChapters: 0, syncedChapters: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function runSync() {
    setErrorMessage(null);
    setWarning(null);
    try {
      const outcome = await runEssentialSync((p) => {
        setProgress(p);
        setPhase(p.phase);
      });
      setPhase("done");
      onSynced(outcome);
      const messages: string[] = [];
      if (outcome.failedChapters > 0) {
        messages.push(
          `${outcome.failedChapters} ${plural(outcome.failedChapters, "chapitre n'a", "chapitres n'ont")} pas pu être ${plural(outcome.failedChapters, "téléchargé", "téléchargés")} — relancez la synchronisation pour réessayer.`
        );
      }
      if (outcome.unsentWrites > 0) {
        messages.push(
          `${outcome.unsentWrites} ${plural(outcome.unsentWrites, "modification locale n'a", "modifications locales n'ont")} pas encore pu être ${plural(outcome.unsentWrites, "envoyée", "envoyées")} au serveur — ${plural(outcome.unsentWrites, "elle reste enregistrée", "elles restent enregistrées")} sur cet appareil et ${plural(outcome.unsentWrites, "partira", "partiront")} automatiquement.`
        );
      }
      if (outcome.historyFailed) messages.push("L'historique de révision (série, temps de révision) n'a pas pu être actualisé — il le sera à la prochaine synchronisation.");
      if (messages.length > 0) setWarning(messages.join(" "));
    } catch (err) {
      setErrorMessage(err instanceof Error && err.message ? `Synchronisation impossible : ${err.message}` : "Synchronisation impossible — vérifiez votre connexion et réessayez.");
      setPhase("error");
    }
  }

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    // Deferred a tick so no state update happens synchronously inside the effect itself.
    Promise.resolve().then(runSync);
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = phase === "flush" || phase === "dashboard" || phase === "content";
  const progressPct =
    phase === "flush"
      ? 5
      : phase === "dashboard"
        ? 15
        : phase === "content"
          ? progress.totalChapters > 0
            ? 20 + Math.round((progress.syncedChapters / progress.totalChapters) * 80)
            : 90
          : phase === "done"
            ? 100
            : 0;

  return (
    <Modal title="Synchroniser les données locales" onClose={onClose} size="sm">
      {phase === "idle" && (
        <>
          <p className="text-sm text-foreground-muted">
            Envoie vos modifications locales, puis récupère ce qui a changé ailleurs : bibliothèque, progression, favoris, notes. Seuls les
            chapitres modifiés depuis la dernière synchronisation sont retéléchargés — les autres restent tels quels.
          </p>
          <div className="mt-5 flex justify-end">
            <Button onClick={runSync}>Synchroniser</Button>
          </div>
        </>
      )}

      {running && (
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">
            {phase === "flush"
              ? "Envoi de vos modifications locales…"
              : phase === "dashboard"
                ? "Bibliothèque et progression…"
                : progress.totalChapters > 0
                  ? `Contenu des chapitres modifiés (${progress.syncedChapters} / ${progress.totalChapters})…`
                  : "Bibliothèque déjà à jour…"}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> Synchronisation terminée.
        </div>
      )}

      {warning && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-accent">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {warning}
        </p>
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
