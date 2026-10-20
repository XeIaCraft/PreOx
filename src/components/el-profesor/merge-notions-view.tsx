"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, Combine, History, ListTree, PenLine, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  cancelMerge,
  deleteMergedBook,
  estimateMergeAction,
  generateMergeChapters,
  getMergeJobs,
  getMergeToc,
  retryMerge,
  runMergeNow,
  startMerge,
  type MergeEstimateResult,
  type MergeJobView,
  type MergeSetupData,
  type MergeToc,
  type MergeTocChapter,
} from "@/app/apps/el-profesor/actions/merge";
import { bulkPublishChapters } from "@/app/apps/el-profesor/actions/extraction";
import { formatUsd, estimateCostUsd } from "@/lib/el-profesor/ai-pricing";
import { shortBookTitle } from "@/lib/el-profesor/book-title";
import type { MergeProvider } from "@/lib/el-profesor/merge/types";

// Two phases: the table of contents (every fiche placed, nothing written yet), then lots of chapters chosen by hand.
const TOC_STAGES = [
  { key: "plan", label: "Parties", hint: "Parties et sous-parties, du fondamental vers l'appliqué." },
  { key: "assign", label: "Répartition", hint: "Chaque fiche source rejoint sa sous-partie." },
  { key: "chapters", label: "Chapitres et fiches", hint: "Chaque sous-partie organisée en chapitres et en fiches, dans l'ordre d'apprentissage." },
] as const;
const LOT_STAGES = [
  { key: "fiches", label: "Fusion des fiches", hint: "Rédaction sans perte, divergences citées, « À retenir », cartes fusionnées." },
  { key: "repair", label: "Contrôle de couverture", hint: "Blocs, cartes et valeurs chiffrées non repris : réintégrés." },
] as const;

const ENDED_LABEL: Record<string, { label: string; variant: "success" | "danger" | "neutral" | "primary" }> = {
  ready: { label: "Table des matières prête", variant: "primary" },
  done: { label: "Tout est rédigé", variant: "success" },
  failed: { label: "Échec", variant: "danger" },
  canceled: { label: "Arrêtée", variant: "neutral" },
};

const nf = new Intl.NumberFormat("fr-BE");

function stagesOf(job: MergeJobView) {
  return LOT_STAGES.some((s) => s.key === job.stage) ? LOT_STAGES : TOC_STAGES;
}

function isActive(job: MergeJobView) {
  return [...TOC_STAGES, ...LOT_STAGES].some((s) => s.key === job.stage);
}

export function MergeNotionsView({ setupPromise, jobsPromise }: { setupPromise: Promise<MergeSetupData | null>; jobsPromise: Promise<MergeJobView[]> }) {
  const initialJobs = use(jobsPromise);
  const [jobs, setJobs] = useState(initialJobs);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => setJobs(await getMergeJobs()), []);

  // Progress shows up without reloading while a fusion runs (it carries on server-side either way).
  const anyActive = jobs.some(isActive);
  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [anyActive, refresh]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/apps/el-profesor" prefetch={false} className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif-display text-3xl font-medium text-foreground">Notions</h1>
          <p className="mt-1 max-w-xl text-sm text-foreground-muted">
            Réunissez plusieurs livres en un seul, construit pour apprendre : une nouvelle table des matières, des fiches fusionnées sans perte d&apos;information, les
            divergences entre livres citées, et des flashcards qui remplacent celles des livres sources.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/apps/el-profesor/notions/anciennes" prefetch={false}>
            <Button variant="ghost" size="sm">
              <History className="h-3.5 w-3.5" /> Anciennes notions
            </Button>
          </Link>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Combine className="h-3.5 w-3.5" /> Nouvelle notion
          </Button>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {jobs.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
            <p className="text-sm text-foreground-muted">Aucune notion pour l&apos;instant.</p>
            <Button className="mt-4" size="sm" onClick={() => setCreating(true)}>
              <Combine className="h-3.5 w-3.5" /> Fusionner des livres
            </Button>
          </div>
        ) : (
          jobs.map((job) => <MergeJobCard key={job.id} job={job} onChanged={refresh} />)
        )}
      </div>

      {creating && (
        <Suspense
          fallback={
            <Modal title="Nouvelle notion" onClose={() => setCreating(false)} size="lg">
              <p className="text-sm text-foreground-subtle">Chargement des livres…</p>
            </Modal>
          }
        >
          <CreateMergeModalLoader setupPromise={setupPromise} onClose={() => setCreating(false)} onStarted={refresh} />
        </Suspense>
      )}
    </div>
  );
}

function MergeJobCard({ job, onChanged }: { job: MergeJobView; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = isActive(job);
  const STAGES = stagesOf(job);
  const inLot = STAGES === LOT_STAGES;
  const stageIndex = STAGES.findIndex((s) => s.key === job.stage);
  const p = job.progress;
  const stageTotal = p.waiting + p.running + p.submitted + p.done + p.failed;
  const stageDone = p.done + p.failed;
  const overall = job.stage === "done" ? 1 : stageIndex < 0 ? 0 : (stageIndex + (stageTotal ? stageDone / stageTotal : 0)) / STAGES.length;
  const s = job.stats;
  const priced = job.provider === "claude" ? `claude:${job.model}` : job.model;
  const cost = s.inputTokens ? estimateCostUsd(priced, s.inputTokens, s.outputTokens ?? 0) : null;
  const lots = s.rounds ?? [];
  const lotsCost = lots.reduce((sum, r) => sum + (estimateCostUsd(priced, r.inputTokens, r.outputTokens) ?? 0), 0);

  function run(action: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast(result.error, { variant: "error" });
      else if (result.success) toast(result.success, { variant: "success" });
      await onChanged();
    });
  }

  return (
    <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-serif-display text-xl font-medium text-foreground">{job.bookTitle}</h2>
          <p className="mt-0.5 text-sm text-foreground-subtle">Fusion de {job.sourceBooks.join(" · ")}</p>
          <p className="mt-0.5 text-xs text-foreground-subtle">
            {job.provider === "claude" ? "Claude (lots)" : "Gemini"} · {job.model}
            {cost != null && ` · ≈ ${formatUsd(cost)} dépensés`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {active ? <Badge variant="accent">En cours</Badge> : <Badge variant={ENDED_LABEL[job.stage]?.variant ?? "neutral"}>{ENDED_LABEL[job.stage]?.label ?? job.stage}</Badge>}
        </div>
      </div>

      {active && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(overall * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(3, overall * 100)}%` }} />
          </div>
          {inLot && <p className="mt-3 text-xs font-medium text-foreground">Lot {job.round}</p>}
          <ol className={`mt-3 grid grid-cols-1 gap-1.5 text-xs ${inLot ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            {STAGES.map((stage, i) => (
              <li
                key={stage.key}
                title={stage.hint}
                className={`flex items-center gap-1.5 ${i < stageIndex ? "text-success" : i === stageIndex ? "font-medium text-foreground" : "text-foreground-subtle"}`}
              >
                {i < stageIndex ? <Check className="h-3 w-3 shrink-0" /> : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === stageIndex ? "bg-primary" : "bg-border-strong"}`} />}
                {stage.label}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-foreground-muted">
            {STAGES[stageIndex]?.hint}{" "}
            {stageTotal > 0 && (
              <span className="tabular-nums">
                {nf.format(stageDone)} / {nf.format(stageTotal)}
                {p.submitted > 0 && ` · ${nf.format(p.submitted)} en lot chez Anthropic`}
                {p.running > 0 && ` · ${nf.format(p.running)} en cours`}
                {p.failed > 0 && ` · ${nf.format(p.failed)} en échec (repris tels quels, rien n'est perdu)`}
              </span>
            )}
          </p>
          {(job.error || job.lastTaskError) && <p className="mt-1 text-xs text-foreground-subtle">Dernière erreur : {job.error ?? job.lastTaskError}</p>}
        </div>
      )}

      {job.stage === "failed" && job.error && <p className="mt-3 text-sm text-danger">{job.error}</p>}

      {(s.sourceFiches || s.fichesPlanned) && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Fiches sources" value={s.sourceFiches} />
          <Stat label={s.chapters ? "Chapitres" : "Sous-parties"} value={s.chapters ?? s.subParts} />
          <Stat label="Fiches fusionnées" value={s.fichesPlanned} />
          <Stat label="Chapitres rédigés" value={s.chapters ? job.chapters.total : undefined} />
        </dl>
      )}
      {lots.length > 0 && (
        <p className="mt-3 text-xs text-foreground-muted">
          {cost != null && `Table des matières ≈ ${formatUsd(Math.max(0, cost - lotsCost))}`}
          {lots.map((r) => {
            const c = estimateCostUsd(priced, r.inputTokens, r.outputTokens);
            return ` · Lot ${r.round} (${new Date(r.finishedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}) : ${r.chapters} chapitre${r.chapters > 1 ? "s" : ""}${c != null ? `, ≈ ${formatUsd(c)}` : ""}`;
          })}
        </p>
      )}
      {(job.stage === "done" || (job.stage === "ready" && lots.length > 0)) && (
        <p className="mt-3 text-xs text-foreground-muted">
          Contrôle de couverture : {nf.format(s.fichesRepaired ?? 0)} fiche(s) complétée(s) au rattrapage (bloc, carte ou valeur chiffrée oubliés, « À retenir » manquant).
          {((s.blocksKeptVerbatim ?? 0) > 0 || (s.cardsKeptVerbatim ?? 0) > 0 || (s.fichesFailed ?? 0) > 0) &&
            ` En dernier recours, ${nf.format(s.blocksKeptVerbatim ?? 0)} bloc(s) et ${nf.format(s.cardsKeptVerbatim ?? 0)} carte(s) ont été ajoutés tels quels${
              (s.fichesFailed ?? 0) > 0 ? `, et ${s.fichesFailed} fiche(s) non fusionnée(s) gardent leurs sources` : ""
            } — marqués « à vérifier ».`}
          {(s.fichesSplit ?? 0) > 0 && ` ${s.fichesSplit} sujet(s) trop longs pour une seule fiche ont été répartis sur plusieurs fiches.`}
          {(s.divergences ?? 0) > 0 && ` ${nf.format(s.divergences ?? 0)} divergence(s) entre livres citée(s).`}
        </p>
      )}

      {s.chapters != null && (job.stage === "ready" || job.stage === "done" || inLot) && <MergeTocPanel job={job} onChanged={onChanged} />}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {job.chapters.total > 0 && (
          <Link href={`/apps/el-profesor/books/${job.bookId}`} prefetch={false}>
            <Button size="sm" variant="secondary">
              <ListTree className="h-3.5 w-3.5" /> Ouvrir le livre
            </Button>
          </Link>
        )}
        {job.chapters.firstDraftId && (
          <Link href={`/apps/el-profesor/chapters/${job.chapters.firstDraftId}/admin-review`} prefetch={false}>
            <Button size="sm" variant="secondary">
              <BookOpen className="h-3.5 w-3.5" /> Relire
            </Button>
          </Link>
        )}
        {!active && job.chapters.draftIds.length > 0 && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => bulkPublishChapters(job.chapters.draftIds))}
            title="Publie les chapitres relus : leurs cartes remplacent alors les cartes sources, avec votre historique de révision"
          >
            <Check className="h-3.5 w-3.5" /> Publier {job.chapters.draftIds.length} chapitre{job.chapters.draftIds.length > 1 ? "s" : ""}
          </Button>
        )}
        {job.chapters.published > 0 && (
          <span className="text-xs text-foreground-subtle">
            {job.chapters.published}/{job.chapters.total} publié{job.chapters.published > 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          {active && (
            <>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(runMergeNow)} title="Relance le traitement tout de suite (il reprend aussi seul chaque minute)">
                <Play className="h-3.5 w-3.5" /> Relancer
              </Button>
              {/* A lot ends on its own; stopping is for the table of contents (it would give up the chapters not written yet). */}
              {!inLot && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelMerge(job.id))}>
                  <Square className="h-3.5 w-3.5" /> Arrêter
                </Button>
              )}
            </>
          )}
          {job.stage === "failed" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => retryMerge(job.id))}>
              <RotateCcw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => setConfirmDelete(true)} aria-label="Supprimer la notion">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {confirmDelete && (
        <Modal
          title="Supprimer cette notion ?"
          description="Le livre fusionné et ses fiches disparaissent. Les cartes qu'il remplaçait reviennent dans leurs livres d'origine, avec leur propre historique."
          onClose={() => setConfirmDelete(false)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  setConfirmDelete(false);
                  run(() => deleteMergedBook(job.bookId));
                }}
              >
                Supprimer
              </Button>
            </>
          }
        >
          <p className="text-sm text-foreground-muted">« {job.bookTitle} »</p>
        </Modal>
      )}
    </article>
  );
}

const STATE_LABEL: Record<MergeTocChapter["state"], { label: (lot: number) => string; variant: "neutral" | "accent" | "success" }> = {
  held: { label: () => "À rédiger", variant: "neutral" },
  writing: { label: (lot) => `Lot ${lot} en cours`, variant: "accent" },
  written: { label: (lot) => `Rédigé · lot ${lot}`, variant: "success" },
};

/**
 * The planned book, chapter by chapter, with the source fiches each merged
 * fiche fuses — to check that every fiche of the books is used, then choose
 * which chapters to write now (one lot) and leave the rest for later.
 */
function MergeTocPanel({ job, onChanged }: { job: MergeJobView; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(job.stage === "ready");
  const [toc, setToc] = useState<MergeToc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdded, setShowAdded] = useState(false);
  const [pending, startTransition] = useTransition();
  const canChoose = job.stage === "ready";

  // Reloaded whenever the fusion moves on (a lot starts or ends).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getMergeToc(job.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) setLoadError(result.error);
      else {
        setToc(result);
        setLoadError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, job.id, job.stage, job.round]);

  const chapters = useMemo(() => (toc ? toc.parts.flatMap((p) => p.subParts.flatMap((sp) => sp.chapters)) : []), [toc]);
  const held = chapters.filter((c) => c.state === "held");
  const written = chapters.filter((c) => c.state === "written").length;
  const chosen = held.filter((c) => selected.has(c.chapterId));
  const sumCost = (list: MergeTocChapter[]) => (list.some((c) => c.costUsd == null) ? null : list.reduce((s, c) => s + (c.costUsd ?? 0), 0));
  const chosenCost = sumCost(chosen);
  const leftCost = sumCost(held);

  function toggle(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function generate() {
    startTransition(async () => {
      const result = await generateMergeChapters(
        job.id,
        chosen.map((c) => c.chapterId)
      );
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Lot lancé.", { variant: "success" });
        setSelected(new Set());
      }
      await onChanged();
    });
  }

  return (
    <section className="mt-4 rounded-[var(--radius-md)] border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-muted/60"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1">Table des matières et chapitres à rédiger</span>
        {toc && (
          <span className="shrink-0 text-xs font-normal tabular-nums text-foreground-subtle">
            {written}/{chapters.length} rédigés
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-3">
          {loadError ? (
            <p className="text-sm text-danger">{loadError}</p>
          ) : !toc ? (
            <p className="text-sm text-foreground-subtle">Chargement…</p>
          ) : (
            <>
              <div className="space-y-1 text-xs">
                {toc.coverage.used === toc.coverage.sourceFiches ? (
                  <p className="flex items-start gap-1.5 text-success">
                    <Check className="mt-px h-3.5 w-3.5 shrink-0" /> Les {nf.format(toc.coverage.sourceFiches)} fiches des livres sont toutes utilisées.
                  </p>
                ) : (
                  <div className="text-accent">
                    <p>
                      {nf.format(toc.coverage.addedSinceCount)} fiche{toc.coverage.addedSinceCount > 1 ? "s" : ""} des livres ne figure
                      {toc.coverage.addedSinceCount > 1 ? "nt" : ""} pas dans cette table des matières (ajoutée{toc.coverage.addedSinceCount > 1 ? "s" : ""} depuis sa création) : elle
                      {toc.coverage.addedSinceCount > 1 ? "s" : ""} ne ser{toc.coverage.addedSinceCount > 1 ? "ont" : "a"} pas fusionnée{toc.coverage.addedSinceCount > 1 ? "s" : ""}.{" "}
                      <button type="button" className="underline" onClick={() => setShowAdded((v) => !v)}>
                        {showAdded ? "Masquer" : "Voir"}
                      </button>
                    </p>
                    {showAdded && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground-muted">
                        {toc.coverage.addedSince.map((f, i) => (
                          <li key={i}>
                            {shortBookTitle(f.book)} · {f.chapter} — {f.title}
                          </li>
                        ))}
                        {toc.coverage.addedSinceCount > toc.coverage.addedSince.length && <li>…</li>}
                      </ul>
                    )}
                  </div>
                )}
                {toc.coverage.goneSince > 0 && (
                  <p className="text-foreground-muted">
                    {nf.format(toc.coverage.goneSince)} fiche{toc.coverage.goneSince > 1 ? "s" : ""} source{toc.coverage.goneSince > 1 ? "s" : ""} supprimée
                    {toc.coverage.goneSince > 1 ? "s" : ""} depuis : simplement laissée{toc.coverage.goneSince > 1 ? "s" : ""} de côté à la rédaction.
                  </p>
                )}
              </div>

              {canChoose && held.length > 0 && (
                <div className="sticky top-0 z-10 -mx-3 mt-3 flex flex-wrap items-center gap-2 border-y border-border bg-surface px-3 py-2">
                  <Button size="sm" disabled={pending || chosen.length === 0} onClick={generate}>
                    <PenLine className="h-3.5 w-3.5" />
                    {pending
                      ? "Lancement…"
                      : chosen.length === 0
                        ? "Choisissez des chapitres"
                        : `Rédiger ${chosen.length} chapitre${chosen.length > 1 ? "s" : ""}${chosenCost != null ? ` · ≈ ${formatUsd(chosenCost)}` : ""}`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(held.map((c) => c.chapterId), chosen.length < held.length)}>
                    {chosen.length < held.length ? "Tout choisir" : "Tout retirer"}
                  </Button>
                  <span className="ml-auto text-xs tabular-nums text-foreground-subtle">
                    Reste {held.length} chapitre{held.length > 1 ? "s" : ""}
                    {leftCost != null && ` · ≈ ${formatUsd(leftCost)}`}
                  </span>
                </div>
              )}
              {!canChoose && held.length > 0 && job.stage !== "done" && (
                <p className="mt-3 text-xs text-foreground-muted">Lot {job.round} en cours : vous pourrez choisir les chapitres suivants quand il sera terminé.</p>
              )}

              <div className="mt-3 space-y-4">
                {toc.parts.map((part, pi) => {
                  const partHeld = part.subParts.flatMap((sp) => sp.chapters).filter((c) => c.state === "held");
                  const partAll = partHeld.length > 0 && partHeld.every((c) => selected.has(c.chapterId));
                  return (
                    <div key={pi}>
                      <div className="flex items-center gap-2">
                        {canChoose && partHeld.length > 0 && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0"
                            checked={partAll}
                            onChange={() => toggle(partHeld.map((c) => c.chapterId), !partAll)}
                            aria-label={`Choisir toute la partie ${part.title}`}
                          />
                        )}
                        <h3 className="font-serif-display text-base font-medium text-foreground">{part.title}</h3>
                      </div>
                      {part.subParts.map((sp, si) => (
                        <div key={si} className="mt-1.5">
                          {sp.title && <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{sp.title}</p>}
                          <ul className="space-y-1">
                            {sp.chapters.map((c) => {
                              const isOpen = expanded.has(c.chapterId);
                              const st = STATE_LABEL[c.state];
                              return (
                                <li key={c.chapterId} className="rounded-[var(--radius-sm)] border border-border/70">
                                  <div className="flex items-start gap-2 px-2.5 py-2">
                                    {canChoose && c.state === "held" ? (
                                      <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 shrink-0"
                                        checked={selected.has(c.chapterId)}
                                        onChange={(e) => toggle([c.chapterId], e.target.checked)}
                                        aria-label={`Choisir ${c.title}`}
                                      />
                                    ) : (
                                      <span className="w-4 shrink-0" />
                                    )}
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 text-left"
                                      onClick={() => setExpanded((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(c.chapterId)) next.delete(c.chapterId);
                                        else next.add(c.chapterId);
                                        return next;
                                      })}
                                      aria-expanded={isOpen}
                                    >
                                      <span className="block text-sm text-foreground">{c.title}</span>
                                      <span className="block text-xs tabular-nums text-foreground-subtle">
                                        {c.fiches.length} fiche{c.fiches.length > 1 ? "s" : ""} · {nf.format(c.fiches.reduce((n, f) => n + f.sources.length, 0))} source
                                        {c.fiches.reduce((n, f) => n + f.sources.length, 0) > 1 ? "s" : ""}
                                        {c.state === "held" && c.costUsd != null && ` · ≈ ${formatUsd(c.costUsd)}`}
                                      </span>
                                    </button>
                                    <Badge variant={st.variant} className="shrink-0">
                                      {st.label(c.lot)}
                                    </Badge>
                                  </div>
                                  {isOpen && (
                                    <ol className="space-y-1.5 border-t border-border/70 px-3 py-2 pl-9 text-xs">
                                      {c.fiches.map((f, fi) => (
                                        <li key={fi}>
                                          <p className="font-medium text-foreground">{f.title}</p>
                                          <ul className="mt-0.5 space-y-0.5 text-foreground-muted">
                                            {f.sources.map((src, k) => (
                                              <li key={k}>
                                                <span className="text-foreground-subtle">{shortBookTitle(src.book)} ·</span> {src.title}
                                              </li>
                                            ))}
                                          </ul>
                                        </li>
                                      ))}
                                    </ol>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{label}</dt>
      <dd className="tabular-nums text-foreground">{value != null ? nf.format(value) : "—"}</dd>
    </div>
  );
}

/** The books and AI choices are only needed to create a notion: the list of fusions never waits for them. */
function CreateMergeModalLoader({ setupPromise, onClose, onStarted }: { setupPromise: Promise<MergeSetupData | null>; onClose: () => void; onStarted: () => Promise<void> }) {
  const setup = use(setupPromise);
  if (!setup)
    return (
      <Modal title="Nouvelle notion" onClose={onClose} size="lg">
        <p className="text-sm text-danger">Les livres n&apos;ont pas pu être chargés. Rechargez la page pour réessayer.</p>
      </Modal>
    );
  return <CreateMergeModal setup={setup} onClose={onClose} onStarted={onStarted} />;
}

function CreateMergeModal({ setup, onClose, onStarted }: { setup: MergeSetupData; onClose: () => void; onStarted: () => Promise<void> }) {
  const { toast } = useToast();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const defaultProvider: MergeProvider = setup.defaultProvider === "claude" ? (setup.hasClaudeKey ? "claude" : "gemini") : setup.hasGeminiKey ? "gemini" : "claude";
  const [provider, setProvider] = useState<MergeProvider>(defaultProvider);
  const [model, setModel] = useState(defaultProvider === "claude" ? setup.claudeModel : (setup.geminiModels[0] ?? ""));
  const [estimate, setEstimate] = useState<MergeEstimateResult | null>(null);
  const [estimating, startEstimate] = useTransition();
  const [starting, startStart] = useTransition();

  const key = useMemo(() => JSON.stringify([selected, includeDrafts, provider, model]), [selected, includeDrafts, provider, model]);
  useEffect(() => {
    if (selected.length === 0 || !model.trim()) return;
    const id = setTimeout(() => {
      startEstimate(async () => {
        const result = await estimateMergeAction({ bookIds: selected, includeDrafts, provider, model });
        setEstimate("error" in result ? null : result);
      });
    }, 500);
    return () => clearTimeout(id);
    // `key` sums up every input of the estimate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function toggleBook(id: string) {
    setEstimate(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  function chooseProvider(next: MergeProvider) {
    setProvider(next);
    setModel(next === "claude" ? setup.claudeModel : (setup.geminiModels[0] ?? ""));
    setEstimate(null);
  }

  // The title field sits at the top of the window, often scrolled out of sight on a phone: say what's missing instead of a greyed-out button.
  const titleRef = useRef<HTMLInputElement>(null);
  const [titleMissing, setTitleMissing] = useState(false);

  function handleStart() {
    if (!title.trim()) {
      setTitleMissing(true);
      titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleRef.current?.focus();
      return;
    }
    if (!model.trim()) {
      toast("Choisissez un modèle.", { variant: "error" });
      return;
    }
    startStart(async () => {
      const result = await startMerge({ title, bookIds: selected, includeDrafts, provider, model });
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      toast(result.success ?? "Fusion lancée.", { variant: "success" });
      onClose();
      await onStarted();
      router.refresh();
    });
  }

  const selectable = setup.books.filter((b) => b.fiches > 0);
  return (
    <Modal
      title="Nouvelle notion"
      description="Choisissez les livres à fusionner. La table des matières est établie d'abord (chaque fiche des livres y trouve sa place) ; vous choisirez ensuite quels chapitres rédiger, et quand."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleStart} disabled={starting || selected.length === 0}>
            <ListTree className="h-4 w-4" /> {starting ? "Lancement…" : "Établir la table des matières"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="merge-title">Titre</Label>
          <Input
            id="merge-title"
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) setTitleMissing(false);
            }}
            placeholder="Ex. Anesthésie-réanimation — référentiel"
            aria-invalid={titleMissing}
            aria-describedby={titleMissing ? "merge-title-missing" : undefined}
          />
          {titleMissing && (
            <p id="merge-title-missing" className="text-xs text-danger">
              Donnez un titre à la notion pour l&apos;établir.
            </p>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground-muted">Livres à fusionner</legend>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-border p-1">
            {selectable.map((book) => {
              const checked = selected.includes(book.id);
              return (
                <li key={book.id}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 ${checked ? "bg-primary-tint/50" : "hover:bg-surface-muted"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBook(book.id)} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{book.title}</span>
                      <span className="block text-xs text-foreground-subtle">
                        {[book.author, book.edition].filter(Boolean).join(" — ")}
                        {(book.author || book.edition) && " · "}
                        {nf.format(book.fiches)} fiches ({nf.format(book.publishedFiches)} publiées)
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {selectable.length === 0 && <li className="px-2.5 py-2 text-sm text-foreground-subtle">Aucun livre avec des fiches pour l&apos;instant.</li>}
          </ul>
        </fieldset>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground-muted">Inclure les fiches pas encore publiées</p>
            <p className="text-xs text-foreground-subtle">Sinon, seules les fiches déjà relues et publiées sont fusionnées.</p>
          </div>
          <Switch
            checked={includeDrafts}
            onCheckedChange={(v) => {
              setIncludeDrafts(v);
              setEstimate(null);
            }}
            aria-label="Inclure les fiches en brouillon"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground-muted">IA</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                { id: "gemini", label: "Gemini", detail: "Côté serveur, plusieurs fiches à la fois. Le plus rapide.", ok: setup.hasGeminiKey },
                { id: "claude", label: "Claude", detail: "En lots, moitié prix. Chaque étape peut prendre de quelques minutes à quelques heures.", ok: setup.hasClaudeKey },
              ] as const
            ).map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border p-3 ${provider === p.id ? "border-primary bg-primary-tint/40" : "border-border"} ${p.ok ? "" : "cursor-not-allowed opacity-50"}`}
              >
                <input type="radio" name="merge-provider" checked={provider === p.id} disabled={!p.ok} onChange={() => chooseProvider(p.id)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium text-foreground">{p.label}</span>
                  <span className="block text-xs text-foreground-subtle">{p.ok ? p.detail : "Clé API non configurée (Réglages IA)."}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="merge-model">Modèle</Label>
            <Input id="merge-model" list="merge-models" value={model} onChange={(e) => setModel(e.target.value)} />
            <datalist id="merge-models">
              {(provider === "claude" ? [setup.claudeModel, "claude-opus-5", "claude-sonnet-5"] : [...setup.geminiModels, "gemini-pro-latest", "gemini-flash-latest"])
                .filter((m, i, all) => m && all.indexOf(m) === i)
                .map((m) => (
                  <option key={m} value={m} />
                ))}
            </datalist>
          </div>
        </fieldset>

        <div className="rounded-[var(--radius-md)] border border-border bg-surface-muted/60 p-3 text-sm" aria-live="polite">
          {selected.length === 0 ? (
            <p className="text-foreground-subtle">Choisissez des livres pour voir l&apos;estimation.</p>
          ) : estimating || !estimate ? (
            <p className="text-foreground-subtle">Estimation…</p>
          ) : (
            <>
              {estimate.costUsd != null && estimate.tocCostUsd != null ? (
                <>
                  <p className="font-medium text-foreground">
                    Table des matières ≈ {formatUsd(estimate.tocCostUsd)}
                    <span className="font-normal text-foreground-subtle"> — maintenant</span>
                  </p>
                  <p className="text-foreground-muted">
                    Rédaction de tous les chapitres ≈ {formatUsd(Math.max(0, estimate.costUsd - estimate.tocCostUsd))}, à lancer chapitre par chapitre, quand vous voulez.
                  </p>
                  <p className="text-xs text-foreground-subtle">Estimations au tarif payant{provider === "claude" ? " des lots" : ""}.</p>
                </>
              ) : (
                <p className="font-medium text-foreground">Coût non estimable pour ce modèle</p>
              )}
              <p className="mt-1 tabular-nums text-foreground-muted">
                {nf.format(estimate.sourceFiches)} fiches sources ({nf.format(estimate.sourceBlocks)} blocs, {nf.format(estimate.sourceCards)} cartes) → environ{" "}
                {nf.format(estimate.chapters)} chapitres et {nf.format(estimate.mergedFiches)} fiches fusionnées ; {nf.format(estimate.requests)} requêtes,{" "}
                {nf.format(Math.round(estimate.inputTokens / 1000))} k jetons lus et {nf.format(Math.round(estimate.outputTokens / 1000))} k écrits.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
