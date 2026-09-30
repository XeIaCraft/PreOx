// Server-side guard against duplicates in a gap-fill pass: the prompt
// already lists what is covered, but a weaker model (Gemini lite) still
// re-proposes the same flashcard reworded or recreates a sub-entity under a
// slightly different name. Deterministic (bigram similarity, no AI cost),
// applied before anything is saved.

import { blockToPlainText } from "./block-text";
import type { ComplementaryResult, ExtractedFicheBlock, ExtractedFlashcard, ExtractedSubEntity } from "./types";

export interface ExistingSubEntity {
  name: string;
  blocks: { blockType: string; content: unknown }[];
  flashcardFronts: string[];
}

/** Flashcard fronts this close are the same question. */
export const CARD_SIMILARITY = 0.75;
/** Block texts this close say the same thing. */
export const BLOCK_SIMILARITY = 0.8;
/** Sub-entity names this close are the same notion. */
export const NAME_SIMILARITY = 0.8;

export function normalizeForDedupe(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** Dice coefficient on character bigrams of the normalised texts (0–1). */
export function similarity(a: string, b: string): number {
  const na = normalizeForDedupe(a);
  const nb = normalizeForDedupe(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const sa = bigrams(na);
  const sb = bigrams(nb);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

const isNear = (text: string, pool: string[], threshold: number) => pool.some((p) => similarity(text, p) >= threshold);

export interface DedupeReport {
  droppedCards: number;
  droppedBlocks: number;
  mergedSubEntities: number;
}

/**
 * Removes from a gap-fill result what the chapter already has (and what the
 * result repeats within itself): near-identical flashcard questions, blocks
 * that restate an existing block, and « new » sub-entities that are an
 * existing one under another name (their content is merged into it instead).
 */
export function dedupeComplementary(result: ComplementaryResult, existing: ExistingSubEntity[]): { result: ComplementaryResult; report: DedupeReport } {
  const report: DedupeReport = { droppedCards: 0, droppedBlocks: 0, mergedSubEntities: 0 };
  const cardPool = existing.flatMap((s) => s.flashcardFronts);
  const blockPool = existing.flatMap((s) => s.blocks.map((b) => blockToPlainText(b.blockType, b.content as never)));

  const keepCards = (cards: ExtractedFlashcard[]) =>
    cards.filter((c) => {
      if (isNear(c.front, cardPool, CARD_SIMILARITY)) {
        report.droppedCards++;
        return false;
      }
      cardPool.push(c.front);
      return true;
    });
  const keepBlocks = (blocks: ExtractedFicheBlock[]) =>
    blocks.filter((b) => {
      const text = blockToPlainText(b.block_type, b.content);
      if (text.trim().length >= 20 && isNear(text, blockPool, BLOCK_SIMILARITY)) {
        report.droppedBlocks++;
        return false;
      }
      blockPool.push(text);
      return true;
    });

  // « New » sub-entities that already exist under another name become additions to that one.
  const additions = [...result.additions_for_existing];
  const newSubs: ExtractedSubEntity[] = [];
  for (const sub of result.new_sub_entities) {
    const match = existing.find((e) => similarity(e.name, sub.name) >= NAME_SIMILARITY);
    if (match) {
      report.mergedSubEntities++;
      additions.push({ sub_entity_name: match.name, blocks: sub.fiche.blocks, flashcards: sub.fiche.flashcards });
    } else newSubs.push(sub);
  }

  const cleanedAdditions = additions
    .map((a) => ({ ...a, blocks: keepBlocks(a.blocks), flashcards: keepCards(a.flashcards) }))
    .filter((a) => a.blocks.length + a.flashcards.length > 0);
  const cleanedNew = newSubs
    .map((s) => ({ ...s, fiche: { ...s.fiche, blocks: keepBlocks(s.fiche.blocks), flashcards: keepCards(s.fiche.flashcards) } }))
    .filter((s) => s.fiche.blocks.length + s.fiche.flashcards.length > 0);

  return { result: { ...result, additions_for_existing: cleanedAdditions, new_sub_entities: cleanedNew }, report };
}
