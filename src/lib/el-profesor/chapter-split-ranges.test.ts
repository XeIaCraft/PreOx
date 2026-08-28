import { describe, expect, it } from "vitest";
import { validateChapterSplitRanges } from "./chapter-split-ranges";

const valid = [
  { title: "Partie 1", startPage: 1, endPage: 10 },
  { title: "Partie 2", startPage: 11, endPage: 20 },
  { title: "Partie 3", startPage: 21, endPage: 30 },
];

describe("validateChapterSplitRanges", () => {
  it("accepts a valid contiguous 3-part partition", () => {
    expect(validateChapterSplitRanges(valid, 30)).toBeNull();
  });

  it("rejects a single part (needs at least 2)", () => {
    expect(validateChapterSplitRanges([{ title: "Seul", startPage: 1, endPage: 30 }], 30)).toMatch(/au moins 2 parties/);
  });

  it("rejects a gap between parts", () => {
    const ranges = [
      { title: "P1", startPage: 1, endPage: 10 },
      { title: "P2", startPage: 12, endPage: 30 },
    ];
    expect(validateChapterSplitRanges(ranges, 30)).toMatch(/trou ni chevauchement/);
  });

  it("rejects an overlap between parts", () => {
    const ranges = [
      { title: "P1", startPage: 1, endPage: 12 },
      { title: "P2", startPage: 10, endPage: 30 },
    ];
    expect(validateChapterSplitRanges(ranges, 30)).toMatch(/trou ni chevauchement/);
  });

  it("rejects a first part that doesn't start at page 1", () => {
    const ranges = [
      { title: "P1", startPage: 2, endPage: 10 },
      { title: "P2", startPage: 11, endPage: 30 },
    ];
    expect(validateChapterSplitRanges(ranges, 30)).toMatch(/commencer à la page 1/);
  });

  it("rejects a last part that doesn't end at pageCount", () => {
    const ranges = [
      { title: "P1", startPage: 1, endPage: 10 },
      { title: "P2", startPage: 11, endPage: 25 },
    ];
    expect(validateChapterSplitRanges(ranges, 30)).toMatch(/finir à la page 30/);
  });

  it("rejects an empty title", () => {
    const ranges = [
      { title: "", startPage: 1, endPage: 10 },
      { title: "P2", startPage: 11, endPage: 30 },
    ];
    expect(validateChapterSplitRanges(ranges, 30)).toMatch(/doit avoir un titre/);
  });

  it("rejects endPage before startPage", () => {
    const ranges = [
      { title: "P1", startPage: 10, endPage: 5 },
      { title: "P2", startPage: 6, endPage: 30 },
    ];
    expect(validateChapterSplitRanges(ranges, 30)).toMatch(/invalide/);
  });
});
