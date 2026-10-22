import { describe, expect, it } from "vitest";
import { mergeCosts } from "./costs";
import { estimateLot } from "./lot-estimate";

const toc = { inputTokens: 3_500_000, outputTokens: 773_000 };

describe("mergeCosts", () => {
  it("splits the bill between the table of contents and each lot, with the double-counted repairs taken off the redo", () => {
    // The first fusion's figures (2026-10): lot 3 re-ran repairs whose earlier tokens lot 2 had already counted.
    const costs = mergeCosts(
      {
        provider: "claude",
        model: "claude-sonnet-5",
        stage: "ready",
        round: 3,
        stats: {
          inputTokens: 25_827_249,
          outputTokens: 9_168_474,
          rounds: [
            { round: 1, fiches: 319, chapters: 64, finishedAt: "2026-10-21T04:40:54Z", inputTokens: 4_150_954, outputTokens: 1_830_766 },
            { round: 2, fiches: 922, chapters: 167, finishedAt: "2026-10-21T06:25:23Z", inputTokens: 11_691_200, outputTokens: 5_639_216 },
            { kind: "repair", round: 3, fiches: 377, chapters: 0, finishedAt: "2026-10-22T05:17:10Z", inputTokens: 8_915_590, outputTokens: 1_521_224 },
          ],
        },
      },
      toc
    );
    expect(costs.toc.costUsd).toBeCloseTo(7.37, 1);
    expect(costs.lots.map((l) => Math.round(l.costUsd! * 100) / 100)).toEqual([13.3, 39.89, 11.11]);
    // The parts add up to what the tokens cost in all, Sonnet 5 at half price in batches.
    expect(costs.totalUsd).toBeCloseTo((25_827_249 * 2 + 9_168_474 * 10) / 2e6, 1);
  });

  it("prices each lot with its own model and shows the one being written", () => {
    const costs = mergeCosts(
      {
        provider: "claude",
        model: "claude-haiku-5-5",
        stage: "fiches",
        round: 2,
        stats: {
          inputTokens: 5_000_000,
          outputTokens: 2_000_000,
          toc: { provider: "claude", model: "claude-sonnet-5", ...toc },
          lotStart: { inputTokens: 4_000_000, outputTokens: 1_500_000 },
          rounds: [{ round: 1, fiches: 10, chapters: 2, finishedAt: "2026-10-21T04:40:54Z", inputTokens: 500_000, outputTokens: 727_000 }],
        },
      },
      { inputTokens: 0, outputTokens: 0 }
    );
    expect(costs.toc.model).toBe("claude-sonnet-5");
    expect(costs.lots[0].model).toBe("claude-sonnet-5");
    expect(costs.lots[1]).toMatchObject({ round: 2, finishedAt: null, model: "claude-haiku-5-5" });
    expect(costs.lots[1].costUsd).toBeCloseTo((1_000_000 * 0.1 + 500_000 * 0.5) / 2e6, 4);
  });
});

describe("estimateLot", () => {
  it("matches what the first lots really cost per fiche", () => {
    // Lot 2: 922 fiches, 5.88 M source characters → 8,910 tokens in and 5,378 out per fiche, plus the rattrapage.
    const lot = estimateLot(922, 5_876_883, "claude", "claude-sonnet-5");
    expect(lot.inputTokens / 922).toBeGreaterThan(9_000);
    expect(lot.inputTokens / 922).toBeLessThan(11_000);
    expect(lot.outputTokens / 922).toBeGreaterThan(5_000);
    expect(lot.outputTokens / 922).toBeLessThan(6_000);
  });
});
