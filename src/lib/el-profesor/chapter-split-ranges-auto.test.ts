import { describe, expect, it } from "vitest";
import { rangesFromSplitPoints, validateChapterSplitRanges } from "./chapter-split-ranges";

describe("parties depuis les coupures suggérées", () => {
  it("partition exacte, première page forcée à 1, doublons et hors limites ignorés", () => {
    const r = rangesFromSplitPoints("Chap. 3", [12, 3, 12, 40, 0], 30);
    expect(r).toEqual([
      { title: "Chap. 3 (partie 1)", startPage: 1, endPage: 2 },
      { title: "Chap. 3 (partie 2)", startPage: 3, endPage: 11 },
      { title: "Chap. 3 (partie 3)", startPage: 12, endPage: 30 },
    ]);
    expect(validateChapterSplitRanges(r, 30)).toBeNull();
  });
  it("une seule partie : rien à diviser", () => {
    expect(rangesFromSplitPoints("C", [1], 20)).toEqual([]);
  });
});
