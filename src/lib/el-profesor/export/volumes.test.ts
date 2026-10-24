import { describe, expect, it } from "vitest";
import { chapterPages, joinTitles, planVolumes, type VolumeChapter } from "./volumes";

let n = 0;
const ch = (partTitle: string, subPartTitle: string, pages: number): VolumeChapter => ({ id: `c${++n}`, partTitle, subPartTitle, ficheCount: Math.round(pages / 2.6), pages });

describe("planVolumes", () => {
  it("keeps a part whole and lets small neighbouring parts share a tome", () => {
    const plan = planVolumes([ch("A", "a", 200), ch("A", "a", 150), ch("B", "b", 250), ch("C", "c", 500)]);
    expect(plan.map((v) => [v.title, v.pages])).toEqual([
      ["A · B", 600],
      ["C", 500],
    ]);
    expect(plan[1].number).toBe(2);
  });

  it("cuts a big part into tomes of similar size, between sub-parts when one is near", () => {
    const plan = planVolumes([ch("P", "x", 300), ch("P", "x", 200), ch("P", "y", 250), ch("P", "y", 250)]);
    expect(plan.map((v) => [v.title, v.pages])).toEqual([
      ["P (1/2)", 500],
      ["P (2/2)", 500],
    ]);
  });

  it("joins a thin tome to a neighbour", () => {
    const plan = planVolumes([ch("A", "a", 600), ch("B", "b", 120), ch("C", "c", 600)]);
    expect(plan.map((v) => [v.title, v.pages])).toEqual([
      ["A · B", 720],
      ["C", 600],
    ]);
  });

  it("estimates pages from text, or from fiches without it", () => {
    expect(chapterPages(2950 * 10, 3)).toBe(10.5);
    expect(chapterPages(null, 10)).toBeCloseTo(26.5);
  });
});

describe("joinTitles", () => {
  it("writes a shared « Prefix : » once", () => {
    expect(joinTitles(["Spécialités : tête", "Spécialités : thorax"])).toBe("Spécialités : tête · thorax");
    expect(joinTitles(["ALR", "Terrain"])).toBe("ALR · Terrain");
  });
});
