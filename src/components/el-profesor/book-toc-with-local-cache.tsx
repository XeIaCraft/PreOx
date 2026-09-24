"use client";

import { useEffect, useState } from "react";
import { BookTocView } from "@/components/el-profesor/book-toc-view";
import { getCachedDashboard, getCachedChapterContent, getAllCachedReviewStates } from "@/lib/el-profesor/local-db";
import { computeLocalMasteryCounts } from "@/lib/el-profesor/local-review-queue";
import type { BookTableOfContents, BookTocChapter } from "@/lib/el-profesor/dal/library";

function TocSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-8" aria-hidden="true">
      <div className="h-8 w-64 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
      ))}
    </div>
  );
}

/**
 * Same seam as DashboardWithLocalCache/ChapterViewWithLocalCache (piste
 * 2026-09-24 — "cache local + synchronisation manuelle"), but this one
 * doesn't need its own cache store: the "Synchroniser" sync already
 * downloads everything a book's table of contents needs — the book/chapter
 * list and mastery counts (in the dashboard snapshot) and each published
 * chapter's sub-entities (in the per-chapter content cache) — so this is
 * assembled straight from those two existing caches instead of fetching or
 * storing anything new. Only falls back to the (deferred) server promise
 * when a published chapter hasn't been synced yet.
 */
export function BookTocWithLocalCache({
  bookId,
  tocPromise,
  onCacheMiss,
}: {
  bookId: string;
  /** Null when rendered by the local nav shell rather than page.tsx directly — in that case onCacheMiss must be provided instead. */
  tocPromise: Promise<BookTableOfContents | null> | null;
  onCacheMiss?: () => void;
}) {
  const [toc, setToc] = useState<BookTableOfContents | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function tryLocal(): Promise<BookTableOfContents | null> {
      const dashboard = await getCachedDashboard();
      if (!dashboard) return null;
      const book = dashboard.books.find((b) => b.id === bookId);
      if (!book) return null;

      const publishedChapters = book.chapters.filter((c) => c.status === "published");
      const contents = await Promise.all(publishedChapters.map((c) => getCachedChapterContent(c.id)));
      // A published chapter with no cached content yet (never synced) means
      // this book can't be fully assembled locally — fall back to the server
      // rather than silently showing it as having no fiches.
      if (contents.some((c) => !c)) return null;

      const contentByChapterId = new Map(publishedChapters.map((c, i) => [c.id, contents[i]!]));
      // Mastery is computed fresh from this book's cached chapter content +
      // review state (piste 2026-09-24 — correctif du bug "à jour"), rather
      // than trusting dashboard.masteryCounts's frozen numbers, which only
      // ever reflected the state at the last "Synchroniser".
      const reviewStates = await getAllCachedReviewStates();
      const masteryCounts = computeLocalMasteryCounts(
        new Map([...contentByChapterId].map(([id, c]) => [id, c.subEntities])),
        reviewStates
      );
      const tocChapters: BookTocChapter[] = book.chapters.map((chapter) => {
        const content = contentByChapterId.get(chapter.id);
        return {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          status: chapter.status,
          subEntities: content ? content.subEntities.map((s) => ({ id: s.id, name: s.name, hasFiche: Boolean(s.fiche) })) : [],
          mastery: masteryCounts[chapter.id] ?? { total: 0, new: 0, learning: 0, acquired: 0 },
        };
      });

      return { book, chapters: tocChapters };
    }

    tryLocal().then((localToc) => {
      if (cancelled) return;
      if (localToc) {
        setToc(localToc);
        return;
      }
      if (!tocPromise) {
        onCacheMiss?.();
        return;
      }
      tocPromise.then((serverToc) => {
        if (cancelled) return;
        if (serverToc) setToc(serverToc);
        else setMissing(true);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [bookId, tocPromise, onCacheMiss]);

  if (missing) {
    return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-foreground-muted">Ce livre n&apos;est plus disponible.</p>;
  }
  if (!toc) return <TocSkeleton />;

  return <BookTocView toc={toc} />;
}
