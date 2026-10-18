import { describe, expect, it } from "vitest";
import {
  buildVerificationPrompt,
  changeCitations,
  describeChanges,
  normalizeReferences,
  orderAfterChanges,
  parseVerification,
  referenceLabel,
  verificationVersion,
  type VerifiableFiche,
} from "./fiche-verification";

const sugammadex: VerifiableFiche = {
  ficheId: "f-1",
  title: "Sugammadex",
  summary: "Antagonisation des curares stéroïdiens.",
  blocks: [
    { id: "b-1", blockType: "definition_mecanisme", content: { text: "Encapsule le rocuronium." } },
    { id: "b-2", blockType: "valeurs_seuils", content: { text: "2 mg/kg si TOF ≥ 2.", heading: "Posologie" } },
    { id: "b-3", blockType: "texte_libre", content: { text: "Ancienne mention." } },
    { id: "b-4", blockType: "a_retenir", content: { text: "• 2, 4 ou 16 mg/kg selon la profondeur du bloc." } },
  ],
  flashcards: [
    { id: "k-1", front: "Dose si TOF ≥ 2 ?", back: "2 mg/kg" },
    { id: "k-2", front: "Dose si PTC 1–2 ?", back: "4 mg/kg" },
  ],
};

const neostigmine: VerifiableFiche = {
  ficheId: "f-2",
  title: "Néostigmine",
  summary: "Anticholinestérasique.",
  blocks: [{ id: "c-1", blockType: "definition_mecanisme", content: { text: "Inhibe l'acétylcholinestérase." } }],
  flashcards: [{ id: "m-1", front: "Associer à quoi ?", back: "Atropine ou glycopyrrolate" }],
};

const fenced = (data: unknown) => `Voici ma relecture :\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\nBonne révision !`;

describe("verification prompt", () => {
  it("exports one fiche with short ids, its version, and the oral-exam asks", () => {
    const prompt = buildVerificationPrompt({ label: "une fiche", fiches: [sugammadex] }, "18 octobre 2026");
    expect(prompt).toContain('"id": "F1.B2"');
    expect(prompt).toContain('"id": "F1.K1"');
    expect(prompt).toContain(`"version": "${verificationVersion([sugammadex])}"`);
    expect(prompt).toContain("18 octobre 2026");
    expect(prompt).toContain("PubMed et Consensus");
    expect(prompt).toContain("etudes_cles");
    expect(prompt).toContain("historique");
    expect(prompt).toContain("N'invente jamais une référence");
  });

  it("numbers the fiches of a chapter", () => {
    const prompt = buildVerificationPrompt({ label: "le chapitre « Curares »", fiches: [sugammadex, neostigmine] }, "18 octobre 2026");
    expect(prompt).toContain('"id": "F2"');
    expect(prompt).toContain('"id": "F2.B1"');
    expect(prompt).toContain('"id": "F2.K1"');
    expect(prompt).toContain("Les fiches");
  });

  it("changes version when a block or a card is added, removed or moved", () => {
    const v = verificationVersion([sugammadex]);
    expect(verificationVersion([{ ...sugammadex, blocks: [...sugammadex.blocks].reverse() }])).not.toBe(v);
    expect(verificationVersion([{ ...sugammadex, flashcards: sugammadex.flashcards.slice(1) }])).not.toBe(v);
    expect(verificationVersion([sugammadex, neostigmine])).not.toBe(v);
  });
});

describe("references", () => {
  it("labels a reference by its first word and year", () => {
    expect(referenceLabel("Baillard C et al., Anesthesiology 2005", "Référence")).toBe("Baillard 2005");
    expect(referenceLabel("POISE (Devereaux PJ et al.), Lancet 2008", "Référence")).toBe("POISE 2008");
    expect(referenceLabel("", "PMID 123")).toBe("PMID 123");
  });

  it("links PMIDs to PubMed and DOIs to doi.org, keeps titles without id", () => {
    expect(
      normalizeReferences([
        { titre: "Brull SJ et al., Anesthesiology 2017", pmid: "PMID: 28045707" },
        { titre: "Fuchs-Buder T et al., Eur J Anaesthesiol 2023", doi: "https://doi.org/10.1097/EJA.0000000000001769" },
        { titre: "Recommandation sans identifiant" },
        { pmid: "" },
        "n'importe quoi",
      ]),
    ).toEqual([
      { label: "Brull 2017", title: "Brull SJ et al., Anesthesiology 2017", url: "https://pubmed.ncbi.nlm.nih.gov/28045707/" },
      { label: "Fuchs-Buder 2023", title: "Fuchs-Buder T et al., Eur J Anaesthesiol 2023", url: "https://doi.org/10.1097/EJA.0000000000001769" },
      { label: "Recommandation", title: "Recommandation sans identifiant", url: null },
    ]);
    expect(normalizeReferences(undefined)).toEqual([]);
  });

  it("turns a change into an « Actualisation » chip and one chip per reference", () => {
    const refs = normalizeReferences([{ titre: "Brull SJ et al., Anesthesiology 2017", pmid: "28045707" }, { titre: "Sans id" }]);
    expect(changeCitations("Dose d'urgence ajoutée.", refs, "octobre 2026")).toEqual([
      { page: 0, quote: "Dose d'urgence ajoutée.", bookTitle: "Actualisation octobre 2026", chapterTitle: "Dose d'urgence ajoutée." },
      { page: 0, quote: "Brull SJ et al., Anesthesiology 2017", bookTitle: "Brull 2017", url: "https://pubmed.ncbi.nlm.nih.gov/28045707/" },
      { page: 0, quote: "Sans id", bookTitle: "Sans" },
    ]);
    expect(changeCitations("", [], "octobre 2026")).toEqual([]);
  });
});

describe("reading the answer", () => {
  const studies = {
    headers: ["Étude ou auteurs", "Année", "Revue", "Ce qu'elle a montré", "Ce que ça a changé"],
    rows: [["Brull et al.", "2017", "Anesthesiology", "Curarisation résiduelle fréquente", "Monitorage quantitatif systématique"]],
  };

  it("reads a fenced answer with every kind of change", () => {
    const answer = fenced({
      version: verificationVersion([sugammadex]),
      resume: "Dose d'urgence précisée, études clés ajoutées.",
      modifications: [
        { action: "modifier", bloc: "F1.B2", contenu: { text: "2 mg/kg si TOF ≥ 2 ; 16 mg/kg en urgence." }, note: "RCP", references: [{ titre: "RCP Bridion 2024" }] },
        { action: "ajouter", fiche: "F1", apres: "F1.B1", type: "etudes_cles", heading: "Études et auteurs clés", contenu: studies, note: "Pour l'oral", references: [{ titre: "Brull SJ et al., Anesthesiology 2017", pmid: "28045707" }] },
        { action: "ajouter", fiche: "F1", apres: "fin", type: "historique", heading: "Avant le sugammadex", contenu: { text: "• 1990s : néostigmine seule." }, note: "" },
        { action: "supprimer", bloc: "F1.B3", note: "obsolète" },
        { action: "modifier_carte", carte: "F1.K1", question: "Dose si TOF ≥ 2 ?", reponse: "2 mg/kg (poids réel)", note: "RCP" },
        { action: "ajouter_carte", fiche: "F1", question: "Quelle étude a montré la fréquence de la curarisation résiduelle ?", reponse: "Brull 2017", references: [{ titre: "Brull 2017", pmid: "28045707" }] },
        { action: "supprimer_carte", carte: "F1.K2", note: "doublon" },
      ],
    });
    const parsed = parseVerification(answer, [sugammadex]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { changes } = parsed;
    expect(changes.summary).toBe("Dose d'urgence précisée, études clés ajoutées.");
    expect(changes.skipped).toEqual([]);
    expect(changes.referencesWithoutId).toBe(1);
    const [c] = changes.fiches;
    expect(c.ficheId).toBe("f-1");
    // The heading the block already had is kept when the answer doesn't give one.
    expect(c.updates).toEqual([{ id: "b-2", content: { text: "2 mg/kg si TOF ≥ 2 ; 16 mg/kg en urgence.", heading: "Posologie" }, note: "RCP", refs: [{ label: "RCP 2024", title: "RCP Bridion 2024", url: null }] }]);
    expect(c.inserts.map((i) => [i.after, i.blockType, i.content])).toEqual([
      ["b-1", "etudes_cles", { ...studies, heading: "Études et auteurs clés" }],
      ["fin", "historique", { text: "• 1990s : néostigmine seule.", heading: "Avant le sugammadex" }],
    ]);
    expect(c.inserts[0].refs[0].url).toBe("https://pubmed.ncbi.nlm.nih.gov/28045707/");
    expect(c.removes).toEqual([{ id: "b-3", note: "obsolète" }]);
    expect(c.cardUpdates).toEqual([{ id: "k-1", front: "Dose si TOF ≥ 2 ?", back: "2 mg/kg (poids réel)", note: "RCP", refs: [] }]);
    expect(c.cardAdds).toHaveLength(1);
    expect(c.cardRemoves).toEqual([{ id: "k-2", note: "doublon" }]);
    const lines = describeChanges(changes, [sugammadex]);
    expect(lines).toHaveLength(7);
    expect(lines[1]).toContain("« Études et auteurs clés »");
    expect(lines[1]).toContain("[Brull 2017]");
  });

  it("routes the changes of a chapter to their fiche and reports what it can't use", () => {
    const answer = fenced({
      version: verificationVersion([sugammadex, neostigmine]),
      modifications: [
        { action: "modifier", bloc: "F2.B1", contenu: { text: "Inhibe l'acétylcholinestérase (effet plafond)." }, note: "" },
        { action: "ajouter_carte", fiche: "F2", question: "Pourquoi un effet plafond ?", reponse: "Enzyme déjà inhibée au maximum" },
        { action: "ajouter", fiche: "F2", apres: "F1.B1", type: "inconnu", contenu: { text: "Bloc d'une autre fiche comme ancre." } },
        { action: "modifier", bloc: "F9.B1", contenu: { text: "?" } },
        { action: "ajouter", fiche: "F3", type: "historique", contenu: { text: "…" } },
        { action: "modifier", bloc: "F1.B1", contenu: {} },
        { action: "renommer", bloc: "F1.B1" },
      ],
    });
    const parsed = parseVerification(answer, [sugammadex, neostigmine]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [first, second] = parsed.changes.fiches;
    expect(first.updates).toEqual([]);
    expect(second.updates.map((u) => u.id)).toEqual(["c-1"]);
    expect(second.cardAdds.map((a) => a.front)).toEqual(["Pourquoi un effet plafond ?"]);
    // An unknown type becomes free text; an anchor from another fiche falls back to the end.
    expect(second.inserts.map((i) => [i.after, i.blockType])).toEqual([["fin", "texte_libre"]]);
    expect(parsed.changes.skipped).toHaveLength(4);
    expect(describeChanges(parsed.changes, [sugammadex, neostigmine])[0]).toContain("« Néostigmine » — ");
  });

  it("refuses an answer built on another version of the fiches, and unreadable text", () => {
    expect(parseVerification(fenced({ version: "autre", modifications: [] }), [sugammadex])).toEqual({ ok: false, error: expect.stringContaining("exportez-les de nouveau") });
    expect(parseVerification("pas de json", [sugammadex]).ok).toBe(false);
    expect(parseVerification("```json\n{ oups }\n```", [sugammadex]).ok).toBe(false);
  });
});

describe("order after changes", () => {
  const typeOf = (id: string) => sugammadex.blocks.find((b) => b.id === id)?.blockType;
  const ids = sugammadex.blocks.map((b) => b.id);
  const changesWith = (inserts: { after: string; blockType: "historique" | "etudes_cles" | "a_retenir" }[], removes: string[] = []) => ({
    ficheId: "f-1",
    updates: [],
    inserts: inserts.map((i) => ({ ...i, content: { text: "…" }, note: "", refs: [] })),
    removes: removes.map((id) => ({ id, note: "" })),
    cardUpdates: [],
    cardAdds: [],
    cardRemoves: [],
  });

  it("puts additions after their anchor, at the start, or just before « À retenir »", () => {
    const changes = changesWith([
      { after: "b-1", blockType: "etudes_cles" },
      { after: "fin", blockType: "historique" },
      { after: "debut", blockType: "historique" },
    ]);
    expect(orderAfterChanges(ids, typeOf, changes)).toEqual([{ insert: 2 }, "b-1", { insert: 0 }, "b-2", "b-3", { insert: 1 }, "b-4"]);
  });

  it("leaves removed blocks out and places an addition anchored on one before « À retenir »", () => {
    const changes = changesWith([{ after: "b-3", blockType: "etudes_cles" }], ["b-3"]);
    expect(orderAfterChanges(ids, typeOf, changes)).toEqual(["b-1", "b-2", { insert: 0 }, "b-4"]);
  });

  it("appends at the very end when the fiche has no « À retenir », and keeps a new « À retenir » last", () => {
    const changes = changesWith([
      { after: "fin", blockType: "a_retenir" },
      { after: "fin", blockType: "historique" },
    ]);
    expect(orderAfterChanges(["b-1", "b-2"], typeOf, changes)).toEqual(["b-1", "b-2", { insert: 1 }, { insert: 0 }]);
  });
});
