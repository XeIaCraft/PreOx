import { describe, expect, it } from "vitest";
import { buildFicheVerificationPrompt, describeChanges, ficheVersion, parseFicheVerification, type VerifiableFiche } from "./fiche-verification";

const fiche: VerifiableFiche = {
  title: "Sugammadex",
  summary: "Antagonisation des curares stéroïdiens.",
  blocks: [
    { id: "b-1", blockType: "definition_mecanisme", content: { text: "Encapsule le rocuronium." } },
    { id: "b-2", blockType: "valeurs_seuils", content: { text: "2 mg/kg si TOF ≥ 2." } },
    { id: "b-3", blockType: "texte_libre", content: { text: "Ancienne mention." } },
  ],
  flashcards: [
    { id: "k-1", front: "Dose si TOF ≥ 2 ?", back: "2 mg/kg" },
    { id: "k-2", front: "Dose si PTC 1–2 ?", back: "4 mg/kg" },
  ],
};

describe("fiche verification", () => {
  it("exports the fiche with short ids and its version", () => {
    const prompt = buildFicheVerificationPrompt(fiche, "18 octobre 2026");
    expect(prompt).toContain('"id": "B2"');
    expect(prompt).toContain('"id": "K1"');
    expect(prompt).toContain(`"fiche_version": "${ficheVersion(fiche)}"`);
    expect(prompt).toContain("18 octobre 2026");
  });

  it("reads a fenced answer: keeps, updates, adds, removes, and keeps what was left out", () => {
    const answer = `Voici :\n\`\`\`json\n${JSON.stringify({
      fiche_version: ficheVersion(fiche),
      resume: "Dose d'urgence précisée.",
      blocs: [
        { id: "B1", change: "inchangé", type: "definition_mecanisme", contenu: { text: "Encapsule le rocuronium." } },
        { id: "B2", change: "modifié", type: "valeurs_seuils", heading: "Posologie", contenu: { text: "2 mg/kg si TOF ≥ 2 ; 16 mg/kg en urgence." }, note: "RCP 2024" },
        { id: null, change: "nouveau", type: "piege_erreur", contenu: { text: "Contraception orale : équivalent d'un oubli de pilule." }, note: "RCP" },
      ],
      cartes: [{ id: "K1", change: "modifié", question: "Dose si TOF ≥ 2 ?", reponse: "2 mg/kg (poids réel)", note: "RCP" }],
      supprimes: [{ id: "B3", note: "obsolète" }],
    })}\n\`\`\``;
    const parsed = parseFicheVerification(answer, fiche);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { changes } = parsed;
    expect(changes.blocks.map((b) => b.kind)).toEqual(["keep", "update", "add"]);
    const update = changes.blocks[1];
    expect(update.kind === "update" && update.content).toEqual({ text: "2 mg/kg si TOF ≥ 2 ; 16 mg/kg en urgence.", heading: "Posologie" });
    expect(changes.removedBlocks).toEqual([{ id: "b-3", note: "obsolète" }]);
    expect(changes.cards.map((c) => c.kind)).toEqual(["update", "keep"]);
    expect(describeChanges(changes, fiche)).toHaveLength(4);
  });

  it("refuses an answer built on another version of the fiche, and unreadable text", () => {
    expect(parseFicheVerification(JSON.stringify({ fiche_version: "autre", blocs: [] }), fiche)).toEqual({ ok: false, error: expect.stringContaining("exportez-la de nouveau") });
    expect(parseFicheVerification("pas de json", fiche).ok).toBe(false);
  });
});
