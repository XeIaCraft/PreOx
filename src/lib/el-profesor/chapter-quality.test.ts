import { describe, expect, it } from "vitest";
import { exceedsQualitySplitThreshold, computeTargetSplitPartCount, CHAPTER_QUALITY_SPLIT_PAGE_THRESHOLD } from "./chapter-quality";

describe("exceedsQualitySplitThreshold", () => {
  it("is false at the threshold itself", () => {
    expect(exceedsQualitySplitThreshold(CHAPTER_QUALITY_SPLIT_PAGE_THRESHOLD)).toBe(false);
  });

  it("is true one page past the threshold", () => {
    expect(exceedsQualitySplitThreshold(CHAPTER_QUALITY_SPLIT_PAGE_THRESHOLD + 1)).toBe(true);
  });

  it("is false for a typical short chapter", () => {
    expect(exceedsQualitySplitThreshold(12)).toBe(false);
  });
});

describe("computeTargetSplitPartCount", () => {
  it.each([
    [21, 2],
    [30, 2],
    [31, 3],
    [45, 3],
    [46, 4],
  ])("suggests %i pages -> %i parts", (pageCount, expected) => {
    expect(computeTargetSplitPartCount(pageCount)).toBe(expected);
  });

  it("never returns fewer than 2 parts, even for a tiny page count", () => {
    expect(computeTargetSplitPartCount(1)).toBe(2);
  });
});
