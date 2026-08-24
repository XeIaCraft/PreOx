import "server-only";

import { createClient } from "@/lib/supabase/server";
import { toBook, toChapter, toFlag, getChapterContent } from "./shared";
import { getMasteryCountsByChapter } from "./review";
import type { Book, Chapter, ChapterStatus, Flag, FicheQuestion, FicheAnswer } from "../types";
import type { ElProfesorBookRow, ElProfesorChapterRow, ElProfesorFlagRow } from "@/lib/supabase/types";

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
