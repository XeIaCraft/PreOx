// What a fusion has cost so far, split between its table of contents and
// each lot — each priced with the model it was made with.

import { estimateCostUsd } from "../ai-pricing";
import { pricedModel } from "./lot-estimate";
import type { MergeProvider, MergeRound, MergeStats } from "./types";

export interface MergeCostLine {
  round: number;
  kind?: "repair";
  /** null: the lot being written. */
  finishedAt: string | null;
  chapters: number;
  fiches: number;
  model: string;
  costUsd: number | null;
}

export interface MergeCosts {
  totalUsd: number | null;
  toc: { model: string; costUsd: number | null };
  lots: MergeCostLine[];
}

type Tokens = { inputTokens: number; outputTokens: number };

/**
 * `tocUsage`: tokens of the plan, répartition and chapter tasks, when the
 * job doesn't hold them yet (fusions whose lots all started before they were
 * kept). Lots recorded before each lot kept its starting point counted again
 * the tokens of repairs taken up in a later lot: the excess is taken off the
 * « rattrapage refait » entries, which are the ones that took them up.
 */
export function mergeCosts(job: { provider: MergeProvider; model: string; stage: string; round: number; stats: MergeStats }, tocUsage: Tokens): MergeCosts {
  const s = job.stats;
  const toc = s.toc ?? { provider: job.provider, model: job.model, ...tocUsage };
  const total = { inputTokens: s.inputTokens ?? 0, outputTokens: s.outputTokens ?? 0 };
  const rounds: (MergeRound & { open?: boolean })[] = (s.rounds ?? []).map((r) => ({ ...r }));

  for (const key of ["inputTokens", "outputTokens"] as const) {
    let excess = rounds.reduce((n, r) => n + r[key], 0) - Math.max(0, total[key] - toc[key]);
    for (const r of [...rounds].reverse()) {
      if (excess <= 0) break;
      if (r.kind !== "repair") continue;
      const cut = Math.min(excess, r[key]);
      r[key] -= cut;
      excess -= cut;
    }
  }

  const inLot = job.stage === "fiches" || job.stage === "repair";
  if (inLot && !rounds.some((r) => r.round === job.round)) {
    const spent = (key: keyof Tokens) => Math.max(0, s.lotStart ? total[key] - s.lotStart[key] : total[key] - toc[key] - rounds.reduce((n, r) => n + r[key], 0));
    rounds.push({
      round: job.round,
      chapters: 0,
      fiches: 0,
      inputTokens: spent("inputTokens"),
      outputTokens: spent("outputTokens"),
      finishedAt: "",
      provider: job.provider,
      model: job.model,
      open: true,
    });
  }

  const price = (provider: MergeProvider, model: string, t: Tokens) => (t.inputTokens || t.outputTokens ? estimateCostUsd(pricedModel(provider, model), t.inputTokens, t.outputTokens) : 0);
  const tocCost = price(toc.provider, toc.model, toc);
  const lots = rounds.map((r) => {
    const provider = r.provider ?? toc.provider;
    const model = r.model ?? toc.model;
    return { round: r.round, kind: r.kind, finishedAt: r.open ? null : r.finishedAt, chapters: r.chapters, fiches: r.fiches, model, costUsd: price(provider, model, r) };
  });
  const all = [tocCost, ...lots.map((l) => l.costUsd)];
  return {
    totalUsd: all.some((c) => c == null) ? null : all.reduce((a: number, c) => a + (c ?? 0), 0),
    toc: { model: toc.model, costUsd: tocCost },
    lots,
  };
}
