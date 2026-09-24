// Every dashboard widget, computed on the device from data already in the
// local cache (piste 2026-09-24 — suite au retour "pourquoi tu ne fais pas
// fonctionner les widgets localement plutôt que d'attendre une réponse à
// tes requêtes ?"). The server used to compute these on demand, and five of
// them (global due count, carnet d'erreurs, carte du jour, forecast,
// knowledge-expiry alerts) each re-read every chapter of the library one
// by one — thousands of queries per load, which is why the widgets hung for
// a minute then died with "unexpected response" (a function killed at its
// time limit). The device already holds all the inputs: every published
// chapter's content, this user's review states, excluded cards, bookmarks,
// notes, block re-read schedule and review-history aggregates. Only the
// few widgets built from OTHER users' data stay server-computed
// (DashboardExtras), fetched in the background and merged in when present.
//
// Pure functions only (no IndexedDB, no clock unless passed in) so each one
// is unit-tested against the documented semantics of the dal/ function it
// replaces — see local-widgets.test.ts. local-dashboard.ts loads the inputs.
import { blockToPlainText } from "./block-text";
import { computeLocalDueQueue } from "./local-review-queue";
import type {
  SubEntityWithFiche,
  BookWithChapters,
  ReviewActivitySummary,
  UpcomingForecastDay,
  KnowledgeExpiryAlert,
  DueBlockEntry,
  BookmarkedEntity,
  OnThisDayNote,
  BlockReviewState,
  GlobalProgressSummary,
  ChapterDueCounts,
} from "./dal";
import type { Flashcard, ReviewState, FicheBlock } from "./types";
import type { DashboardSecondaryData, DashboardExtras, CachedBookmark, CachedNote, ReviewDayStats } from "./dashboard-types";
import type { PendingWrite, LocalReviewEvent } from "./local-db";

const DAY_MS = 86_400_000;

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function activeFlashcards(content: SubEntityWithFiche[]): Flashcard[] {
  return content.flatMap((s) => (s.fiche && !s.fiche.supersededByFicheId ? s.fiche.flashcards : []));
}

export interface LocalLibraryChapter {
  id: string;
  title: string;
  bookTitle: string;
  content: SubEntityWithFiche[];
}

/**
 * The published chapters the dashboard shows, in library order, each with
 * its cached content — the common input of every widget below. A chapter
 * whose content isn't cached is left out (nothing to compute from), same
 * as a chapter that doesn't exist.
 */
export function buildLocalLibrary(books: BookWithChapters[], contentByChapterId: Map<string, SubEntityWithFiche[]>): LocalLibraryChapter[] {
  return books.flatMap((book) =>
    book.chapters.flatMap((chapter) => {
      const content = chapter.status === "published" ? contentByChapterId.get(chapter.id) : undefined;
      return content ? [{ id: chapter.id, title: chapter.title, bookTitle: book.title, content }] : [];
    })
  );
}

// ---------------------------------------------------------------------------
// Review history (streak/heatmap, time invested, overconfidence)
// ---------------------------------------------------------------------------

/**
 * Server history (per-UTC-day aggregates, see CachedReviewHistory) plus the
 * reviews answered on this device that it doesn't include yet — so a review
 * counts in the widgets the moment it's answered.
 */
export function mergeReviewDays(serverDays: Record<string, ReviewDayStats>, localEvents: LocalReviewEvent[]): Record<string, ReviewDayStats> {
  const days: Record<string, ReviewDayStats> = {};
  for (const [day, stats] of Object.entries(serverDays)) days[day] = { ...stats };
  for (const event of localEvents) {
    const day = utcDayKey(new Date(event.reviewedAt).getTime());
    const stats = (days[day] ??= { count: 0, ms: 0, sureMisses: 0 });
    stats.count++;
    stats.ms += event.durationMs ?? 0;
    if (event.confidence === "sure" && event.rating === "again") stats.sureMisses++;
  }
  return days;
}

/** Same sanity clamp submitReview applies before storing a duration — a tab left open mid-card must not count as an hour of study. */
export function cleanReviewDuration(durationMs: number | undefined): number | null {
  return durationMs != null && durationMs > 0 && durationMs < 5 * 60_000 ? Math.round(durationMs) : null;
}

/** Mirrors getReviewActivitySummary (dal/review.ts): 84 UTC days ending today, current streak (today not counting against it until it's over), longest streak within the window. */
export function computeActivitySummary(days: Record<string, ReviewDayStats>, now: number): ReviewActivitySummary {
  const today = startOfUtcDay(now);
  const last12Weeks: { date: string; count: number }[] = [];
  for (let t = today - 83 * DAY_MS; t <= today; t += DAY_MS) {
    const date = utcDayKey(t);
    last12Weeks.push({ date, count: days[date]?.count ?? 0 });
  }

  let currentStreak = 0;
  let cursor = last12Weeks.length - 1;
  if (last12Weeks[cursor]?.count === 0) cursor--;
  for (; cursor >= 0; cursor--) {
    if (last12Weeks[cursor].count > 0) currentStreak++;
    else break;
  }

  let longestStreak = 0;
  let running = 0;
  for (const day of last12Weeks) {
    running = day.count > 0 ? running + 1 : 0;
    longestStreak = Math.max(longestStreak, running);
  }

  return { currentStreak, longestStreak, last12Weeks };
}

/** Mirrors getReviewTimeStats: all-time total, plus the last 7 days (today and the 6 before it, by UTC day). */
export function computeReviewTimeStats(days: Record<string, ReviewDayStats>, now: number): { totalMs: number; last7DaysMs: number } {
  const firstRecentDay = utcDayKey(startOfUtcDay(now) - 6 * DAY_MS);
  let totalMs = 0;
  let last7DaysMs = 0;
  for (const [day, stats] of Object.entries(days)) {
    totalMs += stats.ms;
    if (day >= firstRecentDay) last7DaysMs += stats.ms;
  }
  return { totalMs, last7DaysMs };
}

/** Mirrors getOverconfidentMissCount: "sûr(e)" then "again", over the last 30 days (today and the 29 before it, by UTC day). */
export function computeOverconfidentMissCount(days: Record<string, ReviewDayStats>, now: number): number {
  const firstDay = utcDayKey(startOfUtcDay(now) - 29 * DAY_MS);
  let count = 0;
  for (const [day, stats] of Object.entries(days)) if (day >= firstDay) count += stats.sureMisses;
  return count;
}

// ---------------------------------------------------------------------------
// Flashcard-state widgets
// ---------------------------------------------------------------------------

/** Mirrors getGlobalDueQueue's length: literally the sum of the per-chapter due queues, so it can never disagree with the chapter badges or the queue itself. */
export function computeGlobalDueCount(library: LocalLibraryChapter[], reviewStates: Map<string, ReviewState>, suspendedIds: Set<string>, now: number): number {
  return library.reduce((sum, chapter) => sum + computeLocalDueQueue(chapter.content, reviewStates, suspendedIds, now).length, 0);
}

function isDifficult(card: Flashcard, reviewStates: Map<string, ReviewState>, suspendedIds: Set<string>): boolean {
  if (suspendedIds.has(card.id)) return false;
  const state = reviewStates.get(card.id);
  return !!state && (state.state === "relearning" || state.lapses >= 2);
}

/** Mirrors getDifficultCountsByChapter / getDifficultQueue's criteria: not excluded, and back in "relearning" or lapsed at least twice. */
export function computeDifficultCountsByChapter(library: LocalLibraryChapter[], reviewStates: Map<string, ReviewState>, suspendedIds: Set<string>): ChapterDueCounts {
  const counts: ChapterDueCounts = {};
  for (const chapter of library) counts[chapter.id] = activeFlashcards(chapter.content).filter((card) => isDifficult(card, reviewStates, suspendedIds)).length;
  return counts;
}

/** The "carnet d'erreurs" queue itself — same cards the counts above tally, in library order (the reviewer shuffles its own session). */
export function computeDifficultQueue(library: LocalLibraryChapter[], reviewStates: Map<string, ReviewState>, suspendedIds: Set<string>): Flashcard[] {
  return library.flatMap((chapter) => activeFlashcards(chapter.content).filter((card) => isDifficult(card, reviewStates, suspendedIds)));
}

/** Every chapter's due queue, concatenated in library order — mirrors getGlobalDueQueue exactly. */
export function computeGlobalDueQueue(library: LocalLibraryChapter[], reviewStates: Map<string, ReviewState>, suspendedIds: Set<string>, now: number): Flashcard[] {
  return library.flatMap((chapter) => computeLocalDueQueue(chapter.content, reviewStates, suspendedIds, now));
}

/**
 * Mirrors getUpcomingReviewForecast: one bucket per UTC day for the next 7
 * days, never-reviewed and overdue cards folded into today's. Unlike the
 * server version, excluded cards are left out — otherwise today's bucket
 * would disagree with the due count shown right next to it.
 */
export function computeForecast(library: LocalLibraryChapter[], reviewStates: Map<string, ReviewState>, suspendedIds: Set<string>, now: number): UpcomingForecastDay[] {
  const today = startOfUtcDay(now);
  const buckets: UpcomingForecastDay[] = Array.from({ length: 7 }, (_, i) => ({ date: utcDayKey(today + i * DAY_MS), count: 0 }));
  const indexByDate = new Map(buckets.map((b, i) => [b.date, i]));
  for (const chapter of library) {
    for (const card of activeFlashcards(chapter.content)) {
      if (suspendedIds.has(card.id)) continue;
      const due = reviewStates.get(card.id)?.due;
      const dueDay = due ? startOfUtcDay(new Date(due).getTime()) : today;
      const index = indexByDate.get(utcDayKey(Math.max(dueDay, today)));
      if (index !== undefined) buckets[index].count++;
    }
  }
  return buckets;
}

/** Mirrors getDailyCard: one already-mastered card (any card while nothing is mastered yet), deterministic per UTC day. */
export function computeDailyCard(library: LocalLibraryChapter[], reviewStates: Map<string, ReviewState>, suspendedIds: Set<string>, now: number): Flashcard | null {
  const all = library.flatMap((chapter) => activeFlashcards(chapter.content)).filter((card) => !suspendedIds.has(card.id));
  if (all.length === 0) return null;
  const mastered = all.filter((card) => reviewStates.get(card.id)?.state === "review");
  const source = mastered.length > 0 ? mastered : all;
  return source[Math.floor(now / DAY_MS) % source.length];
}

const KNOWLEDGE_EXPIRY_OVERDUE_DAYS = 60;

/** Mirrors getKnowledgeExpiryAlerts: mastered ("review" state) cards left 60+ days past due, per chapter, most-overdue chapter first. Excluded cards don't count. */
export function computeKnowledgeExpiryAlerts(
  library: LocalLibraryChapter[],
  reviewStates: Map<string, ReviewState>,
  suspendedIds: Set<string>,
  now: number
): KnowledgeExpiryAlert[] {
  const cutoff = now - KNOWLEDGE_EXPIRY_OVERDUE_DAYS * DAY_MS;
  const alerts: KnowledgeExpiryAlert[] = [];
  for (const chapter of library) {
    const overdueDueTimes = activeFlashcards(chapter.content)
      .filter((card) => !suspendedIds.has(card.id))
      .map((card) => reviewStates.get(card.id))
      .filter((state): state is ReviewState => !!state && state.state === "review" && new Date(state.due).getTime() < cutoff)
      .map((state) => new Date(state.due).getTime());
    if (overdueDueTimes.length === 0) continue;
    alerts.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      bookTitle: chapter.bookTitle,
      expiredCount: overdueDueTimes.length,
      oldestOverdueDays: Math.floor((now - Math.min(...overdueDueTimes)) / DAY_MS),
    });
  }
  return alerts.sort((a, b) => b.oldestOverdueDays - a.oldestOverdueDays);
}

/** Mirrors getGlobalProgressSummary: average read % over every active fiche, plus mastery over every active flashcard. */
export function computeGlobalProgress(
  library: LocalLibraryChapter[],
  ficheReadProgressByChapterId: Map<string, Record<string, number>>,
  reviewStates: Map<string, ReviewState>
): GlobalProgressSummary {
  let ficheCount = 0;
  let readSum = 0;
  let total = 0;
  let acquired = 0;
  let learning = 0;
  for (const chapter of library) {
    const readProgress = ficheReadProgressByChapterId.get(chapter.id) ?? {};
    for (const sub of chapter.content) {
      if (!sub.fiche || sub.fiche.supersededByFicheId) continue;
      ficheCount++;
      readSum += readProgress[sub.fiche.id] ?? 0;
      for (const card of sub.fiche.flashcards) {
        total++;
        const state = reviewStates.get(card.id)?.state;
        if (state === "review") acquired++;
        else if (state === "learning" || state === "relearning") learning++;
      }
    }
  }
  return { readPct: ficheCount > 0 ? Math.round(readSum / ficheCount) : 0, mastery: { total, acquired, learning } };
}

// ---------------------------------------------------------------------------
// Bookmarks, notes, block re-reads
// ---------------------------------------------------------------------------

interface SubEntityRef {
  subEntityId: string;
  subEntityName: string;
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
}

function indexSubEntities(library: LocalLibraryChapter[]): Map<string, SubEntityRef> {
  const index = new Map<string, SubEntityRef>();
  for (const chapter of library) {
    for (const sub of chapter.content) {
      index.set(sub.id, { subEntityId: sub.id, subEntityName: sub.name, chapterId: chapter.id, chapterTitle: chapter.title, bookTitle: chapter.bookTitle });
    }
  }
  return index;
}

/**
 * Cached bookmarks with the still-queued local changes applied on top (a
 * star toggled or tags edited since the last sync — possibly offline), so
 * "Mes favoris" and the chapter view agree with what the user just did.
 * The queue is oldest-first, so the latest change for a sub-entity wins.
 */
export function applyPendingBookmarkWrites(cached: CachedBookmark[], pending: PendingWrite[]): CachedBookmark[] {
  let list = [...cached];
  for (const write of pending) {
    if (write.kind === "bookmark") {
      const { subEntityId, bookmarked } = write.payload;
      const exists = list.some((b) => b.subEntityId === subEntityId);
      if (bookmarked && !exists) list = [{ subEntityId, tags: [], createdAt: write.createdAt }, ...list];
      if (!bookmarked) list = list.filter((b) => b.subEntityId !== subEntityId);
    } else if (write.kind === "adminAction" && write.payload.action === "bookmarks.setTags") {
      const [subEntityId, tags] = write.payload.args as [string, string[]];
      list = list.map((b) => (b.subEntityId === subEntityId ? { ...b, tags } : b));
    }
  }
  return list;
}

/** Same idea for notes: the latest still-queued content for each sub-entity wins over the cached copy. */
export function applyPendingNoteWrites(cached: Record<string, CachedNote>, pending: PendingWrite[]): Record<string, CachedNote> {
  const notes = { ...cached };
  for (const write of pending) {
    if (write.kind !== "note") continue;
    const { subEntityId, content } = write.payload;
    const existing = notes[subEntityId];
    notes[subEntityId] = { subEntityId, content, shareToken: existing?.shareToken ?? null, createdAt: existing?.createdAt ?? write.createdAt };
  }
  return notes;
}

/** Mirrors getBookmarkedEntities: newest first, only bookmarks whose sub-entity is still in a published chapter. */
export function computeBookmarks(library: LocalLibraryChapter[], bookmarks: CachedBookmark[]): BookmarkedEntity[] {
  const index = indexSubEntities(library);
  return bookmarks.flatMap((bookmark) => {
    const ref = index.get(bookmark.subEntityId);
    return ref ? [{ ...ref, tags: bookmark.tags }] : [];
  });
}

const ON_THIS_DAY_MONTHS_AGO = [1, 3, 6, 12, 18, 24, 36];

/** Mirrors getOnThisDayNote: a non-empty note written within ±3 days of 1, 3, 6… months ago today, earliest window first. */
export function computeOnThisDayNote(library: LocalLibraryChapter[], notes: Record<string, CachedNote>, now: number): OnThisDayNote | null {
  const index = indexSubEntities(library);
  const withContent = Object.values(notes)
    .filter((n) => n.content !== "")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const monthsAgo of ON_THIS_DAY_MONTHS_AGO) {
    const anchor = new Date(now);
    anchor.setUTCMonth(anchor.getUTCMonth() - monthsAgo);
    const windowStart = anchor.getTime() - 3 * DAY_MS;
    const windowEnd = anchor.getTime() + 3 * DAY_MS;
    for (const note of withContent) {
      const createdAt = new Date(note.createdAt).getTime();
      if (createdAt < windowStart || createdAt > windowEnd) continue;
      const ref = index.get(note.subEntityId);
      if (ref) return { ...ref, content: note.content, createdAt: note.createdAt };
    }
  }
  return null;
}

/** Mirrors getDueBlocksForUser: blocks of active fiches whose re-read is due, most overdue first, at most `limit`. */
export function computeDueBlocks(library: LocalLibraryChapter[], blockReviewStates: Record<string, BlockReviewState>, now: number, limit = 20): DueBlockEntry[] {
  const blockIndex = new Map<string, { block: FicheBlock; subEntityId: string; subEntityName: string; chapterId: string; chapterTitle: string }>();
  for (const chapter of library) {
    for (const sub of chapter.content) {
      if (!sub.fiche || sub.fiche.supersededByFicheId) continue;
      for (const block of sub.fiche.blocks) {
        blockIndex.set(block.id, { block, subEntityId: sub.id, subEntityName: sub.name, chapterId: chapter.id, chapterTitle: chapter.title });
      }
    }
  }

  const entries: DueBlockEntry[] = [];
  for (const [blockId, state] of Object.entries(blockReviewStates)) {
    if (new Date(state.nextDueAt).getTime() > now) continue;
    const ref = blockIndex.get(blockId);
    if (!ref) continue;
    entries.push({
      blockId,
      chapterId: ref.chapterId,
      chapterTitle: ref.chapterTitle,
      subEntityId: ref.subEntityId,
      subEntityName: ref.subEntityName,
      blockType: ref.block.blockType,
      excerpt: blockToPlainText(ref.block.blockType, ref.block.content).slice(0, 140),
      nextDueAt: state.nextDueAt,
    });
  }
  entries.sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime());
  return entries.slice(0, limit);
}

/** Same doubling interval markBlockReviewed (actions/block-review.ts) applies server-side, computed locally so a re-read is reflected instantly. */
export function nextBlockReviewState(existing: BlockReviewState | null | undefined, remembered: boolean, now: number): BlockReviewState {
  const intervalDays = remembered ? Math.min(Math.round((existing?.intervalDays ?? 1.5) * 2.2), 90) : 1;
  return { intervalDays, nextDueAt: new Date(now + intervalDays * DAY_MS).toISOString() };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface LocalWidgetInputs {
  library: LocalLibraryChapter[];
  reviewStates: Map<string, ReviewState>;
  suspendedIds: Set<string>;
  reviewDays: Record<string, ReviewDayStats>;
  bookmarks: CachedBookmark[];
  notes: Record<string, CachedNote>;
  blockReviewStates: Record<string, BlockReviewState>;
  now: number;
}

/** The whole DashboardSecondaryData the widgets render, built locally; the cross-user fields come from the background-fetched extras when there are any, and are simply empty until then. */
export function computeLocalWidgets(input: LocalWidgetInputs, extras: DashboardExtras | null): DashboardSecondaryData {
  const { library, reviewStates, suspendedIds, reviewDays, now } = input;
  const difficultCounts = computeDifficultCountsByChapter(library, reviewStates, suspendedIds);
  return {
    activity: computeActivitySummary(reviewDays, now),
    overconfidentMissCount: computeOverconfidentMissCount(reviewDays, now),
    forecast: computeForecast(library, reviewStates, suspendedIds, now),
    globalDueCount: computeGlobalDueCount(library, reviewStates, suspendedIds, now),
    difficultCount: Object.values(difficultCounts).reduce((sum, n) => sum + n, 0),
    mostDifficultGlobal: extras?.mostDifficultGlobal ?? [],
    leechFlashcards: extras?.leechFlashcards ?? [],
    dailyCard: computeDailyCard(library, reviewStates, suspendedIds, now),
    bookmarks: computeBookmarks(library, input.bookmarks),
    staleChapters: extras?.staleChapters ?? [],
    knowledgeExpiryAlerts: computeKnowledgeExpiryAlerts(library, reviewStates, suspendedIds, now),
    reviewTimeStats: computeReviewTimeStats(reviewDays, now),
    flagStatsByBlockType: extras?.flagStatsByBlockType ?? [],
    onThisDayNote: computeOnThisDayNote(library, input.notes, now),
    bookRecommendation: extras?.bookRecommendation ?? null,
    dueBlocks: computeDueBlocks(library, input.blockReviewStates, now),
  };
}
