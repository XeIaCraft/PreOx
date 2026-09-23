"use client";

import { useEffect, useState } from "react";
import { ChapterView } from "@/components/el-profesor/chapter-view";
import { getCachedChapterContent } from "@/lib/el-profesor/local-db";
import type { ChapterContentSnapshot } from "@/lib/el-profesor/dashboard-types";

/**
 * Same seam as DashboardWithLocalCache, for one chapter (piste 2026-09-24 —
 * "cache local + synchronisation manuelle"). Seeds from the server's own
 * snapshot (so the first paint, and any chapter never synced locally, work
 * exactly as before), then swaps to the local IndexedDB copy on mount if
 * present. ChapterView itself is untouched.
 */
export function ChapterViewWithLocalCache({
  chapterId,
  initialEntityId,
  isAdmin,
  initialSnapshot,
}: {
  chapterId: string;
  initialEntityId?: string;
  isAdmin: boolean;
  initialSnapshot: ChapterContentSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<ChapterContentSnapshot>(initialSnapshot);

  useEffect(() => {
    let cancelled = false;
    getCachedChapterContent(chapterId).then((cached) => {
      if (!cancelled && cached) setSnapshot(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

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
