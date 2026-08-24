import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiError } from "@/lib/gemini-shared";
import type { Database } from "@/lib/supabase/types";
import type { getChapterContent } from "./dal";
import type {
  ExtractionResult,
  ComplementaryResult,
  ExtractedSubEntity,
  ExtractedFicheBlock,
  ExtractedFlashcard,
  VerificationFlag,
  Citation,
  BlockContent,
  FlashcardSide,
  TableBlockContent,
  ProtocolBlockContent,
} from "./types";

// Persistence for both extraction pipelines (initial + gap-fill), shared by
// every entry point that produces an ExtractionResult/ComplementaryResult:
// the synchronous admin-triggered actions (actions/extraction.ts) and the
// Claude batch-result poller (/api/cron/el-profesor-batch-poll), which has
// no request-scoped session — hence every function here takes the caller's
// Supabase client explicitly rather than creating its own. Kept as a plain
// lib module (not a "use server" actions file) specifically so both
// actions/extraction.ts and actions/batches.ts can import from it without
// creating a circular dependency between the two action files.

// Safety cap on auto-run complementary passes, shared by both the Gemini
// synchronous auto-loop (actions/extraction.ts) and the Claude async
// auto-continuation (the cron poller re-submits a fresh one-chapter batch
// after each result until this many passes have run) — each pass is a real
// (costly) API call, so "until complete" still stops well short of runaway
// spend if the model keeps reporting non-zero remaining passes indefinitely.
export const MAX_AUTO_COMPLEMENTARY_PASSES = 6;

function needsReview(flags: VerificationFlag[], subEntityIndex: number, blockIndex: number | null, flashcardIndex: number | null) {
  return flags.some(
    (f) =>
      f.sub_entity_index === subEntityIndex &&
      (blockIndex !== null ? f.block_index === blockIndex : f.flashcard_index === flashcardIndex)
  );
}

/** Claude has no verification pass, sync or batched — every element it produces is conservatively marked needs_review. */
export function allNeedReviewFlags(extraction: ExtractionResult): VerificationFlag[] {
  const flags: VerificationFlag[] = [];
  extraction.sub_entities.forEach((sub, subIndex) => {
    sub.fiche.blocks.forEach((_, blockIndex) =>
      flags.push({ sub_entity_index: subIndex, block_index: blockIndex, flashcard_index: null, needs_review: true, reason: "Non vérifié automatiquement." })
    );
    sub.fiche.flashcards.forEach((_, flashcardIndex) =>
      flags.push({ sub_entity_index: subIndex, block_index: null, flashcard_index: flashcardIndex, needs_review: true, reason: "Non vérifié automatiquement." })
    );
  });
  return flags;
}

interface NewSubEntityItem {
  sub: ExtractedSubEntity;
  orderIndex: number;
  blockNeedsReview: (blockIndex: number) => boolean;
  cardNeedsReview: (cardIndex: number) => boolean;
}

/**
 * Inserts N sub-entities + their fiches + blocks + flashcards in four
 * batched calls total (one per table) instead of four round-trips per
 * sub-entity — a chapter extraction typically produces several sub-entities
 * at once. sub_entity/fiche ids are generated client-side (rather than
 * read back via .select() after insert) specifically so the blocks and
 * flashcards for every sub-entity can be flattened into one insert each,
 * without depending on a multi-row insert returning rows in input order.
 * Shared by the initial and complementary extraction pipelines.
 */
async function insertNewSubEntities(
  supabase: SupabaseClient<Database>,
  chapterId: string,
  items: NewSubEntityItem[]
): Promise<{ blockCount: number; cardCount: number }> {
  if (items.length === 0) return { blockCount: 0, cardCount: 0 };

  const withIds = items.map((item) => ({ ...item, subEntityId: randomUUID(), ficheId: randomUUID() }));

  const { error: subError } = await supabase.from("el_profesor_sub_entities").insert(
    withIds.map(({ subEntityId, sub, orderIndex }) => ({
      id: subEntityId,
      chapter_id: chapterId,
      name: sub.name,
      order_index: orderIndex,
      summary: sub.summary,
    }))
  );
  if (subError) throw new GeminiError("Échec de l'enregistrement des sous-entités.");

  const { error: ficheError } = await supabase.from("el_profesor_fiches").insert(
    withIds.map(({ ficheId, subEntityId, sub }) => ({ id: ficheId, sub_entity_id: subEntityId, title: sub.fiche.title, status: "draft" as const }))
  );
  if (ficheError) throw new GeminiError("Échec de l'enregistrement des fiches.");

  const blockRows = withIds.flatMap(({ ficheId, sub, blockNeedsReview }) =>
    sub.fiche.blocks.map((block, blockIndex) => ({
      fiche_id: ficheId,
      order_index: blockIndex,
      block_type: block.block_type,
      content: block.content as unknown as BlockContent as never,
      citations: block.citations as unknown as Citation[] as never,
      needs_review: blockNeedsReview(blockIndex),
      status: "draft" as const,
    }))
  );
  if (blockRows.length > 0) {
    const { error } = await supabase.from("el_profesor_fiche_blocks").insert(blockRows);
    if (error) throw new GeminiError("Échec de l'enregistrement des blocs de contenu.");
  }

  const cardRows = withIds.flatMap(({ ficheId, sub, cardNeedsReview }) =>
    sub.fiche.flashcards.map((card, cardIndex) => ({
      fiche_id: ficheId,
      front: { text: card.front } as FlashcardSide as never,
      back: { text: card.back } as FlashcardSide as never,
      citations: card.citations as unknown as Citation[] as never,
      status: "draft" as const,
      needs_review: cardNeedsReview(cardIndex),
      suggested_image_page: card.suggested_image_page ?? null,
      suggested_image_hint: card.suggested_image_hint ?? null,
    }))
  );
  if (cardRows.length > 0) {
    const { error } = await supabase.from("el_profesor_flashcards").insert(cardRows);
    if (error) throw new GeminiError("Échec de l'enregistrement des flashcards.");
  }

  return {
    blockCount: items.reduce((sum, i) => sum + i.sub.fiche.blocks.length, 0),
    cardCount: items.reduce((sum, i) => sum + i.sub.fiche.flashcards.length, 0),
  };
}

export async function persistExtraction(supabase: SupabaseClient<Database>, chapterId: string, extraction: ExtractionResult, flags: VerificationFlag[]) {
  await insertNewSubEntities(
    supabase,
    chapterId,
    extraction.sub_entities.map((sub, subIndex) => ({
      sub,
      orderIndex: subIndex,
      blockNeedsReview: (blockIndex: number) => needsReview(flags, subIndex, blockIndex, null),
      cardNeedsReview: (cardIndex: number) => needsReview(flags, subIndex, null, cardIndex),
    }))
  );
}

function blockExcerpt(blockType: string, content: BlockContent): string {
  if (blockType === "tableau_comparatif") {
    const c = content as TableBlockContent;
    return `Tableau : ${(c.headers ?? []).join(" | ")}`;
  }
  if (blockType === "protocole_paliers") {
    const c = content as ProtocolBlockContent;
    return (c.steps ?? []).map((s) => s.label).join(" -> ");
  }
  return ((content as { text?: string }).text ?? "").slice(0, 200);
}

/** Concise summary of what a chapter already covers, sent to the provider so the gap-fill pass knows what NOT to repeat. */
export function buildCoverageSummary(subEntities: Awaited<ReturnType<typeof getChapterContent>>): string {
  const summary = subEntities
    .filter((s) => s.fiche)
    .map((s) => ({
      sub_entity_name: s.name,
      blocks: s.fiche!.blocks.map((b) => ({ block_type: b.blockType, excerpt: blockExcerpt(b.blockType, b.content) })),
      flashcard_fronts: s.fiche!.flashcards.map((c) => c.front.text),
    }));
  return JSON.stringify(summary);
}

export async function persistComplementaryAdditions(
  supabase: SupabaseClient<Database>,
  chapterId: string,
  result: ComplementaryResult,
  existingContent: Awaited<ReturnType<typeof getChapterContent>>
): Promise<number> {
  let added = 0;

  const subEntityByName = new Map(existingContent.filter((s) => s.fiche).map((s) => [s.name.trim().toLowerCase(), s]));
  const nextOrder = existingContent.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

  for (const addition of result.additions_for_existing) {
    const match = subEntityByName.get(addition.sub_entity_name.trim().toLowerCase());
    const ficheId = match?.fiche?.id;
    // No confident name match — skip rather than guess where this content belongs;
    // the model should have proposed a new sub-entity instead in that case.
    if (!ficheId) continue;

    const blockOffset = match!.fiche!.blocks.length;

    if (addition.blocks.length > 0) {
      const { error } = await supabase.from("el_profesor_fiche_blocks").insert(
        addition.blocks.map((block, i) => ({
          fiche_id: ficheId,
          order_index: blockOffset + i,
          block_type: block.block_type,
          content: block.content as unknown as BlockContent as never,
          citations: block.citations as unknown as Citation[] as never,
          needs_review: true,
          status: "draft",
        }))
      );
      if (error) throw new GeminiError(`Échec de l'enregistrement des blocs complémentaires pour « ${addition.sub_entity_name} ».`);
      added += addition.blocks.length;
    }

    if (addition.flashcards.length > 0) {
      const { error } = await supabase.from("el_profesor_flashcards").insert(
        addition.flashcards.map((card) => ({
          fiche_id: ficheId,
          front: { text: card.front } as FlashcardSide as never,
          back: { text: card.back } as FlashcardSide as never,
          citations: card.citations as unknown as Citation[] as never,
          status: "draft",
          needs_review: true,
          suggested_image_page: card.suggested_image_page ?? null,
          suggested_image_hint: card.suggested_image_hint ?? null,
        }))
      );
      if (error) throw new GeminiError(`Échec de l'enregistrement des flashcards complémentaires pour « ${addition.sub_entity_name} ».`);
      added += addition.flashcards.length;
    }
  }

  if (result.new_sub_entities.length > 0) {
    const counts = await insertNewSubEntities(
      supabase,
      chapterId,
      result.new_sub_entities.map((sub, i) => ({
        sub,
        orderIndex: nextOrder + i,
        blockNeedsReview: () => true,
        cardNeedsReview: () => true,
      }))
    );
    added += counts.blockCount + counts.cardCount + result.new_sub_entities.length;
  }

  return added;
}

/**
 * Appends draft blocks/flashcards to one specific fiche — the single-fiche
 * counterpart of persistComplementaryAdditions' "existing sub-entity"
 * branch, used when the target fiche is already known directly (e.g.
 * applying a notion-update proposal) rather than matched by name within a
 * chapter's content. Same conservative pattern as everywhere else: always
 * `draft`/`needs_review`, never an overwrite of existing content.
 */
export async function appendFicheAdditions(
  supabase: SupabaseClient<Database>,
  ficheId: string,
  blocks: ExtractedFicheBlock[],
  flashcards: ExtractedFlashcard[]
): Promise<number> {
  let added = 0;

  if (blocks.length > 0) {
    const { count: existingBlockCount } = await supabase
      .from("el_profesor_fiche_blocks")
      .select("id", { count: "exact", head: true })
      .eq("fiche_id", ficheId);
    const blockOffset = existingBlockCount ?? 0;

    const { error } = await supabase.from("el_profesor_fiche_blocks").insert(
      blocks.map((block, i) => ({
        fiche_id: ficheId,
        order_index: blockOffset + i,
        block_type: block.block_type,
        content: block.content as unknown as BlockContent as never,
        citations: block.citations as unknown as Citation[] as never,
        needs_review: true,
        status: "draft",
      }))
    );
    if (error) throw new GeminiError("Échec de l'enregistrement des blocs proposés.");
    added += blocks.length;
  }

  if (flashcards.length > 0) {
    const { error } = await supabase.from("el_profesor_flashcards").insert(
      flashcards.map((card) => ({
        fiche_id: ficheId,
        front: { text: card.front } as FlashcardSide as never,
        back: { text: card.back } as FlashcardSide as never,
        citations: card.citations as unknown as Citation[] as never,
        status: "draft",
        needs_review: true,
        suggested_image_page: card.suggested_image_page ?? null,
        suggested_image_hint: card.suggested_image_hint ?? null,
      }))
    );
    if (error) throw new GeminiError("Échec de l'enregistrement des flashcards proposées.");
    added += flashcards.length;
  }

  return added;
}
