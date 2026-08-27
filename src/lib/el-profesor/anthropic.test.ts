import { describe, expect, it } from "vitest";
import { normalizeExtractionResult, normalizeComplementaryResult, coerceArray, wasArrayFieldTruncated } from "./anthropic";

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

  // Regression test for the 2026-08-26 bug report: sub_entities came back
  // double-encoded as a JSON string (`"sub_entities": "[\n{\n\"name\": ..."`)
  // instead of a real array — the old Array.isArray check silently dropped
  // this to [], which then tripped the "extraction vide" guard even though
  // the model's response genuinely contained the full result.
  it("recovers sub_entities double-encoded as a JSON string instead of a real array", () => {
    const encoded = JSON.stringify([{ name: "Jonction neuromusculaire", summary: "s", fiche: { title: "t", blocks: [], flashcards: [] } }]);
    const result = normalizeExtractionResult({ sub_entities: encoded, estimated_remaining_passes: 0 });
    expect(result.sub_entities.map((s) => s.name)).toEqual(["Jonction neuromusculaire"]);
  });

  it("still defaults to [] when the string isn't valid JSON at all", () => {
    const result = normalizeExtractionResult({ sub_entities: "not json", estimated_remaining_passes: 0 });
    expect(result.sub_entities).toEqual([]);
  });

  // Regression test for the 2026-08-27 report: a chapter's sub_entities came
  // back double-encoded (as above) AND cut short mid-string — encoding the
  // whole array as one big escaped string roughly doubles its token cost,
  // which can push a content-heavy chapter past the provider's max output
  // ceiling. The old coerceArray gave up entirely on a JSON.parse failure,
  // losing every sub-entity including the ones that finished fine before the
  // cut — this recovers those instead of failing "extraction vide" again.
  it("salvages complete sub_entities from a string truncated mid-array", () => {
    const first = { name: "Jonction neuromusculaire", summary: "s1", fiche: { title: "t1", blocks: [], flashcards: [] } };
    const second = { name: "Curares dépolarisants", summary: "s2", fiche: { title: "t2", blocks: [], flashcards: [] } };
    const truncated = `[${JSON.stringify(first)},${JSON.stringify(second)},{"name": "Curares non dépolarisants", "summary": "cut off mid-str`;
    const result = normalizeExtractionResult({ sub_entities: truncated, estimated_remaining_passes: 0 });
    expect(result.sub_entities.map((s) => s.name)).toEqual(["Jonction neuromusculaire", "Curares dépolarisants"]);
  });

  it("salvages nothing when even the first element is incomplete", () => {
    const result = normalizeExtractionResult({ sub_entities: '[{"name": "Cut off before closing', estimated_remaining_passes: 0 });
    expect(result.sub_entities).toEqual([]);
  });
});

describe("coerceArray", () => {
  it("returns a native array unchanged", () => {
    expect(coerceArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("salvages complete objects and drops a trailing truncated one, preserving order", () => {
    const raw = '[{"a":1},{"b":{"nested":"value with \\"quotes\\" and } braces { inside"}},{"c":"incomple';
    expect(coerceArray(raw)).toEqual([{ a: 1 }, { b: { nested: 'value with "quotes" and } braces { inside' } }]);
  });
});

describe("wasArrayFieldTruncated", () => {
  it("is false for a native array field", () => {
    expect(wasArrayFieldTruncated({ sub_entities: [{ name: "x" }] }, "sub_entities")).toBe(false);
  });

  it("is false for a string field that parses cleanly as an array", () => {
    expect(wasArrayFieldTruncated({ sub_entities: JSON.stringify([{ name: "x" }]) }, "sub_entities")).toBe(false);
  });

  it("is true for a string field that fails to parse (truncated)", () => {
    expect(wasArrayFieldTruncated({ sub_entities: '[{"name": "cut off' }, "sub_entities")).toBe(true);
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
