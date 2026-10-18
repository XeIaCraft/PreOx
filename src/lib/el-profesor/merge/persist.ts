import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiError } from "@/lib/gemini-shared";
import type { Database, ElProfesorFicheBlockRow } from "@/lib/supabase/types";
import type { BlockContent, BlockType, Citation, SuggestedImage } from "../types";
import type { SourceCard } from "./source";

type Admin = SupabaseClient<Database>;

export interface MergedBlockDraft {
  blockType: BlockType;
  content: BlockContent;
  citations: Citation[];
  imageUrl: string | null;
  imageAlt: string | null;
  suggestedImage: SuggestedImage | null;
  isEmergency: boolean;
  needsReview: boolean;
}

export interface MergedCardDraft {
  front: string;
  back: string;
  citations: Citation[];
  imageUrl: string | null;
  imageAlt: string | null;
  sourceFlashcardIds: string[];
  needsReview: boolean;
  /** Set for a card copied as it is (image occlusion, cloze, or a card no merged card took over). */
  copyOf?: SourceCard;
}

function blockRow(ficheId: string, b: MergedBlockDraft, orderIndex: number) {
  return {
    fiche_id: ficheId,
    order_index: orderIndex,
    block_type: b.blockType,
    content: b.content as never,
    citations: b.citations as never,
    needs_review: b.needsReview,
    status: "draft" as const,
    is_emergency: b.isEmergency,
    image_url: b.imageUrl,
    image_alt: b.imageAlt,
    suggested_image: b.suggestedImage as never,
  };
}

function cardRow(ficheId: string, c: MergedCardDraft) {
  const src = c.copyOf?.row;
  return {
    fiche_id: ficheId,
    front: { text: c.front } as never,
    back: { text: c.back } as never,
    citations: c.citations as never,
    status: "draft" as const,
    needs_review: c.needsReview,
    image_url: c.imageUrl,
    image_alt: c.imageAlt,
    variants: (src?.variants ?? []) as never,
    image_occlusions: (src?.image_occlusions ?? []) as never,
    cloze_ranges: (src?.cloze_ranges ?? []) as never,
    source_flashcard_ids: c.sourceFlashcardIds,
  };
}

/** Replaces the whole content of a merged fiche (a stage run again rewrites it, never appends to it). */
export async function writeMergedFiche(
  supabase: Admin,
  target: { subEntityId: string; ficheId: string },
  summary: string,
  blocks: MergedBlockDraft[],
  cards: MergedCardDraft[]
): Promise<void> {
  await supabase.from("el_profesor_fiche_blocks").delete().eq("fiche_id", target.ficheId);
  await supabase.from("el_profesor_flashcards").delete().eq("fiche_id", target.ficheId);
  if (summary) await supabase.from("el_profesor_sub_entities").update({ summary }).eq("id", target.subEntityId);
  if (blocks.length) {
    const { error } = await supabase.from("el_profesor_fiche_blocks").insert(blocks.map((b, i) => blockRow(target.ficheId, b, i)));
    if (error) throw new GeminiError(`Enregistrement des blocs fusionnés impossible : ${error.message}`);
  }
  if (cards.length) {
    const { error } = await supabase.from("el_profesor_flashcards").insert(cards.map((c) => cardRow(target.ficheId, c)));
    if (error) throw new GeminiError(`Enregistrement des cartes fusionnées impossible : ${error.message}`);
  }
}

export async function appendMergedCards(supabase: Admin, ficheId: string, cards: MergedCardDraft[]): Promise<void> {
  if (!cards.length) return;
  const { error } = await supabase.from("el_profesor_flashcards").insert(cards.map((c) => cardRow(ficheId, c)));
  if (error) throw new GeminiError(`Enregistrement des cartes reprises impossible : ${error.message}`);
}

export async function loadFicheBlocks(supabase: Admin, ficheId: string): Promise<ElProfesorFicheBlockRow[]> {
  const { data } = await supabase.from("el_profesor_fiche_blocks").select("*").eq("fiche_id", ficheId).order("order_index");
  return (data ?? []) as ElProfesorFicheBlockRow[];
}

/**
 * Writes a fiche's blocks in the given order: existing rows (with `id`) are
 * updated in place, new ones inserted. Used by the repair stage, which
 * enriches and inserts blocks without rewriting the fiche.
 */
export async function rewriteFicheBlocks(
  supabase: Admin,
  ficheId: string,
  ordered: ({ id: string; content?: BlockContent; citations?: Citation[] } | { draft: MergedBlockDraft })[]
): Promise<void> {
  const inserts: ReturnType<typeof blockRow>[] = [];
  const updates: PromiseLike<unknown>[] = [];
  ordered.forEach((entry, orderIndex) => {
    if ("draft" in entry) {
      inserts.push(blockRow(ficheId, entry.draft, orderIndex));
      return;
    }
    const patch: Record<string, unknown> = { order_index: orderIndex };
    if (entry.content) patch.content = entry.content;
    if (entry.citations) patch.citations = entry.citations;
    updates.push(supabase.from("el_profesor_fiche_blocks").update(patch as never).eq("id", entry.id));
  });
  await Promise.all(updates);
  if (inserts.length) {
    const { error } = await supabase.from("el_profesor_fiche_blocks").insert(inserts);
    if (error) throw new GeminiError(`Enregistrement des blocs ajoutés impossible : ${error.message}`);
  }
}
