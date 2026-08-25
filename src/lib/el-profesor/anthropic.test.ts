import { describe, expect, it } from "vitest";
import { normalizeExtractionResult, normalizeComplementaryResult } from "./anthropic";

// Regression test for the 2026-08-25 bug report: a Claude batch item came
// back "succeeded" but with a required array (blocks/flashcards/citations/
// additions_for_existing/new_sub_entities) missing from the tool_use JSON —
// Claude's tool schemas are schema-guided, not schema-enforced the way
// Gemini's responseSchema is. The old code cast `result.output` straight to
// ExtractionResult/ComplementaryResult with no check, so every downstream
// `.forEach`/`.map`/`.length` on a missing array threw "Cannot read
// properties of undefined" and left the chapter stuck. These normalizers
// must turn any missing/malformed array into `[]` instead of `undefined`.

describe("normalizeExtractionResult", () => {
  it("defaults every missing array to [] instead of leaving it undefined", () => {
    const result = normalizeExtractionResult({ sub_entities: [{ name: "X", summary: "s" }], estimated_remaining_passes: 1 });
    expect(result.sub_entities).toHaveLength(1);
    expect(result.sub_entities[0].fiche.blocks).toEqual([]);
    expect(result.sub_entities[0].fiche.flashcards).toEqual([]);
  });

  it("drops a malformed sub-entity instead of throwing", () => {
    const result = normalizeExtractionResult({ sub_entities: [{ name: "Valid", summary: "s", fiche: { title: "t", blocks: [], flashcards: [] } }, { summary: "no name field" }, null], estimated_remaining_passes: 0 });
    expect(result.sub_entities.map((s) => s.name)).toEqual(["Valid"]);
  });

  it("defaults citations on a block/flashcard to [] when missing", () => {
    const result = normalizeExtractionResult({
      sub_entities: [
        {
          name: "X",
          summary: "s",
          fiche: {
            title: "t",
            blocks: [{ block_type: "definition_mecanisme", content: { text: "x" } }],
            flashcards: [{ front: "Q", back: "A" }],
          },
        },
      ],
      estimated_remaining_passes: 0,
    });
    expect(result.sub_entities[0].fiche.blocks[0].citations).toEqual([]);
    expect(result.sub_entities[0].fiche.flashcards[0].citations).toEqual([]);
  });

  it("handles completely empty/undefined input without throwing", () => {
    expect(normalizeExtractionResult(undefined)).toEqual({ sub_entities: [], estimated_remaining_passes: 0 });
    expect(normalizeExtractionResult({})).toEqual({ sub_entities: [], estimated_remaining_passes: 0 });
  });
});

describe("normalizeComplementaryResult", () => {
  it("defaults additions_for_existing and new_sub_entities to [] when absent", () => {
    const result = normalizeComplementaryResult({ estimated_remaining_passes: 2 });
    expect(result.additions_for_existing).toEqual([]);
    expect(result.new_sub_entities).toEqual([]);
    expect(result.estimated_remaining_passes).toBe(2);
  });

  it("defaults an addition's blocks/flashcards to [] when Claude omits them (the exact reported shape)", () => {
    const result = normalizeComplementaryResult({
      additions_for_existing: [{ sub_entity_name: "Circuit d'anesthésie" }],
      new_sub_entities: [],
      estimated_remaining_passes: 0,
    });
    expect(result.additions_for_existing).toHaveLength(1);
    expect(result.additions_for_existing[0].blocks).toEqual([]);
    expect(result.additions_for_existing[0].flashcards).toEqual([]);
  });

  it("drops an addition with no sub_entity_name instead of throwing", () => {
    const result = normalizeComplementaryResult({
      additions_for_existing: [{ blocks: [], flashcards: [] }, { sub_entity_name: "Valid", blocks: [], flashcards: [] }],
      new_sub_entities: [],
      estimated_remaining_passes: 0,
    });
    expect(result.additions_for_existing.map((a) => a.sub_entity_name)).toEqual(["Valid"]);
  });
});
