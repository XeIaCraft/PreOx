"use client";

import { useEffect, useState } from "react";
import { ChapterView } from "@/components/el-profesor/chapter-view";
import { loadLocalChapterSnapshot } from "@/lib/el-profesor/local-chapter";
import type { ChapterContentSnapshot } from "@/lib/el-profesor/dashboard-types";

function ChapterViewSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 px-4 py-8" aria-hidden="true">
      <div className="h-8 w-48 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      <div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
    </div>
  );
}

/**
 * Same seam as DashboardWithLocalCache, for one chapter (piste 2026-09-24 —
 * "cache local + synchronisation manuelle"). Takes the chapter's content as
 * an un-awaited promise (see chapters/[chapterId]/page.tsx) rather than an
 * already-resolved snapshot — checks the local IndexedDB cache first and
 * only ever falls back to waiting on that promise when this chapter hasn't
 * been synced yet, so a cached chapter renders instantly instead of always
 * waiting on the page's own (slow) server round trip. The cached copy comes
 * with this user's current bookmarks, block re-read schedule and mastery
 * laid over it (loadLocalChapterSnapshot) — never the copy frozen inside
 * the chapter snapshot the last time its content changed.
 */
export function ChapterViewWithLocalCache({
  chapterId,
  initialEntityId,
  isAdmin,
  contentPromise,
  onCacheMiss,
}: {
  chapterId: string;
  initialEntityId?: string;
  isAdmin: boolean;
  /** Null when rendered by the local nav shell rather than page.tsx directly — in that case onCacheMiss must be provided instead. */
  contentPromise: Promise<ChapterContentSnapshot | null> | null;
  onCacheMiss?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<ChapterContentSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLocalChapterSnapshot(chapterId).then((cached) => {
      if (cancelled) return;
      if (cached) {
        setSnapshot(cached);
        return;
      }
      if (!contentPromise) {
        onCacheMiss?.();
        return;
      }
      contentPromise.then((serverSnapshot) => {
        if (cancelled) return;
        if (serverSnapshot) setSnapshot(serverSnapshot);
        else setNotFound(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId, contentPromise, onCacheMiss]);

  if (notFound) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-sm text-foreground-muted">Ce chapitre n&apos;est plus disponible.</p>;
  }
  if (!snapshot) return <ChapterViewSkeleton />;

  return (
    <ChapterView
      key={chapterId}
      chapterId={chapterId}
      chapterTitle={snapshot.chapterTitle}
      subEntities={snapshot.subEntities}
      initialEntityId={initialEntityId}
      bookmarkedIds={snapshot.bookmarkedIds}
      sourceKind={snapshot.sourceKind}
      sourceText={snapshot.sourceText}
      blockReviewStates={snapshot.blockReviewStates}
      isAdmin={isAdmin}
      prevChapter={snapshot.adjacentChapters.prev}
      nextChapter={snapshot.adjacentChapters.next}
      ficheReadProgress={snapshot.ficheReadProgress}
      ficheMasteryProgress={snapshot.ficheMasteryProgress}
    />
  );
}
