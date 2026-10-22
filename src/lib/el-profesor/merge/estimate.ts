// Cost estimate shown before a fusion is launched. Deliberately rough (the
// actual bill depends on how much the model writes), but derived from the
// real volume of the selected books, stage by stage, with the same pricing
// table as the usage panel.

import { estimateCostUsd } from "../ai-pricing";
import { ASSIGN_CHUNK, targetSubPartCount } from "./plan";
import { CHARS_PER_TOKEN, pricedModel as priced, writingStages } from "./lot-estimate";
import type { MergeProvider } from "./types";

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
  /** The table of contents alone (plan, répartition, chapitres): what launching the fusion costs; the fiches are written later, lot by lot. */
  tocCostUsd: number | null;
}

export function estimateMerge(input: MergeEstimateInput, provider: MergeProvider, model: string): MergeEstimate {
  const n = input.fiches.length;
  const subParts = targetSubPartCount(n);
  // Several books on the same subject fuse into one fiche; one book alone barely regroups.
  const mergedFiches = Math.max(1, Math.round(n / Math.min(2.2, 1 + 0.6 * (input.bookCount - 1))));
  const chapters = Math.max(1, Math.round(mergedFiches / 7));
  const titleTokens = input.fiches.reduce((s, f) => s + f.title.length + 4, 0) / CHARS_PER_TOKEN;
  const refTokens = input.fiches.reduce((s, f) => s + f.title.length + f.summary.length + 70, 0) / CHARS_PER_TOKEN;
  const contentTokens = input.fiches.reduce((s, f) => s + f.chars, 0) / CHARS_PER_TOKEN;
  const tocTokens = subParts * 60;

  const assignChunks = Math.ceil(n / ASSIGN_CHUNK);
  const toc = [
    { requests: 1, input: 2_500 + titleTokens, output: tocTokens + 1_000 },
    { requests: assignChunks, input: assignChunks * (800 + tocTokens) + refTokens, output: n * 15 },
    { requests: subParts, input: subParts * 1_500 + refTokens, output: mergedFiches * 45 + chapters * 15 },
  ];
  const stages = [...toc, ...writingStages(mergedFiches, contentTokens)];

  const sum = (list: typeof stages, key: "requests" | "input" | "output") => Math.round(list.reduce((s, x) => s + x[key], 0));
  const inputTokens = sum(stages, "input");
  const outputTokens = sum(stages, "output");
  return {
    chapters,
    mergedFiches,
    requests: sum(stages, "requests"),
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(priced(provider, model), inputTokens, outputTokens),
    tocCostUsd: estimateCostUsd(priced(provider, model), sum(toc, "input"), sum(toc, "output")),
  };
}

export { estimateLot } from "./lot-estimate";
