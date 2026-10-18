// Cost estimate shown before a fusion is launched. Deliberately rough (the
// actual bill depends on how much the model writes), but derived from the
// real volume of the selected books, stage by stage, with the same pricing
// table as the usage panel.

import { estimateCostUsd } from "../ai-pricing";
import { ASSIGN_CHUNK } from "./plan";
import type { MergeProvider } from "./types";

/** Characters per token for this content: JSON-quoted French and English medical prose. */
const CHARS_PER_TOKEN = 3.2;
const FICHE_PROMPT_TOKENS = 3_200;
/** Source fiches per chapter the plan aims for. */
export const FICHES_PER_CHAPTER = 15;

export interface MergeEstimateInput {
  fiches: { title: string; summary: string; chars: number }[];
  bookCount: number;
}

export interface MergeEstimate {
  chapters: number;
  mergedFiches: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export function targetChapterCount(ficheCount: number): number {
  return Math.max(3, Math.min(600, Math.round(ficheCount / FICHES_PER_CHAPTER)));
}

export function estimateMerge(input: MergeEstimateInput, provider: MergeProvider, model: string): MergeEstimate {
  const n = input.fiches.length;
  const chapters = targetChapterCount(n);
  // Two books on the same subject fuse into one fiche; one book alone barely regroups.
  const mergedFiches = Math.max(1, Math.round(n / Math.min(2.2, 1 + 0.6 * (input.bookCount - 1))));
  const titleTokens = input.fiches.reduce((s, f) => s + f.title.length + 4, 0) / CHARS_PER_TOKEN;
  const refTokens = input.fiches.reduce((s, f) => s + f.title.length + f.summary.length + 60, 0) / CHARS_PER_TOKEN;
  const contentTokens = input.fiches.reduce((s, f) => s + f.chars, 0) / CHARS_PER_TOKEN;
  const tocTokens = chapters * 45;

  const assignChunks = Math.ceil(n / ASSIGN_CHUNK);
  const stages = [
    { requests: 1, input: 2_500 + titleTokens, output: tocTokens + 1_500 },
    { requests: assignChunks, input: assignChunks * (1_000 + tocTokens) + refTokens, output: n * 14 },
    { requests: chapters, input: chapters * 1_400 + refTokens, output: mergedFiches * 45 },
    // Sources go in with their labels; the merged fiche comes out about as long (nothing is dropped, duplicates are).
    { requests: mergedFiches, input: mergedFiches * FICHE_PROMPT_TOKENS + contentTokens * 1.15, output: contentTokens * 0.85 + mergedFiches * 350 },
    // Rattrapage: roughly one fiche in five needs one.
    { requests: Math.ceil(mergedFiches / 5), input: contentTokens * 0.12, output: contentTokens * 0.04 },
  ];

  const requests = stages.reduce((s, x) => s + x.requests, 0);
  const inputTokens = Math.round(stages.reduce((s, x) => s + x.input, 0));
  const outputTokens = Math.round(stages.reduce((s, x) => s + x.output, 0));
  const costUsd = estimateCostUsd(provider === "claude" ? `claude:${model}` : model, inputTokens, outputTokens);
  return { chapters, mergedFiches, requests, inputTokens, outputTokens, costUsd };
}
