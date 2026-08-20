import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import type { Profile } from "@/lib/supabase/types";
import type {
  Book,
  Chapter,
  SubEntity,
  Fiche,
  FicheBlock,
  Flashcard,
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
  return { id: row.id, title: row.title, author: row.author, edition: row.edition, createdAt: row.created_at };
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
  };
}

function toSubEntity(row: ElProfesorSubEntityRow): SubEntity {
  return { id: row.id, chapterId: row.chapter_id, name: row.name, orderIndex: row.order_index, summary: row.summary };
}

function toFiche(row: ElProfesorFicheRow): Fiche {
  return { id: row.id, subEntityId: row.sub_entity_id, title: row.title, status: row.status };
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
    supabase.from("el_profesor_books").select("*").order("created_at", { ascending: true }),
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

  return flashcards.filter((card) => {
    const state = stateByCard.get(card.id);
    if (!state) return true; // never reviewed — always due
    return new Date(state.due).getTime() <= now;
  });
}

/** Every published flashcard for a chapter, ignoring due dates — free/on-demand review. */
export async function getFreeReviewQueue(chapterId: string): Promise<Flashcard[]> {
  const content = await getChapterContent(chapterId, false);
  return content.flatMap((s) => s.fiche?.flashcards ?? []);
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
