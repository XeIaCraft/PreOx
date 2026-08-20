import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import { EL_PROFESOR_GEMINI_MODEL_DEFAULT } from "./gemini";
import { decryptSecret } from "@/lib/crypto";
import { GeminiError } from "@/lib/gemini-shared";
import type { Profile } from "@/lib/supabase/types";
import type {
  Book,
  BlockType,
  Chapter,
  SubEntity,
  Fiche,
  FicheBlock,
  Flashcard,
  Flag,
  ReviewState,
  BlockContent,
  Citation,
  FlashcardSide,
} from "./types";
import type {
  ElProfesorBookRow,
  ElProfesorChapterRow,
  ElProfesorSubEntityRow,
  ElProfesorFicheRow,
  ElProfesorFicheBlockRow,
  ElProfesorFlashcardRow,
  ElProfesorReviewStateRow,
  ElProfesorFlagRow,
} from "@/lib/supabase/types";

/** Same access-check every other module page uses — gated by the hub's own RBAC. */
export async function requireElProfesorAccess(): Promise<Profile> {
  const profile = await requireProfile();
  const app = await getAppBySlugForProfile("el-profesor", profile);
  if (!app || !app.hasAccess) {
    notFound();
  }
  return profile;
}

/** Import/extraction/publication are admin-only — reuses the hub's existing admin role. */
export async function requireElProfesorAdmin(): Promise<Profile> {
  const profile = await requireElProfesorAccess();
  if (profile.role !== "admin") {
    notFound();
  }
  return profile;
}

function toBook(row: ElProfesorBookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    edition: row.edition,
    coverUrl: row.cover_url,
    theme: row.theme,
    orderIndex: row.order_index,
    createdAt: row.created_at,
  };
}

function toChapter(row: ElProfesorChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    orderIndex: row.order_index,
    pdfStoragePath: row.pdf_storage_path,
    pdfPageCount: row.pdf_page_count,
    status: row.status,
    extractionError: row.extraction_error,
    estimatedRemainingPasses: row.estimated_remaining_passes,
  };
}

function toSubEntity(row: ElProfesorSubEntityRow): SubEntity {
  return { id: row.id, chapterId: row.chapter_id, name: row.name, orderIndex: row.order_index, summary: row.summary };
}

function toFiche(row: ElProfesorFicheRow): Fiche {
  return { id: row.id, subEntityId: row.sub_entity_id, title: row.title, status: row.status, shareToken: row.share_token };
}

function toFicheBlock(row: ElProfesorFicheBlockRow): FicheBlock {
  return {
    id: row.id,
    ficheId: row.fiche_id,
    orderIndex: row.order_index,
    blockType: row.block_type as FicheBlock["blockType"],
    content: row.content as unknown as BlockContent,
    citations: (row.citations as unknown as Citation[]) ?? [],
    needsReview: row.needs_review,
    status: row.status,
  };
}

function toFlashcard(row: ElProfesorFlashcardRow): Flashcard {
  return {
    id: row.id,
    ficheId: row.fiche_id,
    front: row.front as unknown as FlashcardSide,
    back: row.back as unknown as FlashcardSide,
    citations: (row.citations as unknown as Citation[]) ?? [],
    status: row.status,
    needsReview: row.needs_review,
  };
}

function toFlag(row: ElProfesorFlagRow): Flag {
  return { id: row.id, targetType: row.target_type, targetId: row.target_id, reason: row.reason, status: row.status };
}

/** Open (unresolved) user-submitted flags for a set of blocks/flashcards, keyed by target id — for the admin review screen. */
export async function getOpenFlagsByTarget(targetIds: string[]): Promise<Record<string, Flag[]>> {
  const byTarget: Record<string, Flag[]> = {};
  if (targetIds.length === 0) return byTarget;
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_flags").select("*").eq("status", "open").in("target_id", targetIds);
  for (const row of data ?? []) {
    const flag = toFlag(row as ElProfesorFlagRow);
    (byTarget[flag.targetId] ??= []).push(flag);
  }
  return byTarget;
}

export interface BookmarkedEntity {
  subEntityId: string;
  subEntityName: string;
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
}

/** Sub-entity ids the user has bookmarked — for showing a filled/outline star in the UI. */
export async function getBookmarkedSubEntityIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_bookmarks").select("sub_entity_id").eq("user_id", userId);
  return new Set((data ?? []).map((row) => row.sub_entity_id));
}

/** Bookmarked sub-entities with enough context (book/chapter title) to render a quick-access list on the dashboard. */
export async function getBookmarkedEntities(userId: string): Promise<BookmarkedEntity[]> {
  const supabase = await createClient();
  const { data: bookmarks } = await supabase
    .from("el_profesor_bookmarks")
    .select("sub_entity_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const subEntityIds = (bookmarks ?? []).map((b) => b.sub_entity_id);
  if (subEntityIds.length === 0) return [];

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, name, chapter_id").in("id", subEntityIds);
  const chapterIds = [...new Set((subEntities ?? []).map((s) => s.chapter_id))];
  if (chapterIds.length === 0) return [];

  const { data: chapters } = await supabase
    .from("el_profesor_chapters")
    .select("id, title, book_id")
    .in("id", chapterIds)
    .eq("status", "published");
  const chapterById = new Map((chapters ?? []).map((c) => [c.id, c]));

  const bookIds = [...new Set((chapters ?? []).map((c) => c.book_id))];
  const { data: books } = bookIds.length > 0 ? await supabase.from("el_profesor_books").select("id, title").in("id", bookIds) : { data: [] };
  const bookTitleById = new Map((books ?? []).map((b) => [b.id, b.title]));

  const subEntityById = new Map((subEntities ?? []).map((s) => [s.id, s]));
  const results: BookmarkedEntity[] = [];
  for (const bookmark of bookmarks ?? []) {
    const sub = subEntityById.get(bookmark.sub_entity_id);
    const chapter = sub ? chapterById.get(sub.chapter_id) : undefined;
    if (!sub || !chapter) continue; // chapter unpublished since bookmarking, or sub-entity deleted
    results.push({
      subEntityId: sub.id,
      subEntityName: sub.name,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      bookTitle: bookTitleById.get(chapter.book_id) ?? "",
    });
  }
  return results;
}

function toReviewState(row: ElProfesorReviewStateRow): ReviewState {
  return {
    flashcardId: row.flashcard_id,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.last_review,
  };
}

export type BookWithChapters = Book & { chapters: Chapter[] };

/** Dashboard payload: every book with its chapters, in display order. */
export async function getLibrary(): Promise<BookWithChapters[]> {
  const supabase = await createClient();
  const [booksRes, chaptersRes] = await Promise.all([
    supabase.from("el_profesor_books").select("*").order("order_index", { ascending: true }),
    supabase.from("el_profesor_chapters").select("*").order("order_index", { ascending: true }),
  ]);

  const books = (booksRes.data ?? []) as ElProfesorBookRow[];
  const chapters = (chaptersRes.data ?? []) as ElProfesorChapterRow[];

  return books.map((book) => ({
    ...toBook(book),
    chapters: chapters.filter((c) => c.book_id === book.id).map(toChapter),
  }));
}

export type SubEntityWithFiche = SubEntity & { fiche: (Fiche & { blocks: FicheBlock[]; flashcards: Flashcard[] }) | null };

/**
 * Full chapter content for consultation. `includeDrafts` is only meant for
 * the admin extraction-review screen — regular consultation must only ever
 * see published content, since unpublished drafts haven't passed human review.
 */
export async function getChapterContent(chapterId: string, includeDrafts = false): Promise<SubEntityWithFiche[]> {
  const supabase = await createClient();

  const { data: subEntities } = await supabase
    .from("el_profesor_sub_entities")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("order_index", { ascending: true });

  const subEntityIds = (subEntities ?? []).map((s) => s.id);
  if (subEntityIds.length === 0) return [];

  let fichesQuery = supabase.from("el_profesor_fiches").select("*").in("sub_entity_id", subEntityIds);
  if (!includeDrafts) fichesQuery = fichesQuery.eq("status", "published");
  const { data: fiches } = await fichesQuery;

  const ficheIds = (fiches ?? []).map((f) => f.id);
  let blocks: ElProfesorFicheBlockRow[] = [];
  let flashcards: ElProfesorFlashcardRow[] = [];
  if (ficheIds.length > 0) {
    const [blocksRes, flashcardsRes] = await Promise.all([
      includeDrafts
        ? supabase.from("el_profesor_fiche_blocks").select("*").in("fiche_id", ficheIds).order("order_index", { ascending: true })
        : supabase
            .from("el_profesor_fiche_blocks")
            .select("*")
            .in("fiche_id", ficheIds)
            .eq("status", "published")
            .order("order_index", { ascending: true }),
      includeDrafts
        ? supabase.from("el_profesor_flashcards").select("*").in("fiche_id", ficheIds)
        : supabase.from("el_profesor_flashcards").select("*").in("fiche_id", ficheIds).eq("status", "published"),
    ]);
    blocks = (blocksRes.data ?? []) as ElProfesorFicheBlockRow[];
    flashcards = (flashcardsRes.data ?? []) as ElProfesorFlashcardRow[];
  }

  return (subEntities ?? []).map((sub) => {
    const ficheRow = (fiches ?? []).find((f) => f.sub_entity_id === sub.id) as ElProfesorFicheRow | undefined;
    if (!ficheRow) return { ...toSubEntity(sub), fiche: null };
    return {
      ...toSubEntity(sub),
      fiche: {
        ...toFiche(ficheRow),
        blocks: blocks.filter((b) => b.fiche_id === ficheRow.id).map(toFicheBlock),
        flashcards: flashcards.filter((c) => c.fiche_id === ficheRow.id).map(toFlashcard),
      },
    };
  });
}

/** Flashcards due today (or new) for a chapter, for the scheduled review queue. */
export async function getDueQueue(userId: string, chapterId: string): Promise<Flashcard[]> {
  const supabase = await createClient();
  const content = await getChapterContent(chapterId, false);
  const flashcards = content.flatMap((s) => s.fiche?.flashcards ?? []);
  if (flashcards.length === 0) return [];

  const { data: states } = await supabase
    .from("el_profesor_review_state")
    .select("*")
    .eq("user_id", userId)
    .in(
      "flashcard_id",
      flashcards.map((f) => f.id)
    );

  const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s as ElProfesorReviewStateRow]));
  const now = Date.now();

  const due = flashcards
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
 * "Carnet d'erreurs": flashcards the user is currently struggling with —
 * either FSRS put them back in "relearning" after a recent miss, or they've
 * accumulated repeat lapses over time. Deliberate practice on known weak
 * spots, not just whatever happens to be due today.
 */
export async function getDifficultQueue(userId: string, chapters: Chapter[]): Promise<Flashcard[]> {
  const supabase = await createClient();
  const published = chapters.filter((c) => c.status === "published");

  const perChapter = await Promise.all(
    published.map(async (chapter) => {
      const content = await getChapterContent(chapter.id, false);
      const flashcards = content.flatMap((s) => s.fiche?.flashcards ?? []);
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

  const perChapter = await Promise.all(published.map((c) => getChapterContent(c.id, false)));
  const all = perChapter.flat().flatMap((s) => s.fiche?.flashcards ?? []);
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

  await Promise.all(
    chapters
      .filter((c) => c.status === "published")
      .map(async (chapter) => {
        const content = await getChapterContent(chapter.id, false);
        const flashcards = content.flatMap((s) => s.fiche?.flashcards ?? []);
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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Every published flashcard for a chapter, ignoring due dates — free/on-demand review, shuffled for variety across sessions. */
export async function getFreeReviewQueue(chapterId: string): Promise<Flashcard[]> {
  const content = await getChapterContent(chapterId, false);
  return shuffle(content.flatMap((s) => s.fiche?.flashcards ?? []));
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
  const flashcardIds = perChapterContent.flatMap((content) => content.flatMap((s) => s.fiche?.flashcards ?? []).map((f) => f.id));

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
        const flashcards = content.flatMap((s) => s.fiche?.flashcards ?? []);
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

export interface BlockTypeFlagStat {
  blockType: BlockType;
  flagCount: number;
}

/**
 * Admin-only content-quality signal, reinterpreted from "review difficulty
 * per block type": flashcards aren't linked to a specific block in the
 * schema (extraction generates them as sibling arrays on the same
 * sub-entity, not tied 1:1 to a block), so per-block-type review difficulty
 * isn't something the data can actually answer. What IS precisely
 * trackable: which block types get flagged as erroneous most often — a
 * comparable quality signal, grounded in real block→flag links.
 */
export async function getFlagStatsByBlockType(): Promise<BlockTypeFlagStat[]> {
  const supabase = await createClient();
  const { data: flags } = await supabase.from("el_profesor_flags").select("target_id").eq("target_type", "block");
  if (!flags || flags.length === 0) return [];

  const blockIds = [...new Set(flags.map((f) => f.target_id))];
  const { data: blocks } = await supabase.from("el_profesor_fiche_blocks").select("id, block_type").in("id", blockIds);
  const typeByBlock = new Map((blocks ?? []).map((b) => [b.id, b.block_type as BlockType]));

  const counts = new Map<BlockType, number>();
  for (const flag of flags) {
    const type = typeByBlock.get(flag.target_id);
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts.entries()].map(([blockType, flagCount]) => ({ blockType, flagCount })).sort((a, b) => b.flagCount - a.flagCount);
}

export interface StaleChapterAlert {
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
  lastReviewedAt: string | null;
}

/**
 * Admin-only content-quality signal: published chapters nobody has reviewed
 * in a while (or ever) — worth a nudge to promote or double-check the
 * content. Aggregates el_profesor_review_log via the service-role client
 * (same "no admin override on individual review data" caveat as
 * getMostDifficultFlashcardsGlobal), but only ever surfaces a timestamp per
 * chapter, never who reviewed what.
 */
export async function getStaleChaptersForAdmin(
  chapters: Chapter[],
  books: Book[],
  staleDays = 30
): Promise<StaleChapterAlert[]> {
  const supabase = createAdminClient();
  const published = chapters.filter((c) => c.status === "published");
  const bookTitleById = new Map(books.map((b) => [b.id, b.title]));
  const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const alerts: StaleChapterAlert[] = [];

  await Promise.all(
    published.map(async (chapter) => {
      const content = await getChapterContent(chapter.id, false);
      const flashcardIds = content.flatMap((s) => s.fiche?.flashcards ?? []).map((f) => f.id);
      if (flashcardIds.length === 0) return;

      const { data } = await supabase
        .from("el_profesor_review_log")
        .select("reviewed_at")
        .in("flashcard_id", flashcardIds)
        .order("reviewed_at", { ascending: false })
        .limit(1);
      const last = data?.[0]?.reviewed_at ?? null;
      if (!last || new Date(last).getTime() < cutoff) {
        alerts.push({ chapterId: chapter.id, chapterTitle: chapter.title, bookTitle: bookTitleById.get(chapter.bookId) ?? "", lastReviewedAt: last });
      }
    })
  );

  return alerts;
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
      const flashcardIds = content.flatMap((s) => s.fiche?.flashcards ?? []).map((f) => f.id);
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

/** Currently configured Gemini model — falls back to the built-in default if the settings row is somehow missing. */
export async function getElProfesorGeminiModel(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("gemini_model").eq("id", true).single();
  return data?.gemini_model || EL_PROFESOR_GEMINI_MODEL_DEFAULT;
}

/** Whether an admin has configured the Gemini key from the settings UI — safe to expose to any user, unlike the key itself. */
export async function hasElProfesorGeminiKey(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_secrets").select("gemini_api_key_encrypted").eq("id", true).maybeSingle();
  return Boolean(data?.gemini_api_key_encrypted);
}

/**
 * Decrypted Gemini key + model in one call — every extraction/proposal
 * action needs both together. Uses the service-role client: the key table
 * is admin-write/admin-read RLS (see 20260101000019), but reading the
 * *decrypted* key server-side to call Gemini on behalf of a non-admin user
 * (e.g. "select passage -> generate") is exactly the trusted-server-action
 * pattern already used elsewhere (`toggleFicheShare`, `proposeFromSelection`'s
 * insert) — the caller's own access was already checked by
 * `requireElProfesorAccess()` before this is reached.
 */
export async function getElProfesorGeminiConfig(): Promise<{ apiKey: string; model: string }> {
  const admin = createAdminClient();
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    admin.from("el_profesor_settings").select("gemini_model").eq("id", true).maybeSingle(),
    admin.from("el_profesor_secrets").select("gemini_api_key_encrypted").eq("id", true).maybeSingle(),
  ]);

  if (!secrets?.gemini_api_key_encrypted) {
    throw new GeminiError("Clé API Gemini non configurée. Un administrateur doit la renseigner dans les réglages d'El Profesor.");
  }

  return {
    apiKey: decryptSecret(secrets.gemini_api_key_encrypted),
    model: settings?.gemini_model || EL_PROFESOR_GEMINI_MODEL_DEFAULT,
  };
}
