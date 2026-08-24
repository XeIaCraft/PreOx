import { describe, expect, it } from "vitest";
import { findDuplicateFlashcards, findSimilarSubEntities } from "./dedupe";

describe("findDuplicateFlashcards", () => {
  it("flags two flashcards whose fronts are near-identical", () => {
    const pairs = findDuplicateFlashcards([
      { id: "a", front: "Quelle est la dose initiale d'adrénaline en cas d'anaphylaxie ?" },
      { id: "b", front: "Quelle est la dose initiale d'adrénaline en cas d'anaphylaxie?" },
      { id: "c", front: "Quel est le mécanisme de la curarisation ?" },
    ]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0].a.id, pairs[0].b.id].sort()).toEqual(["a", "b"]);
    expect(pairs[0].similarity).toBeGreaterThanOrEqual(0.7);
  });

  it("does not flag genuinely different questions", () => {
    const pairs = findDuplicateFlashcards([
      { id: "a", front: "Quelle est la dose initiale d'adrénaline en cas d'anaphylaxie ?" },
      { id: "b", front: "Quel est le mécanisme de la curarisation ?" },
    ]);
    expect(pairs).toEqual([]);
  });

  it("sorts results by descending similarity", () => {
    const pairs = findDuplicateFlashcards([
      { id: "a", front: "Définition de l'hyperkaliémie sévère" },
      { id: "b", front: "Définition de l'hyperkaliémie sévère." },
      { id: "c", front: "Définition de l'hyperkaliémie" },
    ]);
    for (let i = 1; i < pairs.length; i++) expect(pairs[i - 1].similarity).toBeGreaterThanOrEqual(pairs[i].similarity);
  });

  it("returns nothing for an empty or single-card list", () => {
    expect(findDuplicateFlashcards([])).toEqual([]);
    expect(findDuplicateFlashcards([{ id: "a", front: "Seule carte" }])).toEqual([]);
  });
});

describe("findSimilarSubEntities", () => {
  it("flags similarly-named sub-entities within the same chapter (near-miss, not an exact accent-only difference)", () => {
    const pairs = findSimilarSubEntities([
      { id: "a", name: "Hyperkaliémie", chapterId: "ch1" },
      { id: "b", name: "Hyperkalicemie", chapterId: "ch1" }, // one-letter typo
    ]);
    expect(pairs.some((p) => [p.a.id, p.b.id].sort().join() === "a,b")).toBe(true);
  });

  it("never compares sub-entities across different chapters", () => {
    const pairs = findSimilarSubEntities([
      { id: "a", name: "Hyperkaliémie", chapterId: "ch1" },
      { id: "b", name: "Hyperkaliémie", chapterId: "ch2" },
    ]);
    expect(pairs).toEqual([]);
  });

  it("skips exact-name matches (handled elsewhere, not a 'similar' suggestion)", () => {
    const pairs = findSimilarSubEntities([
      { id: "a", name: "Hyperkaliémie", chapterId: "ch1" },
      { id: "b", name: "Hyperkaliémie", chapterId: "ch1" },
    ]);
    expect(pairs).toEqual([]);
  });
});
