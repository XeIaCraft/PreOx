import { describe, expect, it } from "vitest";
import { scheduleReview, computeAdjustedRetention, FSRS_RETENTION_TARGET, FSRS_RETENTION_MIN, FSRS_RETENTION_MAX } from "./fsrs";
import type { ReviewState } from "@/lib/el-profesor/types";

const NOW = new Date("2026-01-01T12:00:00.000Z");

describe("scheduleReview", () => {
  it("starts a brand-new card (no prior state) in a scheduled state after a first answer", () => {
    const result = scheduleReview(null, "good", NOW);
    expect(result.reps).toBe(1);
    expect(result.lapses).toBe(0);
    expect(new Date(result.due).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("schedules 'good' further out than 'again' from the same starting state", () => {
    const good = scheduleReview(null, "good", NOW);
    const again = scheduleReview(null, "again", NOW);
    expect(new Date(good.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
  });

  it("does not count a brand-new card's first miss as a lapse (nothing was learned yet to forget)", () => {
    const afterGood = scheduleReview(null, "good", NOW);
    const afterAgain = scheduleReview(null, "again", NOW);
    expect(afterGood.lapses).toBe(0);
    expect(afterAgain.lapses).toBe(0);
  });

  it("counts a lapse when a card previously in the 'review' state is answered 'again' (forgetting something known)", () => {
    let state: ReviewState | null = null;
    let cursor = NOW;
    for (let i = 0; i < 3; i++) {
      const update = scheduleReview(state, "good", cursor);
      state = { flashcardId: "card-1", ...update };
      cursor = new Date(update.due);
    }
    expect(state!.state).toBe("review");
    const afterLapse = scheduleReview(state, "again", cursor);
    expect(afterLapse.lapses).toBe(1);
    expect(afterLapse.state).toBe("relearning");
  });

  it("pushes the due date further out on consecutive correct answers (real spacing, not a fixed step)", () => {
    let state: ReviewState | null = null;
    let previousInterval = 0;
    let cursor = NOW;
    for (let i = 0; i < 4; i++) {
      const update = scheduleReview(state, "good", cursor);
      const interval = new Date(update.due).getTime() - cursor.getTime();
      // FSRS is stochastic-ish in its early stability growth but strictly
      // monotonic in scheduled_days once a card has left the "new" state —
      // check from the second answer on, where growth is guaranteed.
      if (i > 0) expect(interval).toBeGreaterThanOrEqual(previousInterval);
      previousInterval = interval;
      state = { flashcardId: "card-1", ...update };
      cursor = new Date(update.due);
    }
  });

  it("round-trips every review state label through the FSRS state enum without loss", () => {
    const states: ReviewState["state"][] = ["new", "learning", "review", "relearning"];
    for (const state of states) {
      const fakeState: ReviewState = {
        flashcardId: "card-1",
        due: NOW.toISOString(),
        stability: 2,
        difficulty: 5,
        elapsedDays: 1,
        scheduledDays: 1,
        reps: 3,
        lapses: 0,
        state,
        lastReview: NOW.toISOString(),
      };
      // Doesn't throw on any of the four states, and returns a state that's
      // still one of the four valid labels (not undefined from a missed enum case).
      const result = scheduleReview(fakeState, "good", NOW);
      expect(states).toContain(result.state);
    }
  });
});

describe("computeAdjustedRetention", () => {
  it("returns the target unchanged when the observed success rate exactly matches it", () => {
    expect(computeAdjustedRetention(FSRS_RETENTION_TARGET)).toBeCloseTo(FSRS_RETENTION_TARGET);
  });

  it("lowers the retention target (fewer, longer-spaced reviews) when the user succeeds more than the target implies", () => {
    expect(computeAdjustedRetention(0.98)).toBeLessThan(FSRS_RETENTION_TARGET);
  });

  it("raises the retention target (more frequent review) when the user succeeds less than the target implies", () => {
    expect(computeAdjustedRetention(0.75)).toBeGreaterThan(FSRS_RETENTION_TARGET);
  });

  it("clamps to FSRS_RETENTION_MAX for a very low success rate (pushed for more frequent review)", () => {
    expect(computeAdjustedRetention(0)).toBe(FSRS_RETENTION_MAX);
  });

  it("stays within bounds for a perfect success rate (the formula itself doesn't reach FSRS_RETENTION_MIN at this gain, by design — a defensive floor, not a target)", () => {
    const result = computeAdjustedRetention(1);
    expect(result).toBeLessThan(FSRS_RETENTION_TARGET);
    expect(result).toBeGreaterThanOrEqual(FSRS_RETENTION_MIN);
  });

  it("stays within bounds across the whole [0, 1] range of possible success rates", () => {
    for (let rate = 0; rate <= 1; rate += 0.05) {
      const result = computeAdjustedRetention(rate);
      expect(result).toBeGreaterThanOrEqual(FSRS_RETENTION_MIN);
      expect(result).toBeLessThanOrEqual(FSRS_RETENTION_MAX);
    }
  });
});
