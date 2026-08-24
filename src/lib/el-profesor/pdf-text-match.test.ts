import { describe, expect, it } from "vitest";
import { matchItems, normalize } from "./pdf-text-match";

describe("normalize", () => {
  it("folds curly quotes, dashes, and whitespace to a common form", () => {
    expect(normalize("l’hyperkaliémie  —  un  risque")).toBe("l'hyperkaliémie - un risque");
    expect(normalize('la dose “usuelle”')).toBe('la dose "usuelle"');
  });

  it("is case-insensitive", () => {
    expect(normalize("HyperKaliémie")).toBe(normalize("hyperkaliémie"));
  });
});

describe("matchItems", () => {
  const items = [{ str: "L'hyperkaliémie est" }, { str: "une complication fréquente" }, { str: "de l'insuffisance rénale." }];

  it("matches items spanning an exact verbatim quote", () => {
    const matched = matchItems(items, "hyperkaliémie est une complication fréquente");
    expect(matched.map((i) => i.str)).toEqual(["L'hyperkaliémie est", "une complication fréquente"]);
  });

  it("still matches on curly-quote/dash variants the model might produce", () => {
    const matched = matchItems(items, "l’hyperkaliémie est une complication");
    expect(matched.length).toBeGreaterThan(0);
  });

  it("falls back to a shorter prefix when the quote's tail diverges from the source (paraphrase, OCR noise)", () => {
    // Shares its first ~34 characters with sourceItems[2], then diverges —
    // the 120/60-char prefixes both span the divergence and fail, only the
    // 30-char prefix stays inside the shared region and matches.
    const sourceItems = [
      { str: "L'hyperkaliémie est" },
      { str: "une complication fréquente" },
      { str: "de l'insuffisance rénale ou d'une acidose métabolique sévère non compensée." },
    ];
    const paraphrasedQuote = "de l'insuffisance rénale ou d'une hyperventilation compensatrice mal tolérée";
    const matched = matchItems(sourceItems, paraphrasedQuote);
    expect(matched.map((i) => i.str)).toEqual(["de l'insuffisance rénale ou d'une acidose métabolique sévère non compensée."]);
  });

  it("returns an empty array when the quote isn't present at all", () => {
    expect(matchItems(items, "un passage totalement absent du texte fourni ici")).toEqual([]);
  });

  it("returns an empty array for an empty or whitespace-only quote", () => {
    expect(matchItems(items, "")).toEqual([]);
    expect(matchItems(items, "   ")).toEqual([]);
  });
});
