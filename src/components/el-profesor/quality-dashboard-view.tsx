"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, Copy, Merge } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BookQualityDashboard } from "@/lib/el-profesor/dal";

function timeAgoLabel(iso: string | null): string {
  if (!iso) return "jamais révisé";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "révisé aujourd'hui";
  if (days === 1) return "révisé hier";
  if (days < 30) return `révisé il y a ${days} j`;
  return `révisé il y a ${Math.round(days / 30)} mois`;
}

export function QualityDashboardView({
  books,
  selectedBookId,
  dashboard,
}: {
  books: { id: string; title: string }[];
  selectedBookId: string | null;
  dashboard: BookQualityDashboard | null;
}) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <h1 className="font-serif-display text-2xl font-medium text-foreground">Tableau de bord qualité</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Couverture par chapitre, flashcards potentiellement en double, sous-entités à fusionner — par livre.
      </p>

      {books.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-subtle">Aucun livre avec du contenu publié pour l&apos;instant.</p>
      ) : (
        <>
          <div className="mt-5">
            <Select
              value={selectedBookId ?? ""}
              onChange={(e) => router.push(`/apps/el-profesor/quality?book=${e.target.value}`)}
              className="max-w-sm"
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </Select>
          </div>

          {dashboard && (
            <>
              <div className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <ShieldAlert className="h-4 w-4" /> Couverture par chapitre
                </p>
                <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
                  {dashboard.chapters.map((c) => (
                    <li key={c.chapterId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <Link href={`/apps/el-profesor/chapters/${c.chapterId}`} className="min-w-0 truncate text-foreground hover:underline">
                        {c.chapterTitle}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-foreground-subtle">{timeAgoLabel(c.lastReviewedAt)}</span>
                        {c.openFlagCount > 0 && <Badge variant="danger">{c.openFlagCount} signalement(s)</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Copy className="h-4 w-4" /> Flashcards potentiellement en double ({dashboard.duplicateFlashcards.length})
                </p>
                {dashboard.duplicateFlashcards.length === 0 ? (
                  <p className="text-sm text-foreground-subtle">Aucun doublon détecté.</p>
                ) : (
                  <ul className="space-y-2">
                    {dashboard.duplicateFlashcards.map((pair, i) => (
                      <li key={i} className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-tint/40 p-3 text-sm">
                        <p className="text-foreground">« {pair.a.front} »</p>
                        <p className="mt-1 text-foreground-muted">« {pair.b.front} »</p>
                        <p className="mt-1 text-xs text-foreground-subtle">{Math.round(pair.similarity * 100)}% de similarité</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Merge className="h-4 w-4" /> Sous-entités à fusionner peut-être ({dashboard.similarSubEntities.length})
                </p>
                {dashboard.similarSubEntities.length === 0 ? (
                  <p className="text-sm text-foreground-subtle">Aucune suggestion.</p>
                ) : (
                  <ul className="space-y-2">
                    {dashboard.similarSubEntities.map((pair, i) => (
                      <li key={i} className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-tint/40 p-3 text-sm">
                        <p className="text-foreground">
                          « {pair.a.name} » et « {pair.b.name} »
                        </p>
                        <p className="mt-1 text-xs text-foreground-subtle">
                          {pair.chapterTitle} — {Math.round(pair.similarity * 100)}% de similarité
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
