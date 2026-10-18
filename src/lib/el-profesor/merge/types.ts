// Shapes shared by the book fusion pipeline (migration 098) — plain data,
// no server or client runtime, so the Notions screen can read a job's plan
// and stats with the same types the pipeline writes them with.

import type { BlockContent, BlockType } from "../types";

export type MergeProvider = "gemini" | "claude";

/**
 * The merged table of contents. The plan stage writes the parts and their
 * sub-parts (`key` "S12" is what the prompts use); each sub-part's chapters
 * are added once the chapters stage has organised the fiches assigned to it.
 */
export interface MergePlanChapter {
  key: string;
  title: string;
  chapterId: string;
}

/** A sub-part with an empty title means "chapters directly under the part". */
export interface MergePlanSubPart {
  key: string;
  title: string;
  scope: string;
  chapters: MergePlanChapter[];
}

export interface MergePlanPart {
  title: string;
  subParts: MergePlanSubPart[];
}

export interface MergePlan {
  parts: MergePlanPart[];
}

export interface MergeStats {
  sourceFiches?: number;
  sourceBlocks?: number;
  sourceCards?: number;
  chapters?: number;
  /** Fiches the model left out at the répartition / chapitres stages, placed by rule instead. */
  assignFallback?: number;
  chapterFallback?: number;
  subParts?: number;
  fichesPlanned?: number;
  /** Merged fiches split in two or more because their sources were too long for one answer. */
  fichesSplit?: number;
  fichesDone?: number;
  fichesFailed?: number;
  tasksTotal?: number;
  tasksDone?: number;
  /** Source blocks / cards no merged block or card claims, after the repair pass — kept verbatim, so nothing is lost. */
  blocksKeptVerbatim?: number;
  cardsKeptVerbatim?: number;
  divergences?: number;
  /** Fiches sent to the repair pass: a source block not taken up, a value lost on the way, or no « à retenir ». */
  fichesRepaired?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/** One active fiche of a source book, as listed by el_profesor_merge_source_fiches (migration 098). Prompts refer to it by a short alias ("F12") given per task. */
export interface SourceFicheRef {
  ficheId: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  title: string;
  summary: string;
  blockCount: number;
  cardCount: number;
  chars: number;
}

/** Raw model output of the fiche stage, before ids are resolved. */
export interface RawMergedBlock {
  block_type: BlockType;
  heading?: string;
  content: BlockContent;
  source_block_ids: string[];
  suggested_image?: { what: string; source_block_id?: string } | null;
  reuse_image_from?: string | null;
}

export interface RawMergedCard {
  front: string;
  back: string;
  source_flashcard_ids: string[];
}

export interface RawMergedFiche {
  summary: string;
  blocks: RawMergedBlock[];
  flashcards: RawMergedCard[];
}

export interface RawRepairCard {
  front: string;
  back: string;
  source_flashcard_ids: string[];
}

export interface RawRepair {
  replacements: { block_index: number; heading?: string; content: BlockContent; source_block_ids: string[] }[];
  insertions: { after_block_index: number; block_type: BlockType; heading?: string; content: BlockContent; source_block_ids: string[] }[];
  alreadyCovered: { sourceBlockId: string; blockIndex: number }[];
  flashcards: RawRepairCard[];
}
