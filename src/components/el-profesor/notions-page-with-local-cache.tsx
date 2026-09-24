"use client";

import { useEffect, useState } from "react";
import { NotionsView } from "@/components/el-profesor/notions-view";
import { getCachedNotionsPage } from "@/lib/el-profesor/local-db";
import type { NotionsPageSnapshot } from "@/lib/el-profesor/dashboard-types";

function NotionsPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-3 px-4 py-8" aria-hidden="true">
      <div className="h-8 w-56 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only cache-first wrapper for the /apps/el-profesor/notions admin
 * screen (piste 2026-09-24 — "module 100% local", extension aux autres
 * écrans) — same "cache first, live promise only when nothing's cached yet"
 * seam as DashboardWithLocalCache. This screen's own admin actions
 * (categorize, detect contradictions, resolve/dismiss, generate/publish
 * synthesis...) stay server-direct: they're either AI-triggered (can't
 * complete offline anyway) or edit richly-structured content where an
 * incorrect optimistic patch risks corrupting the cache — same "content
 * editing stays server-direct for now" scope line the plan draws elsewhere.
 * Only the (already read-only) browsing/diagnostic data is cached here.
 */
export function NotionsPageWithLocalCache({ initialDataPromise }: { initialDataPromise: Promise<NotionsPageSnapshot> }) {
  const [data, setData] = useState<NotionsPageSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCachedNotionsPage().then((cached) => {
      if (cancelled) return;
      if (cached) {
        setData(cached);
        return;
      }
      initialDataPromise.then(
        (live) => {
          if (!cancelled) setData(live);
        },
        () => {
          if (!cancelled) setLoadError(true);
        }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [initialDataPromise]);

  if (loadError) {
    return <p className="mx-auto max-w-5xl px-4 py-8 text-sm text-danger">Impossible de charger cette page — vérifiez votre connexion.</p>;
  }
  if (!data) return <NotionsPageSkeleton />;

  return (
    <NotionsView
      chapters={data.chapters}
      notionSummaries={data.notionSummaries}
      categories={data.categories}
      recommendations={data.recommendations}
      doseCalculators={data.doseCalculators}
      contradictions={data.contradictions}
      crossBookDuplicates={data.crossBookDuplicates}
      supersededFiches={data.supersededFiches}
      notionUpdateProposals={data.notionUpdateProposals}
    />
  );
}
