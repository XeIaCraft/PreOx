"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Search,
  GraduationCap,
  ExternalLink,
  Landmark,
  Calculator,
  TriangleAlert,
  NotebookPen,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RenameFicheButton } from "@/components/el-profesor/inline-rename-fiche";
import { MergeFichesForm } from "@/components/el-profesor/merge-fiches-form";
import { moveNotion, moveNotionFiche } from "@/app/apps/el-profesor/actions/notions";
import { useToast } from "@/components/ui/toast";
import type { NotionSummary, NotionRecommendation, DoseCalculator as DoseCalculatorEntry } from "@/lib/el-profesor/types";
import type { NotionReadiness } from "@/lib/el-profesor/dal";

// Notion cards can list many fiches (a well-covered notion easily reaches
// a dozen) — collapsed to this many by default so the "Par notion" view
// stays scannable, with a "+N de plus" toggle for the rest (requested
// 2026-08-26 alongside the density complaints on this exact screen).
const COLLAPSED_FICHE_COUNT = 4;

/** Piste 2026-08-24 ("estimation de préparation par notion") — color + label for a readiness percentage, same three-tier read as the rest of the app's progress indicators. */
function readinessTier(pct: number): { badgeClassName: string; barClassName: string; label: string } {
  if (pct >= 80) return { badgeClassName: "bg-success/15 text-success", barClassName: "bg-success", label: "Prêt" };
  if (pct >= 40) return { badgeClassName: "bg-accent/15 text-accent", barClassName: "bg-accent", label: "À consolider" };
  return { badgeClassName: "bg-danger/15 text-danger", barClassName: "bg-danger", label: "Fragile" };
}

function formatDoseValue(v: number): string {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

/**
 * Piste 2026-08-24 ("calculateur de doses contextuel") — the only
 * computation here is `min(dosePerKg * weightKg, maxDose)`, entirely
 * client-side on admin-authored numbers. The disclaimer is not optional
 * decoration: this is the single most safety-sensitive widget in the
 * module, so it stays visible whenever a computed value is shown.
 */
function DoseCalculatorSection({ calculators }: { calculators: DoseCalculatorEntry[] }) {
  const [weight, setWeight] = useState("");
  const weightKg = Number(weight);
  const validWeight = weight.trim() !== "" && Number.isFinite(weightKg) && weightKg > 0;

  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
        <Calculator className="h-3 w-3" /> Calculateur de dose
      </p>
      <label className="mt-1.5 flex items-center gap-2 text-xs text-foreground-subtle">
        Poids du patient (kg)
        <input
          type="number"
          min={0}
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="ex. 15"
          className="w-20 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </label>
      <ul className="mt-2 space-y-1.5">
        {calculators.map((c) => {
          const raw = validWeight ? c.dosePerKg * weightKg : null;
          const capped = raw != null && c.maxDose != null ? Math.min(raw, c.maxDose) : raw;
          const wasCapped = raw != null && c.maxDose != null && raw > c.maxDose;
          return (
            <li key={c.id} className="rounded-[var(--radius-sm)] bg-surface-muted/50 p-2 text-xs">
              <p className="font-medium text-foreground">{c.label}</p>
              <p className="text-foreground-subtle">
                {c.dosePerKg} {c.doseUnit}/kg
                {c.maxDose != null ? ` (max ${c.maxDose} ${c.doseUnit})` : ""}
                {c.frequency ? ` — ${c.frequency}` : ""}
              </p>
              {capped != null && (
                <p className="mt-1 font-medium text-primary-strong">
                  ≈ {formatDoseValue(capped)} {c.doseUnit}
                  {wasCapped ? " (plafonné)" : ""}
                </p>
              )}
              {c.note && <p className="mt-0.5 text-foreground-subtle">{c.note}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-start gap-1 text-[11px] font-medium text-danger">
        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
        Outil de calcul, pas un avis médical — vérifiez systématiquement la posologie auprès d&apos;une source de référence à jour avant
        toute administration.
      </p>
    </div>
  );
}

/**
 * The per-notion card list — extracted (2026-08-25) so the same rendering
 * can be reused both on the standalone /glossary page and as the "Par
 * notion" grouping on the main dashboard (see DashboardNotionView), instead
 * of duplicating this ~90-line block.
 */
/** One notion's fiche listing, with the collapse-past-N behavior and (admin-only) rename/reorder/merge controls. Extracted so hooks (useState for the collapse toggle) stay valid despite the outer list being a .map(). */
function NotionFicheList({ notionId, fiches, isAdmin, onChanged }: { notionId: string; fiches: NotionSummary["fiches"]; isAdmin: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? fiches : fiches.slice(0, COLLAPSED_FICHE_COUNT);
  const hiddenCount = fiches.length - visible.length;

  function handleMove(ficheId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveNotionFiche(notionId, ficheId, direction);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  return (
    <>
      <ul className="mt-2 space-y-1 text-xs text-foreground-subtle">
        {visible.map((f, i) => (
          <li key={f.ficheId} className="flex items-center gap-1.5">
            {isAdmin && (
              <span className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => handleMove(f.ficheId, "up")}
                  disabled={isPending || i === 0}
                  aria-label="Monter cette fiche"
                  className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(f.ficheId, "down")}
                  disabled={isPending || i === visible.length - 1}
                  aria-label="Descendre cette fiche"
                  className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </span>
            )}
            <Link href={`/apps/el-profesor/chapters/${f.chapterId}`} className="inline-flex min-w-0 items-center gap-1 hover:underline">
              <BookOpen className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium text-foreground">{f.ficheTitle}</span>
              <span className="shrink-0">
                — {f.bookTitle} / {f.chapterTitle}
              </span>
            </Link>
            {isAdmin && <RenameFicheButton ficheId={f.ficheId} currentTitle={f.ficheTitle} onRenamed={onChanged} />}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1.5 flex items-center gap-1 text-xs text-primary-strong hover:underline"
        >
          <ChevronsUpDown className="h-3 w-3" /> +{hiddenCount} de plus
        </button>
      )}
      {isAdmin && fiches.length >= 2 && <MergeFichesForm fiches={fiches} onChanged={onChanged} />}
    </>
  );
}

export function NotionList({
  notions,
  readiness,
  recommendations,
  doseCalculators,
  caseCounts,
  isAdmin = false,
}: {
  notions: NotionSummary[];
  readiness: Record<string, NotionReadiness>;
  recommendations: Record<string, NotionRecommendation[]>;
  doseCalculators: Record<string, DoseCalculatorEntry[]>;
  caseCounts: Record<string, number>;
  /** Rename/reorder/merge controls only make sense for admins — everyone else sees the plain read-only listing. */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  function refresh() {
    router.refresh();
  }

  function handleMoveNotion(notionId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveNotion(notionId, direction);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  return (
    <div className="space-y-3">
      {notions.map(({ notion, fiches }, i) => {
        const distinctBooks = new Set(fiches.map((f) => f.bookId)).size;
        const r = readiness[notion.id];
        const tier = r && r.total > 0 ? readinessTier(r.readinessPct) : null;
        const notionRecommendations = recommendations[notion.id] ?? [];
        const notionDoseCalculators = doseCalculators[notion.id] ?? [];
        return (
          <div key={notion.id} id={`notion-${notion.id}`} className="rounded-[var(--radius-md)] border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => handleMoveNotion(notion.id, "up")}
                      disabled={i === 0}
                      aria-label="Monter cette notion"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveNotion(notion.id, "down")}
                      disabled={i === notions.length - 1}
                      aria-label="Descendre cette notion"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <p className="font-medium text-foreground">{notion.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="neutral">
                  {fiches.length} fiche{fiches.length > 1 ? "s" : ""}
                  {distinctBooks > 1 ? ` · ${distinctBooks} livres` : ""}
                </Badge>
                {tier && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tier.badgeClassName}`}
                    title={`Préparation estimée : ${r.acquired}/${r.total} flashcards maîtrisées sur les fiches de cette notion.`}
                  >
                    {tier.label} · {r.readinessPct}%
                  </span>
                )}
                <Link
                  href={`/apps/el-profesor/review?mode=theme&notionId=${notion.id}&name=${encodeURIComponent(notion.name)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-tint px-2.5 py-1 text-xs font-medium text-primary-strong hover:bg-primary-tint/70"
                >
                  <GraduationCap className="h-3.5 w-3.5" /> Réviser ce thème
                </Link>
                <Link
                  href={`/apps/el-profesor/journal?notionId=${notion.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-foreground-subtle hover:text-foreground"
                  title="Mon journal de cas pour cette notion"
                >
                  <NotebookPen className="h-3.5 w-3.5" /> {caseCounts[notion.id] ? `${caseCounts[notion.id]} cas` : "Cas"}
                </Link>
              </div>
            </div>
            {r && r.total > 0 && tier && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted">
                <div className={`h-full rounded-full ${tier.barClassName}`} style={{ width: `${r.readinessPct}%` }} />
              </div>
            )}
            <NotionFicheList notionId={notion.id} fiches={fiches} isAdmin={isAdmin} onChanged={refresh} />
            {notionRecommendations.length > 0 && (
              <div className="mt-3 border-t border-border pt-2">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                  <Landmark className="h-3 w-3" /> Recommandations officielles
                </p>
                <ul className="mt-1 space-y-1">
                  {notionRecommendations.map((rec) => (
                    <li key={rec.id}>
                      <a
                        href={rec.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-1 text-xs text-primary-strong hover:underline"
                      >
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          {rec.title}
                          {rec.source ? <span className="text-foreground-subtle"> — {rec.source}</span> : null}
                        </span>
                      </a>
                      {rec.note && <p className="ml-4 text-[11px] text-foreground-subtle">{rec.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notionDoseCalculators.length > 0 && <DoseCalculatorSection calculators={notionDoseCalculators} />}
          </div>
        );
      })}
    </div>
  );
}

export function GlossaryView({
  notions,
  readiness,
  recommendations,
  doseCalculators,
  caseCounts,
  isAdmin = false,
}: {
  notions: NotionSummary[];
  readiness: Record<string, NotionReadiness>;
  recommendations: Record<string, NotionRecommendation[]>;
  doseCalculators: Record<string, DoseCalculatorEntry[]>;
  caseCounts: Record<string, number>;
  isAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notions;
    return notions.filter(
      ({ notion, fiches }) =>
        notion.name.toLowerCase().includes(q) || fiches.some((f) => f.ficheTitle.toLowerCase().includes(q))
    );
  }, [notions, query]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <h1 className="font-serif-display text-2xl font-medium text-foreground">Glossaire</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Les notions transversales repérées à travers les livres, avec les fiches où chacune est traitée.
      </p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une notion ou une fiche…"
          className="w-full rounded-[var(--radius-md)] border border-border bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      {notions.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-subtle">Aucune notion transversale pour l&apos;instant.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-subtle">Aucun résultat pour « {query} ».</p>
      ) : (
        <div className="mt-6">
          <NotionList notions={filtered} readiness={readiness} recommendations={recommendations} doseCalculators={doseCalculators} caseCounts={caseCounts} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}
