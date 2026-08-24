import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiError } from "@/lib/gemini-shared";
import type { Database } from "@/lib/supabase/types";
import type { getChapterContent } from "./dal";
import type {
  ExtractionResult,
  ComplementaryResult,
  ExtractedSubEntity,
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

/** Inserts one sub-entity + its fiche + blocks + flashcards. Shared by the initial and complementary extraction pipelines. */
async function insertNewSubEntity(
  supabase: SupabaseClient<Database>,
  chapterId: string,
  sub: ExtractedSubEntity,
  orderIndex: number,
  blockNeedsReview: (blockIndex: number) => boolean,
  cardNeedsReview: (cardIndex: number) => boolean
): Promise<{ blockCount: number; cardCount: number }> {
  const { data: subEntity, error: subError } = await supabase
    .from("el_profesor_sub_entities")
    .insert({ chapter_id: chapterId, name: sub.name, order_index: orderIndex, summary: sub.summary })
    .select("id")
    .single();
  if (subError || !subEntity) throw new GeminiError(`Échec de l'enregistrement de « ${sub.name} ».`);

  const { data: fiche, error: ficheError } = await supabase
    .from("el_profesor_fiches")
    .insert({ sub_entity_id: subEntity.id, title: sub.fiche.title, status: "draft" })
    .select("id")
    .single();
  if (ficheError || !fiche) throw new GeminiError(`Échec de l'enregistrement de la fiche « ${sub.fiche.title} ».`);

  if (sub.fiche.blocks.length > 0) {
    const { error } = await supabase.from("el_profesor_fiche_blocks").insert(
      sub.fiche.blocks.map((block, blockIndex) => ({
        fiche_id: fiche.id,
        order_index: blockIndex,
        block_type: block.block_type,
        content: block.content as unknown as BlockContent as never,
        citations: block.citations as unknown as Citation[] as never,
        needs_review: blockNeedsReview(blockIndex),
        status: "draft",
      }))
    );
    if (error) throw new GeminiError("Échec de l'enregistrement des blocs de contenu.");
  }

  if (sub.fiche.flashcards.length > 0) {
    const { error } = await supabase.from("el_profesor_flashcards").insert(
      sub.fiche.flashcards.map((card, cardIndex) => ({
        fiche_id: fiche.id,
        front: { text: card.front } as FlashcardSide as never,
        back: { text: card.back } as FlashcardSide as never,
        citations: card.citations as unknown as Citation[] as never,
        status: "draft",
        needs_review: cardNeedsReview(cardIndex),
        suggested_image_page: card.suggested_image_page ?? null,
        suggested_image_hint: card.suggested_image_hint ?? null,
      }))
    );
    if (error) throw new GeminiError("Échec de l'enregistrement des flashcards.");
  }

  return { blockCount: sub.fiche.blocks.length, cardCount: sub.fiche.flashcards.length };
}

export async function persistExtraction(supabase: SupabaseClient<Database>, chapterId: string, extraction: ExtractionResult, flags: VerificationFlag[]) {
  for (let subIndex = 0; subIndex < extraction.sub_entities.length; subIndex++) {
    const sub = extraction.sub_entities[subIndex];
    await insertNewSubEntity(
      supabase,
      chapterId,
      sub,
      subIndex,
      (blockIndex) => needsReview(flags, subIndex, blockIndex, null),
      (cardIndex) => needsReview(flags, subIndex, null, cardIndex)
    );
  }
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
  let nextOrder = existingContent.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

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

  for (const sub of result.new_sub_entities) {
    const counts = await insertNewSubEntity(
      supabase,
      chapterId,
      sub,
      nextOrder++,
      () => true,
      () => true
    );
    added += counts.blockCount + counts.cardCount + 1;
  }

  return added;
}
