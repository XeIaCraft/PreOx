import "server-only";

import { fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { ReviewRating, ReviewState } from "@/lib/el-profesor/types";

const STATE_TO_LABEL: Record<State, ReviewState["state"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const LABEL_TO_STATE: Record<ReviewState["state"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/** FSRS's own 4-grade self-assessment scale — a direct passthrough, no remapping needed. */
const RATING_MAP: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function toFsrsCard(state: ReviewState | null): Card {
  if (!state) {
    return {
      due: new Date(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
    };
  }
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: LABEL_TO_STATE[state.state],
    last_review: state.lastReview ? new Date(state.lastReview) : undefined,
  };
}

export type FsrsUpdate = Omit<ReviewState, "flashcardId">;

/**
 * Computes the next FSRS state for a flashcard given the user's self-grade.
 * `requestRetention` (default 0.9, FSRS's own default) is the one per-user
 * personalization knob applied here — see maybeRecomputeUserFsrsRetention
 * in dal.ts for how it's tuned from a user's own review history. A fresh
 * scheduler per call rather than a module-level singleton: cheap to build,
 * and the retention target genuinely varies call to call by caller.
 */
export function scheduleReview(currentState: ReviewState | null, rating: ReviewRating, now: Date = new Date(), requestRetention = 0.9): FsrsUpdate {
  const card = toFsrsCard(currentState);
  const scheduler = fsrs({ request_retention: requestRetention });
  const { card: nextCard } = scheduler.next(card, now, RATING_MAP[rating]);

  return {
    due: nextCard.due.toISOString(),
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    elapsedDays: nextCard.elapsed_days,
    scheduledDays: nextCard.scheduled_days,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    state: STATE_TO_LABEL[nextCard.state],
    lastReview: nextCard.last_review ? nextCard.last_review.toISOString() : null,
  };
}

// Bounds for the per-user request_retention personalization — see
// computeAdjustedRetention below and maybeRecomputeUserFsrsRetention in
// dal.ts, which calls it from a user's actual review history.
export const FSRS_RETENTION_TARGET = 0.9;
export const FSRS_RETENTION_MIN = 0.8;
export const FSRS_RETENTION_MAX = 0.97;
// How strongly a gap between actual and target success rate moves the
// retention target — 0.5 is a moderate, damped response, not a 1:1 chase.
export const FSRS_RETENTION_GAIN = 0.5;

/**
 * Pure half of the "paramètres FSRS ajustés par utilisateur" piste
 * d'amélioration (2026-08-24): given a user's observed success rate on
 * scheduled reviews, nudges FSRS's request_retention target — the one
 * knob FSRS explicitly exposes for this, deliberately simpler and safer
 * than fitting the algorithm's full weight vector from scratch (see the
 * doc comment on maybeRecomputeUserFsrsRetention in dal.ts for why). If
 * the observed rate runs above target, FSRS is scheduling more often than
 * that person needs — the target moves down (longer, less frequent
 * reviews); if it runs below target, it moves up (more frequent review).
 * Always clamped to [FSRS_RETENTION_MIN, FSRS_RETENTION_MAX].
 */
export function computeAdjustedRetention(successRate: number): number {
  const adjusted = FSRS_RETENTION_TARGET + (FSRS_RETENTION_TARGET - successRate) * FSRS_RETENTION_GAIN;
  return Math.min(FSRS_RETENTION_MAX, Math.max(FSRS_RETENTION_MIN, adjusted));
}
