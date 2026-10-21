import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ElProfesorFicheBlockRow, ElProfesorFlashcardRow } from "@/lib/supabase/types";
import { selectAllPages, selectInChunksStrict } from "../dal/shared";
import type { BlockContent, BlockType, Citation, FlashcardSide } from "../types";
import type { SourceFicheRef } from "./types";

// Reads the source books of a fusion. Always called with the service-role
// client: the queue runs from the cron route, with no user session.

type Admin = SupabaseClient<Database>;

export interface SourceCatalog {
  books: { id: string; title: string }[];
  fiches: SourceFicheRef[];
}

type SourceRow = Database["public"]["Functions"]["el_profesor_merge_source_fiches"]["Returns"][number];

/**
 * The rows of el_profesor_merge_source_fiches. One call returning the whole
 * list (el_profesor_merge_source_catalog, migration 102); before that
 * migration, page by page — each page recomputes everything, slow on a
 * large library.
 */
export async function loadSourceRows(supabase: Admin, bookIds: string[], includeDrafts: boolean): Promise<SourceRow[]> {
  const { data, error } = await supabase.rpc("el_profesor_merge_source_catalog", { p_book_ids: bookIds, p_include_drafts: includeDrafts });
  if (!error && Array.isArray(data)) return data as unknown as SourceRow[];
  return selectAllPages((from, to) =>
    supabase
      .rpc("el_profesor_merge_source_fiches", { p_book_ids: bookIds, p_include_drafts: includeDrafts })
      .order("book_id")
      .order("chapter_order")
      .order("sub_entity_order")
      .order("fiche_id")
      .range(from, to)
  );
}

/** Every active fiche of the source books, in reading order (book as selected, then chapter, then fiche). */
export async function loadSourceCatalog(supabase: Admin, bookIds: string[], includeDrafts: boolean): Promise<SourceCatalog> {
  const { data: bookRows } = await supabase.from("el_profesor_books").select("id, title").in("id", bookIds);
  const titleById = new Map((bookRows ?? []).map((b) => [b.id, b.title]));
  const books = bookIds.filter((id) => titleById.has(id)).map((id) => ({ id, title: titleById.get(id)! }));
  const bookRank = new Map(books.map((b, i) => [b.id, i]));

  const rows = await loadSourceRows(supabase, books.map((b) => b.id), includeDrafts);

  const fiches = rows
    .map((r) => ({
      ficheId: r.fiche_id,
      bookId: r.book_id,
      bookTitle: titleById.get(r.book_id) ?? "",
      chapterId: r.chapter_id,
      chapterTitle: r.chapter_title,
      title: r.title,
      summary: r.summary ?? "",
      blockCount: r.block_count,
      cardCount: r.card_count,
      chars: r.chars,
      order: [bookRank.get(r.book_id) ?? 0, r.chapter_order, r.sub_entity_order] as const,
    }))
    .filter((f) => f.blockCount + f.cardCount > 0)
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2]);

  return {
    books,
    fiches: fiches.map((f) => ({
      ficheId: f.ficheId,
      bookId: f.bookId,
      bookTitle: f.bookTitle,
      chapterId: f.chapterId,
      chapterTitle: f.chapterTitle,
      title: f.title,
      summary: f.summary,
      blockCount: f.blockCount,
      cardCount: f.cardCount,
      chars: f.chars,
    })),
  };
}

export interface SourceBlock {
  id: string;
  ficheId: string;
  blockType: BlockType;
  content: BlockContent;
  citations: Citation[];
  imageUrl: string | null;
  imageAlt: string | null;
  isEmergency: boolean;
}

export interface SourceCard {
  row: ElProfesorFlashcardRow;
  id: string;
  ficheId: string;
  front: string;
  back: string;
  citations: Citation[];
  /** Image-occlusion and cloze cards are copied as they are: their text alone isn't the card. */
  structural: boolean;
}

/** Blocks and cards of the given source fiches, each fiche's in its own reading order. */
export async function loadSourceContent(
  supabase: Admin,
  ficheIds: string[],
  includeDrafts: boolean
): Promise<{ blocksByFiche: Map<string, SourceBlock[]>; cardsByFiche: Map<string, SourceCard[]> }> {
  const [blockRows, cardRows] = await Promise.all([
    selectInChunksStrict(ficheIds, (chunk) => {
      let q = supabase.from("el_profesor_fiche_blocks").select("*").in("fiche_id", chunk);
      if (!includeDrafts) q = q.eq("status", "published");
      return q;
    }),
    selectInChunksStrict(ficheIds, (chunk) => {
      let q = supabase.from("el_profesor_flashcards").select("*").in("fiche_id", chunk).neq("status", "replaced");
      if (!includeDrafts) q = q.eq("status", "published");
      return q;
    }),
  ]);

  const blocksByFiche = new Map<string, SourceBlock[]>();
  for (const b of (blockRows as ElProfesorFicheBlockRow[]).sort((x, y) => x.order_index - y.order_index)) {
    const list = blocksByFiche.get(b.fiche_id) ?? [];
    list.push({
      id: b.id,
      ficheId: b.fiche_id,
      blockType: b.block_type as BlockType,
      content: b.content as unknown as BlockContent,
      citations: ((b.citations as unknown as Citation[]) ?? []).filter((c) => c && typeof c.page === "number"),
      imageUrl: b.image_url,
      imageAlt: b.image_alt,
      isEmergency: b.is_emergency,
    });
    blocksByFiche.set(b.fiche_id, list);
  }

  const cardsByFiche = new Map<string, SourceCard[]>();
  for (const c of (cardRows as ElProfesorFlashcardRow[]).sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    const occlusions = Array.isArray(c.image_occlusions) ? c.image_occlusions.length : 0;
    const clozes = Array.isArray(c.cloze_ranges) ? c.cloze_ranges.length : 0;
    const list = cardsByFiche.get(c.fiche_id) ?? [];
    list.push({
      row: c,
      id: c.id,
      ficheId: c.fiche_id,
      front: (c.front as unknown as FlashcardSide)?.text ?? "",
      back: (c.back as unknown as FlashcardSide)?.text ?? "",
      citations: ((c.citations as unknown as Citation[]) ?? []).filter((x) => x && typeof x.page === "number"),
      structural: occlusions > 0 || clozes > 0,
    });
    cardsByFiche.set(c.fiche_id, list);
  }

  return { blocksByFiche, cardsByFiche };
}
