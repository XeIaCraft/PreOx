import { describe, expect, it } from "vitest";
import {
  flattenChapters,
  flattenSubParts,
  mergeCitations,
  missingFacts,
  numberPlan,
  numericFacts,
  resolveAssignments,
  resolveOutline,
  routeItems,
  splitBySize,
  uncovered,
  withChapters,
} from "./plan";
import { normalizeContent, normalizeMergedFiche, normalizeOutline, normalizePlan, normalizeRepair, toGeminiSchema, FICHE_SCHEMA } from "./schemas";
import { estimateMerge } from "./estimate";
import { stableUuid } from "./ids";
import { buildCatalogText, buildFichePrompt, buildRepairPrompt, blockPromptText } from "./prompts";
import type { SourceFicheRef } from "./types";

// The fusion's promise to the user is "sans perte d'informations": these
// tests pin the rules that place whatever the model forgets, share out a
// broad source fiche, catch a value lost on the way, and turn an
// approximate answer into something safe to store.

function ref(id: string, chapterId: string, title = id, chars = 900): SourceFicheRef {
  return { ficheId: id, bookId: "b", bookTitle: "Miller", chapterId, chapterTitle: `chap-${chapterId}`, title, summary: "", blockCount: 2, cardCount: 1, chars };
}

describe("plan: parts, sub-parts, then chapters", () => {
  it("numbers sub-parts in reading order, drops empty levels, then gives chapters stable ids", () => {
    const raw = normalizePlan({
      parts: [
        { title: "Bases", sub_parts: [{ title: "Respiration", scope: "x" }, { title: "", scope: "" }] },
        { title: "Vide", sub_parts: [] },
        { title: "Techniques", sub_parts: [{ title: "", scope: "ALR, tout" }] },
      ],
    });
    const plan = numberPlan(raw);
    expect(flattenSubParts(plan).map((s) => [s.key, s.partTitle, s.title])).toEqual([
      ["S1", "Bases", "Respiration"],
      ["S2", "Techniques", ""],
    ]);
    const full = withChapters(plan, "job-1", new Map([["S1", ["Mécanique ventilatoire", "Échanges gazeux"]], ["S2", ["Blocs du membre supérieur"]]]));
    const chapters = flattenChapters(full);
    expect(chapters.map((c) => [c.key, c.orderIndex, c.subPartTitle])).toEqual([
      ["S1.C1", 0, "Respiration"],
      ["S1.C2", 1, "Respiration"],
      ["S2.C1", 2, null],
    ]);
    expect(chapters[0].chapterId).toBe(stableUuid("job-1", "chapter", "S1.C1"));
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
    const { byKey, fallbackCount } = resolveAssignments(["S1", "S2"], fiches, [
      {
        aliasToFiche: { F1: "f1", F2: "f2", F3: "f3", F4: "f4" },
        assignments: [
          { fiche: "F1", chapter: "S2" },
          { fiche: "f2", chapter: "s2" },
          { fiche: "F4", chapter: "S1" },
          { fiche: "F9", chapter: "S1" },
        ],
      },
    ]);
    expect(fallbackCount).toBe(1);
    expect(byKey.get("S2")).toEqual(["f1", "f2", "f3"]);
    expect(byKey.get("S1")).toEqual(["f4"]);
  });

  it("never loses a fiche, even when the answer is unusable", () => {
    const { byKey } = resolveAssignments(["S1", "S2"], fiches, [{ aliasToFiche: {}, assignments: [{ fiche: "F1", chapter: "S99" }] }]);
    expect([...byKey.values()].flat().sort()).toEqual(["f1", "f2", "f3", "f4"]);
  });
});

describe("resolveOutline", () => {
  const sub = [ref("f1", "x", "Rocuronium"), ref("f2", "x", "Sugammadex"), ref("f3", "y", "Suxaméthonium"), ref("f4", "x", "Vécuronium")];
  const aliases = { F1: "f1", F2: "f2", F3: "f3", F4: "f4" };

  it("keeps the model's chapters, drops unknown ids, and gives a forgotten fiche its own fiche next to its siblings", () => {
    const { chapters, fallbackCount } = resolveOutline(
      [
        { title: "Curares", fiches: [{ title: "Curares stéroïdiens", objective: "o", sources: ["F1", "F4", "F7"] }, { title: "Sans source", objective: "o", sources: ["F9"] }] },
        { title: "Dépolarisants", fiches: [{ title: "Suxaméthonium", objective: "o", sources: ["F3"] }] },
      ],
      aliases,
      sub,
      "Curarisation"
    );
    expect(chapters.map((c) => c.title)).toEqual(["Curares", "Dépolarisants"]);
    expect(chapters[0].fiches.map((f) => f.title)).toEqual(["Curares stéroïdiens", "Sugammadex"]);
    expect(chapters[0].fiches[0].sourceFicheIds).toEqual(["f1", "f4"]);
    expect(fallbackCount).toBe(1);
  });

  it("builds a chapter when the answer has none, and splits a fiche whose sources are too long", () => {
    const empty = resolveOutline([], aliases, sub, "Curarisation");
    expect(empty.chapters).toHaveLength(1);
    expect(empty.chapters[0].fiches).toHaveLength(4);

    const big = [ref("g1", "x", "A", 30_000), ref("g2", "x", "B", 30_000), ref("g3", "x", "C", 20_000)];
    const { chapters, splitCount } = resolveOutline([{ title: "T", fiches: [{ title: "Gros sujet", objective: "o", sources: ["F1", "F2", "F3"] }] }], { F1: "g1", F2: "g2", F3: "g3" }, big, "T", 55_000);
    expect(splitCount).toBe(1);
    expect(chapters[0].fiches.map((f) => [f.title, f.sourceFicheIds])).toEqual([
      ["Gros sujet (1/2)", ["g1"]],
      ["Gros sujet (2/2)", ["g2", "g3"]],
    ]);
  });

  it("splitBySize keeps an oversized single source alone", () => {
    expect(splitBySize(["a"], () => 99_000, 55_000)).toEqual([["a"]]);
  });
});

describe("routeItems", () => {
  it("sends each passage of a broad source fiche to the merged fiche it is about", () => {
    const targets = [
      { key: "meca", profile: "Sugammadex : structure et mécanisme d'encapsulation cyclodextrine complexe" },
      { key: "dose", profile: "Sugammadex : posologie selon la profondeur du bloc, dose urgence mg/kg" },
      { key: "effets", profile: "Sugammadex : effets secondaires, anaphylaxie, hypersensibilité, interactions contraceptifs" },
    ];
    const route = routeItems(
      [
        { id: "b1", text: "Mécanisme d'action : encapsulation dans la cavité de la cyclodextrine" },
        { id: "b2", text: "Posologie standard 2 à 4 mg/kg ; urgence 16 mg/kg" },
        { id: "b3", text: "Anaphylaxie rare ; interaction avec les contraceptifs hormonaux" },
        { id: "b4", text: "Prix élevé" },
      ],
      targets
    );
    expect(Object.fromEntries(route)).toEqual({ b1: "meca", b2: "dose", b3: "effets", b4: "meca" });
  });
});

describe("numeric facts", () => {
  it("reads doses, thresholds and percentages, not bare list numbers", () => {
    expect([...numericFacts("Posologie : 2 mg/kg si TOF ≥ 2, 4 mg/kg si PTC 1–2 ; 16 mg/kg en urgence. TOF 0,90 en 107 secondes, 97 % des patients.")].sort()).toEqual(
      ["0.9", "107", "16mg", "2mg", "4mg", "97%"].sort()
    );
    expect([...numericFacts("Dose de 1 000 mg ; 2,0 h")].sort()).toEqual(["1000mg", "2h"].sort());
  });

  it("finds a value the merged text lost, and accepts the same value written differently", () => {
    const merged = numericFacts("Dose : 0.6 mg/kg (poids réel) ; délai 60 s ; 1044 secondes avec la néostigmine.");
    expect(missingFacts("Rocuronium 0,6 mg/kg, délai 60 s, puis 1,2 mg/kg en séquence rapide ; 1044 s.", merged)).toEqual(["1.2mg"]);
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

  it("parses an outline and a repair answer", () => {
    expect(normalizeOutline({ chapters: [{ title: "C", fiches: [{ title: "F", objective: "o", sources: ["F1"] }, { title: "Vide", objective: "", sources: [] }] }, { title: "Rien", fiches: [] }] })).toEqual([
      { title: "C", fiches: [{ title: "F", objective: "o", sources: ["F1"] }] },
    ]);
    const r = normalizeRepair({
      replacements: [{ block_index: 1, content: { text: "x" }, source_block_ids: ["B1"] }, { content: {} }],
      insertions: [{ after_block_index: 0, block_type: "divergence", content: { text: "• A : 1 / • B : 2" }, source_block_ids: ["B2"] }],
      already_covered: [{ source_block_id: "B3", block_index: 2 }],
      flashcards: [{ front: "Q", back: "R", source_flashcard_ids: ["K1"] }],
    });
    expect(r.replacements).toHaveLength(1);
    expect(r.insertions[0].block_type).toBe("divergence");
    expect(r.alreadyCovered).toEqual([{ sourceBlockId: "B3", blockIndex: 2 }]);
    expect(r.flashcards).toHaveLength(1);
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
      [
        {
          alias: "F1",
          bookTitle: "Miller",
          chapterTitle: "NMB",
          title: "Roc",
          sharedWith: ["Sugammadex"],
          blocks: [{ alias: "B1", blockType: "valeurs_seuils", content: { text: "0,6 mg/kg" }, pages: [812], image: "courbe" }],
          cards: [{ alias: "K1", front: "Q", back: "R" }],
        },
      ]
    );
    expect(prompt).toContain("[B1] Valeurs & seuils · p. 812 : 0,6 mg/kg");
    expect(prompt).toContain("[B1] [illustration : courbe]");
    expect(prompt).toContain("[K1] Q : Q — R : R");
    expect(prompt).toContain("le reste est traité dans « Sugammadex »");
    expect(prompt).toContain("ZÉRO PERTE");
    expect(prompt).toContain("40 à 160 mots");
    expect(prompt).toContain("a_retenir");
  });

  it("asks the repair pass for lost values, cards and the missing « À retenir »", () => {
    const prompt = buildRepairPrompt(
      { bookTitle: "N", chapterTitle: "C", title: "T" },
      [{ index: 0, blockType: "definition_mecanisme", content: { text: "x" } }],
      [{ alias: "B1", bookTitle: "Miller", blockType: "valeurs_seuils", content: { text: "1,2 mg/kg" }, lostValues: ["1.2mg"] }],
      [{ alias: "K1", bookTitle: "Albrecht", front: "Q", back: "R", lostValues: [] }],
      true
    );
    expect(prompt).toContain("valeurs absentes de la fiche : 1.2mg");
    expect(prompt).toContain("[K1] « Albrecht »");
    expect(prompt).toContain("n'a pas de bloc « À retenir »");
  });

  it("asks only for the « À retenir » when there's nothing else to take up", () => {
    const prompt = buildRepairPrompt({ bookTitle: "N", chapterTitle: "C", title: "T" }, [{ index: 0, blockType: "definition_mecanisme", content: { text: "x" } }], [], [], true);
    expect(prompt).toContain("Il lui manque son bloc final « À retenir »");
    expect(prompt).toContain("#0");
    expect(prompt).not.toContain("Blocs sources à intégrer");
    expect(prompt).not.toContain("contrôle de couverture");
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
    expect(gemini.inputTokens).toBeGreaterThan(300_000);
    expect(claude.costUsd!).toBeGreaterThan(gemini.costUsd!);
    expect(estimateMerge({ fiches: fiches.slice(0, 30), bookCount: 2 }, "gemini", "gemini-flash-latest").inputTokens).toBeLessThan(gemini.inputTokens);
  });
});
