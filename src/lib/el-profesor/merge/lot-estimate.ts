// Cost of writing chapters (fusion + rattrapage), shared by the server and
// the table of contents screen, which prices a lot with the model chosen for it.

import { estimateCostUsd } from "../ai-pricing";
import type { MergeProvider } from "./types";

/** Characters per token for this content: JSON-quoted French and English medical prose. */
export const CHARS_PER_TOKEN = 3.2;

export const pricedModel = (provider: MergeProvider, model: string) => (provider === "claude" ? `claude:${model}` : model);

/**
 * Writing merged fiches from the characters of their sources. Calibrated on
 * the first 1,241 fiches written (Sonnet 5, 2026-10): ≈ 8,900 tokens in and
 * 5,300 out per fiche, of which ≈ 3,000 of reasoning before the fiche itself.
 */
export function writingStages(mergedFiches: number, contentTokens: number) {
  return [
    // Instructions and the sources with their labels in; the reasoning, the merged fiche and its cards out.
    { requests: mergedFiches, input: mergedFiches * 6_250 + contentTokens * 1.33, output: mergedFiches * 3_200 + contentTokens * 1.1 },
    // Rattrapage: about one fiche in three (a value or a block to take up again).
    { requests: Math.ceil(mergedFiches / 3), input: mergedFiches * 1_000, output: mergedFiches * 150 },
  ];
}

/** Cost of writing a lot: `fiches` merged fiches whose sources hold `sourceChars` characters in all. */
export function estimateLot(fiches: number, sourceChars: number, provider: MergeProvider, model: string): { inputTokens: number; outputTokens: number; costUsd: number | null } {
  const stages = writingStages(fiches, sourceChars / CHARS_PER_TOKEN);
  const inputTokens = Math.round(stages.reduce((s, x) => s + x.input, 0));
  const outputTokens = Math.round(stages.reduce((s, x) => s + x.output, 0));
  return { inputTokens, outputTokens, costUsd: estimateCostUsd(pricedModel(provider, model), inputTokens, outputTokens) };
}
