"use client";

import { use, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { NotionList } from "@/components/el-profesor/glossary-view";
import type { DashboardNotionViewData } from "@/lib/el-profesor/dashboard-types";

/**
 * "Par notion" grouping on the main dashboard — the same cross-book data as
 * the standalone /glossary page (see NotionList), embedded as an
 * alternative to the "Par livre" list rather than a separate page (added
 * 2026-08-25, replacing a repeated ask that had only ever landed as its own
 * page). Consumes notionViewDataPromise via use(), so it only ever blocks
 * on that query once this view is actually selected — see the doc comment
 * on DashboardNotionViewData.
 */
export function DashboardNotionView({ dataPromise, isAdmin = false }: { dataPromise: Promise<DashboardNotionViewData>; isAdmin?: boolean }) {
  const { notions, readiness, recommendations, doseCalculators, caseCounts } = use(dataPromise);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notions;
    return notions.filter(
      ({ notion, fiches }) => notion.name.toLowerCase().includes(q) || fiches.some((f) => f.ficheTitle.toLowerCase().includes(q))
    );
  }, [notions, query]);

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
            readiness={readiness}
            recommendations={recommendations}
            doseCalculators={doseCalculators}
            caseCounts={caseCounts}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}

export function DashboardNotionViewSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-9 rounded-[var(--radius-md)] bg-surface-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 rounded-[var(--radius-md)] border border-border bg-surface-muted/40" />
      ))}
    </div>
  );
}
