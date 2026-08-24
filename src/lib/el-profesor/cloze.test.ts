import { describe, expect, it } from "vitest";
import { parseClozeText, formatClozeText, maskClozeText, splitClozeSegments } from "./cloze";

describe("parseClozeText", () => {
  it("strips {{...}} markers and records the ranges they occupied", () => {
    const { text, ranges } = parseClozeText("La dose initiale d'adrénaline en anaphylaxie est {{0,01 mg/kg}} en IM.");
    expect(text).toBe("La dose initiale d'adrénaline en anaphylaxie est 0,01 mg/kg en IM.");
    expect(ranges).toEqual([{ start: 49, end: 59 }]);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("0,01 mg/kg");
  });

  it("handles multiple blanks in one passage", () => {
    const { text, ranges } = parseClozeText("{{Propofol}} agit sur les récepteurs {{GABA-A}}.");
    expect(text).toBe("Propofol agit sur les récepteurs GABA-A.");
    expect(ranges).toHaveLength(2);
    for (const r of ranges) expect(text.slice(r.start, r.end).length).toBeGreaterThan(0);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("Propofol");
    expect(text.slice(ranges[1].start, ranges[1].end)).toBe("GABA-A");
  });

  it("returns no ranges for plain text with no markers", () => {
    const { text, ranges } = parseClozeText("Aucun trou ici.");
    expect(text).toBe("Aucun trou ici.");
    expect(ranges).toEqual([]);
  });

  it("keeps an unclosed {{ as literal text instead of dropping it", () => {
    const { text, ranges } = parseClozeText("Un marqueur {{ jamais fermé");
    expect(text).toBe("Un marqueur {{ jamais fermé");
    expect(ranges).toEqual([]);
  });

  it("round-trips through formatClozeText", () => {
    const original = "La {{première}} et la {{seconde}} zone.";
    const { text, ranges } = parseClozeText(original);
    expect(formatClozeText(text, ranges)).toBe(original);
  });
});

describe("maskClozeText", () => {
  it("replaces every range with the mask placeholder", () => {
    const { text, ranges } = parseClozeText("{{Propofol}} agit sur les récepteurs {{GABA-A}}.");
    expect(maskClozeText(text, ranges)).toBe("[...] agit sur les récepteurs [...].");
  });

  it("returns the text unchanged when there are no ranges", () => {
    expect(maskClozeText("Rien à cacher.", [])).toBe("Rien à cacher.");
  });
});

describe("splitClozeSegments", () => {
  it("splits text into alternating visible/hidden segments", () => {
    const { text, ranges } = parseClozeText("{{Propofol}} agit sur les récepteurs {{GABA-A}}.");
    const segments = splitClozeSegments(text, ranges);
    expect(segments.map((s) => s.hidden)).toEqual([true, false, true, false]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("returns one visible segment when there are no ranges", () => {
    expect(splitClozeSegments("Texte simple.", [])).toEqual([{ text: "Texte simple.", hidden: false }]);
  });
});
