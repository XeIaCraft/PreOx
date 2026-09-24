import { describe, expect, it } from "vitest";
import { computeLocalDueQueue, computeLocalFreeQueue, computeLocalDueCounts, computeLocalMasteryCounts } from "./local-review-queue";
import type { Flashcard, ReviewState } from "./types";
import type { SubEntityWithFiche } from "./dal";

// Mirrors dal/review.ts's getDueQueue/getFreeReviewQueue/
// getDueCountsByChapter/getMasteryCountsByChapter semantics — these tests
// are the regression guard against the "à jour" bug (badge and queue
// silently disagreeing) ever recurring: any change here should be checked
// against those server functions' documented behavior too.

function makeFlashcard(id: string): Flashcard {
  return {
    id,
    ficheId: `fiche-of-${id}`,
    front: { text: `front-${id}` },
    back: { text: `back-${id}` },
    citations: [],
    status: "published",
    needsReview: false,
    imageUrl: null,
    imageAlt: null,
    variants: [],
    imageOcclusions: [],
    clozeRanges: [],
    suggestedImagePage: null,
    suggestedImageHint: null,
  };
}

function makeSubEntity(id: string, flashcards: Flashcard[], supersededByFicheId: string | null = null): SubEntityWithFiche {
  return {
    id: `sub-${id}`,
    chapterId: "chapter-1",
    name: `sub-entity-${id}`,
    orderIndex: 0,
    summary: "",
    fiche: {
      id: `fiche-${id}`,
      subEntityId: `sub-${id}`,
      title: `fiche-${id}`,
      status: "published",
      shareToken: null,
      supersededByFicheId,
      supersededReason: supersededByFicheId ? "duplicate" : null,
      supersededNote: "",
      blocks: [],
      flashcards,
    },
  };
}

function makeReviewState(flashcardId: string, dueIso: string, state: ReviewState["state"] = "review"): ReviewState {
  return {
    flashcardId,
    due: dueIso,
    stability: 5,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 3,
    lapses: 0,
    state,
    lastReview: dueIso,
  };
}

const NOW = new Date("2026-01-01T12:00:00.000Z").getTime();
const PAST = new Date("2026-01-01T00:00:00.000Z").toISOString(); // due, overdue
const FUTURE = new Date("2026-01-02T00:00:00.000Z").toISOString(); // not due yet

describe("computeLocalDueQueue", () => {
  it("counts a never-reviewed card as due now", () => {
    const card = makeFlashcard("a");
    const content = [makeSubEntity("1", [card])];
    const queue = computeLocalDueQueue(content, new Map(), new Set(), NOW);
    expect(queue.map((c) => c.id)).toEqual(["a"]);
  });

  it("excludes a card whose review state isn't due yet", () => {
    const card = makeFlashcard("a");
    const content = [makeSubEntity("1", [card])];
    const states = new Map([["a", makeReviewState("a", FUTURE)]]);
    const queue = computeLocalDueQueue(content, states, new Set(), NOW);
    expect(queue).toEqual([]);
  });

  it("includes a card whose review state is overdue", () => {
    const card = makeFlashcard("a");
    const content = [makeSubEntity("1", [card])];
    const states = new Map([["a", makeReviewState("a", PAST)]]);
    const queue = computeLocalDueQueue(content, states, new Set(), NOW);
    expect(queue.map((c) => c.id)).toEqual(["a"]);
  });

  it("excludes a suspended card even if it's due", () => {
    const card = makeFlashcard("a");
    const content = [makeSubEntity("1", [card])];
    const states = new Map([["a", makeReviewState("a", PAST)]]);
    const queue = computeLocalDueQueue(content, states, new Set(["a"]), NOW);
    expect(queue).toEqual([]);
  });

  it("excludes flashcards belonging to a superseded fiche", () => {
    const card = makeFlashcard("a");
    const content = [makeSubEntity("1", [card], "some-other-fiche-id")];
    const queue = computeLocalDueQueue(content, new Map(), new Set(), NOW);
    expect(queue).toEqual([]);
  });

  it("sorts most-overdue first, treating never-reviewed cards as due 'now' (after genuinely overdue ones)", () => {
    const overdue = makeFlashcard("overdue");
    const neverReviewed = makeFlashcard("never-reviewed");
    const content = [makeSubEntity("1", [neverReviewed, overdue])];
    const states = new Map([["overdue", makeReviewState("overdue", PAST)]]);
    const queue = computeLocalDueQueue(content, states, new Set(), NOW);
    expect(queue.map((c) => c.id)).toEqual(["overdue", "never-reviewed"]);
  });
});

describe("computeLocalFreeQueue", () => {
  it("includes every non-suspended active flashcard regardless of due date", () => {
    const due = makeFlashcard("due");
    const notDue = makeFlashcard("not-due");
    const content = [makeSubEntity("1", [due, notDue])];
    const queue = computeLocalFreeQueue(content, new Set());
    expect(new Set(queue.map((c) => c.id))).toEqual(new Set(["due", "not-due"]));
  });

  it("excludes suspended cards", () => {
    const a = makeFlashcard("a");
    const b = makeFlashcard("b");
    const content = [makeSubEntity("1", [a, b])];
    const queue = computeLocalFreeQueue(content, new Set(["a"]));
    expect(queue.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("computeLocalDueCounts", () => {
  it("is exactly the due queue's length for each chapter — badge and queue can never disagree", () => {
    const cardA = makeFlashcard("a");
    const cardB = makeFlashcard("b");
    const contentByChapterId = new Map([
      ["chapter-1", [makeSubEntity("1", [cardA])]],
      ["chapter-2", [makeSubEntity("2", [cardB])]],
    ]);
    const states = new Map([["b", makeReviewState("b", FUTURE)]]);
    const counts = computeLocalDueCounts(contentByChapterId, states, new Set(), NOW);
    expect(counts).toEqual({ "chapter-1": 1, "chapter-2": 0 });
  });
});

describe("computeLocalMasteryCounts", () => {
  it("buckets by review state: no row -> new, 'review' -> acquired, learning/relearning -> learning", () => {
    const cardNew = makeFlashcard("new");
    const cardLearning = makeFlashcard("learning");
    const cardRelearning = makeFlashcard("relearning");
    const cardAcquired = makeFlashcard("acquired");
    const content = [makeSubEntity("1", [cardNew, cardLearning, cardRelearning, cardAcquired])];
    const states = new Map([
      ["learning", makeReviewState("learning", FUTURE, "learning")],
      ["relearning", makeReviewState("relearning", FUTURE, "relearning")],
      ["acquired", makeReviewState("acquired", FUTURE, "review")],
    ]);
    const counts = computeLocalMasteryCounts(new Map([["chapter-1", content]]), states);
    expect(counts["chapter-1"]).toEqual({ total: 4, new: 1, learning: 2, acquired: 1 });
  });

  it("returns all-zero for a chapter with no active flashcards", () => {
    const counts = computeLocalMasteryCounts(new Map([["chapter-1", []]]), new Map());
    expect(counts["chapter-1"]).toEqual({ total: 0, new: 0, learning: 0, acquired: 0 });
  });
});
