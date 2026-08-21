"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tag, ShieldAlert, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import {
  categorizeChapterNotions,
  detectContradictionsForNotion,
  resolveContradiction,
  dismissContradiction,
} from "@/app/apps/el-profesor/actions/notions";
import { useToast } from "@/components/ui/toast";
import type { NotionSummary, Contradiction } from "@/lib/el-profesor/types";

function FicheRef({ fiche }: { fiche: { ficheTitle: string; chapterTitle: string; bookTitle: string; chapterId: string } }) {
  return (
    <Link href={`/apps/el-profesor/chapters/${fiche.chapterId}`} className="hover:underline">
      <span className="font-medium text-foreground">{fiche.ficheTitle}</span>{" "}
      <span className="text-foreground-subtle">
        — {fiche.bookTitle} / {fiche.chapterTitle}
      </span>
    </Link>
  );
}

function ContradictionCard({ contradiction, onChanged }: { contradiction: Contradiction; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveContradiction(contradiction.id, note);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissContradiction(contradiction.id);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-tint/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 text-sm">
          <FicheRef fiche={contradiction.ficheA} />
          <p className="text-xs text-foreground-subtle">contre</p>
          <FicheRef fiche={contradiction.ficheB} />
        </div>
        {contradiction.notionName && <Badge variant="neutral">{contradiction.notionName}</Badge>}
      </div>
      <p className="mt-3 text-sm text-foreground">{contradiction.explanation}</p>

      {contradiction.status === "pending" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note de résolution (optionnel — ex. quelle version est correcte)"
            className="min-w-[220px] flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <Button size="sm" onClick={handleResolve} disabled={isPending}>
            <Check className="h-3.5 w-3.5" /> Résolu
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isPending}>
            <X className="h-3.5 w-3.5" /> Ignorer
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-foreground-subtle">
          {contradiction.status === "resolved" ? "Résolue" : "Ignorée"}
          {contradiction.resolutionNote && ` — ${contradiction.resolutionNote}`}
        </p>
      )}
    </div>
  );
}

export function NotionsView({
  chapters,
  notionSummaries,
  contradictions,
}: {
  chapters: { id: string; title: string; bookTitle: string }[];
  notionSummaries: NotionSummary[];
  contradictions: Contradiction[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isCategorizing, startCategorizing] = useTransition();
  const [isDetecting, startDetecting] = useTransition();
  const [selectedChapterId, setSelectedChapterId] = useState(chapters[0]?.id ?? "");
  const [detectingNotionId, setDetectingNotionId] = useState<string | null>(null);

  function handleCategorize() {
    if (!selectedChapterId) return;
    startCategorizing(async () => {
      const result = await categorizeChapterNotions(selectedChapterId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function handleDetect(notionId: string) {
    setDetectingNotionId(notionId);
    startDetecting(async () => {
      const result = await detectContradictionsForNotion(notionId);
      setDetectingNotionId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function refresh() {
    router.refresh();
  }

  const pending = contradictions.filter((c) => c.status === "pending");
  const resolved = contradictions.filter((c) => c.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <h1 className="font-serif-display text-2xl font-medium text-foreground">Notions &amp; contradictions</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Catégorise le contenu par notions transversales, puis compare entre eux les passages qui partagent une notion — utile pour
        repérer des livres qui se contredisent sur un point de fait.
      </p>

      <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Tag className="h-4 w-4" /> Catégoriser un chapitre
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={selectedChapterId} onChange={(e) => setSelectedChapterId(e.target.value)} className="max-w-xs">
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.bookTitle} — {c.title}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={handleCategorize} disabled={isCategorizing || !selectedChapterId}>
            {isCategorizing ? "Analyse…" : "Catégoriser"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-foreground-subtle">
          Appelle Gemini une fois par fiche publiée du chapitre — à faire chapitre par chapitre plutôt que d&apos;un coup, pour garder
          le coût prévisible.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ShieldAlert className="h-4 w-4 text-danger" /> Contradictions à arbitrer ({pending.length})
          </p>
          <div className="space-y-3">
            {pending.map((c) => (
              <ContradictionCard key={c.id} contradiction={c} onChanged={refresh} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <p className="mb-2 text-sm font-medium text-foreground">Notions ({notionSummaries.length})</p>
        {notionSummaries.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Aucune notion pour l&apos;instant — catégorisez un premier chapitre ci-dessus.</p>
        ) : (
          <div className="space-y-3">
            {notionSummaries.map(({ notion, fiches }) => {
              const distinctBooks = new Set(fiches.map((f) => f.bookId)).size;
              return (
                <div key={notion.id} className="rounded-[var(--radius-md)] border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{notion.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">
                        {fiches.length} fiche{fiches.length > 1 ? "s" : ""}
                        {distinctBooks > 1 ? ` · ${distinctBooks} livres` : ""}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDetect(notion.id)}
                        disabled={isDetecting || fiches.length < 2}
                        title={fiches.length < 2 ? "Il faut au moins 2 fiches liées" : "Compare chaque paire de fiches liées à cette notion"}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {isDetecting && detectingNotionId === notion.id ? "Analyse…" : "Détecter les contradictions"}
                      </Button>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs text-foreground-subtle">
                    {fiches.map((f) => (
                      <li key={f.ficheId}>
                        <FicheRef fiche={f} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium text-foreground-subtle">Historique traité ({resolved.length})</summary>
          <div className="mt-3 space-y-3">
            {resolved.map((c) => (
              <ContradictionCard key={c.id} contradiction={c} onChanged={refresh} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
