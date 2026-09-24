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
import { scheduleReview } from "./fsrs";
import {
  getCachedReviewState,
  setCachedReviewState,
  deleteCachedReviewState,
  patchDashboardCountsForReview,
  enqueuePendingWrite,
  deletePendingWrite,
  getPendingWrite,
  getCachedDashboard,
} from "./local-db";
import { undoReview } from "@/app/apps/el-profesor/actions/review";
import type { ReviewRating, ReviewSource, ReviewState } from "./types";
import type { ReviewConfidence } from "@/app/apps/el-profesor/actions/review";

function masteryBucket(state: ReviewState | null): "new" | "learning" | "acquired" {
  if (!state) return "new";
  // Mirrors getMasteryCountsByChapter's exact bucketing (dal/review.ts):
  // "review" = acquired, "learning"/"relearning" = learning. A row is only
  // ever written after a first review, so state is never "new" here.
  return state.state === "review" ? "acquired" : "learning";
}

function isDueNow(state: ReviewState | null, now: number): boolean {
  return !state || new Date(state.due).getTime() <= now;
}

export interface LocalReviewResult {
  pendingWriteId: string;
  previousState: ReviewState | null;
  nextState: ReviewState | null;
}

/**
 * Applies one flashcard review entirely against the local cache: computes
 * the next FSRS state (source === "scheduled" only — "free"/"exam" reviews
 * never touch the schedule, same as submitReview), writes it to reviewState,
 * delta-patches this chapter's cached due/mastery counts, and queues the
 * real write for sync-queue.ts's next flush.
 */
export async function applyLocalReview(params: {
  flashcardId: string;
  /** Null for cross-chapter sessions (révision globale, carnet d'erreurs) — see PendingReviewPayload's doc comment. */
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

    if (chapterId) {
      const dueDelta = (isDueNow(nextState, now.getTime()) ? 1 : 0) - (isDueNow(previousState, now.getTime()) ? 1 : 0);
      await patchDashboardCountsForReview(chapterId, dueDelta, masteryBucket(previousState), masteryBucket(nextState));
    }
  }

  const pendingWriteId = crypto.randomUUID();
  await enqueuePendingWrite({
    id: pendingWriteId,
    kind: "review",
    createdAt: now.toISOString(),
    payload: { flashcardId, chapterId, rating, source, durationMs, variantId, confidence, previousState },
  });

  return { pendingWriteId, previousState, nextState };
}

/**
 * Reverts a review. If sync-queue.ts hasn't flushed it to the server yet,
 * this is entirely local (restore the cached FSRS state, undo the dashboard
 * patch, drop the queued write). If it has already been flushed — possible
 * but rare given the ~30s flush interval versus how quickly someone actually
 * hits "undo" — falls back to the real undoReview Server Action using the
 * log id sync-queue.ts recorded when it flushed this entry.
 */
export async function undoLocalReview(pendingWriteId: string): Promise<void> {
  const write = await getPendingWrite(pendingWriteId);
  if (!write || write.kind !== "review") return;

  if (write.flushed) {
    await undoReview(write.payload.flashcardId, write.serverLogId, write.payload.source, write.payload.previousState);
    await deletePendingWrite(pendingWriteId);
    return;
  }

  const { flashcardId, chapterId, source, previousState } = write.payload;
  if (source === "scheduled") {
    const now = Date.now();
    const stateBeingUndone = await getCachedReviewState(flashcardId);
    if (previousState) await setCachedReviewState(flashcardId, previousState);
    else await deleteCachedReviewState(flashcardId);
    if (chapterId) {
      const dueDelta = (isDueNow(previousState, now) ? 1 : 0) - (isDueNow(stateBeingUndone, now) ? 1 : 0);
      await patchDashboardCountsForReview(chapterId, dueDelta, masteryBucket(stateBeingUndone), masteryBucket(previousState));
    }
  }

  await deletePendingWrite(pendingWriteId);
}

/** Queues excluding a flashcard from this user's own reviews — see PendingExcludePayload. */
export async function applyLocalExclude(flashcardId: string): Promise<void> {
  await enqueuePendingWrite({
    id: crypto.randomUUID(),
    kind: "exclude",
    createdAt: new Date().toISOString(),
    payload: { flashcardId, excluded: true },
  });
}
