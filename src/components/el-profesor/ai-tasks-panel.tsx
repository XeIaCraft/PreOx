"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Activity, AlertTriangle, Loader2, Play, RefreshCw, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { fetchAiActivity } from "@/lib/el-profesor/sync-api";
import { retryAiTasks, removeFromGeminiQueue, runGeminiQueueNow } from "@/app/apps/el-profesor/actions/gemini-queue";
import type { AiActivity, AiTaskItem, AiTaskKind } from "@/lib/el-profesor/ai-activity-types";

// « Tâches IA » (admin): a counter in the dashboard header — tasks being
// processed or waiting, and errors — and a panel listing them, with
// « Relancer » for what failed or came out of the queue. Read live from the
// server (fetch, not a Server Action, so it never waits behind a long queue
// run) every 30 s while the page is visible, every 8 s while the panel is open.

const KIND_LABEL: Record<AiTaskKind, string> = { extraction: "Extraction", complementary: "Complément", split: "Division" };
const BATCH_KIND_LABEL: Record<string, string> = {
  extraction: "Extraction",
  complementary: "Complément",
  notion_categorization: "Catégorisation par notion",
  contradiction_check: "Détection de contradictions",
  notion_update_check: "Mise à jour depuis une source externe",
};
const POLL_MS = 30_000;
const POLL_OPEN_MS = 8_000;

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function since(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return minutes < 1 ? "depuis moins d'une minute" : minutes < 60 ? `depuis ${minutes} min` : `depuis ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** `refreshKey`: bump it after queueing something so the counter updates right away. */
export function AiTasksButton({ refreshKey = 0 }: { refreshKey?: number }) {
  const [activity, setActivity] = useState<AiActivity | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [finished, setFinished] = useState(0);
  const previousActive = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAiActivity();
      if (!next) return;
      // Tasks gone from « en cours / en attente » without landing in errors have finished.
      const active = new Set([...next.running, ...next.waiting].map((t) => `${t.chapterId}:${t.kind}`));
      const failedIds = new Set(next.failed.map((t) => t.chapterId));
      if (previousActive.current) {
        let done = 0;
        for (const key of previousActive.current) if (!active.has(key) && !failedIds.has(key.split(":")[0])) done++;
        if (done) setFinished((n) => n + done);
      }
      previousActive.current = active;
      setActivity(next);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // The first check runs from the timer's own callback, never synchronously in the effect.
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(tick, open ? POLL_OPEN_MS : POLL_MS);
    };
    timer = setTimeout(tick, 0);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, open, refreshKey]);

  const active = activity ? activity.running.length + activity.waiting.length + activity.claudeBatches.length : 0;
  const errors = activity?.failed.length ?? 0;
  const label = [active ? `${active} en cours ou en attente` : "", errors ? `${errors} en erreur` : ""].filter(Boolean).join(", ") || "Aucune tâche";

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Tâches IA : ${label}`} title={`Tâches IA : ${label}`} className="gap-1.5 px-2">
        {activity && activity.running.length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
        {active > 0 && <span className="rounded-full bg-accent-tint px-1.5 text-xs font-semibold tabular-nums text-accent">{active}</span>}
        {errors > 0 && <span className="rounded-full bg-danger-tint px-1.5 text-xs font-semibold tabular-nums text-danger">{errors}</span>}
      </Button>
      {open && (
        <AiTasksDialog
          activity={activity}
          loadError={loadError}
          finished={finished}
          onRefresh={refresh}
          onClose={() => {
            setOpen(false);
            setFinished(0);
          }}
        />
      )}
    </>
  );
}

function AiTasksDialog({ activity, loadError, finished, onRefresh, onClose }: { activity: AiActivity | null; loadError: boolean; finished: number; onRefresh: () => Promise<void>; onClose: () => void }) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRunning, startRun] = useTransition();

  function act(id: string, action: () => Promise<{ error?: string; success?: string }>, thenRunQueue = false) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else toast(result.success ?? "Fait.", { variant: "success" });
      await onRefresh();
      if (thenRunQueue && !result.error) runQueue(false);
    });
  }

  function runQueue(withToast = true) {
    startRun(async () => {
      const result = await runGeminiQueueNow().catch(() => ({ error: "La file n'a pas pu être lancée." }) as { error?: string; success?: string });
      if (withToast || result.error) toast(result.error ?? result.success ?? "Fait.", { variant: result.error ? "error" : "success" });
      await onRefresh();
    });
  }

  const retry = (ids: string[], key: string) => act(key, () => retryAiTasks(ids), true);
  const hasGeminiWaiting = !!activity?.waiting.some((t) => t.provider === "gemini");
  const empty = activity && !activity.running.length && !activity.waiting.length && !activity.failed.length && !activity.claudeBatches.length;

  return (
    <Modal title="Tâches IA" description="Extractions, compléments et divisions en cours, en attente ou en erreur — état réel du serveur." onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-subtle">
          <span>{loadError ? "Impossible de vérifier (connexion ?)." : activity ? `Vérifié à ${new Date(activity.checkedAt).toLocaleTimeString("fr-FR")} · actualisation automatique` : "Chargement…"}</span>
          <div className="flex gap-2">
            {hasGeminiWaiting && (
              <Button variant="secondary" size="sm" onClick={() => runQueue()} disabled={isRunning} title="Traiter la file Gemini tout de suite au lieu d'attendre le prochain passage automatique (toutes les 5 min)">
                {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {isRunning ? "File en cours…" : "Lancer la file maintenant"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void onRefresh()}>
              <RefreshCw className="h-3.5 w-3.5" /> Actualiser
            </Button>
          </div>
        </div>

        {finished > 0 && (
          <p className="rounded-[var(--radius-sm)] border border-success/30 bg-success-tint p-2.5 text-sm text-success">
            {finished} tâche{finished > 1 ? "s" : ""} terminée{finished > 1 ? "s" : ""} depuis l&apos;ouverture de la page — « Synchroniser » pour voir le nouveau contenu.
          </p>
        )}

        {empty && <p className="text-sm text-foreground-subtle">Aucune tâche IA en cours, en attente ou en erreur.</p>}

        {activity && activity.failed.length > 0 && (
          <Section
            title={`Erreurs à relancer (${activity.failed.length})`}
            tone="danger"
            action={
              activity.failed.length > 1 && (
                <Button size="sm" variant="secondary" onClick={() => retry(activity.failed.map((t) => t.chapterId), "all")} disabled={isPending}>
                  <RotateCcw className="h-3.5 w-3.5" /> {busyId === "all" ? "…" : "Tout relancer"}
                </Button>
              )
            }
          >
            {activity.failed.map((t) => (
              <TaskRow key={`f-${t.chapterId}`} task={t}>
                {t.error && <p className="mt-1 whitespace-pre-line text-xs text-danger">{t.error}</p>}
                <p className="mt-1 text-[11px] text-foreground-subtle">
                  {t.inQueue ? `Sorti de la file après ${t.attempts} essai${t.attempts > 1 ? "s" : ""} — « Relancer » le remet en file (${KIND_LABEL[t.kind].toLowerCase()}).` : "Chapitre en échec — « Relancer » refait l'extraction avec le fournisseur actuel."}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => retry([t.chapterId], t.chapterId)} disabled={isPending}>
                    <RotateCcw className="h-3.5 w-3.5" /> {busyId === t.chapterId ? "…" : "Relancer"}
                  </Button>
                  {t.inQueue && (
                    <Button size="sm" variant="ghost" onClick={() => act(`r-${t.chapterId}`, () => removeFromGeminiQueue(t.chapterId))} disabled={isPending} title="Retirer de cette liste sans relancer">
                      <X className="h-3.5 w-3.5" /> Retirer
                    </Button>
                  )}
                </div>
              </TaskRow>
            ))}
          </Section>
        )}

        {activity && (activity.running.length > 0 || activity.claudeBatches.length > 0) && (
          <Section title={`En cours (${activity.running.length + activity.claudeBatches.length})`} tone="accent">
            {activity.running.map((t) => (
              <TaskRow key={`r-${t.chapterId}`} task={t}>
                <p className="mt-1 text-xs text-foreground-subtle">{[t.provider === "claude" ? "Claude" : "Gemini", since(t.startedAt)].filter(Boolean).join(" · ")}</p>
              </TaskRow>
            ))}
            {activity.claudeBatches.map((b) => (
              <li key={b.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-muted/50 p-2.5 text-sm">
                <p className="font-medium text-foreground">Lot Claude · {BATCH_KIND_LABEL[b.kind] ?? b.kind}</p>
                <p className="text-xs text-foreground-subtle">
                  {b.requestCount} requête{b.requestCount > 1 ? "s" : ""} · soumis le {new Date(b.createdAt).toLocaleString("fr-FR")} · récupéré automatiquement (ou « Vérifier maintenant » dans Réglages IA)
                </p>
              </li>
            ))}
          </Section>
        )}

        {activity && activity.waiting.length > 0 && (
          <Section title={`En attente (${activity.waiting.length})`} tone="neutral">
            {activity.waiting.map((t, i) => (
              <TaskRow key={`w-${t.chapterId}`} task={t} position={t.provider === "gemini" ? i + 1 : undefined}>
                <p className="mt-1 text-xs text-foreground-subtle">
                  {t.provider === "claude"
                    ? "Lot Claude soumis — en attente du résultat."
                    : t.nextAttemptAt && new Date(t.nextAttemptAt).getTime() > Date.now()
                      ? `Prochain essai vers ${hhmm(t.nextAttemptAt)}${t.attempts ? ` (essai ${t.attempts + 1})` : ""}`
                      : "Au prochain passage de la file"}
                </p>
                {t.provider === "gemini" && t.attempts > 0 && t.error && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-foreground-muted">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {t.error}
                  </p>
                )}
                {t.inQueue && (
                  <div className="mt-2">
                    <Button size="sm" variant="ghost" onClick={() => act(`r-${t.chapterId}`, () => removeFromGeminiQueue(t.chapterId))} disabled={isPending}>
                      <X className="h-3.5 w-3.5" /> Retirer de la file
                    </Button>
                  </div>
                )}
              </TaskRow>
            ))}
          </Section>
        )}
      </div>
    </Modal>
  );
}

function Section({ title, tone, action, children }: { title: string; tone: "danger" | "accent" | "neutral"; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`text-sm font-semibold ${tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-foreground"}`}>{title}</h3>
        {action}
      </div>
      <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">{children}</ul>
    </section>
  );
}

function TaskRow({ task, position, children }: { task: AiTaskItem; position?: number; children?: React.ReactNode }) {
  return (
    <li className="rounded-[var(--radius-sm)] border border-border bg-surface-muted/50 p-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {position !== undefined && <span className="mr-1.5 tabular-nums text-foreground-subtle">{position}.</span>}
            {task.chapterTitle}
          </p>
          {task.bookTitle && <p className="text-xs text-foreground-subtle">{task.bookTitle}</p>}
        </div>
        <Badge variant="outline" className="shrink-0">
          {KIND_LABEL[task.kind]}
          {task.progress ? ` · ${task.progress}` : ""}
        </Badge>
      </div>
      {children}
    </li>
  );
}
