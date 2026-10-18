import { describe, expect, it } from "vitest";
import { cardOwners, flattenPlan, mergeCitations, numberPlan, resolveAssignments, resolveChapterPlan, uncovered } from "./plan";
import { normalizeContent, normalizeMergedFiche, normalizePlan, normalizeRepair, toGeminiSchema, FICHE_SCHEMA } from "./schemas";
import { estimateMerge, targetChapterCount } from "./estimate";
import { stableUuid } from "./ids";
import { buildCatalogText, buildFichePrompt, blockPromptText } from "./prompts";
import type { SourceFicheRef } from "./types";

// The fusion's promise to the user is "sans perte d'informations": these
// tests pin the rules that place whatever the model forgets, and the
// parsing that turns an approximate answer into something safe to store.

function ref(id: string, chapterId: string, title = id): SourceFicheRef {
  return { ficheId: id, bookId: "b", bookTitle: "Miller", chapterId, chapterTitle: `chap-${chapterId}`, title, summary: "", blockCount: 2, cardCount: 1, chars: 900 };
}

describe("numberPlan / flattenPlan", () => {
  it("numbers chapters in reading order, drops empty levels, gives stable ids", () => {
    const raw = normalizePlan({
      parts: [
        { title: "Bases", sub_parts: [{ title: "", chapters: [{ title: "Physiologie respiratoire", scope: "x" }, { title: "", scope: "vide" }] }] },
        { title: "Vide", sub_parts: [] },
        { title: "Techniques", sub_parts: [{ title: "ALR", chapters: [{ title: "Blocs du membre supérieur", scope: "y" }] }] },
      ],
    });
    const plan = numberPlan(raw, "job-1");
    const flat = flattenPlan(plan);
    expect(flat.map((c) => c.key)).toEqual(["C1", "C2"]);
    expect(flat[0].subPartTitle).toBeNull();
    expect(flat[1].partTitle).toBe("Techniques");
    expect(flat[1].subPartTitle).toBe("ALR");
    expect(numberPlan(raw, "job-1").parts[0].subParts[0].chapters[0].chapterId).toBe(flat[0].chapterId);
    expect(numberPlan(raw, "job-2").parts[0].subParts[0].chapters[0].chapterId).not.toBe(flat[0].chapterId);
  });
});

describe("stableUuid", () => {
  it("is a valid, deterministic uuid", () => {
    const id = stableUuid("a", "b");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid("a", "b")).toBe(id);
    expect(stableUuid("a", "c")).not.toBe(id);
  });
});

describe("resolveAssignments", () => {
  const fiches = [ref("f1", "x"), ref("f2", "x"), ref("f3", "x"), ref("f4", "y")];

  it("follows the model, and places forgotten fiches with their siblings", () => {
    const { byChapter, fallbackCount } = resolveAssignments(["C1", "C2"], fiches, [
      {
        aliasToFiche: { F1: "f1", F2: "f2", F3: "f3", F4: "f4" },
        assignments: [
          { fiche: "F1", chapter: "C2" },
          { fiche: "f2", chapter: "c2" },
          { fiche: "F4", chapter: "C1" },
          { fiche: "F9", chapter: "C1" },
        ],
      },
    ]);
    expect(fallbackCount).toBe(1);
    expect(byChapter.get("C2")).toEqual(["f1", "f2", "f3"]);
    expect(byChapter.get("C1")).toEqual(["f4"]);
  });

  it("never loses a fiche, even when the answer is unusable", () => {
    const { byChapter } = resolveAssignments(["C1", "C2"], fiches, [{ aliasToFiche: {}, assignments: [{ fiche: "F1", chapter: "C99" }] }]);
    expect([...byChapter.values()].flat().sort()).toEqual(["f1", "f2", "f3", "f4"]);
  });
});

describe("resolveChapterPlan / cardOwners", () => {
  const chapter = [ref("f1", "x", "Rocuronium"), ref("f2", "x", "Sugammadex"), ref("f3", "y", "Suxaméthonium")];

  it("keeps the model's fiches and gives every forgotten source fiche its own", () => {
    const { fiches, fallbackCount } = resolveChapterPlan(
      [
        { title: "Curares stéroïdiens", objective: "o", sources: ["F1", "F2", "F7"] },
        { title: "Sans source", objective: "o", sources: ["F9"] },
        { title: "Antagonisation", objective: "o", sources: ["F2"] },
      ],
      { F1: "f1", F2: "f2", F3: "f3" },
      chapter
    );
    expect(fiches.map((f) => f.title)).toEqual(["Curares stéroïdiens", "Antagonisation", "Suxaméthonium"]);
    expect(fiches[0].sourceFicheIds).toEqual(["f1", "f2"]);
    expect(fallbackCount).toBe(1);
  });

  it("gives a shared source fiche's cards to its first merged fiche only", () => {
    const owners = cardOwners([
      { key: "C1.0", sourceFicheIds: ["f1", "f2"] },
      { key: "C1.1", sourceFicheIds: ["f2", "f3"] },
    ]);
    expect(owners.get("f2")).toBe("C1.0");
    expect(owners.get("f3")).toBe("C1.1");
  });
});

describe("uncovered / mergeCitations", () => {
  it("lists what was given and never claimed", () => {
    expect(uncovered(["a", "b", "c", "a"], ["b"])).toEqual(["a", "c"]);
  });

  it("points each citation at its own source chapter, deduplicated, with a trace for uncited blocks", () => {
    const citations = mergeCitations([
      { id: "b1", chapterId: "ch1", bookTitle: "Miller", chapterTitle: "NMB", citations: [{ page: 12, quote: "q" }, { page: 12, quote: "q" }] },
      { id: "b2", chapterId: "ch2", bookTitle: "Morgan", chapterTitle: "Curares", citations: [] },
    ]);
    expect(citations).toEqual([
      { page: 12, quote: "q", chapterId: "ch1", bookTitle: "Miller", chapterTitle: "NMB", sourceBlockId: "b1" },
      { page: 0, quote: "", chapterId: "ch2", bookTitle: "Morgan", chapterTitle: "Curares", sourceBlockId: "b2" },
    ]);
  });
});

describe("normalizers", () => {
  it("keeps only the fields a block type uses, and falls back to text when a structure is empty", () => {
    expect(normalizeContent("tableau_comparatif", { headers: ["a"], rows: [], text: "vu" })).toEqual({ text: "vu" });
    expect(normalizeContent("protocole_paliers", { steps: [{ label: "1", detail: "d", condition: "" }] })).toEqual({ steps: [{ label: "1", detail: "d" }] });
    expect(normalizeContent("divergence", { text: "  " })).toBeNull();
  });

  it("parses a merged fiche defensively (double-encoded arrays, unknown types, empty cards)", () => {
    const fiche = normalizeMergedFiche({
      summary: "s",
      blocks: JSON.stringify([
        { block_type: "inconnu", content: { text: "t" }, source_block_ids: ["B1"], heading: "Intro" },
        { block_type: "tableau_comparatif", content: { text: "aplati" }, source_block_ids: "[\"B2\"]" },
        { block_type: "a_retenir", content: { text: "• x" }, source_block_ids: [], suggested_image: { what: "" } },
        { block_type: "definition_mecanisme", content: {}, source_block_ids: [] },
      ]),
      flashcards: [{ front: "Q", back: "R", source_flashcard_ids: ["K1"] }, { front: "", back: "R", source_flashcard_ids: [] }],
    });
    expect(fiche.blocks.map((b) => b.block_type)).toEqual(["texte_libre", "texte_libre", "a_retenir"]);
    expect(fiche.blocks[0].heading).toBe("Intro");
    expect(fiche.blocks[1].source_block_ids).toEqual(["B2"]);
    expect(fiche.blocks[2].suggested_image).toBeNull();
    expect(fiche.flashcards).toHaveLength(1);
  });

  it("parses a repair answer", () => {
    const r = normalizeRepair({
      replacements: [{ block_index: 1, content: { text: "x" }, source_block_ids: ["B1"] }, { content: {} }],
      insertions: [{ after_block_index: 0, block_type: "divergence", content: { text: "• A : 1 / • B : 2" }, source_block_ids: ["B2"] }],
      already_covered: [{ source_block_id: "B3", block_index: 2 }],
    });
    expect(r.replacements).toHaveLength(1);
    expect(r.insertions[0].block_type).toBe("divergence");
    expect(r.alreadyCovered).toEqual([{ sourceBlockId: "B3", blockIndex: 2 }]);
  });

  it("converts schemas to Gemini's dialect without touching enums", () => {
    const g = toGeminiSchema(FICHE_SCHEMA) as { type: string; properties: { blocks: { items: { properties: { block_type: { type: string; enum: string[] } } } } } };
    expect(g.type).toBe("OBJECT");
    expect(g.properties.blocks.items.properties.block_type.type).toBe("STRING");
    expect(g.properties.blocks.items.properties.block_type.enum).toContain("a_retenir");
  });
});

describe("prompts", () => {
  it("renders tables and protocols with their structure, and every source with its aliases", () => {
    expect(blockPromptText("protocole_paliers", { steps: [{ label: "Bolus", detail: "1 mg/kg", condition: "TA ok" }], heading: "Induction" })).toContain(
      "Induction — étapes\n  1. Bolus — 1 mg/kg (si : TA ok)"
    );
    const prompt = buildFichePrompt(
      { bookTitle: "Notion", path: "Pharmacologie", chapterTitle: "Curares", title: "Rocuronium", objective: "o", siblings: ["Sugammadex"] },
      [{ alias: "F1", bookTitle: "Miller", chapterTitle: "NMB", title: "Roc", blocks: [{ alias: "B1", blockType: "valeurs_seuils", content: { text: "0,6 mg/kg" }, pages: [812], image: "courbe" }], cards: [{ alias: "K1", front: "Q", back: "R" }] }]
    );
    expect(prompt).toContain("[B1] Valeurs & seuils · p. 812 : 0,6 mg/kg");
    expect(prompt).toContain("[B1] [illustration : courbe]");
    expect(prompt).toContain("[K1] Q : Q — R : R");
    expect(prompt).toContain("ZÉRO PERTE");
    expect(prompt).toContain("a_retenir");
  });

  it("lists the catalogue by book and source chapter", () => {
    const text = buildCatalogText([{ id: "b", title: "Miller" }], [ref("f1", "x", "A"), ref("f2", "x", "B"), ref("f3", "y", "C")]);
    expect(text).toBe("Livre « Miller » (3 fiches)\n  chap-x : A · B\n  chap-y : C");
  });
});

describe("estimateMerge", () => {
  it("scales with the volume and prices Claude at the batch rate", () => {
    const fiches = Array.from({ length: 300 }, (_, i) => ({ title: `Fiche ${i}`, summary: "résumé", chars: 3_000 }));
    const gemini = estimateMerge({ fiches, bookCount: 2 }, "gemini", "gemini-flash-latest");
    const claude = estimateMerge({ fiches, bookCount: 2 }, "claude", "claude-sonnet-5");
    expect(gemini.chapters).toBe(targetChapterCount(300));
    expect(gemini.inputTokens).toBeGreaterThan(300_000);
    expect(claude.costUsd!).toBeGreaterThan(gemini.costUsd!);
    expect(estimateMerge({ fiches: fiches.slice(0, 30), bookCount: 2 }, "gemini", "gemini-flash-latest").inputTokens).toBeLessThan(gemini.inputTokens);
  });
});
