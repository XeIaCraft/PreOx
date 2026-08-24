import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import { EL_PROFESOR_GEMINI_MODEL_DEFAULT } from "./gemini";
import { EL_PROFESOR_CLAUDE_MODEL_DEFAULT } from "./anthropic";
import { computeAdjustedRetention } from "./fsrs";
import { decryptSecret } from "@/lib/crypto";
import { GeminiError } from "@/lib/gemini-shared";
import { blockToPlainText } from "./block-text";
import { estimateCostUsd } from "./ai-pricing";
import { findDuplicateFlashcards, findSimilarSubEntities, type DuplicateFlashcardPair, type SimilarSubEntityPair } from "./dedupe";
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
  Notion,
  NotionLinkedFiche,
  NotionSummary,
  Contradiction,
  ContradictionStatus,
  CrossBookDuplicateFlashcards,
  SupersededFicheEntry,
  ChapterStatus,
  FicheQuestion,
  FicheAnswer,
  FlashcardVariant,
  ImageOcclusion,
  NotionUpdateProposal,
  NotionUpdateProposalStatus,
  ExtractedFicheBlock,
  ExtractedFlashcard,
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
  Database,
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
    archivedAt: row.archived_at,
    previousEditionBookId: row.previous_edition_book_id,
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
    sourceKind: row.source_kind,
    sourceText: row.source_text,
  };
}

function toSubEntity(row: ElProfesorSubEntityRow): SubEntity {
  return { id: row.id, chapterId: row.chapter_id, name: row.name, orderIndex: row.order_index, summary: row.summary };
}

function toFiche(row: ElProfesorFicheRow): Fiche {
  return {
    id: row.id,
    subEntityId: row.sub_entity_id,
    title: row.title,
    status: row.status,
    shareToken: row.share_token,
    supersededByFicheId: row.superseded_by_fiche_id,
    supersededReason: row.superseded_reason,
    supersededNote: row.superseded_note,
  };
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
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    variants: (row.variants as unknown as FlashcardVariant[]) ?? [],
    imageOcclusions: (row.image_occlusions as unknown as ImageOcclusion[]) ?? [],
    suggestedImagePage: row.suggested_image_page,
    suggestedImageHint: row.suggested_image_hint,
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
  tags: string[];
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
    .select("sub_entity_id, tags, created_at")
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
      tags: bookmark.tags ?? [],
    });
  }
  return results;
}

export interface OnThisDayNote {
  subEntityId: string;
  subEntityName: string;
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
  content: string;
  createdAt: string;
}

const ON_THIS_DAY_MONTHS_AGO = [1, 3, 6, 12, 18, 24, 36];

/** Resurfaces one personal note written roughly N months/years ago today — a lightweight "on this day" nudge, item 36 of the backlog. */
export async function getOnThisDayNote(userId: string): Promise<OnThisDayNote | null> {
  const supabase = await createClient();
  const now = new Date();

  for (const monthsAgo of ON_THIS_DAY_MONTHS_AGO) {
    const anchor = new Date(now);
    anchor.setUTCMonth(anchor.getUTCMonth() - monthsAgo);
    const windowStart = new Date(anchor);
    windowStart.setUTCDate(windowStart.getUTCDate() - 3);
    const windowEnd = new Date(anchor);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 3);

    const { data: notes } = await supabase
      .from("el_profesor_notes")
      .select("sub_entity_id, content, created_at")
      .eq("user_id", userId)
      .neq("content", "")
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString())
      .order("created_at", { ascending: true })
      .limit(1);

    const note = notes?.[0];
    if (!note) continue;

    const { data: subEntity } = await supabase
      .from("el_profesor_sub_entities")
      .select("id, name, chapter_id")
      .eq("id", note.sub_entity_id)
      .maybeSingle();
    if (!subEntity) continue;

    const { data: chapter } = await supabase
      .from("el_profesor_chapters")
      .select("id, title, book_id")
      .eq("id", subEntity.chapter_id)
      .eq("status", "published")
      .maybeSingle();
    if (!chapter) continue; // chapter unpublished/deleted since the note was written

    const { data: book } = await supabase.from("el_profesor_books").select("title").eq("id", chapter.book_id).maybeSingle();

    return {
      subEntityId: subEntity.id,
      subEntityName: subEntity.name,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      bookTitle: book?.title ?? "",
      content: note.content,
      createdAt: note.created_at,
    };
  }
  return null;
}

export interface BookRecommendation {
  bookId: string;
  bookTitle: string;
  firstChapterId: string;
  otherUsersEngaged: number;
}

/**
 * "Recommandé par les autres utilisateurs" — item 29 of the backlog.
 * Simple collaborative signal, single pass over the library rather than a
 * query per book: among published books this user hasn't started yet, picks
 * the one the most *other* users have review history on. Returns null
 * rather than guessing when there's no real signal (fewer than 2 published
 * books, or no other user has engaged with any book this user hasn't
 * started) — a recommendation with no basis is worse than none.
 */
export async function getRecommendedNextBook(userId: string, books: BookWithChapters[]): Promise<BookRecommendation | null> {
  const published = books.filter((b) => b.chapters.some((c) => c.status === "published"));
  if (published.length < 2) return null;

  const supabase = await createClient();
  const publishedChapters = published.flatMap((b) => b.chapters.filter((c) => c.status === "published"));
  const chapterIds = publishedChapters.map((c) => c.id);
  if (chapterIds.length === 0) return null;

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, chapter_id").in("chapter_id", chapterIds);
  const subEntityIds = (subEntities ?? []).map((s) => s.id);
  const { data: fiches } = subEntityIds.length
    ? await supabase.from("el_profesor_fiches").select("id, sub_entity_id").in("sub_entity_id", subEntityIds).eq("status", "published")
    : { data: [] };
  const ficheIds = (fiches ?? []).map((f) => f.id);
  const { data: flashcards } = ficheIds.length
    ? await supabase.from("el_profesor_flashcards").select("id, fiche_id").in("fiche_id", ficheIds)
    : { data: [] };

  const chapterToBook = new Map<string, string>();
  for (const book of published) for (const c of book.chapters) chapterToBook.set(c.id, book.id);
  const subEntityToChapter = new Map((subEntities ?? []).map((s) => [s.id, s.chapter_id]));
  const ficheToSubEntity = new Map((fiches ?? []).map((f) => [f.id, f.sub_entity_id]));

  const flashcardToBook = new Map<string, string>();
  for (const card of flashcards ?? []) {
    const subEntityId = ficheToSubEntity.get(card.fiche_id);
    const chapterId = subEntityId ? subEntityToChapter.get(subEntityId) : undefined;
    const bookId = chapterId ? chapterToBook.get(chapterId) : undefined;
    if (bookId) flashcardToBook.set(card.id, bookId);
  }

  const allFlashcardIds = [...flashcardToBook.keys()];
  if (allFlashcardIds.length === 0) return null;

  const { data: states } = await supabase.from("el_profesor_review_state").select("user_id, flashcard_id").in("flashcard_id", allFlashcardIds);

  const engagedUsersByBook = new Map<string, Set<string>>();
  const myBookIds = new Set<string>();
  for (const s of states ?? []) {
    const bookId = flashcardToBook.get(s.flashcard_id);
    if (!bookId) continue;
    if (s.user_id === userId) {
      myBookIds.add(bookId);
      continue;
    }
    if (!engagedUsersByBook.has(bookId)) engagedUsersByBook.set(bookId, new Set());
    engagedUsersByBook.get(bookId)!.add(s.user_id);
  }

  let best: { bookId: string; count: number } | null = null;
  for (const book of published) {
    if (myBookIds.has(book.id)) continue;
    const count = engagedUsersByBook.get(book.id)?.size ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { bookId: book.id, count };
  }
  if (!best) return null;

  const book = published.find((b) => b.id === best!.bookId);
  const firstChapter = book?.chapters.find((c) => c.status === "published");
  if (!book || !firstChapter) return null;

  return { bookId: book.id, bookTitle: book.title, firstChapterId: firstChapter.id, otherUsersEngaged: best.count };
}

export interface ReadingPosition {
  chapterId: string;
  subEntityId: string | null;
}

/** Server-side "where was I" — makes the resume banner and the chapter view's default sub-entity work across devices, not just on the device that set localStorage. */
export async function getReadingPosition(userId: string): Promise<ReadingPosition | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_reading_position")
    .select("chapter_id, sub_entity_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { chapterId: data.chapter_id, subEntityId: data.sub_entity_id } : null;
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

/** Archived books (item 49 of the backlog) — hidden from the active library, listed here for the admin "Livres archivés" screen. */
export type ArchivedBookEntry = Book & { newerEdition: { bookId: string; title: string } | null };

/** Archived books, each decorated with its newer edition (if any) so the archived-books screen can link straight to it — item 6 of the backlog. */
export async function getArchivedBooks(): Promise<ArchivedBookEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_books").select("*").not("archived_at", "is", null).order("archived_at", { ascending: false });
  const books = ((data ?? []) as ElProfesorBookRow[]).map(toBook);
  if (books.length === 0) return [];

  const { data: newerEditions } = await supabase
    .from("el_profesor_books")
    .select("id, title, previous_edition_book_id")
    .in(
      "previous_edition_book_id",
      books.map((b) => b.id)
    );
  const newerByOldId = new Map((newerEditions ?? []).map((b) => [b.previous_edition_book_id as string, { bookId: b.id, title: b.title }]));

  return books.map((book) => ({ ...book, newerEdition: newerByOldId.get(book.id) ?? null }));
}

export type SubEntityWithFiche = SubEntity & { fiche: (Fiche & { blocks: FicheBlock[]; flashcards: Flashcard[] }) | null };

/**
 * Full chapter content for consultation. `includeDrafts` is only meant for
 * the admin extraction-review screen — regular consultation must only ever
 * see published content, since unpublished drafts haven't passed human review.
 */
/**
 * `client` defaults to the request-scoped (RLS-bound) client — pass the
 * service-role admin client explicitly when calling from a context with no
 * user session (e.g. the Claude batch-result cron poller), since the
 * select policies on these tables are `to authenticated` only and silently
 * return zero rows for an unauthenticated request rather than erroring.
 *
 * Wrapped in React's `cache()`: the dashboard page loads ~9 independent
 * stats (due counts, mastery, forecast, daily card...) in parallel, each of
 * which calls this per chapter with the exact same (chapterId, false,
 * undefined) arguments — without memoization that's ~9x the DB round trips
 * for identical data on every dashboard load. `cache()` collapses those
 * into one fetch per chapter per request; safe because it's request-scoped
 * (no cross-request staleness) and every dashboard-facing caller already
 * passes identical arguments for the same chapter.
 */
export const getChapterContent = cache(async function getChapterContent(
  chapterId: string,
  includeDrafts = false,
  client?: SupabaseClient<Database>
): Promise<SubEntityWithFiche[]> {
  const supabase = client ?? (await createClient());

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
});

/**
 * Flashcards from every fiche in this content set, excluding ones whose
 * fiche has been merged/superseded (items 52/56 — "don't learn the same
 * fact, or an outdated one, twice"). Used everywhere a review queue,
 * forecast, or mastery stat is built from getChapterContent's output;
 * admin tools that need to see superseded content too (e.g. the quality
 * dashboard) read `fiche.flashcards` directly instead of calling this.
 */
function activeFlashcards(content: SubEntityWithFiche[]): Flashcard[] {
  return content.flatMap((s) => (s.fiche && !s.fiche.supersededByFicheId ? s.fiche.flashcards : []));
}

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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
  const successRate = rows.filter((r) => r.rating === "good").length / rows.length;
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

/** How many extra rotation keys are configured — safe to expose as a count, unlike the keys themselves. */
export async function getElProfesorGeminiExtraKeyCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_secrets").select("gemini_extra_keys_encrypted").eq("id", true).maybeSingle();
  return ((data?.gemini_extra_keys_encrypted as string[] | null) ?? []).length;
}

/** Configured fallback model (or null if unset) — just a model name, safe to expose. */
export async function getElProfesorGeminiFallbackModel(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("gemini_fallback_model").eq("id", true).maybeSingle();
  return data?.gemini_fallback_model ?? null;
}

/**
 * Ordered lists of Gemini API keys and models to try — every
 * extraction/proposal action needs this together. Uses the service-role
 * client: the key table is admin-write/admin-read RLS (see 20260101000019),
 * but reading the *decrypted* key server-side to call Gemini on behalf of a
 * non-admin user (e.g. "select passage -> generate") is exactly the
 * trusted-server-action pattern already used elsewhere (`toggleFicheShare`,
 * `proposeFromSelection`'s insert) — the caller's own access was already
 * checked by `requireElProfesorAccess()` before this is reached.
 *
 * `apiKeys` is [primary, ...extra keys] in the admin-configured order;
 * `models` is [primary model, fallback model] (fallback omitted if unset).
 * The caller (see lib/el-profesor/gemini.ts's rotation helpers) tries every
 * key for the primary model before falling back to the secondary model, so a
 * quota (429) or capacity (503) error on one key/model automatically retries
 * with the next before surfacing an error to the admin.
 */
export async function getElProfesorGeminiConfig(): Promise<{ apiKeys: string[]; models: string[] }> {
  const admin = createAdminClient();
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    admin.from("el_profesor_settings").select("gemini_model, gemini_fallback_model").eq("id", true).maybeSingle(),
    admin.from("el_profesor_secrets").select("gemini_api_key_encrypted, gemini_extra_keys_encrypted").eq("id", true).maybeSingle(),
  ]);

  if (!secrets?.gemini_api_key_encrypted) {
    throw new GeminiError("Clé API Gemini non configurée. Un administrateur doit la renseigner dans les réglages d'El Profesor.");
  }

  const extraKeys = ((secrets.gemini_extra_keys_encrypted as string[] | null) ?? []).map((k) => decryptSecret(k));
  const apiKeys = [decryptSecret(secrets.gemini_api_key_encrypted), ...extraKeys];

  const models = [settings?.gemini_model || EL_PROFESOR_GEMINI_MODEL_DEFAULT];
  if (settings?.gemini_fallback_model && settings.gemini_fallback_model !== models[0]) {
    models.push(settings.gemini_fallback_model);
  }

  return { apiKeys, models };
}

export type ElProfesorAiProvider = "gemini" | "claude";

/** Which AI provider powers extraction/complément — an admin-configurable alternative to Gemini when its quota runs out. */
export async function getElProfesorAiProvider(): Promise<ElProfesorAiProvider> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("ai_provider").eq("id", true).maybeSingle();
  return data?.ai_provider === "claude" ? "claude" : "gemini";
}

/** Currently configured Claude model — falls back to the built-in default if the settings row is somehow missing. */
export async function getElProfesorClaudeModel(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("claude_model").eq("id", true).maybeSingle();
  return data?.claude_model || EL_PROFESOR_CLAUDE_MODEL_DEFAULT;
}

/** Whether an admin has configured the Claude key — safe to expose to any user, unlike the key itself. */
export async function hasElProfesorClaudeKey(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_secrets").select("claude_api_key_encrypted").eq("id", true).maybeSingle();
  return Boolean(data?.claude_api_key_encrypted);
}

/** Decrypted Claude API key + configured model, for the trusted-server-action extraction pipeline (same pattern as getElProfesorGeminiConfig). */
export async function getElProfesorClaudeConfig(): Promise<{ apiKey: string; model: string }> {
  const admin = createAdminClient();
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    admin.from("el_profesor_settings").select("claude_model").eq("id", true).maybeSingle(),
    admin.from("el_profesor_secrets").select("claude_api_key_encrypted").eq("id", true).maybeSingle(),
  ]);

  if (!secrets?.claude_api_key_encrypted) {
    throw new GeminiError("Clé API Claude non configurée. Un administrateur doit la renseigner dans les réglages d'El Profesor.");
  }

  return {
    apiKey: decryptSecret(secrets.claude_api_key_encrypted),
    model: settings?.claude_model || EL_PROFESOR_CLAUDE_MODEL_DEFAULT,
  };
}

export interface GeminiUsageWindowStats {
  calls: number;
  failures: number;
  totalTokens: number;
  /** Sum over calls whose model matched a known pricing tier — see ai-pricing.ts. */
  estimatedCostUsd: number;
  /** True if at least one call in this window used a model with no known pricing tier — estimatedCostUsd then understates the real total. */
  hasUnpricedCalls: boolean;
}

export interface GeminiUsageStats {
  last24h: GeminiUsageWindowStats;
  last7d: GeminiUsageWindowStats;
  byModel: (GeminiUsageWindowStats & { model: string })[];
  recentFailures: { calledAt: string; model: string; statusCode: number | null; errorMessage: string | null }[];
}

/** Quota/consumption journal summary for the admin "Réglages IA" panel — item 48 of the backlog. Cost is a rough estimate (see ai-pricing.ts), added 2026-08-24. */
export async function getGeminiUsageStats(): Promise<GeminiUsageStats> {
  const supabase = await createClient();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("el_profesor_gemini_usage_log")
    .select("called_at, model, success, status_code, prompt_tokens, candidates_tokens, total_tokens, error_message")
    .gte("called_at", since7d)
    .order("called_at", { ascending: false });

  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const all = rows ?? [];
  const last24hRows = all.filter((r) => new Date(r.called_at).getTime() >= since24h);

  function summarize(list: typeof all): GeminiUsageWindowStats {
    let estimatedCostUsd = 0;
    let hasUnpricedCalls = false;
    for (const r of list) {
      const cost = estimateCostUsd(r.model, r.prompt_tokens ?? 0, r.candidates_tokens ?? 0);
      if (cost === null) hasUnpricedCalls = true;
      else estimatedCostUsd += cost;
    }
    return {
      calls: list.length,
      failures: list.filter((r) => !r.success).length,
      totalTokens: list.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
      estimatedCostUsd,
      hasUnpricedCalls,
    };
  }

  const byModelRows = new Map<string, typeof all>();
  for (const r of all) {
    const list = byModelRows.get(r.model) ?? [];
    list.push(r);
    byModelRows.set(r.model, list);
  }

  return {
    last24h: summarize(last24hRows),
    last7d: summarize(all),
    byModel: [...byModelRows.entries()]
      .map(([model, list]) => ({ model, ...summarize(list) }))
      .sort((a, b) => b.calls - a.calls),
    recentFailures: all
      .filter((r) => !r.success)
      .slice(0, 5)
      .map((r) => ({ calledAt: r.called_at, model: r.model, statusCode: r.status_code, errorMessage: r.error_message })),
  };
}

// -- Per-book quality dashboard (admin-only) ---------------------------------

export interface BookQualityChapterStat {
  chapterId: string;
  chapterTitle: string;
  openFlagCount: number;
  lastReviewedAt: string | null;
}

export interface ThinSubEntity {
  subEntityId: string;
  subEntityName: string;
  chapterId: string;
  chapterTitle: string;
  blockCount: number;
  flashcardCount: number;
}

export interface BookQualityDashboard {
  chapters: BookQualityChapterStat[];
  duplicateFlashcards: DuplicateFlashcardPair[];
  similarSubEntities: (SimilarSubEntityPair & { chapterTitle: string })[];
  thinSubEntities: ThinSubEntity[];
}

/** Combines coverage (open signalements, staleness), near-duplicate flashcards, and near-duplicate sub-entity names into one per-book admin view — items 43/45/50 of the backlog. Deterministic dedup, no Gemini cost. */
export async function getBookQualityDashboard(bookId: string): Promise<BookQualityDashboard> {
  const supabase = createAdminClient();

  const { data: chapterRows } = await supabase
    .from("el_profesor_chapters")
    .select("id, title")
    .eq("book_id", bookId)
    .eq("status", "published")
    .order("order_index", { ascending: true });
  const chapters = chapterRows ?? [];
  if (chapters.length === 0) return { chapters: [], duplicateFlashcards: [], similarSubEntities: [], thinSubEntities: [] };

  const chapterTitleById = new Map(chapters.map((c) => [c.id, c.title]));

  const allFlashcards: { id: string; front: string }[] = [];
  const allSubEntities: { id: string; name: string; chapterId: string }[] = [];
  const contentSizeBySubEntity = new Map<string, { blockCount: number; flashcardCount: number }>();
  const flagCountByChapter = new Map<string, number>();
  const lastReviewedByChapter = new Map<string, string | null>();

  await Promise.all(
    chapters.map(async (chapter) => {
      const content = await getChapterContent(chapter.id, false);
      for (const sub of content) {
        allSubEntities.push({ id: sub.id, name: sub.name, chapterId: chapter.id });
        const blockCount = sub.fiche?.blocks.length ?? 0;
        const flashcardCount = sub.fiche?.flashcards.length ?? 0;
        contentSizeBySubEntity.set(sub.id, { blockCount, flashcardCount });
        if (!sub.fiche) continue;
        for (const card of sub.fiche.flashcards) allFlashcards.push({ id: card.id, front: card.front.text });
      }

      const blockIds = content.flatMap((s) => s.fiche?.blocks.map((b) => b.id) ?? []);
      const flashcardIds = content.flatMap((s) => s.fiche?.flashcards.map((f) => f.id) ?? []);
      const targetIds = [...blockIds, ...flashcardIds];

      const [{ count }, { data: reviewLog }] = await Promise.all([
        targetIds.length > 0
          ? supabase.from("el_profesor_flags").select("id", { count: "exact", head: true }).eq("status", "open").in("target_id", targetIds)
          : Promise.resolve({ count: 0 }),
        flashcardIds.length > 0
          ? supabase
              .from("el_profesor_review_log")
              .select("reviewed_at")
              .in("flashcard_id", flashcardIds)
              .order("reviewed_at", { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [] as { reviewed_at: string }[] }),
      ]);

      flagCountByChapter.set(chapter.id, count ?? 0);
      lastReviewedByChapter.set(chapter.id, reviewLog?.[0]?.reviewed_at ?? null);
    })
  );

  const duplicateFlashcards = findDuplicateFlashcards(allFlashcards);
  const similarSubEntities = findSimilarSubEntities(allSubEntities).map((pair) => ({
    ...pair,
    chapterTitle: chapterTitleById.get(pair.a.chapterId) ?? "",
  }));

  const chapterStats: BookQualityChapterStat[] = chapters.map((c) => ({
    chapterId: c.id,
    chapterTitle: c.title,
    openFlagCount: flagCountByChapter.get(c.id) ?? 0,
    lastReviewedAt: lastReviewedByChapter.get(c.id) ?? null,
  }));

  // Proactive "this sub-entity looks thin" nudge — item 11 of the backlog.
  // Purely a heuristic on already-fetched counts (no extraction, no AI
  // call): flags sub-entities whose block+flashcard count sits well below
  // this book's own average. Needs at least 4 sub-entities for "average" to
  // mean anything.
  const thinSubEntities: ThinSubEntity[] = [];
  if (allSubEntities.length >= 4) {
    const sizes = allSubEntities.map((s) => {
      const size = contentSizeBySubEntity.get(s.id) ?? { blockCount: 0, flashcardCount: 0 };
      return size.blockCount + size.flashcardCount;
    });
    const average = sizes.reduce((sum, n) => sum + n, 0) / sizes.length;
    const threshold = average * 0.4;
    for (const sub of allSubEntities) {
      const size = contentSizeBySubEntity.get(sub.id) ?? { blockCount: 0, flashcardCount: 0 };
      if (size.blockCount + size.flashcardCount < threshold) {
        thinSubEntities.push({
          subEntityId: sub.id,
          subEntityName: sub.name,
          chapterId: sub.chapterId,
          chapterTitle: chapterTitleById.get(sub.chapterId) ?? "",
          blockCount: size.blockCount,
          flashcardCount: size.flashcardCount,
        });
      }
    }
  }

  return { chapters: chapterStats, duplicateFlashcards, similarSubEntities, thinSubEntities };
}

// -- Notion tagging + cross-fiche contradiction detection (admin-only) ------

/** Plain-text content of a fiche's published blocks, for feeding to an LLM prompt (categorization, contradiction check). */
export async function getFicheTextForAI(ficheId: string): Promise<{ title: string; text: string } | null> {
  const supabase = await createClient();
  const { data: fiche } = await supabase.from("el_profesor_fiches").select("id, title").eq("id", ficheId).maybeSingle();
  if (!fiche) return null;

  const { data: blocks } = await supabase
    .from("el_profesor_fiche_blocks")
    .select("block_type, content")
    .eq("fiche_id", ficheId)
    .eq("status", "published")
    .order("order_index", { ascending: true });

  const text = ((blocks ?? []) as { block_type: string; content: BlockContent }[])
    .map((b) => blockToPlainText(b.block_type, b.content))
    .join("\n\n");

  return { title: fiche.title, text };
}

/** Chapter title + one text summary per sub-entity (published blocks only) — input for the on-demand mind map (item 2). */
export async function getChapterMindMapInputs(chapterId: string): Promise<{ chapterTitle: string; subEntities: { name: string; text: string }[] } | null> {
  const supabase = await createClient();
  const { data: chapter } = await supabase.from("el_profesor_chapters").select("title").eq("id", chapterId).maybeSingle();
  if (!chapter) return null;

  const content = await getChapterContent(chapterId, false);
  const subEntities = content
    .filter((s) => s.fiche && s.fiche.blocks.length > 0)
    .map((s) => ({
      name: s.name,
      text: s.fiche!.blocks.map((b) => blockToPlainText(b.blockType, b.content)).join("\n\n"),
    }));

  return { chapterTitle: chapter.title, subEntities };
}

// -- Per-book interactive table of contents ----------------------------------

export interface BookTocChapter {
  chapterId: string;
  chapterTitle: string;
  status: ChapterStatus;
  subEntities: { id: string; name: string; hasFiche: boolean }[];
  mastery: { total: number; new: number; learning: number; acquired: number };
}

export interface BookTableOfContents {
  book: Book;
  chapters: BookTocChapter[];
}

/**
 * Every chapter of a book with its sub-entities and the user's own mastery
 * coverage — a dedicated visual overview distinct from the full-library
 * board (which only lists chapters inline). Item 7 of the backlog.
 * `includeUnpublished` is admin-only, mirroring the main dashboard's
 * pipeline visibility rule.
 */
export async function getBookTableOfContents(bookId: string, userId: string, includeUnpublished: boolean): Promise<BookTableOfContents | null> {
  const supabase = await createClient();
  const { data: bookRow } = await supabase.from("el_profesor_books").select("*").eq("id", bookId).maybeSingle();
  if (!bookRow) return null;

  const { data: chapterRows } = await supabase.from("el_profesor_chapters").select("*").eq("book_id", bookId).order("order_index", { ascending: true });
  const chapters = (chapterRows ?? []).map(toChapter).filter((c) => includeUnpublished || c.status === "published");

  const [contentByChapter, mastery] = await Promise.all([
    Promise.all(chapters.map((c) => getChapterContent(c.id, includeUnpublished))),
    getMasteryCountsByChapter(userId, chapters),
  ]);

  const tocChapters: BookTocChapter[] = chapters.map((chapter, i) => ({
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    status: chapter.status,
    subEntities: contentByChapter[i].map((s) => ({ id: s.id, name: s.name, hasFiche: Boolean(s.fiche) })),
    mastery: mastery[chapter.id] ?? { total: 0, new: 0, learning: 0, acquired: 0 },
  }));

  return { book: toBook(bookRow), chapters: tocChapters };
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

export async function getAllNotionNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_notions").select("name").order("name", { ascending: true });
  return (data ?? []).map((n) => n.name);
}

/**
 * Reuses an existing notion by case-insensitive name match, or creates a
 * new one. Race-safe enough for admin-only, low-frequency use. `client`
 * defaults to the request-scoped client — pass the service-role admin
 * client when calling with no user session (writes here are admin-only via
 * RLS, and an unauthenticated request is silently rejected, not errored).
 */
export async function findOrCreateNotion(name: string, client?: SupabaseClient<Database>): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const supabase = client ?? (await createClient());

  const { data: all } = await supabase.from("el_profesor_notions").select("id, name");
  const existing = (all ?? []).find((n) => n.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing.id;

  const { data: created, error } = await supabase.from("el_profesor_notions").insert({ name: trimmed }).select("id").maybeSingle();
  if (error || !created) {
    // Likely a race on the unique constraint — re-fetch and use whichever won.
    const { data: retry } = await supabase.from("el_profesor_notions").select("id, name").ilike("name", trimmed).maybeSingle();
    return retry?.id ?? null;
  }
  return created.id;
}

export async function linkFicheToNotion(notionId: string, ficheId: string, client?: SupabaseClient<Database>): Promise<void> {
  const supabase = client ?? (await createClient());
  await supabase.from("el_profesor_notion_links").upsert({ notion_id: notionId, fiche_id: ficheId }, { onConflict: "notion_id,fiche_id" });
}

/** Resolves fiche IDs to their book/chapter context in a handful of batched queries (not N+1) — shared by the notion summary and contradiction listing below. */
async function resolveFicheContexts(ficheIds: string[]): Promise<Map<string, NotionLinkedFiche>> {
  const supabase = await createClient();
  const result = new Map<string, NotionLinkedFiche>();
  if (ficheIds.length === 0) return result;

  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id, title, sub_entity_id").in("id", ficheIds);
  const subEntityIds = [...new Set((fiches ?? []).map((f) => f.sub_entity_id))];
  if (subEntityIds.length === 0) return result;

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, chapter_id").in("id", subEntityIds);
  const chapterIds = [...new Set((subEntities ?? []).map((s) => s.chapter_id))];
  if (chapterIds.length === 0) return result;

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("id, title, book_id").in("id", chapterIds);
  const bookIds = [...new Set((chapters ?? []).map((c) => c.book_id))];
  const { data: books } = bookIds.length ? await supabase.from("el_profesor_books").select("id, title").in("id", bookIds) : { data: [] };

  const bookById = new Map((books ?? []).map((b) => [b.id, b]));
  const chapterById = new Map((chapters ?? []).map((c) => [c.id, c]));
  const subEntityById = new Map((subEntities ?? []).map((s) => [s.id, s]));

  for (const fiche of fiches ?? []) {
    const subEntity = subEntityById.get(fiche.sub_entity_id);
    const chapter = subEntity ? chapterById.get(subEntity.chapter_id) : undefined;
    const book = chapter ? bookById.get(chapter.book_id) : undefined;
    if (!subEntity || !chapter || !book) continue;
    result.set(fiche.id, {
      ficheId: fiche.id,
      ficheTitle: fiche.title,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      bookId: book.id,
      bookTitle: book.title,
    });
  }
  return result;
}

/** Every notion with only its *published* linked fiches (cross-book context included) — the user-facing transversal glossary. Notions left with no published fiche after filtering are omitted. */
export async function getGlossary(): Promise<NotionSummary[]> {
  const supabase = await createClient();
  const [{ data: notions }, { data: links }] = await Promise.all([
    supabase.from("el_profesor_notions").select("*").order("name", { ascending: true }),
    supabase.from("el_profesor_notion_links").select("notion_id, fiche_id"),
  ]);
  if (!notions || notions.length === 0 || !links || links.length === 0) return [];

  const ficheIds = [...new Set(links.map((l) => l.fiche_id))];
  const { data: publishedFiches } = await supabase
    .from("el_profesor_fiches")
    .select("id")
    .in("id", ficheIds)
    .eq("status", "published");
  const publishedIds = new Set((publishedFiches ?? []).map((f) => f.id));

  const ficheContexts = await resolveFicheContexts([...publishedIds]);

  return (notions as { id: string; name: string; created_at: string }[])
    .map((n) => ({
      notion: { id: n.id, name: n.name, createdAt: n.created_at } as Notion,
      fiches: links
        .filter((l) => l.notion_id === n.id && publishedIds.has(l.fiche_id))
        .map((l) => ficheContexts.get(l.fiche_id))
        .filter((f): f is NotionLinkedFiche => Boolean(f)),
    }))
    .filter((s) => s.fiches.length > 0);
}

/**
 * Other published fiches that share at least one notion with this one —
 * inline cross-links shown directly on a fiche, rather than only reachable
 * through the admin notions page. Item 4 of the backlog.
 */
export async function getRelatedFiches(ficheId: string): Promise<NotionLinkedFiche[]> {
  const supabase = await createClient();
  const { data: myLinks } = await supabase.from("el_profesor_notion_links").select("notion_id").eq("fiche_id", ficheId);
  const notionIds = (myLinks ?? []).map((l) => l.notion_id);
  if (notionIds.length === 0) return [];

  const { data: otherLinks } = await supabase
    .from("el_profesor_notion_links")
    .select("fiche_id")
    .in("notion_id", notionIds)
    .neq("fiche_id", ficheId);
  const otherFicheIds = [...new Set((otherLinks ?? []).map((l) => l.fiche_id))];
  if (otherFicheIds.length === 0) return [];

  const { data: publishedFiches } = await supabase
    .from("el_profesor_fiches")
    .select("id")
    .in("id", otherFicheIds)
    .eq("status", "published");
  const publishedIds = (publishedFiches ?? []).map((f) => f.id);
  if (publishedIds.length === 0) return [];

  const contexts = await resolveFicheContexts(publishedIds);
  return [...contexts.values()];
}

/** Every notion with the fiches linked to it (cross-book context included), for the admin notions/contradictions screen. */
export async function getNotionSummaries(): Promise<NotionSummary[]> {
  const supabase = await createClient();
  const [{ data: notions }, { data: links }] = await Promise.all([
    supabase.from("el_profesor_notions").select("*").order("name", { ascending: true }),
    supabase.from("el_profesor_notion_links").select("notion_id, fiche_id"),
  ]);
  if (!notions || notions.length === 0) return [];

  const ficheIds = [...new Set((links ?? []).map((l) => l.fiche_id))];
  const ficheContexts = await resolveFicheContexts(ficheIds);

  return (notions as { id: string; name: string; created_at: string }[]).map((n) => ({
    notion: { id: n.id, name: n.name, createdAt: n.created_at } as Notion,
    fiches: (links ?? [])
      .filter((l) => l.notion_id === n.id)
      .map((l) => ficheContexts.get(l.fiche_id))
      .filter((f): f is NotionLinkedFiche => Boolean(f)),
  }));
}

/**
 * Near-duplicate flashcards across two different books' fiches, for every
 * notion that links fiches from more than one book — item 53 of the
 * backlog. Reuses the same deterministic bigram similarity as the existing
 * per-book duplicate detection (item 45), just sourced across the notion's
 * fiches instead of one book's, and only reports pairs that actually cross
 * a book boundary (same-book duplicates are already covered by item 45).
 */
export async function getCrossBookFlashcardDuplicates(): Promise<CrossBookDuplicateFlashcards[]> {
  const summaries = await getNotionSummaries();
  const supabase = await createClient();
  const results: CrossBookDuplicateFlashcards[] = [];

  for (const { notion, fiches } of summaries) {
    const distinctBooks = new Set(fiches.map((f) => f.bookId));
    if (fiches.length < 2 || distinctBooks.size < 2) continue;

    const { data: cardRows } = await supabase
      .from("el_profesor_flashcards")
      .select("id, front, fiche_id")
      .in(
        "fiche_id",
        fiches.map((f) => f.ficheId)
      )
      .eq("status", "published");
    const cards = (cardRows ?? []) as { id: string; front: FlashcardSide; fiche_id: string }[];
    if (cards.length < 2) continue;

    const byFiche = new Map<string, NotionLinkedFiche>(fiches.map((f) => [f.ficheId, f]));
    const flat = cards.map((c) => ({ id: c.id, front: c.front.text, ficheId: c.fiche_id }));
    const pairs = findDuplicateFlashcards(flat.map(({ id, front }) => ({ id, front })));

    const byFichePair = new Map<string, { ficheA: NotionLinkedFiche; ficheB: NotionLinkedFiche; pairs: { frontA: string; frontB: string; similarity: number }[] }>();
    for (const pair of pairs) {
      const cardA = flat.find((c) => c.id === pair.a.id);
      const cardB = flat.find((c) => c.id === pair.b.id);
      if (!cardA || !cardB || cardA.ficheId === cardB.ficheId) continue;
      const ficheA = byFiche.get(cardA.ficheId);
      const ficheB = byFiche.get(cardB.ficheId);
      if (!ficheA || !ficheB || ficheA.bookId === ficheB.bookId) continue;

      const key = [ficheA.ficheId, ficheB.ficheId].sort().join("|");
      const entry = byFichePair.get(key) ?? { ficheA, ficheB, pairs: [] };
      entry.pairs.push({ frontA: pair.a.front, frontB: pair.b.front, similarity: pair.similarity });
      byFichePair.set(key, entry);
    }

    for (const entry of byFichePair.values()) {
      results.push({ notionId: notion.id, notionName: notion.name, ...entry });
    }
  }

  return results;
}

/** Every currently merged/replaced fiche, for the admin "fusions & obsolescences" oversight list (with a way back via clearFicheSuperseded). */
export async function getSupersededFiches(): Promise<SupersededFicheEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_fiches")
    .select("id, superseded_by_fiche_id, superseded_reason, superseded_note")
    .not("superseded_by_fiche_id", "is", null);
  const rows = (data ?? []) as { id: string; superseded_by_fiche_id: string; superseded_reason: "duplicate" | "outdated"; superseded_note: string }[];
  if (rows.length === 0) return [];

  const contexts = await resolveFicheContexts([...rows.map((r) => r.id), ...rows.map((r) => r.superseded_by_fiche_id)]);

  return rows
    .map((row) => {
      const fiche = contexts.get(row.id);
      const supersededBy = contexts.get(row.superseded_by_fiche_id);
      if (!fiche || !supersededBy) return null;
      return { fiche, supersededBy, reason: row.superseded_reason, note: row.superseded_note } satisfies SupersededFicheEntry;
    })
    .filter((e): e is SupersededFicheEntry => Boolean(e));
}

/** Pending/resolved/dismissed contradiction findings, most recent first. */
export async function getContradictions(status?: ContradictionStatus): Promise<Contradiction[]> {
  const supabase = await createClient();
  let query = supabase.from("el_profesor_contradictions").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  if (!data || data.length === 0) return [];

  const ficheIds = [...new Set(data.flatMap((c) => [c.fiche_id_a, c.fiche_id_b]))];
  const ficheContexts = await resolveFicheContexts(ficheIds);

  const notionIds = [...new Set(data.map((c) => c.notion_id).filter((id): id is string => Boolean(id)))];
  const { data: notions } = notionIds.length
    ? await supabase.from("el_profesor_notions").select("id, name").in("id", notionIds)
    : { data: [] as { id: string; name: string }[] };
  const notionNameById = new Map((notions ?? []).map((n) => [n.id, n.name]));

  return data
    .map((c) => {
      const ficheA = ficheContexts.get(c.fiche_id_a);
      const ficheB = ficheContexts.get(c.fiche_id_b);
      if (!ficheA || !ficheB) return null;
      return {
        id: c.id,
        notionId: c.notion_id,
        notionName: c.notion_id ? (notionNameById.get(c.notion_id) ?? null) : null,
        ficheA,
        ficheB,
        explanation: c.explanation,
        status: c.status,
        resolutionNote: c.resolution_note,
        createdAt: c.created_at,
      } satisfies Contradiction;
    })
    .filter((c): c is Contradiction => Boolean(c));
}

/** Notion-update proposals for the admin review list on /notions — pending by default, or a specific status when passed. */
export async function getNotionUpdateProposals(status?: NotionUpdateProposalStatus): Promise<NotionUpdateProposal[]> {
  const supabase = await createClient();
  let query = supabase.from("el_profesor_notion_update_proposals").select("*").order("created_at", { ascending: false });
  query = status ? query.eq("status", status) : query.eq("status", "pending");
  const { data } = await query;
  if (!data || data.length === 0) return [];

  const ficheIds = [...new Set(data.map((p) => p.fiche_id))];
  const ficheContexts = await resolveFicheContexts(ficheIds);

  const notionIds = [...new Set(data.map((p) => p.notion_id))];
  const { data: notions } = await supabase.from("el_profesor_notions").select("id, name").in("id", notionIds);
  const notionNameById = new Map((notions ?? []).map((n) => [n.id, n.name]));

  return data
    .map((p) => {
      const fiche = ficheContexts.get(p.fiche_id);
      if (!fiche) return null;
      const additions = p.additions as unknown as { blocks: ExtractedFicheBlock[]; flashcards: ExtractedFlashcard[] };
      return {
        id: p.id,
        notionId: p.notion_id,
        notionName: notionNameById.get(p.notion_id) ?? "",
        fiche,
        sourceKind: p.source_kind,
        sourceExcerpt: p.source_excerpt,
        explanation: p.explanation,
        additions,
        status: p.status,
        createdAt: p.created_at,
      } satisfies NotionUpdateProposal;
    })
    .filter((p): p is NotionUpdateProposal => Boolean(p));
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
  const grouped = new Map<string | null, { attempts: number; good: number }>();
  for (const row of rows) {
    const key = row.variant_id;
    if (!grouped.has(key)) grouped.set(key, { attempts: 0, good: 0 });
    const entry = grouped.get(key)!;
    entry.attempts++;
    if (row.rating === "good") entry.good++;
  }

  return [...textById.entries()].map(([variantId, text]) => {
    const entry = grouped.get(variantId) ?? { attempts: 0, good: 0 };
    return { variantId, text, attempts: entry.attempts, successRate: entry.attempts > 0 ? entry.good / entry.attempts : 0 };
  });
}

// -- Questions/réponses sous une fiche, visibles par tous -------------------

/** All questions + their answers for a fiche, oldest first — item 28 of the backlog. */
export async function getFicheQuestions(ficheId: string, userId: string): Promise<FicheQuestion[]> {
  const supabase = await createClient();

  const { data: questionRows } = await supabase
    .from("el_profesor_fiche_questions")
    .select("*")
    .eq("fiche_id", ficheId)
    .order("created_at", { ascending: true });
  const questions = questionRows ?? [];
  if (questions.length === 0) return [];

  const { data: answerRows } = await supabase
    .from("el_profesor_fiche_answers")
    .select("*")
    .in(
      "question_id",
      questions.map((q) => q.id)
    )
    .order("created_at", { ascending: true });

  const answersByQuestion = new Map<string, FicheAnswer[]>();
  for (const row of answerRows ?? []) {
    const answer: FicheAnswer = { id: row.id, questionId: row.question_id, body: row.body, createdAt: row.created_at, isMine: row.author_id === userId, flagged: row.flagged };
    if (!answersByQuestion.has(row.question_id)) answersByQuestion.set(row.question_id, []);
    answersByQuestion.get(row.question_id)!.push(answer);
  }

  return questions.map((q) => ({
    id: q.id,
    ficheId: q.fiche_id,
    body: q.body,
    createdAt: q.created_at,
    isMine: q.author_id === userId,
    flagged: q.flagged,
    answers: answersByQuestion.get(q.id) ?? [],
  }));
}
