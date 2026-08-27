import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  Flag,
  ReviewState,
  BlockContent,
  Citation,
  FlashcardSide,
  NotionLinkedFiche,
  FlashcardVariant,
  ImageOcclusion,
  ClozeRange,
} from "../types";
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
    updatedAt: row.updated_at,
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
    isEmergency: row.is_emergency,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
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
    clozeRanges: (row.cloze_ranges as unknown as ClozeRange[]) ?? [],
    suggestedImagePage: row.suggested_image_page,
    suggestedImageHint: row.suggested_image_hint,
  };
}

function toFlag(row: ElProfesorFlagRow): Flag {
  return { id: row.id, targetType: row.target_type, targetId: row.target_id, reason: row.reason, status: row.status };
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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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

export { toBook, toChapter, toSubEntity, toFiche, toFicheBlock, toFlashcard, toFlag, toReviewState, activeFlashcards, shuffle, resolveFicheContexts };
