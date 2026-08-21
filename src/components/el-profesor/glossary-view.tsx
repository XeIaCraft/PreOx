"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { NotionSummary } from "@/lib/el-profesor/types";

export function GlossaryView({ notions }: { notions: NotionSummary[] }) {
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
            return (
              <div key={notion.id} id={`notion-${notion.id}`} className="rounded-[var(--radius-md)] border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{notion.name}</p>
                  <Badge variant="neutral">
                    {fiches.length} fiche{fiches.length > 1 ? "s" : ""}
                    {distinctBooks > 1 ? ` · ${distinctBooks} livres` : ""}
                  </Badge>
                </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
