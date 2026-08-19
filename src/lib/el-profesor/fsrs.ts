import "server-only";

import { fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { ReviewRating, ReviewState } from "@/lib/el-profesor/types";

const scheduler = fsrs();

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

/**
 * The app exposes only a binary Correct/Incorrect self-grade (Anki-style,
 * as requested) rather than FSRS's usual 4-grade scale — mapped onto
 * Again/Good, letting the FSRS math still drive real spaced scheduling.
 */
const RATING_MAP: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  good: Rating.Good,
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

/** Computes the next FSRS state for a flashcard given the user's self-grade. */
export function scheduleReview(currentState: ReviewState | null, rating: ReviewRating, now: Date = new Date()): FsrsUpdate {
  const card = toFsrsCard(currentState);
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
