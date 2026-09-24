"use client";

import { useEffect, useState } from "react";
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
 * `notionId:admin` or `notionId:user` in local-db.ts's generic `entities`
 * store (Part B of the plan: per-entity screens that don't warrant their own
 * dedicated store). The isAdmin suffix matters: getNotionSynthesis includes
 * unpublished/draft blocks only for an effective admin, so without it a real
 * admin's cache (with drafts) could get served back during a later "preview
 * as user" visit, defeating the whole point of that preview — the two states
 * now cache separately and can never cross-contaminate. There's also no
 * "Synchroniser" step for notion pages the way there is for chapters (no
 * bounded list of "notions worth prefetching"), so the cache is shown
 * instantly for a fast first paint but the live server promise is always
 * awaited too and overwrites it — the only way this data would otherwise
 * ever refresh is by clearing the whole local cache. The screen's own
 * editing actions (generate/publish/unpublish synthesis, edit blocks...)
 * stay server-direct — see NotionsPageWithLocalCache's doc comment for why.
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
    const entityId = `${notionId}:${isAdmin ? "admin" : "user"}`;

    getEntity<NotionSynthesisSnapshot>(ENTITY_TYPE, entityId).then((cached) => {
      if (cancelled) return;
      if (cached) setData(cached);

      // Always revalidate against the live server data, cache hit or not —
      // see the doc comment above for why this screen needs that (no manual
      // sync step to otherwise ever refresh it).
      initialDataPromise.then(
        (live) => {
          if (cancelled) return;
          if (!live) {
            setData("miss");
            return;
          }
          setData(live);
          void setEntity(ENTITY_TYPE, entityId, live);
        },
        () => {
          // Live fetch failed (offline, most likely) — only show an error if
          // there was nothing cached to fall back on.
          if (!cancelled && !cached) setLoadError(true);
        }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [notionId, isAdmin, initialDataPromise]);

  if (loadError) {
    return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-danger">Impossible de charger cette notion — vérifiez votre connexion.</p>;
  }
  if (data === "miss") {
    // next/navigation's notFound() only works from a Server Component,
    // Server Function, or Route Handler in this Next.js version — not from
    // a Client Component's render (see node_modules/next/dist/docs/.../
    // not-found.md), so a genuinely-missing notion renders its own inline
    // message here instead of throwing.
    return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-foreground-subtle">Cette notion n&apos;existe pas ou plus.</p>;
  }
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
