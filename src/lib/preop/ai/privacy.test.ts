import { describe, expect, it } from "vitest";
import { buildQuestion, protocolQuestion, questionForCondition, questionForTreatment } from "../rules/question";
import { REFERENCE_PROTOCOLS } from "../reference-protocols";
import { generaliseAges, outgoingText, privacyIssues } from "./privacy";

const blocked = (t: string) => privacyIssues(outgoingText(t)).map((i) => i.label);

describe("what may be sent to an AI service", () => {
  it("refuses what could identify a patient", () => {
    expect(blocked("Patient KL, rivaroxaban")).toContain("des initiales de patient");
    expect(blocked("Initiales : AB")).toContain("des initiales de patient");
    expect(blocked("Mme Dupont, 72 ans")).toContain("un nom de personne");
    expect(blocked("opérée le 12/03/2026")).toContain("une date précise");
    expect(blocked("née le 3 mars 1950")).toContain("une date de naissance");
    expect(blocked("joindre au 0471 23 45 67")).toContain("un numéro de téléphone");
    expect(blocked("NISS 85.07.30-033.28")).toContain("un numéro national ou de dossier");
    expect(blocked("dossier 12345678")).toContain("un numéro national ou de dossier");
    expect(blocked("contact: x.y@hopital.be")).toContain("une adresse e-mail");
    expect(blocked("chambre 214")).toContain("un lieu (chambre, lit, adresse)");
  });

  it("lets general clinical questions through, acronyms and guideline years included", () => {
    for (const t of [
      "Délai entre la dernière prise d'édoxaban 60 mg et une rachianesthésie, clairance 45 mL/min ?",
      "Patient ASA 3 sous apixaban 5 mg × 2 pour une FA, PTH, ESAIC/ESRA 2022 Guidelines",
      "SGLT2 inhibitors and euglycaemic ketoacidosis: ESC 2022 recommendation",
      "patiente BPCO GOLD 3, chirurgie abdominale haute",
    ])
      expect(blocked(t), t).toEqual([]);
  });

  it("rounds ages to the decade", () => {
    expect(generaliseAges("homme de 58 ans")).toBe("homme de 50–59 ans");
    expect(generaliseAges("93 ans")).toBe("≥ 90 ans");
    expect(generaliseAges("a 67-year-old")).toContain("60–69");
  });

  it("the questions PreOx builds itself are never blocked", () => {
    const qs = [
      buildQuestion(questionForTreatment({ drug: "rivaroxaban", atc: "B01AF01", dailyDoseMg: 20, indication: "atrial fibrillation", techniques: ["neuraxial"], crcl: 48, surgery: "Prothèse totale de hanche" })),
      buildQuestion(questionForCondition({ condition: "myasthenia gravis", techniques: ["general"], surgery: "Thymectomie" })),
      ...REFERENCE_PROTOCOLS.map((p) => protocolQuestion({ surgery: p.surgery, techniques: p.content.techniques }).prompt),
    ];
    for (const q of qs) expect(blocked(q), q.slice(0, 80)).toEqual([]);
  });
});
