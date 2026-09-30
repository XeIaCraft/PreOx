import { describe, expect, it } from "vitest";
import { dedupeComplementary, similarity } from "./complement-dedupe";
import { plannedGeminiPasses } from "./gemini-passes";
import type { ComplementaryResult } from "./types";

const card = (front: string) => ({ front, back: "x", citations: [{ page: 1, quote: "q" }] });
const block = (text: string) => ({ block_type: "texte_libre" as const, content: { text }, citations: [{ page: 1, quote: "q" }] });

describe("doublons des passes de complément", () => {
  const existing = [
    {
      name: "Facteurs de risque des NVPO",
      blocks: [{ blockType: "texte_libre", content: { text: "Sexe féminin, non-fumeur, antécédent de NVPO ou de mal des transports, morphiniques postopératoires." } }],
      flashcardFronts: ["Quels sont les 4 facteurs du score d'Apfel ?"],
    },
  ];

  it("retire une question reformulée à peine et un bloc qui répète", () => {
    const r: ComplementaryResult = {
      additions_for_existing: [
        {
          sub_entity_name: "Facteurs de risque des NVPO",
          blocks: [block("Sexe feminin, non fumeur, antecedent de NVPO ou mal des transports, morphiniques post-operatoires."), block("Le protoxyde d'azote augmente le risque de NVPO de façon dose-dépendante.")],
          flashcards: [card("Quels sont les quatre facteurs du score d'Apfel ?"), card("Quel est le risque de NVPO avec 3 facteurs d'Apfel ?")],
        },
      ],
      new_sub_entities: [],
      estimated_remaining_passes: 0,
    };
    const { result, report } = dedupeComplementary(r, existing);
    expect(report.droppedCards).toBe(1);
    expect(report.droppedBlocks).toBe(1);
    expect(result.additions_for_existing[0].flashcards.map((c) => c.front)).toEqual(["Quel est le risque de NVPO avec 3 facteurs d'Apfel ?"]);
  });

  it("fusionne une « nouvelle » sous-entité qui existe déjà sous un autre nom, et les doublons internes", () => {
    const r: ComplementaryResult = {
      additions_for_existing: [],
      new_sub_entities: [
        { name: "Facteurs de risques des NVPO", summary: "", fiche: { title: "t", blocks: [], flashcards: [card("Qu'est-ce que le score de Koivuranta ?"), card("Qu'est-ce que le score de Koivuranta ?")] } },
        { name: "Traitement curatif", summary: "", fiche: { title: "t", blocks: [block("Sétron en première intention si pas de prophylaxie.")], flashcards: [] } },
      ],
      estimated_remaining_passes: 0,
    };
    const { result, report } = dedupeComplementary(r, existing);
    expect(report.mergedSubEntities).toBe(1);
    expect(result.additions_for_existing[0].sub_entity_name).toBe("Facteurs de risque des NVPO");
    expect(result.additions_for_existing[0].flashcards).toHaveLength(1);
    expect(result.new_sub_entities.map((s) => s.name)).toEqual(["Traitement curatif"]);
  });

  it("des questions différentes restent", () => {
    expect(similarity("Dose de dexaméthasone en prévention ?", "Délai d'action de l'ondansétron ?")).toBeLessThan(0.75);
  });
});

describe("nombre de passes Gemini selon les pages", () => {
  it("une passe par 3 pages, au moins 1, plafonné", () => {
    expect(plannedGeminiPasses(2)).toBe(1);
    expect(plannedGeminiPasses(12)).toBe(4);
    expect(plannedGeminiPasses(40)).toBe(8);
    expect(plannedGeminiPasses(12, { pagesPerPass: 6, maxPasses: 8, minAddedPerPass: 3 })).toBe(2);
    expect(plannedGeminiPasses(null)).toBe(1);
  });
});
