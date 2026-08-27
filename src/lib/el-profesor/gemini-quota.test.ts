import { describe, expect, it } from "vitest";
import { GEMINI_FREE_TIER_SAFE_PAGE_BUDGET, exceedsGeminiFreeTierBudget } from "./gemini-quota";

describe("exceedsGeminiFreeTierBudget", () => {
  it("does not flag a typical chapter-length PDF", () => {
    expect(exceedsGeminiFreeTierBudget(80)).toBe(false);
  });

  it("does not flag the budget threshold itself", () => {
    expect(exceedsGeminiFreeTierBudget(GEMINI_FREE_TIER_SAFE_PAGE_BUDGET)).toBe(false);
  });

  it("flags a PDF one page past the budget", () => {
    expect(exceedsGeminiFreeTierBudget(GEMINI_FREE_TIER_SAFE_PAGE_BUDGET + 1)).toBe(true);
  });

  it("flags an extreme page count", () => {
    expect(exceedsGeminiFreeTierBudget(1000)).toBe(true);
  });
});
