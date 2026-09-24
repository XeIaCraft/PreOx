import { describe, expect, it } from "vitest";
import {
  buildLocalLibrary,
  mergeReviewDays,
  cleanReviewDuration,
  computeActivitySummary,
  computeReviewTimeStats,
  computeOverconfidentMissCount,
  computeGlobalDueCount,
  computeGlobalDueQueue,
  computeDifficultCountsByChapter,
  computeDifficultQueue,
  computeForecast,
  computeDailyCard,
  computeKnowledgeExpiryAlerts,
  computeGlobalProgress,
  applyPendingBookmarkWrites,
  applyPendingNoteWrites,
  computeBookmarks,
  computeOnThisDayNote,
  computeDueBlocks,
  nextBlockReviewState,
  computeLocalWidgets,
  type LocalLibraryChapter,
} from "./local-widgets";
import type { Flashcard, FicheBlock, ReviewState } from "./types";
import type { SubEntityWithFiche, BookWithChapters } from "./dal";
import type { PendingWrite, LocalReviewEvent } from "./local-db";

// Each function here replaces a server-side dal/ function the dashboard
// used to call on every load — these tests pin the documented semantics of
// those functions (see local-widgets.ts) so the local numbers can't quietly
// drift from what the server would have shown.

const DAY = 86_400_000;
const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

function card(id: string): Flashcard {
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

function block(id: string, text: string): FicheBlock {
  return {
    id,
    ficheId: "f",
    orderIndex: 0,
    blockType: "definition_mecanisme",
    content: { text },
    citations: [],
    needsReview: false,
    status: "published",
    isEmergency: false,
    imageUrl: null,
    imageAlt: null,
  };
}

function sub(id: string, cards: Flashcard[], opts: { superseded?: boolean; blocks?: FicheBlock[] } = {}): SubEntityWithFiche {
  return {
    id,
    chapterId: "c",
    name: `name-${id}`,
    orderIndex: 0,
    summary: "",
    fiche: {
      id: `fiche-${id}`,
      subEntityId: id,
      title: `fiche-${id}`,
      status: "published",
      shareToken: null,
      supersededByFicheId: opts.superseded ? "other" : null,
      supersededReason: opts.superseded ? "duplicate" : null,
      supersededNote: "",
      blocks: opts.blocks ?? [],
      flashcards: cards,
    },
  };
}

function chapter(id: string, content: SubEntityWithFiche[], title = `chapter-${id}`, bookTitle = "Livre"): LocalLibraryChapter {
  return { id, title, bookTitle, content };
}

function state(flashcardId: string, due: number, s: ReviewState["state"] = "review", lapses = 0): ReviewState {
  return {
    flashcardId,
    due: new Date(due).toISOString(),
    stability: 5,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 3,
    lapses,
    state: s,
    lastReview: new Date(due - DAY).toISOString(),
  };
}

function states(...list: ReviewState[]): Map<string, ReviewState> {
  return new Map(list.map((s) => [s.flashcardId, s]));
}

function event(id: string, reviewedAt: number, extra: Partial<LocalReviewEvent> = {}): LocalReviewEvent {
  return { id, flashcardId: `card-${id}`, source: "scheduled", reviewedAt: new Date(reviewedAt).toISOString(), durationMs: 1000, rating: "good", confidence: null, ...extra };
}

describe("buildLocalLibrary", () => {
  it("keeps published chapters with cached content, in library order", () => {
    const books = [
      {
        id: "b1",
        title: "Livre 1",
        chapters: [
          { id: "c1", title: "Un", status: "published" },
          { id: "c2", title: "Deux", status: "draft_ready" },
          { id: "c3", title: "Trois", status: "published" },
        ],
      },
    ] as unknown as BookWithChapters[];
    const content = new Map([
      ["c1", [sub("s1", [])]],
      ["c2", [sub("s2", [])]],
    ]);
    const library = buildLocalLibrary(books, content);
    expect(library.map((c) => c.id)).toEqual(["c1"]);
    expect(library[0]).toMatchObject({ title: "Un", bookTitle: "Livre 1" });
  });
});

describe("review history widgets", () => {
  it("adds local, not-yet-synced reviews on top of the server's day aggregates", () => {
    const days = mergeReviewDays({ "2026-06-15": { count: 2, ms: 3000, sureMisses: 0 } }, [
      event("a", NOW, { durationMs: 500, confidence: "sure", rating: "again" }),
      event("b", NOW - DAY, { durationMs: null }),
    ]);
    expect(days["2026-06-15"]).toEqual({ count: 3, ms: 3500, sureMisses: 1 });
    expect(days["2026-06-14"]).toEqual({ count: 1, ms: 0, sureMisses: 0 });
  });

  it("clamps durations exactly like submitReview", () => {
    expect(cleanReviewDuration(undefined)).toBeNull();
    expect(cleanReviewDuration(0)).toBeNull();
    expect(cleanReviewDuration(5 * 60_000)).toBeNull();
    expect(cleanReviewDuration(1234.6)).toBe(1235);
  });

  it("computes 84 days ending today, and a streak that today's empty count doesn't break", () => {
    const days = {
      "2026-06-14": { count: 4, ms: 0, sureMisses: 0 },
      "2026-06-13": { count: 1, ms: 0, sureMisses: 0 },
      "2026-06-11": { count: 2, ms: 0, sureMisses: 0 },
      "2026-06-10": { count: 2, ms: 0, sureMisses: 0 },
      "2026-06-09": { count: 2, ms: 0, sureMisses: 0 },
    };
    const summary = computeActivitySummary(days, NOW);
    expect(summary.last12Weeks).toHaveLength(84);
    expect(summary.last12Weeks[83]).toEqual({ date: "2026-06-15", count: 0 });
    expect(summary.currentStreak).toBe(2);
    expect(summary.longestStreak).toBe(3);
  });

  it("counts today in the streak as soon as there's a review today", () => {
    const summary = computeActivitySummary({ "2026-06-15": { count: 1, ms: 0, sureMisses: 0 }, "2026-06-14": { count: 1, ms: 0, sureMisses: 0 } }, NOW);
    expect(summary.currentStreak).toBe(2);
  });

  it("sums time over all days and over the last 7 days (today included)", () => {
    const days = {
      "2026-06-15": { count: 1, ms: 100, sureMisses: 0 },
      "2026-06-09": { count: 1, ms: 10, sureMisses: 0 },
      "2026-06-08": { count: 1, ms: 1, sureMisses: 0 },
    };
    expect(computeReviewTimeStats(days, NOW)).toEqual({ totalMs: 111, last7DaysMs: 110 });
  });

  it("counts overconfident misses over the last 30 days only", () => {
    const days = {
      "2026-06-15": { count: 1, ms: 0, sureMisses: 2 },
      "2026-05-17": { count: 1, ms: 0, sureMisses: 1 },
      "2026-05-16": { count: 1, ms: 0, sureMisses: 5 },
    };
    expect(computeOverconfidentMissCount(days, NOW)).toBe(3);
  });
});

describe("flashcard-state widgets", () => {
  const a = card("a");
  const b = card("b");
  const c = card("c");
  const library = [chapter("c1", [sub("s1", [a, b])]), chapter("c2", [sub("s2", [c]), sub("s3", [card("gone")], { superseded: true })])];

  it("global due count is exactly the sum of the per-chapter due queues, excluded cards left out", () => {
    const reviewStates = states(state("b", NOW + DAY));
    expect(computeGlobalDueCount(library, reviewStates, new Set(), NOW)).toBe(2); // a (new) + c (new)
    expect(computeGlobalDueCount(library, reviewStates, new Set(["c"]), NOW)).toBe(1);
    expect(computeGlobalDueQueue(library, reviewStates, new Set(), NOW).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("difficult = relearning or lapsed twice, never an excluded card", () => {
    const reviewStates = states(state("a", NOW, "relearning"), state("b", NOW, "review", 2), state("c", NOW, "review", 1));
    expect(computeDifficultCountsByChapter(library, reviewStates, new Set())).toEqual({ c1: 2, c2: 0 });
    expect(computeDifficultCountsByChapter(library, reviewStates, new Set(["a"]))).toEqual({ c1: 1, c2: 0 });
    expect(computeDifficultQueue(library, reviewStates, new Set()).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("forecast folds new and overdue cards into today and buckets the rest by UTC day", () => {
    const reviewStates = states(state("a", NOW - 10 * DAY), state("b", NOW + 2 * DAY), state("c", NOW + 30 * DAY));
    const forecast = computeForecast(library, reviewStates, new Set(), NOW);
    expect(forecast).toHaveLength(7);
    expect(forecast[0]).toEqual({ date: "2026-06-15", count: 1 });
    expect(forecast[2]).toEqual({ date: "2026-06-17", count: 1 });
    expect(forecast.reduce((sum, d) => sum + d.count, 0)).toBe(2);
  });

  it("carte du jour prefers mastered cards, is stable within a UTC day and skips excluded ones", () => {
    const reviewStates = states(state("b", NOW + DAY, "review"));
    expect(computeDailyCard(library, reviewStates, new Set(), NOW)?.id).toBe("b");
    expect(computeDailyCard(library, reviewStates, new Set(), NOW + 3600_000)?.id).toBe("b");
    expect(computeDailyCard(library, reviewStates, new Set(["b"]), NOW)?.id).not.toBe("b");
    expect(computeDailyCard([], reviewStates, new Set(), NOW)).toBeNull();
  });

  it("flags mastered cards 60+ days past due, per chapter, most overdue first", () => {
    const reviewStates = states(state("a", NOW - 61 * DAY), state("b", NOW - 90 * DAY, "learning"), state("c", NOW - 100 * DAY));
    const alerts = computeKnowledgeExpiryAlerts(library, reviewStates, new Set(), NOW);
    expect(alerts.map((x) => [x.chapterId, x.expiredCount, x.oldestOverdueDays])).toEqual([
      ["c2", 1, 100],
      ["c1", 1, 61],
    ]);
  });

  it("global progress averages read % over active fiches and buckets mastery over their cards", () => {
    const reviewStates = states(state("a", NOW, "review"), state("b", NOW, "learning"));
    const progress = computeGlobalProgress(library, new Map([["c1", { "fiche-s1": 80 }]]), reviewStates);
    expect(progress).toEqual({ readPct: 40, mastery: { total: 3, acquired: 1, learning: 1 } });
  });
});

describe("bookmarks, notes and block re-reads", () => {
  const library = [chapter("c1", [sub("s1", [], { blocks: [block("blk1", "Texte du bloc")] }), sub("s2", [])], "Chapitre 1", "Livre A")];
  const pendingBookmark = (subEntityId: string, bookmarked: boolean, createdAt = "2026-06-15T10:00:00.000Z"): PendingWrite => ({
    id: `bookmark:${subEntityId}`,
    kind: "bookmark",
    createdAt,
    payload: { subEntityId, bookmarked },
  });

  it("applies queued star toggles and tag edits on top of the cached bookmarks", () => {
    const cached = [{ subEntityId: "s1", tags: ["old"], createdAt: "2026-01-01T00:00:00.000Z" }];
    const tagWrite: PendingWrite = { id: "t", kind: "adminAction", createdAt: "x", payload: { action: "bookmarks.setTags", args: ["s1", ["new"]] } };
    expect(applyPendingBookmarkWrites(cached, [pendingBookmark("s2", true), tagWrite]).map((b) => [b.subEntityId, b.tags])).toEqual([
      ["s2", []],
      ["s1", ["new"]],
    ]);
    expect(applyPendingBookmarkWrites(cached, [pendingBookmark("s1", false)])).toEqual([]);
  });

  it("resolves bookmarks against the cached library and drops ones no longer published", () => {
    const bookmarks = computeBookmarks(library, [
      { subEntityId: "s2", tags: ["t"], createdAt: "" },
      { subEntityId: "missing", tags: [], createdAt: "" },
    ]);
    expect(bookmarks).toEqual([{ subEntityId: "s2", subEntityName: "name-s2", chapterId: "c1", chapterTitle: "Chapitre 1", bookTitle: "Livre A", tags: ["t"] }]);
  });

  it("queued note content wins over the cached note", () => {
    const cached = { s1: { subEntityId: "s1", content: "old", shareToken: "tok", createdAt: "2026-01-01T00:00:00.000Z" } };
    const write: PendingWrite = { id: "note:s1", kind: "note", createdAt: "2026-06-15T10:00:00.000Z", payload: { subEntityId: "s1", content: "new" } };
    expect(applyPendingNoteWrites(cached, [write]).s1).toEqual({ subEntityId: "s1", content: "new", shareToken: "tok", createdAt: "2026-01-01T00:00:00.000Z" });
  });

  it("resurfaces a note written about a month ago (±3 days), never an empty one", () => {
    const monthAgo = new Date(NOW);
    monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
    const notes = {
      s1: { subEntityId: "s1", content: "", shareToken: null, createdAt: monthAgo.toISOString() },
      s2: { subEntityId: "s2", content: "Ma note", shareToken: null, createdAt: new Date(monthAgo.getTime() + 2 * DAY).toISOString() },
    };
    expect(computeOnThisDayNote(library, notes, NOW)).toMatchObject({ subEntityId: "s2", content: "Ma note", chapterTitle: "Chapitre 1" });
    expect(computeOnThisDayNote(library, { s2: { ...notes.s2, createdAt: new Date(NOW - 10 * DAY).toISOString() } }, NOW)).toBeNull();
  });

  it("lists blocks whose re-read is due, most overdue first, with an excerpt", () => {
    const due = computeDueBlocks(
      library,
      {
        blk1: { intervalDays: 2, nextDueAt: new Date(NOW - DAY).toISOString() },
        unknown: { intervalDays: 2, nextDueAt: new Date(NOW - 2 * DAY).toISOString() },
      },
      NOW
    );
    expect(due).toEqual([
      {
        blockId: "blk1",
        chapterId: "c1",
        chapterTitle: "Chapitre 1",
        subEntityId: "s1",
        subEntityName: "name-s1",
        blockType: "definition_mecanisme",
        excerpt: "Texte du bloc",
        nextDueAt: new Date(NOW - DAY).toISOString(),
      },
    ]);
    expect(computeDueBlocks(library, { blk1: { intervalDays: 2, nextDueAt: new Date(NOW + DAY).toISOString() } }, NOW)).toEqual([]);
  });

  it("schedules a block re-read with the same doubling interval as markBlockReviewed", () => {
    expect(nextBlockReviewState(null, true, NOW).intervalDays).toBe(3);
    expect(nextBlockReviewState({ intervalDays: 3, nextDueAt: "" }, true, NOW).intervalDays).toBe(7);
    expect(nextBlockReviewState({ intervalDays: 60, nextDueAt: "" }, true, NOW).intervalDays).toBe(90);
    expect(nextBlockReviewState({ intervalDays: 60, nextDueAt: "" }, false, NOW)).toEqual({ intervalDays: 1, nextDueAt: new Date(NOW + DAY).toISOString() });
  });
});

describe("computeLocalWidgets", () => {
  it("builds every widget locally and only takes the cross-user fields from the extras", () => {
    const library = [chapter("c1", [sub("s1", [card("a")])])];
    const input = { library, reviewStates: new Map(), suspendedIds: new Set<string>(), reviewDays: {}, bookmarks: [], notes: {}, blockReviewStates: {}, now: NOW };
    const withoutExtras = computeLocalWidgets(input, null);
    expect(withoutExtras.globalDueCount).toBe(1);
    expect(withoutExtras.dailyCard?.id).toBe("a");
    expect(withoutExtras.mostDifficultGlobal).toEqual([]);
    expect(withoutExtras.bookRecommendation).toBeNull();

    const recommendation = { bookId: "b2", bookTitle: "Autre", firstChapterId: "c9", otherUsersEngaged: 3 };
    const withExtras = computeLocalWidgets(input, {
      globalMastery: {},
      bookRecommendation: recommendation,
      mostDifficultGlobal: [],
      leechFlashcards: [],
      flagStatsByBlockType: [],
      staleChapters: [],
    });
    expect(withExtras.bookRecommendation).toEqual(recommendation);
  });
});
