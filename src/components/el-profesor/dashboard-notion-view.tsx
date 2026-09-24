"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { NotionList } from "@/components/el-profesor/glossary-view";
import type { DashboardNotionViewData } from "@/lib/el-profesor/dashboard-types";

/**
 * "Par notion" grouping on the main dashboard — the same cross-book data as
 * the standalone /glossary page (see NotionList), embedded as an
 * alternative to the "Par livre" list rather than a separate page (added
 * 2026-08-25, replacing a repeated ask that had only ever landed as its own
 * page). Read purely from cache as a plain value (piste 2026-09-24 — suite
 * au retour "les widgets ne s'affichent jamais et finissent en erreur") —
 * populated only by an explicit "Synchroniser", never an automatic live
 * fetch that could hang or fail on every dashboard visit.
 */
export function DashboardNotionView({ data, isAdmin = false }: { data: DashboardNotionViewData | null; isAdmin?: boolean }) {
  const [query, setQuery] = useState("");
  const notions = useMemo(() => data?.notions ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notions;
    return notions.filter(
      ({ notion, fiches }) => notion.name.toLowerCase().includes(q) || fiches.some((f) => f.ficheTitle.toLowerCase().includes(q))
    );
  }, [notions, query]);

  if (!data) return <p className="mt-6 text-sm text-foreground-subtle">Notions indisponibles — synchronisez pour les voir.</p>;

  const { categories, readiness, recommendations, doseCalculators, caseCounts, progress } = data;

  return (
    <div>
      <div className="relative">
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
        <div className="mt-4">
          <NotionList
            notions={filtered}
            categories={categories}
            readiness={readiness}
            recommendations={recommendations}
            doseCalculators={doseCalculators}
            caseCounts={caseCounts}
            progress={progress}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}
