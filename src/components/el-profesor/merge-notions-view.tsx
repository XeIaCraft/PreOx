"use client";

import { use, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Check, Combine, History, ListTree, Play, RotateCcw, Square, Trash2 } from "lucide-react";
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
  getMergeJobs,
  retryMerge,
  runMergeNow,
  startMerge,
  type MergeEstimateResult,
  type MergeJobView,
  type MergeSetupData,
} from "@/app/apps/el-profesor/actions/merge";
import { bulkPublishChapters } from "@/app/apps/el-profesor/actions/extraction";
import { formatUsd, estimateCostUsd } from "@/lib/el-profesor/ai-pricing";
import type { MergeProvider } from "@/lib/el-profesor/merge/types";

const STAGES = [
  { key: "plan", label: "Table des matières", hint: "Parties et sous-parties, du fondamental vers l'appliqué." },
  { key: "assign", label: "Répartition", hint: "Chaque fiche source rejoint sa sous-partie." },
  { key: "chapters", label: "Chapitres et fiches", hint: "Chaque sous-partie organisée en chapitres et en fiches, dans l'ordre d'apprentissage." },
  { key: "fiches", label: "Fusion des fiches", hint: "Rédaction sans perte, divergences citées, « À retenir », cartes fusionnées." },
  { key: "repair", label: "Contrôle de couverture", hint: "Blocs, cartes et valeurs chiffrées non repris : réintégrés." },
] as const;

const ENDED_LABEL: Record<string, { label: string; variant: "success" | "danger" | "neutral" }> = {
  done: { label: "Terminée", variant: "success" },
  failed: { label: "Échec", variant: "danger" },
  canceled: { label: "Arrêtée", variant: "neutral" },
};

const nf = new Intl.NumberFormat("fr-BE");

function isActive(job: MergeJobView) {
  return STAGES.some((s) => s.key === job.stage);
}

export function MergeNotionsView({ setupPromise, jobsPromise }: { setupPromise: Promise<MergeSetupData>; jobsPromise: Promise<MergeJobView[]> }) {
  const setup = use(setupPromise);
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

      {creating && <CreateMergeModal setup={setup} onClose={() => setCreating(false)} onStarted={refresh} />}
    </div>
  );
}

function MergeJobCard({ job, onChanged }: { job: MergeJobView; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = isActive(job);
  const stageIndex = STAGES.findIndex((s) => s.key === job.stage);
  const p = job.progress;
  const stageTotal = p.waiting + p.running + p.submitted + p.done + p.failed;
  const stageDone = p.done + p.failed;
  const overall = job.stage === "done" ? 1 : stageIndex < 0 ? 0 : (stageIndex + (stageTotal ? stageDone / stageTotal : 0)) / STAGES.length;
  const s = job.stats;
  const cost = s.inputTokens ? estimateCostUsd(job.provider === "claude" ? `claude:${job.model}` : job.model, s.inputTokens, s.outputTokens ?? 0) : null;

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
            {cost != null && ` · ≈ ${formatUsd(cost)} jusqu'ici`}
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
          <ol className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-5">
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
          <Stat label="Divergences citées" value={s.divergences} />
        </dl>
      )}
      {job.stage === "done" && (
        <p className="mt-3 text-xs text-foreground-muted">
          Contrôle de couverture : {nf.format(s.fichesRepaired ?? 0)} fiche(s) complétée(s) au rattrapage (bloc, carte ou valeur chiffrée oubliés, « À retenir » manquant).
          {((s.blocksKeptVerbatim ?? 0) > 0 || (s.cardsKeptVerbatim ?? 0) > 0 || (s.fichesFailed ?? 0) > 0) &&
            ` En dernier recours, ${nf.format(s.blocksKeptVerbatim ?? 0)} bloc(s) et ${nf.format(s.cardsKeptVerbatim ?? 0)} carte(s) ont été ajoutés tels quels${
              (s.fichesFailed ?? 0) > 0 ? `, et ${s.fichesFailed} fiche(s) non fusionnée(s) gardent leurs sources` : ""
            } — marqués « à vérifier ».`}
          {(s.fichesSplit ?? 0) > 0 && ` ${s.fichesSplit} sujet(s) trop longs pour une seule fiche ont été répartis sur plusieurs fiches.`}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {job.chapters.total > 0 && (
          <Link href={`/apps/el-profesor/books/${job.bookId}`} prefetch={false}>
            <Button size="sm" variant="secondary">
              <ListTree className="h-3.5 w-3.5" /> Table des matières
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
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelMerge(job.id))}>
                <Square className="h-3.5 w-3.5" /> Arrêter
              </Button>
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

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{label}</dt>
      <dd className="tabular-nums text-foreground">{value != null ? nf.format(value) : "—"}</dd>
    </div>
  );
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

  function handleStart() {
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
      description="Choisissez les livres à fusionner : leurs fiches seront réorganisées en une nouvelle table des matières, puis fusionnées sujet par sujet."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleStart} disabled={starting || selected.length === 0 || !title.trim() || !model.trim()}>
            <Combine className="h-4 w-4" /> {starting ? "Lancement…" : "Lancer la fusion"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="merge-title">Titre</Label>
          <Input id="merge-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Anesthésie-réanimation — référentiel" />
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
              <p className="font-medium text-foreground">
                {estimate.costUsd != null ? `≈ ${formatUsd(estimate.costUsd)}` : "Coût non estimable pour ce modèle"}
                <span className="font-normal text-foreground-subtle"> — estimation, au tarif payant{provider === "claude" ? " des lots" : ""}</span>
              </p>
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
