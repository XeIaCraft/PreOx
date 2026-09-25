import { describe, expect, it } from "vitest";
import { DRUG_REFERENCES, drugReferenceFor, formatReferenceDose, morphineEquivalents } from "./drug-reference";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolDrug } from "./protocols";

const drug = (name: string): ProtocolDrug => ({ id: name, name, route: "bolus_iv", phase: "induction", doseMode: "per_kg", amount: null, unit: "mg", weightBasis: "total", maxAmount: null, redoseEveryMin: null, note: "" });

describe("reference doses and cautions (Manuel pratique d'anesthésie 2020, chap. 6–10)", () => {
  it("every caution names antecedents that exist in the catalogue", () => {
    const ids = new Set(DEFAULT_CATALOGS.conditions.map((c) => c.id));
    for (const r of DRUG_REFERENCES) for (const c of r.cautions) for (const id of c.conditions ?? []) expect(ids.has(id), `${r.name}: ${id}`).toBe(true);
  });

  it("finds the reference from the name written in the plan", () => {
    expect(drugReferenceFor("Propofol 1 %")?.name).toBe("Propofol");
    expect(drugReferenceFor("Célocurine")?.name).toBe("Suxaméthonium (succinylcholine)");
    expect(formatReferenceDose(drugReferenceFor("Rocuronium")!.doses[0])).toBe("0,6–1,2 mg/kg");
    expect(formatReferenceDose(drugReferenceFor("Rémifentanil")!.doses[1])).toBe("0,1–0,5 µg/kg/min");
  });

  it("converts the usual opioids to oral morphine (table 7.4)", () => {
    const r = morphineEquivalents([
      { id: "o", atc: "N02AA05", name: "Oxycodone", dailyDoseMg: 40 },
      { id: "t", atc: "N02AX02", name: "Tramadol", dailyDoseMg: 200 },
      { id: "m", atc: "N07BC02", name: "Méthadone", dailyDoseMg: 60 },
    ]);
    expect(r.total).toBe(90);
    expect(r.unknown).toEqual(["Méthadone"]);
  });

  it("flags a contraindicated drug of the plan, and lists what to avoid for the patient", () => {
    const c: ConsultationState = { ...emptyConsultation(), conditions: { raised_icp: { present: true }, malignant_hyperthermia: { present: true } } };
    const plan = { ...emptyProtocolContent(), drugs: [drug("Kétamine"), drug("Propofol")] };
    const points = attentionPoints(c, consultationScores(c, { plan }), plan);
    const ketamine = points.find((p) => p.title.startsWith("Kétamine au plan"));
    expect(ketamine?.level).toBe("high");
    expect(points.find((p) => p.id === "drugs-avoid")?.detail).toMatch(/Suxaméthonium.*hyperthermie maligne/);
    const noPlan = attentionPoints(c, consultationScores(c));
    expect(noPlan.find((p) => p.id === "drugs-avoid")?.detail).toMatch(/Kétamine — hypertension intracrânienne/);
  });
});
