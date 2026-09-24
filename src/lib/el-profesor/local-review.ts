"use client";

// Local-first review write path (piste 2026-09-24 — "écriture locale
// automatique"): answering a flashcard used to mean awaiting submitReview's
// full server round trip (insert the log row, read back the previous FSRS
// state, compute the next one, upsert it) before the UI could move on — the
// single most frequent action in the whole module, now made instant by
// running that exact same computation (scheduleReview, fsrs.ts) against the
// locally cached review state instead. The real server write is queued
// (local-db.ts's pendingWrites store) and replayed by sync-queue.ts, so
// nothing here talks to the network directly except undoLocalReview's
// already-flushed fallback.
//
// This used to also delta-patch the dashboard's cached due/mastery counts
// (patchDashboardCountsForReview) after each review — removed as the fix
// for the "à jour" bug: those counts are now always computed fresh from
// this same reviewState store (local-review-queue.ts's
// computeLocalDueCounts/computeLocalMasteryCounts) whenever the dashboard
// renders, so writing reviewState here is all that's needed — no separate
// number to keep in sync by hand.
import { scheduleReview } from "./fsrs";
import {
  getCachedReviewState,
  setCachedReviewState,
  deleteCachedReviewState,
  enqueuePendingWrite,
  deletePendingWrite,
  getPendingWrite,
  getCachedDashboard,
  addLocalReviewEvent,
  deleteLocalReviewEvent,
} from "./local-db";
import { cleanReviewDuration } from "./local-widgets";
import { setFlashcardExcludedLocally } from "./local-writes";
import { undoReview } from "@/app/apps/el-profesor/actions/review";
import type { ReviewRating, ReviewSource, ReviewState } from "./types";
import type { ReviewConfidence } from "@/app/apps/el-profesor/actions/review";

export interface LocalReviewResult {
  pendingWriteId: string;
  previousState: ReviewState | null;
  nextState: ReviewState | null;
}

/**
 * Applies one flashcard review entirely against the local cache: computes
 * the next FSRS state (source === "scheduled" only — "free"/"exam" reviews
 * never touch the schedule, same as submitReview), writes it to reviewState,
 * and queues the real write for sync-queue.ts's next flush.
 */
export async function applyLocalReview(params: {
  flashcardId: string;
  /** Kept for the eventual server write's own bookkeeping — no longer used for any local dashboard patch (see file doc comment). */
  chapterId: string | null;
  rating: ReviewRating;
  source: ReviewSource;
  durationMs?: number;
  variantId: string | null;
  confidence: ReviewConfidence | null;
}): Promise<LocalReviewResult> {
  const { flashcardId, chapterId, rating, source, durationMs, variantId, confidence } = params;
  const now = new Date();
  const previousState = source === "scheduled" ? await getCachedReviewState(flashcardId) : null;

  let nextState: ReviewState | null = null;
  if (source === "scheduled") {
    const dashboard = await getCachedDashboard();
    const retention = dashboard?.fsrsRetention ?? 0.9;
    const update = scheduleReview(previousState, rating, now, retention);
    nextState = { flashcardId, ...update };
    await setCachedReviewState(flashcardId, nextState);
  }

  const pendingWriteId = crypto.randomUUID();
  await enqueuePendingWrite({
    id: pendingWriteId,
    kind: "review",
    createdAt: now.toISOString(),
    payload: { flashcardId, chapterId, rating, source, durationMs, variantId, confidence, previousState },
  });
  // Counted in the streak/heatmap/time widgets right away (piste 2026-09-24
  // — "widgets en local"), until a synced review history includes it.
  await addLocalReviewEvent({
    id: pendingWriteId,
    flashcardId,
    source,
    reviewedAt: now.toISOString(),
    durationMs: cleanReviewDuration(durationMs),
    rating,
    confidence,
  });

  return { pendingWriteId, previousState, nextState };
}

/**
 * Reverts a review. If sync-queue.ts hasn't flushed it to the server yet,
 * this is entirely local (restore the cached FSRS state, drop the queued
 * write). If it has already been flushed — possible but rare given the ~30s
 * flush interval versus how quickly someone actually hits "undo" — falls
 * back to the real undoReview Server Action using the log id sync-queue.ts
 * recorded when it flushed this entry.
 */
export async function undoLocalReview(pendingWriteId: string): Promise<void> {
  const write = await getPendingWrite(pendingWriteId);
  if (!write || write.kind !== "review") return;
  await deleteLocalReviewEvent(pendingWriteId);

  if (write.flushed) {
    await undoReview(write.payload.flashcardId, write.serverLogId, write.payload.source, write.payload.previousState);
    await deletePendingWrite(pendingWriteId);
    return;
  }

  const { flashcardId, source, previousState } = write.payload;
  if (source === "scheduled") {
    if (previousState) await setCachedReviewState(flashcardId, previousState);
    else await deleteCachedReviewState(flashcardId);
  }

  await deletePendingWrite(pendingWriteId);
}

/** Excludes a flashcard from this user's own reviews — patched into the cached list right away and queued, see setFlashcardExcludedLocally. */
export async function applyLocalExclude(flashcardId: string): Promise<void> {
  await setFlashcardExcludedLocally(flashcardId, true);
}
