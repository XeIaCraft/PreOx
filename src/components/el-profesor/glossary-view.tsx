"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Search, GraduationCap, ExternalLink, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { NotionSummary, NotionRecommendation } from "@/lib/el-profesor/types";
import type { NotionReadiness } from "@/lib/el-profesor/dal";

/** Piste 2026-08-24 ("estimation de préparation par notion") — color + label for a readiness percentage, same three-tier read as the rest of the app's progress indicators. */
function readinessTier(pct: number): { badgeClassName: string; barClassName: string; label: string } {
  if (pct >= 80) return { badgeClassName: "bg-success/15 text-success", barClassName: "bg-success", label: "Prêt" };
  if (pct >= 40) return { badgeClassName: "bg-accent/15 text-accent", barClassName: "bg-accent", label: "À consolider" };
  return { badgeClassName: "bg-danger/15 text-danger", barClassName: "bg-danger", label: "Fragile" };
}

export function GlossaryView({
  notions,
  readiness,
  recommendations,
}: {
  notions: NotionSummary[];
  readiness: Record<string, NotionReadiness>;
  recommendations: Record<string, NotionRecommendation[]>;
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
        <div className="mt-6 space-y-3">
          {filtered.map(({ notion, fiches }) => {
            const distinctBooks = new Set(fiches.map((f) => f.bookId)).size;
            const r = readiness[notion.id];
            const tier = r && r.total > 0 ? readinessTier(r.readinessPct) : null;
            const notionRecommendations = recommendations[notion.id] ?? [];
            return (
              <div key={notion.id} id={`notion-${notion.id}`} className="rounded-[var(--radius-md)] border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{notion.name}</p>
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
                  </div>
                </div>
                {r && r.total > 0 && tier && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted">
                    <div className={`h-full rounded-full ${tier.barClassName}`} style={{ width: `${r.readinessPct}%` }} />
                  </div>
                )}
                <ul className="mt-2 space-y-1 text-xs text-foreground-subtle">
                  {fiches.map((f) => (
                    <li key={f.ficheId}>
                      <Link href={`/apps/el-profesor/chapters/${f.chapterId}`} className="inline-flex items-center gap-1 hover:underline">
                        <BookOpen className="h-3 w-3 shrink-0" />
                        <span className="font-medium text-foreground">{f.ficheTitle}</span>
                        <span>
                          — {f.bookTitle} / {f.chapterTitle}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
