import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAdjustedRetention } from "../fsrs";
import { blockToPlainText } from "../block-text";
import { getChapterContent, activeFlashcards, shuffle, toReviewState, toFlashcard, resolveFicheContexts } from "./shared";
import type { Chapter, Flashcard, ReviewState, FlashcardSide, Book, BlockType, BlockContent, FlashcardVariant } from "../types";
import type { ElProfesorReviewStateRow, ElProfesorFicheRow, ElProfesorFlashcardRow } from "@/lib/supabase/types";

/** Flashcard IDs this user has excluded from their own reviews — never affects other users or deletes the card itself. */
async function getSuspendedFlashcardIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_suspended_flashcards").select("flashcard_id").eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.flashcard_id));
}

/** Excludes a flashcard from this user's own reviews (scheduled, global due, carnet d'erreurs, carte du jour, free review). */
export async function suspendFlashcard(userId: string, flashcardId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("el_profesor_suspended_flashcards")
    .upsert({ user_id: userId, flashcard_id: flashcardId }, { onConflict: "user_id,flashcard_id" });
}

/** Puts a previously-excluded flashcard back into this user's reviews. */
export async function unsuspendFlashcard(userId: string, flashcardId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("el_profesor_suspended_flashcards").delete().eq("user_id", userId).eq("flashcard_id", flashcardId);
}

export interface SuspendedFlashcard {
  flashcardId: string;
  front: string;
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
}

/** Every flashcard this user has excluded from their reviews, for a small "cartes exclues" management screen. */
export async function getSuspendedFlashcards(userId: string): Promise<SuspendedFlashcard[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("el_profesor_suspended_flashcards")
    .select("flashcard_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const ids = (rows ?? []).map((r) => r.flashcard_id);
  if (ids.length === 0) return [];

  const { data: cards } = await supabase.from("el_profesor_flashcards").select("id, front, fiche_id").in("id", ids);
  if (!cards || cards.length === 0) return [];

  const ficheIds = [...new Set(cards.map((c) => c.fiche_id))];
  const ficheContexts = await resolveFicheContexts(ficheIds);

  return cards
    .map((c) => {
      const ctx = ficheContexts.get(c.fiche_id);
      if (!ctx) return null;
      return {
        flashcardId: c.id,
        front: (c.front as FlashcardSide).text,
        chapterId: ctx.chapterId,
        chapterTitle: ctx.chapterTitle,
        bookTitle: ctx.bookTitle,
      } satisfies SuspendedFlashcard;
    })
    .filter((c): c is SuspendedFlashcard => c !== null);
}

/** Flashcards due today (or new) for a chapter, for the scheduled review queue. */
export async function getDueQueue(userId: string, chapterId: string): Promise<Flashcard[]> {
  const supabase = await createClient();
  const content = await getChapterContent(chapterId, false);
  const flashcards = activeFlashcards(content);
  if (flashcards.length === 0) return [];

  const [{ data: states }, suspended] = await Promise.all([
    supabase
      .from("el_profesor_review_state")
      .select("*")
      .eq("user_id", userId)
      .in(
        "flashcard_id",
        flashcards.map((f) => f.id)
      ),
    getSuspendedFlashcardIds(userId),
  ]);

  const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s as ElProfesorReviewStateRow]));
  const now = Date.now();

  const due = flashcards
    .filter((card) => !suspended.has(card.id))
    .map((card) => ({ card, dueAt: stateByCard.get(card.id)?.due }))
    .filter(({ dueAt }) => !dueAt || new Date(dueAt).getTime() <= now);

  // Most-overdue first (never-reviewed cards sort as "due now", after any
  // genuinely overdue review), so lapsed knowledge gets priority over new material.
  due.sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : now) - (b.dueAt ? new Date(b.dueAt).getTime() : now));

  return due.map(({ card }) => card);
}

/** Due queue across every published chapter the user can see — for interleaved, cross-topic review instead of one chapter at a time. */
export async function getGlobalDueQueue(userId: string, chapters: Chapter[]): Promise<Flashcard[]> {
  const published = chapters.filter((c) => c.status === "published");
  const perChapter = await Promise.all(published.map((c) => getDueQueue(userId, c.id)));
  // Each getDueQueue result is already sorted most-overdue-first; a plain
  // concat would still group by chapter, so re-derive due dates for a
  // global sort instead of re-querying — cheap since queues are small.
  return perChapter.flat();
}

/**
 * Due queue for one notion, across every book that covers it — item 54 of
 * the backlog: revise a theme in one interleaved session instead of
 * repeating the same fact once per book. Mirrors getDueQueue's due-date
 * logic exactly, just sourced from the notion's linked (published,
 * non-superseded) fiches instead of one chapter's.
 */
export async function getNotionDueQueue(userId: string, notionId: string): Promise<Flashcard[]> {
  const supabase = await createClient();

  const { data: links } = await supabase.from("el_profesor_notion_links").select("fiche_id").eq("notion_id", notionId);
  const linkedFicheIds = [...new Set((links ?? []).map((l) => l.fiche_id))];
  if (linkedFicheIds.length === 0) return [];

  const { data: ficheRows } = await supabase
    .from("el_profesor_fiches")
    .select("*")
    .in("id", linkedFicheIds)
    .eq("status", "published");
  const activeFicheIds = ((ficheRows ?? []) as ElProfesorFicheRow[])
    .filter((f) => !f.superseded_by_fiche_id)
    .map((f) => f.id);
  if (activeFicheIds.length === 0) return [];

  const [{ data: cardRows }, suspended] = await Promise.all([
    supabase.from("el_profesor_flashcards").select("*").in("fiche_id", activeFicheIds).eq("status", "published"),
    getSuspendedFlashcardIds(userId),
  ]);
  const flashcards = ((cardRows ?? []) as ElProfesorFlashcardRow[]).map(toFlashcard);
  if (flashcards.length === 0) return [];

  const { data: states } = await supabase
    .from("el_profesor_review_state")
    .select("*")
    .eq("user_id", userId)
    .in(
      "flashcard_id",
      flashcards.map((f) => f.id)
    );
  const stateByCard = new Map(((states ?? []) as ElProfesorReviewStateRow[]).map((s) => [s.flashcard_id, s]));
  const now = Date.now();

  const due = flashcards
    .filter((card) => !suspended.has(card.id))
    .map((card) => ({ card, dueAt: stateByCard.get(card.id)?.due }))
    .filter(({ dueAt }) => !dueAt || new Date(dueAt).getTime() <= now);

  due.sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : now) - (b.dueAt ? new Date(b.dueAt).getTime() : now));
  return due.map(({ card }) => card);
}

/**
 * "Carnet d'erreurs": flashcards the user is currently struggling with —
 * either FSRS put them back in "relearning" after a recent miss, or they've
 * accumulated repeat lapses over time. Deliberate practice on known weak
 * spots, not just whatever happens to be due today.
 */
export async function getDifficultQueue(userId: string, chapters: Chapter[]): Promise<Flashcard[]> {
  const supabase = await createClient();
  const published = chapters.filter((c) => c.status === "published");
  const suspended = await getSuspendedFlashcardIds(userId);

  const perChapter = await Promise.all(
    published.map(async (chapter) => {
      const content = await getChapterContent(chapter.id, false);
      const flashcards = activeFlashcards(content);
      if (flashcards.length === 0) return [];

      const { data: states } = await supabase
        .from("el_profesor_review_state")
        .select("flashcard_id, state, lapses")
        .eq("user_id", userId)
        .in(
          "flashcard_id",
          flashcards.map((f) => f.id)
        );
      const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s]));

      return flashcards.filter((card) => {
        if (suspended.has(card.id)) return false;
        const state = stateByCard.get(card.id);
        return !!state && (state.state === "relearning" || state.lapses >= 2);
      });
    })
  );

  return shuffle(perChapter.flat());
}

/**
 * "Carte du jour": one already-mastered flashcard resurfaced as a passive
 * daily refresher on the dashboard — a light retrieval-practice nudge that
 * doesn't require starting a full session. Deterministic per UTC day (same
 * card all day, a different one tomorrow) rather than re-randomized on
 * every page load, and falls back to any published card while nothing is
 * mastered yet.
 */
export async function getDailyCard(userId: string, chapters: Chapter[]): Promise<Flashcard | null> {
  const supabase = await createClient();
  const published = chapters.filter((c) => c.status === "published");

  const [perChapter, suspended] = await Promise.all([
    Promise.all(published.map((c) => getChapterContent(c.id, false))),
    getSuspendedFlashcardIds(userId),
  ]);
  const all = activeFlashcards(perChapter.flat()).filter((c) => !suspended.has(c.id));
  if (all.length === 0) return null;

  const { data: states } = await supabase
    .from("el_profesor_review_state")
    .select("flashcard_id")
    .eq("user_id", userId)
    .eq("state", "review")
    .in(
      "flashcard_id",
      all.map((c) => c.id)
    );
  const masteredIds = new Set((states ?? []).map((s) => s.flashcard_id));
  const pool = all.filter((c) => masteredIds.has(c.id));
  const source = pool.length > 0 ? pool : all;

  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return source[dayIndex % source.length];
}

/** Per-chapter "carnet d'erreurs" counts — same criteria as getDifficultQueue, tallied by chapter for the dashboard cards. */
export async function getDifficultCountsByChapter(userId: string, chapters: Chapter[]): Promise<ChapterDueCounts> {
  const counts: ChapterDueCounts = {};
  const supabase = await createClient();
  const suspended = await getSuspendedFlashcardIds(userId);

  await Promise.all(
    chapters
      .filter((c) => c.status === "published")
      .map(async (chapter) => {
        const content = await getChapterContent(chapter.id, false);
        const flashcards = activeFlashcards(content);
        if (flashcards.length === 0) {
          counts[chapter.id] = 0;
          return;
        }

        const { data: states } = await supabase
          .from("el_profesor_review_state")
          .select("flashcard_id, state, lapses")
          .eq("user_id", userId)
          .in(
            "flashcard_id",
            flashcards.map((f) => f.id)
          );
        const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s]));

        counts[chapter.id] = flashcards.filter((card) => {
          if (suspended.has(card.id)) return false;
          const state = stateByCard.get(card.id);
          return !!state && (state.state === "relearning" || state.lapses >= 2);
        }).length;
      })
  );

  return counts;
}

export interface ReviewActivitySummary {
  currentStreak: number;
  longestStreak: number;
  /** Oldest first, one entry per day, for a consistency heatmap. */
  last12Weeks: { date: string; count: number }[];
}

/** Review streaks + a 12-week activity heatmap, derived from raw review log timestamps (UTC day buckets). */
export async function getReviewActivitySummary(userId: string): Promise<ReviewActivitySummary> {
  const supabase = await createClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 83);
  since.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("el_profesor_review_log")
    .select("reviewed_at")
    .eq("user_id", userId)
    .gte("reviewed_at", since.toISOString());

  const countByDay = new Map<string, number>();
  for (const row of data ?? []) {
    const day = row.reviewed_at.slice(0, 10);
    countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
  }

  const last12Weeks: { date: string; count: number }[] = [];
  const cursor = new Date(since);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  while (cursor <= today) {
    const date = cursor.toISOString().slice(0, 10);
    last12Weeks.push({ date, count: countByDay.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Today having zero reviews yet doesn't break the streak — the day isn't
  // over. Only a truly empty past day stops the count.
  let currentStreak = 0;
  let cursorIndex = last12Weeks.length - 1;
  const todayStr = today.toISOString().slice(0, 10);
  if (last12Weeks[cursorIndex]?.date === todayStr && last12Weeks[cursorIndex].count === 0) cursorIndex--;
  for (; cursorIndex >= 0; cursorIndex--) {
    if (last12Weeks[cursorIndex].count > 0) currentStreak++;
    else break;
  }

  let longestStreak = 0;
  let running = 0;
  for (const day of last12Weeks) {
    if (day.count > 0) {
      running++;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }

  return { currentStreak, longestStreak, last12Weeks };
}

/**
 * Number of reviews in the last `days` where the user marked themselves
 * "sûr(e)" before revealing the answer and then answered "Incorrect" —
 * the state the audit's "calibration de la confiance" piste calls the most
 * dangerous in clinical practice (confidently wrong beats knowingly unsure).
 */
export async function getOverconfidentMissCount(userId: string, days = 30): Promise<number> {
  const supabase = await createClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const { count } = await supabase
    .from("el_profesor_review_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("confidence", "sure")
    .eq("rating", "again")
    .gte("reviewed_at", since.toISOString());

  return count ?? 0;
}

/** Every published flashcard for a chapter, ignoring due dates — free/on-demand review, shuffled for variety across sessions. */
export async function getFreeReviewQueue(chapterId: string, userId: string): Promise<Flashcard[]> {
  const [content, suspended] = await Promise.all([getChapterContent(chapterId, false), getSuspendedFlashcardIds(userId)]);
  return shuffle(activeFlashcards(content).filter((c) => !suspended.has(c.id)));
}

export async function getReviewState(userId: string, flashcardId: string): Promise<ReviewState | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_review_state")
    .select("*")
    .eq("user_id", userId)
    .eq("flashcard_id", flashcardId)
    .maybeSingle();
  return data ? toReviewState(data as ElProfesorReviewStateRow) : null;
}

/** Personalized FSRS retention target for this user — see maybeRecomputeUserFsrsRetention. Defaults to FSRS's own 0.9 until there's enough history to tune it. */
export async function getUserFsrsRetention(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_user_fsrs_params").select("request_retention").eq("user_id", userId).maybeSingle();
  return data?.request_retention ?? 0.9;
}

// Requires a real sample before tuning away from the default, and only
// re-evaluates every N new scheduled reviews so one bad day doesn't
// whipsaw the schedule. The adjustment formula itself lives in fsrs.ts
// (computeAdjustedRetention) so it can be unit-tested as pure logic.
const FSRS_RETENTION_MIN_REVIEWS = 50;
const FSRS_RETENTION_RECOMPUTE_EVERY = 20;

/**
 * Piste d'amélioration 2026-08-24 ("paramètres FSRS ajustés par
 * utilisateur") — see computeAdjustedRetention in fsrs.ts for the
 * adjustment itself and why it's deliberately narrower/safer than fitting
 * FSRS's full weight vector. Called opportunistically after a scheduled
 * review is recorded (submitReview) — cheap no-op until
 * FSRS_RETENTION_MIN_REVIEWS is reached and only actually recomputes every
 * FSRS_RETENTION_RECOMPUTE_EVERY new reviews.
 */
export async function maybeRecomputeUserFsrsRetention(userId: string): Promise<void> {
  const supabase = await createClient();
  const [{ data: params }, { count: totalReviews }] = await Promise.all([
    supabase.from("el_profesor_user_fsrs_params").select("reviews_at_last_update").eq("user_id", userId).maybeSingle(),
    supabase.from("el_profesor_review_log").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "scheduled"),
  ]);
  const total = totalReviews ?? 0;
  if (total < FSRS_RETENTION_MIN_REVIEWS) return;
  const lastUpdateCount = params?.reviews_at_last_update ?? 0;
  if (total - lastUpdateCount < FSRS_RETENTION_RECOMPUTE_EVERY) return;

  const { data: ratings } = await supabase.from("el_profesor_review_log").select("rating").eq("user_id", userId).eq("source", "scheduled");
  const rows = ratings ?? [];
  if (rows.length === 0) return;
  // "Success" = recalled at all (hard/good/easy), not specifically "good" — a 4-grade rating still only fails on "again".
  const successRate = rows.filter((r) => r.rating !== "again").length / rows.length;
  const clamped = computeAdjustedRetention(successRate);

  await supabase
    .from("el_profesor_user_fsrs_params")
    .upsert(
      { user_id: userId, request_retention: clamped, reviews_at_last_update: total, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
}

export type ChapterDueCounts = Record<string, number>;

export interface UpcomingForecastDay {
  date: string;
  count: number;
}

/**
 * Cards coming due over the next 7 days, one bucket per day. Never-reviewed
 * cards and anything already overdue both fold into today's bucket — same
 * "due now" rule getDueQueue uses — so this reads as "what's waiting today,
 * then what's coming."
 */
export async function getUpcomingReviewForecast(userId: string, chapters: Chapter[]): Promise<UpcomingForecastDay[]> {
  const supabase = await createClient();
  const published = chapters.filter((c) => c.status === "published");
  const perChapterContent = await Promise.all(published.map((c) => getChapterContent(c.id, false)));
  const flashcardIds = perChapterContent.flatMap((content) => activeFlashcards(content).map((f) => f.id));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets: UpcomingForecastDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count: 0 };
  });
  if (flashcardIds.length === 0) return buckets;

  const { data: states } = await supabase
    .from("el_profesor_review_state")
    .select("flashcard_id, due")
    .eq("user_id", userId)
    .in("flashcard_id", flashcardIds);

  const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s.due]));
  const bucketIndex = new Map(buckets.map((b, i) => [b.date, i]));

  for (const flashcardId of flashcardIds) {
    const dueAt = stateByCard.get(flashcardId);
    let dueDay = buckets[0].date;
    if (dueAt) {
      const d = new Date(dueAt);
      d.setUTCHours(0, 0, 0, 0);
      if (d >= today) dueDay = d.toISOString().slice(0, 10);
    }
    const idx = bucketIndex.get(dueDay);
    if (idx !== undefined) buckets[idx].count++;
  }

  return buckets;
}

/** Due-today count per chapter, for the dashboard's chapter cards. */
export async function getDueCountsByChapter(userId: string, chapters: Chapter[]): Promise<ChapterDueCounts> {
  const counts: ChapterDueCounts = {};
  await Promise.all(
    chapters
      .filter((c) => c.status === "published")
      .map(async (chapter) => {
        const due = await getDueQueue(userId, chapter.id);
        counts[chapter.id] = due.length;
      })
  );
  return counts;
}

export type ChapterMasteryCounts = Record<string, { total: number; new: number; learning: number; acquired: number }>;

/**
 * Per-chapter breakdown of the user's own memorization progress, for the
 * dashboard's motivational progress indicator. "new" = never reviewed,
 * "learning" = FSRS learning/relearning state, "acquired" = FSRS review
 * state (graduated past the initial learning phase).
 */
export async function getMasteryCountsByChapter(userId: string, chapters: Chapter[]): Promise<ChapterMasteryCounts> {
  const counts: ChapterMasteryCounts = {};
  const supabase = await createClient();

  await Promise.all(
    chapters
      .filter((c) => c.status === "published")
      .map(async (chapter) => {
        const content = await getChapterContent(chapter.id, false);
        const flashcards = activeFlashcards(content);
        const total = flashcards.length;
        if (total === 0) {
          counts[chapter.id] = { total: 0, new: 0, learning: 0, acquired: 0 };
          return;
        }

        const { data: states } = await supabase
          .from("el_profesor_review_state")
          .select("flashcard_id, state")
          .eq("user_id", userId)
          .in(
            "flashcard_id",
            flashcards.map((f) => f.id)
          );
        const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s.state]));

        let learning = 0;
        let acquired = 0;
        for (const card of flashcards) {
          const state = stateByCard.get(card.id);
          if (state === "review") acquired++;
          else if (state === "learning" || state === "relearning") learning++;
        }
        counts[chapter.id] = { total, new: total - stateByCard.size, learning, acquired };
      })
  );

  return counts;
}

/** Draft blocks/flashcards still flagged needs_review, per chapter — surfaces on the admin dashboard without opening each chapter. */
export async function getNeedsReviewCounts(chapterIds: string[]): Promise<ChapterDueCounts> {
  const counts: ChapterDueCounts = {};
  if (chapterIds.length === 0) return counts;
  const supabase = await createClient();

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, chapter_id").in("chapter_id", chapterIds);
  const chapterBySubEntity = new Map((subEntities ?? []).map((s) => [s.id, s.chapter_id]));
  const subEntityIds = (subEntities ?? []).map((s) => s.id);
  if (subEntityIds.length === 0) return counts;

  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id, sub_entity_id").in("sub_entity_id", subEntityIds);
  const chapterByFiche = new Map((fiches ?? []).map((f) => [f.id, chapterBySubEntity.get(f.sub_entity_id)]));
  const ficheIds = (fiches ?? []).map((f) => f.id);
  if (ficheIds.length === 0) return counts;

  const [blocksRes, flashcardsRes] = await Promise.all([
    supabase.from("el_profesor_fiche_blocks").select("fiche_id").eq("needs_review", true).eq("status", "draft").in("fiche_id", ficheIds),
    supabase.from("el_profesor_flashcards").select("fiche_id").eq("needs_review", true).eq("status", "draft").in("fiche_id", ficheIds),
  ]);

  for (const row of [...(blocksRes.data ?? []), ...(flashcardsRes.data ?? [])]) {
    const chapterId = chapterByFiche.get(row.fiche_id);
    if (!chapterId) continue;
    counts[chapterId] = (counts[chapterId] ?? 0) + 1;
  }
  return counts;
}

export interface DifficultFlashcardStat {
  flashcardId: string;
  front: string;
  bookTitle: string;
  chapterTitle: string;
  againCount: number;
}

/**
 * Anonymous, admin-only content-quality signal: flashcards most often
 * marked "again" across every user. el_profesor_review_log's RLS is
 * strictly per-user with no admin override (see migration comment) —
 * individual review history stays private — so this uses the service-role
 * client to aggregate, but only ever returns tallies per flashcard, never
 * which user answered what.
 */
export async function getMostDifficultFlashcardsGlobal(limit = 10): Promise<DifficultFlashcardStat[]> {
  const supabase = createAdminClient();

  const { data: logs } = await supabase.from("el_profesor_review_log").select("flashcard_id").eq("rating", "again");
  if (!logs || logs.length === 0) return [];

  const countByCard = new Map<string, number>();
  for (const row of logs) countByCard.set(row.flashcard_id, (countByCard.get(row.flashcard_id) ?? 0) + 1);

  const topIds = [...countByCard.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  if (topIds.length === 0) return [];

  const { data: flashcards } = await supabase
    .from("el_profesor_flashcards")
    .select("id, front, fiche_id")
    .in("id", topIds)
    .eq("status", "published");
  if (!flashcards || flashcards.length === 0) return [];

  const ficheIds = [...new Set(flashcards.map((f) => f.fiche_id))];
  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id, sub_entity_id").in("id", ficheIds);
  const subEntityByFiche = new Map((fiches ?? []).map((f) => [f.id, f.sub_entity_id]));
  const subEntityIds = [...new Set((fiches ?? []).map((f) => f.sub_entity_id))];

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, chapter_id").in("id", subEntityIds);
  const chapterBySubEntity = new Map((subEntities ?? []).map((s) => [s.id, s.chapter_id]));
  const chapterIds = [...new Set((subEntities ?? []).map((s) => s.chapter_id))];

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("id, title, book_id").in("id", chapterIds);
  const bookIdByChapter = new Map((chapters ?? []).map((c) => [c.id, c.book_id]));
  const chapterTitleById = new Map((chapters ?? []).map((c) => [c.id, c.title]));
  const bookIds = [...new Set((chapters ?? []).map((c) => c.book_id))];

  const { data: books } = await supabase.from("el_profesor_books").select("id, title").in("id", bookIds);
  const bookTitleById = new Map((books ?? []).map((b) => [b.id, b.title]));

  const stats: DifficultFlashcardStat[] = flashcards.map((f) => {
    const subEntityId = subEntityByFiche.get(f.fiche_id);
    const chapterId = subEntityId ? chapterBySubEntity.get(subEntityId) : undefined;
    const bookId = chapterId ? bookIdByChapter.get(chapterId) : undefined;
    return {
      flashcardId: f.id,
      front: (f.front as unknown as { text: string }).text,
      bookTitle: (bookId && bookTitleById.get(bookId)) || "",
      chapterTitle: (chapterId && chapterTitleById.get(chapterId)) || "",
      againCount: countByCard.get(f.id) ?? 0,
    };
  });

  return stats.sort((a, b) => b.againCount - a.againCount);
}

export interface LeechFlashcardStat {
  flashcardId: string;
  front: string;
  back: string;
  subEntityName: string;
  bookTitle: string;
  chapterTitle: string;
  attemptCount: number;
  againCount: number;
  againRate: number;
}

// A minimum sample before a rate means anything, and a rate high enough
// that the card — not the learner — is the likely problem.
const LEECH_MIN_ATTEMPTS = 8;
const LEECH_MIN_AGAIN_RATE = 0.5;

/**
 * "Cartes sangsues" — piste d'amélioration 2026-08-24 ("traitement des
 * cartes sangsues") : flashcards qu'un nombre suffisant d'utilisateurs
 * ratent de façon persistante, signe fréquent d'une carte mal formulée
 * plutôt que d'une vraie difficulté de la notion (question ambiguë, deux
 * informations demandées à la fois, réponse attendue trop vague...).
 * Distinct de getMostDifficultFlashcardsGlobal (classement par nombre brut
 * d'échecs) : ici un taux, avec un minimum d'essais, pour qu'une carte vue
 * deux fois et ratée une fois ne devance pas une carte vue 200 fois et
 * ratée 40 fois (20 %, bien plus parlant à volume). Même agrégat anonyme
 * que getMostDifficultFlashcardsGlobal — jamais quel utilisateur a répondu
 * quoi, seulement des tallies par carte.
 */
export async function getLeechFlashcards(limit = 10): Promise<LeechFlashcardStat[]> {
  const supabase = createAdminClient();
  const { data: logs } = await supabase.from("el_profesor_review_log").select("flashcard_id, rating").eq("source", "scheduled");
  if (!logs || logs.length === 0) return [];

  const statsByCard = new Map<string, { attempts: number; again: number }>();
  for (const row of logs) {
    const s = statsByCard.get(row.flashcard_id) ?? { attempts: 0, again: 0 };
    s.attempts++;
    if (row.rating === "again") s.again++;
    statsByCard.set(row.flashcard_id, s);
  }

  const leechIds = [...statsByCard.entries()]
    .filter(([, s]) => s.attempts >= LEECH_MIN_ATTEMPTS && s.again / s.attempts >= LEECH_MIN_AGAIN_RATE)
    .sort((a, b) => b[1].again / b[1].attempts - a[1].again / a[1].attempts)
    .slice(0, limit)
    .map(([id]) => id);
  if (leechIds.length === 0) return [];

  const { data: flashcards } = await supabase.from("el_profesor_flashcards").select("id, front, back, fiche_id").in("id", leechIds).eq("status", "published");
  if (!flashcards || flashcards.length === 0) return [];

  const ficheIds = [...new Set(flashcards.map((f) => f.fiche_id))];
  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id, sub_entity_id").in("id", ficheIds);
  const subEntityByFiche = new Map((fiches ?? []).map((f) => [f.id, f.sub_entity_id]));
  const ficheContexts = await resolveFicheContexts(ficheIds);
  const subEntityIds = [...new Set((fiches ?? []).map((f) => f.sub_entity_id))];
  const { data: subEntities } = subEntityIds.length ? await supabase.from("el_profesor_sub_entities").select("id, name").in("id", subEntityIds) : { data: [] };
  const subEntityNameById = new Map((subEntities ?? []).map((s) => [s.id, s.name]));

  const stats: LeechFlashcardStat[] = flashcards
    .map((f) => {
      const ctx = ficheContexts.get(f.fiche_id);
      const s = statsByCard.get(f.id);
      const subEntityId = subEntityByFiche.get(f.fiche_id);
      if (!ctx || !s) return null;
      return {
        flashcardId: f.id,
        front: (f.front as unknown as { text: string }).text,
        back: (f.back as unknown as { text: string }).text,
        subEntityName: (subEntityId && subEntityNameById.get(subEntityId)) || ctx.chapterTitle,
        bookTitle: ctx.bookTitle,
        chapterTitle: ctx.chapterTitle,
        attemptCount: s.attempts,
        againCount: s.again,
        againRate: s.again / s.attempts,
      } satisfies LeechFlashcardStat;
    })
    .filter((s): s is LeechFlashcardStat => s !== null);

  return stats.sort((a, b) => b.againRate - a.againRate);
}

export interface ReviewTimeStats {
  totalMs: number;
  last7DaysMs: number;
}

/** Total time spent in review sessions (sum of tracked per-card durations) — overall and over the last 7 days, for the dashboard's time-invested stat. */
export async function getReviewTimeStats(userId: string): Promise<ReviewTimeStats> {
  const supabase = await createClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);

  const { data } = await supabase
    .from("el_profesor_review_log")
    .select("duration_ms, reviewed_at")
    .eq("user_id", userId)
    .not("duration_ms", "is", null);

  let totalMs = 0;
  let last7DaysMs = 0;
  const sinceTime = since.getTime();
  for (const row of data ?? []) {
    const ms = row.duration_ms ?? 0;
    totalMs += ms;
    if (new Date(row.reviewed_at).getTime() >= sinceTime) last7DaysMs += ms;
  }
  return { totalMs, last7DaysMs };
}

export interface KnowledgeExpiryAlert {
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
  expiredCount: number;
  oldestOverdueDays: number;
}

const KNOWLEDGE_EXPIRY_OVERDUE_DAYS = 60;

/**
 * Piste d'amélioration 2026-08-24 ("alerte de péremption des
 * connaissances") — personal signal distinct from the everyday FSRS due
 * count (getDueCountsByChapter): a card a day or two overdue is routine
 * and already surfaced there. A card that's graduated to "review" state
 * (once actually mastered) and then sat unreviewed 60+ days past its due
 * date has had real time to decay — worth flagging as a dedicated
 * refresher rather than blending into the ordinary review queue.
 */
export async function getKnowledgeExpiryAlerts(userId: string, chapters: Chapter[], books: Book[]): Promise<KnowledgeExpiryAlert[]> {
  const supabase = await createClient();
  const bookTitleById = new Map(books.map((b) => [b.id, b.title]));
  const cutoff = Date.now() - KNOWLEDGE_EXPIRY_OVERDUE_DAYS * 24 * 60 * 60 * 1000;
  const alerts: KnowledgeExpiryAlert[] = [];

  await Promise.all(
    chapters
      .filter((c) => c.status === "published")
      .map(async (chapter) => {
        const content = await getChapterContent(chapter.id, false);
        const flashcards = activeFlashcards(content);
        if (flashcards.length === 0) return;

        const { data: states } = await supabase
          .from("el_profesor_review_state")
          .select("due")
          .eq("user_id", userId)
          .eq("state", "review")
          .in(
            "flashcard_id",
            flashcards.map((f) => f.id)
          );

        const overdue = (states ?? []).filter((s) => new Date(s.due).getTime() < cutoff);
        if (overdue.length === 0) return;

        const oldestDueMs = Math.min(...overdue.map((s) => new Date(s.due).getTime()));
        const oldestOverdueDays = Math.floor((Date.now() - oldestDueMs) / (24 * 60 * 60 * 1000));
        alerts.push({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          bookTitle: bookTitleById.get(chapter.bookId) ?? "",
          expiredCount: overdue.length,
          oldestOverdueDays,
        });
      })
  );

  return alerts.sort((a, b) => b.oldestOverdueDays - a.oldestOverdueDays);
}

export interface ChapterMasteryPercentile {
  masteredPct: number;
  engagedUsers: number;
}

/**
 * Anonymous, user-facing signal: of the users who have engaged with this
 * chapter (reviewed at least one of its cards), what percentage have fully
 * mastered every card. Uses the service-role client to aggregate across all
 * users — el_profesor_review_state's RLS is strictly per-user with no admin
 * override (see migration comment), so this only ever returns a rounded
 * percentage plus the engaged-user count, never anything tied to an
 * individual. A floor of 3 engaged users avoids a percentage that would
 * otherwise reveal a single other user's own mastery state.
 */
export async function getGlobalChapterMasteryPercentages(chapters: Chapter[]): Promise<Record<string, ChapterMasteryPercentile>> {
  const supabase = createAdminClient();
  const published = chapters.filter((c) => c.status === "published");
  const result: Record<string, ChapterMasteryPercentile> = {};

  await Promise.all(
    published.map(async (chapter) => {
      const content = await getChapterContent(chapter.id, false);
      const flashcardIds = activeFlashcards(content).map((f) => f.id);
      if (flashcardIds.length === 0) return;

      const { data: states } = await supabase
        .from("el_profesor_review_state")
        .select("user_id, flashcard_id, state")
        .in("flashcard_id", flashcardIds);

      const engagedUsers = new Set<string>();
      const acquiredByUser = new Map<string, Set<string>>();
      for (const row of states ?? []) {
        engagedUsers.add(row.user_id);
        if (row.state === "review") {
          if (!acquiredByUser.has(row.user_id)) acquiredByUser.set(row.user_id, new Set());
          acquiredByUser.get(row.user_id)!.add(row.flashcard_id);
        }
      }
      if (engagedUsers.size < 3) return;

      let masteredCount = 0;
      for (const userId of engagedUsers) {
        if ((acquiredByUser.get(userId)?.size ?? 0) === flashcardIds.length) masteredCount++;
      }
      result[chapter.id] = { masteredPct: Math.round((masteredCount / engagedUsers.size) * 100), engagedUsers: engagedUsers.size };
    })
  );

  return result;
}

// -- Spaced repetition per content block (parallel to the flashcard FSRS engine) --

export type BlockReviewState = { intervalDays: number; nextDueAt: string };

/** Per-block spaced-repetition state for a set of blocks, for the fiche viewer's "je m'en souviens" controls. Item 16 of the backlog. */
export async function getBlockReviewStates(userId: string, blockIds: string[]): Promise<Record<string, BlockReviewState>> {
  if (blockIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_block_review_state")
    .select("block_id, interval_days, next_due_at")
    .eq("user_id", userId)
    .in("block_id", blockIds);

  const result: Record<string, BlockReviewState> = {};
  for (const row of data ?? []) result[row.block_id] = { intervalDays: row.interval_days, nextDueAt: row.next_due_at };
  return result;
}

export interface DueBlockEntry {
  blockId: string;
  chapterId: string;
  chapterTitle: string;
  subEntityId: string;
  subEntityName: string;
  blockType: BlockType;
  excerpt: string;
  nextDueAt: string;
}

/** Blocks due for a re-read (not a flashcard review) — feeds the dashboard's "blocs à relire" widget. Item 16 of the backlog. */
export async function getDueBlocksForUser(userId: string, limit = 20): Promise<DueBlockEntry[]> {
  const supabase = await createClient();
  const { data: dueStates } = await supabase
    .from("el_profesor_block_review_state")
    .select("block_id, next_due_at")
    .eq("user_id", userId)
    .lte("next_due_at", new Date().toISOString())
    .order("next_due_at", { ascending: true })
    .limit(limit);
  if (!dueStates || dueStates.length === 0) return [];

  const dueAtByBlock = new Map(dueStates.map((s) => [s.block_id, s.next_due_at]));
  const { data: blocks } = await supabase
    .from("el_profesor_fiche_blocks")
    .select("id, fiche_id, block_type, content")
    .in(
      "id",
      dueStates.map((s) => s.block_id)
    )
    .eq("status", "published");
  if (!blocks || blocks.length === 0) return [];

  const ficheIds = [...new Set(blocks.map((b) => b.fiche_id))];
  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id, sub_entity_id, superseded_by_fiche_id").in("id", ficheIds).eq("status", "published");
  const activeFicheById = new Map((fiches ?? []).filter((f) => !f.superseded_by_fiche_id).map((f) => [f.id, f]));

  const subEntityIds = [...new Set([...activeFicheById.values()].map((f) => f.sub_entity_id))];
  if (subEntityIds.length === 0) return [];
  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, name, chapter_id").in("id", subEntityIds);
  const subEntityById = new Map((subEntities ?? []).map((s) => [s.id, s]));

  const chapterIds = [...new Set((subEntities ?? []).map((s) => s.chapter_id))];
  const { data: chapters } = await supabase.from("el_profesor_chapters").select("id, title").in("id", chapterIds).eq("status", "published");
  const chapterById = new Map((chapters ?? []).map((c) => [c.id, c]));

  const entries: DueBlockEntry[] = [];
  for (const block of blocks) {
    const fiche = activeFicheById.get(block.fiche_id);
    if (!fiche) continue;
    const subEntity = subEntityById.get(fiche.sub_entity_id);
    if (!subEntity) continue;
    const chapter = chapterById.get(subEntity.chapter_id);
    if (!chapter) continue;
    entries.push({
      blockId: block.id,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      subEntityId: subEntity.id,
      subEntityName: subEntity.name,
      blockType: block.block_type as BlockType,
      excerpt: blockToPlainText(block.block_type, block.content as BlockContent).slice(0, 140),
      nextDueAt: dueAtByBlock.get(block.id) ?? new Date().toISOString(),
    });
  }
  entries.sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime());
  return entries;
}

// -- Test de formulations de flashcards --------------------------------------

export interface FlashcardVariantStat {
  /** null = the flashcard's original front wording. */
  variantId: string | null;
  text: string;
  attempts: number;
  successRate: number;
}

/** Per-wording success rate from the review log — item 47 of the backlog. Every logged review (scheduled or free) counts: both reflect a genuine recall attempt against whatever wording was shown. */
export async function getFlashcardVariantStats(flashcardId: string, originalText: string, variants: FlashcardVariant[]): Promise<FlashcardVariantStat[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_review_log").select("rating, variant_id").eq("flashcard_id", flashcardId);
  const rows = data ?? [];

  const textById = new Map<string | null, string>([[null, originalText], ...variants.map((v) => [v.id, v.text] as const)]);
  const grouped = new Map<string | null, { attempts: number; success: number }>();
  for (const row of rows) {
    const key = row.variant_id;
    if (!grouped.has(key)) grouped.set(key, { attempts: 0, success: 0 });
    const entry = grouped.get(key)!;
    entry.attempts++;
    // "Success" = recalled at all (hard/good/easy) — a 4-grade rating still only fails on "again".
    if (row.rating !== "again") entry.success++;
  }

  return [...textById.entries()].map(([variantId, text]) => {
    const entry = grouped.get(variantId) ?? { attempts: 0, success: 0 };
    return { variantId, text, attempts: entry.attempts, successRate: entry.attempts > 0 ? entry.success / entry.attempts : 0 };
  });
}
