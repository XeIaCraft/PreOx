"use client";

import { use, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ShieldAlert, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LearningWidgets, DailyCard, BookmarksList, OnThisDayNoteCard, BookRecommendationCard, DueBlocksWidget } from "@/components/el-profesor/learning-widgets";
import { suggestLeechVariant } from "@/app/apps/el-profesor/actions/leech";
import type { LeechFlashcardStat } from "@/lib/el-profesor/dal";
import type { BlockType } from "@/lib/el-profesor/types";
import type { DashboardSecondaryData } from "@/lib/el-profesor/dashboard-types";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  definition_mecanisme: "Définition / mécanisme",
  valeurs_seuils: "Valeurs & seuils",
  tableau_comparatif: "Tableau comparatif",
  protocole_paliers: "Protocole",
  mnemotechnique: "Mnémotechnique",
  perle_clinique: "Perle clinique",
  piege_erreur: "Piège fréquent",
  formule: "Formule",
  texte_libre: "Note",
};

export function DashboardWidgetsSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden="true">
      <div className="h-20 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
      <div className="h-32 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
    </div>
  );
}

export function DashboardSecondaryWidgets({
  dataPromise,
  totalAcquired,
  chaptersMastered,
  isAdmin,
}: {
  dataPromise: Promise<DashboardSecondaryData>;
  totalAcquired: number;
  chaptersMastered: number;
  isAdmin: boolean;
}) {
  const data = use(dataPromise);
  const router = useRouter();
  const { toast } = useToast();
  const [pendingLeechId, setPendingLeechId] = useState<string | null>(null);
  const [isLeechPending, startLeechTransition] = useTransition();

  function handleSuggestLeechVariant(stat: LeechFlashcardStat) {
    setPendingLeechId(stat.flashcardId);
    startLeechTransition(async () => {
      const result = await suggestLeechVariant(stat.flashcardId, stat.subEntityName, stat.againRate);
      setPendingLeechId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.suggestion ? `Variante ajoutée : « ${result.suggestion} »` : (result.success ?? "Variante ajoutée."), { variant: "success" });
        router.refresh();
      }
    });
  }

  return (
    <>
      {data.dailyCard && <DailyCard card={data.dailyCard} />}
      {data.onThisDayNote && <OnThisDayNoteCard note={data.onThisDayNote} />}
      {data.bookRecommendation && <BookRecommendationCard recommendation={data.bookRecommendation} />}

      <BookmarksList bookmarks={data.bookmarks} />
      <DueBlocksWidget blocks={data.dueBlocks} />

      <LearningWidgets
        activity={data.activity}
        overconfidentMissCount={data.overconfidentMissCount}
        forecast={data.forecast}
        globalDueCount={data.globalDueCount}
        difficultCount={data.difficultCount}
        totalAcquired={totalAcquired}
        chaptersMastered={chaptersMastered}
        reviewTimeStats={data.reviewTimeStats}
      />

      {data.globalDueCount >= 50 && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3">
          <p className="text-sm text-danger">
            {data.globalDueCount} cartes en attente de révision — la pile s&apos;accumule, un rattrapage s&apos;impose.
          </p>
          <Link href="/apps/el-profesor/review?mode=due">
            <Button size="sm" variant="secondary">
              Rattraper
            </Button>
          </Link>
        </div>
      )}

      {data.knowledgeExpiryAlerts.length > 0 && (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <AlertTriangle className="h-4 w-4" /> Connaissances probablement périmées
          </p>
          <p className="mt-0.5 text-xs text-danger/80">
            Ces chapitres étaient maîtrisés mais n&apos;ont pas été revus depuis longtemps après leur échéance — le risque d&apos;oubli
            y est élevé, une révision dédiée vaut mieux qu&apos;une simple mise à jour.
          </p>
          <ul className="mt-2 space-y-1.5">
            {data.knowledgeExpiryAlerts.slice(0, 5).map((alert) => (
              <li key={alert.chapterId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-foreground-muted">
                  <span className="font-medium text-foreground">{alert.chapterTitle}</span> — {alert.bookTitle} · {alert.expiredCount} carte
                  {alert.expiredCount > 1 ? "s" : ""} en retard de {alert.oldestOverdueDays}+ jours
                </span>
                <Link href={`/apps/el-profesor/chapters/${alert.chapterId}/review?mode=due`}>
                  <Button size="sm" variant="secondary">
                    Rafraîchir
                  </Button>
                </Link>
              </li>
            ))}
            {data.knowledgeExpiryAlerts.length > 5 && (
              <li className="text-xs text-danger/80">+ {data.knowledgeExpiryAlerts.length - 5} autre(s) chapitre(s)</li>
            )}
          </ul>
        </div>
      )}

      {isAdmin &&
        (data.mostDifficultGlobal.length > 0 || data.leechFlashcards.length > 0 || data.flagStatsByBlockType.length > 0 || data.staleChapters.length > 0) && (
          <details className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
              <ShieldAlert className="h-3.5 w-3.5" /> Diagnostics de contenu (admin)
            </summary>
            <div className="mt-3 space-y-4">
              {data.mostDifficultGlobal.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground-subtle">Flashcards les plus ratées (tous utilisateurs)</p>
                  <ul className="mt-2 space-y-1.5">
                    {data.mostDifficultGlobal.slice(0, 5).map((stat) => (
                      <li key={stat.flashcardId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-foreground-muted" title={stat.front}>
                          {stat.front}
                          {stat.chapterTitle && <span className="text-foreground-subtle"> — {stat.chapterTitle}</span>}
                        </span>
                        <Badge variant="danger" className="shrink-0">
                          {stat.againCount}×
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.leechFlashcards.length > 0 && (
                <div>
                  <p
                    className="text-xs font-medium text-foreground-subtle"
                    title="Ratée par une forte proportion des utilisateurs qui l'ont vue — souvent une question mal formulée plutôt qu'une vraie difficulté"
                  >
                    Cartes sangsues (échec fréquent, probablement mal formulées)
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {data.leechFlashcards.slice(0, 5).map((stat) => (
                      <li key={stat.flashcardId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-foreground-muted" title={stat.front}>
                          {stat.front}
                          {stat.chapterTitle && <span className="text-foreground-subtle"> — {stat.chapterTitle}</span>}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="danger">{Math.round(stat.againRate * 100)} %</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSuggestLeechVariant(stat)}
                            disabled={isLeechPending && pendingLeechId === stat.flashcardId}
                            title="Génère une reformulation de la question via IA et l'ajoute comme variante à tester (item « Test de formulations »)"
                          >
                            <Sparkles className="h-3.5 w-3.5" /> {isLeechPending && pendingLeechId === stat.flashcardId ? "…" : "Reformuler"}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.flagStatsByBlockType.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground-subtle">Signalements par type de bloc</p>
                  <ul className="mt-2 space-y-1.5">
                    {data.flagStatsByBlockType.map((stat) => (
                      <li key={stat.blockType} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-foreground-muted">{BLOCK_TYPE_LABELS[stat.blockType]}</span>
                        <Badge variant="danger" className="shrink-0">
                          {stat.flagCount}×
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.staleChapters.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-accent">Chapitres jamais révisés récemment</p>
                  <ul className="mt-2 space-y-1 text-sm text-foreground-muted">
                    {data.staleChapters.map((c) => (
                      <li key={c.chapterId}>
                        {c.chapterTitle} <span className="text-foreground-subtle">— {c.bookTitle}</span>
                        {c.lastReviewedAt ? (
                          <span className="text-foreground-subtle"> (dernière révision : {new Date(c.lastReviewedAt).toLocaleDateString("fr-FR")})</span>
                        ) : (
                          <span className="text-foreground-subtle"> (jamais révisé)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}
    </>
  );
}
