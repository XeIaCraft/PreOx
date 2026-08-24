"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Siren } from "lucide-react";
import { BlockBody } from "@/components/el-profesor/fiche-viewer";
import type { EmergencyBlockEntry } from "@/lib/el-profesor/dal";

/**
 * Piste 2026-08-24 ("mode urgence / bloc") — quick-reference view over
 * blocks an admin hand-flagged as emergency material, all already
 * published and reviewed through the normal pipeline. Deliberately no AI
 * anywhere on this page: it only reads and displays existing content, as
 * fast and legibly as possible under pressure — large text, minimal
 * chrome, one search box, no fluff.
 */
export function EmergencyView({ entries }: { entries: EmergencyBlockEntry[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.ficheTitle.toLowerCase().includes(q) ||
        e.chapterTitle.toLowerCase().includes(q) ||
        e.bookTitle.toLowerCase().includes(q) ||
        JSON.stringify(e.block.content).toLowerCase().includes(q)
    );
  }, [entries, query]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => a.ficheTitle.localeCompare(b.ficheTitle, "fr")), [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-danger/30 bg-danger-tint px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/apps/el-profesor" className="text-danger hover:text-danger/80" aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Siren className="h-5 w-5 shrink-0 text-danger" />
          <h1 className="text-lg font-semibold text-danger">Mode urgence</h1>
          <span className="ml-auto text-xs text-danger/80">{entries.length} référence{entries.length > 1 ? "s" : ""}</span>
        </div>
        <div className="mx-auto mt-2 max-w-3xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-danger/60" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (ex. hyperkaliémie, choc anaphylactique…)"
              className="w-full rounded-[var(--radius-md)] border border-danger/30 bg-surface py-2.5 pl-9 pr-3 text-base placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {entries.length === 0 ? (
          <p className="text-sm text-foreground-subtle">
            Aucune référence d&apos;urgence pour l&apos;instant — un administrateur peut en marquer depuis l&apos;édition d&apos;un bloc de fiche.
          </p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Aucun résultat pour « {query} ».</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((entry) => (
              <div key={entry.block.id} className="rounded-[var(--radius-lg)] border-2 border-danger/40 bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/apps/el-profesor/chapters/${entry.chapterId}`} className="hover:underline">
                    <h2 className="text-xl font-semibold text-foreground">{entry.ficheTitle}</h2>
                  </Link>
                </div>
                <p className="mb-3 text-xs text-foreground-subtle">
                  {entry.bookTitle} — {entry.chapterTitle}
                </p>
                <div className="text-lg leading-relaxed">
                  <BlockBody block={entry.block} fontScale="lg" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
