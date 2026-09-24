"use client";

import { useEffect, useState } from "react";
import { FlashcardReviewer } from "@/components/el-profesor/flashcard-reviewer";
import { getLocalDueQueue, getLocalFreeQueue } from "@/lib/el-profesor/local-review-queue";
import { applyFreeSessionCap } from "@/lib/el-profesor/review-session-params";
import { loadLocalGlobalReviewQueue } from "@/lib/el-profesor/local-dashboard";
import type { Flashcard, ReviewSource } from "@/lib/el-profesor/types";

function ReviewSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-8" aria-hidden="true">
      <div className="h-6 w-24 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      <div className="h-48 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted/60" />
    </div>
  );
}

/**
 * Same seam as ChapterViewWithLocalCache, for the flashcard review queue
 * (piste 2026-09-24 — "module 100% local"). Before this, opening a review
 * session always meant awaiting getDueQueue/getFreeReviewQueue's server
 * round trip — the one screen in the reading loop that had no local-cache
 * path at all, despite being the most frequently opened. Computes the queue
 * from local-review-queue.ts (same logic as the dashboard's due-count
 * badge, so the two can never disagree) whenever this chapter's content is
 * cached, and only ever falls back to waiting on the server-computed
 * queuePromise when it isn't.
 */
export function ReviewQueueWithLocalCache({
  chapterId,
  source,
  limit,
  all,
  queuePromise,
  examDurationMs,
  badgeLabel,
  emptyMessage,
  onCacheMiss,
}: {
  chapterId: string;
  source: ReviewSource;
  limit?: string;
  all?: string;
  /** Null when rendered by the local nav shell rather than page.tsx directly — in that case onCacheMiss must be provided instead. */
  queuePromise: Promise<{ queue: Flashcard[]; cappedFrom: number | null }> | null;
  examDurationMs?: number;
  badgeLabel?: string;
  emptyMessage?: string;
  onCacheMiss?: () => void;
}) {
  const [result, setResult] = useState<{ queue: Flashcard[]; cappedFrom: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tryLocal(): Promise<{ queue: Flashcard[]; cappedFrom: number | null } | null> {
      // "exam" behaves like "free" for queue-building purposes, same mapping review/page.tsx applies.
      const fullQueue = source === "scheduled" ? await getLocalDueQueue(chapterId) : await getLocalFreeQueue(chapterId);
      if (fullQueue === null) return null;
      return source === "free" ? applyFreeSessionCap(fullQueue, { all, limit }) : { queue: fullQueue, cappedFrom: null };
    }

    tryLocal().then((local) => {
      if (cancelled) return;
      if (local) {
        setResult(local);
        return;
      }
      if (!queuePromise) {
        onCacheMiss?.();
        return;
      }
      queuePromise.then((server) => {
        if (!cancelled) setResult(server);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [chapterId, source, limit, all, queuePromise, onCacheMiss]);

  if (!result) return <ReviewSkeleton />;

  return (
    <FlashcardReviewer
      chapterId={chapterId}
      source={source}
      cards={result.queue}
      cappedFrom={result.cappedFrom}
      examDurationMs={examDurationMs}
      badgeLabel={badgeLabel}
      emptyMessage={emptyMessage}
    />
  );
}

const GLOBAL_REVIEW_LABELS = {
  due: { badgeLabel: "Toutes matières", emptyMessage: "Rien à réviser aujourd'hui, tous chapitres confondus." },
  difficult: { badgeLabel: "Carnet d'erreurs", emptyMessage: "Aucune carte difficile en ce moment — beau travail !" },
} as const;

/**
 * Cross-chapter review ("Révision globale" / "Carnet d'erreurs") from the
 * local cache (piste 2026-09-24): the server version used to rebuild every
 * chapter's queue one by one before showing a single card. Falls back to
 * the server-computed queue only when nothing is cached on this device.
 */
export function GlobalReviewWithLocalCache({
  mode,
  cardsPromise,
  onCacheMiss,
}: {
  mode: "due" | "difficult";
  /** Null when rendered by the local nav shell — onCacheMiss must be provided instead. */
  cardsPromise: Promise<Flashcard[]> | null;
  onCacheMiss?: () => void;
}) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLocalGlobalReviewQueue(mode).then((local) => {
      if (cancelled) return;
      if (local) {
        setCards(local);
        return;
      }
      if (!cardsPromise) {
        onCacheMiss?.();
        return;
      }
      cardsPromise.then((server) => {
        if (!cancelled) setCards(server);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, cardsPromise, onCacheMiss]);

  if (!cards) return <ReviewSkeleton />;
  const labels = GLOBAL_REVIEW_LABELS[mode];
  return <FlashcardReviewer source={mode === "difficult" ? "free" : "scheduled"} cards={cards} badgeLabel={labels.badgeLabel} emptyMessage={labels.emptyMessage} />;
}
