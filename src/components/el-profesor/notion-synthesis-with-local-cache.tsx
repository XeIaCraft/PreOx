"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { NotionSynthesisView } from "@/components/el-profesor/notion-synthesis-view";
import { getEntity, setEntity } from "@/lib/el-profesor/local-db";
import type { NotionSynthesisSnapshot } from "@/lib/el-profesor/dashboard-types";

const ENTITY_TYPE = "notionSynthesis";

function NotionSynthesisSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-8" aria-hidden="true">
      <div className="h-8 w-64 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
    </div>
  );
}

/**
 * Cache-first wrapper for a single notion's synthesis screen (piste
 * 2026-09-24 — "module 100% local", extension aux autres écrans) — keyed by
 * notionId in local-db.ts's generic `entities` store (Part B of the plan:
 * per-entity screens that don't warrant their own dedicated store). Caching
 * here is opportunistic (written on every successful visit, like the
 * service worker's own per-URL caching) rather than pulled during
 * "Synchroniser" — there's no bounded list of "notions worth prefetching"
 * the way there is for chapters, so a notion becomes available offline once
 * it's actually been opened at least once online. The screen's own editing
 * actions (generate/publish/unpublish synthesis, edit blocks...) stay
 * server-direct — see NotionsPageWithLocalCache's doc comment for why.
 */
export function NotionSynthesisWithLocalCache({
  notionId,
  isAdmin,
  initialDataPromise,
}: {
  notionId: string;
  isAdmin: boolean;
  initialDataPromise: Promise<NotionSynthesisSnapshot | null>;
}) {
  const [data, setData] = useState<NotionSynthesisSnapshot | null | "miss">(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEntity<NotionSynthesisSnapshot>(ENTITY_TYPE, notionId).then((cached) => {
      if (cancelled) return;
      if (cached) {
        setData(cached);
        return;
      }
      initialDataPromise.then(
        (live) => {
          if (cancelled) return;
          if (!live) {
            setData("miss");
            return;
          }
          setData(live);
          void setEntity(ENTITY_TYPE, notionId, live);
        },
        () => {
          if (!cancelled) setLoadError(true);
        }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [notionId, initialDataPromise]);

  if (loadError) {
    return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-danger">Impossible de charger cette notion — vérifiez votre connexion.</p>;
  }
  if (data === "miss") notFound();
  if (!data) return <NotionSynthesisSkeleton />;

  return (
    <NotionSynthesisView
      notionId={notionId}
      notionName={data.notionName}
      synthesis={data.synthesis}
      fiches={data.fiches}
      isAdmin={isAdmin}
      prevNotion={data.prevNotion}
      nextNotion={data.nextNotion}
      readProgress={data.readProgress}
      masteryProgress={data.masteryProgress}
    />
  );
}
