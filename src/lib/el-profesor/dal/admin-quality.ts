import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChapterContent } from "./shared";
import { blockToPlainText } from "../block-text";
import { findDuplicateFlashcards, findSimilarSubEntities, type DuplicateFlashcardPair, type SimilarSubEntityPair } from "../dedupe";
import type { BlockContent, BlockType, Chapter, Book } from "../types";

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
