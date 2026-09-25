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

describe("regional anaesthesia (chap. 12–14)", () => {
  it("adds up the local anaesthetics of a plan against their toxic dose", async () => {
    const { localAnaestheticLoad } = await import("./drug-reference");
    const { computeDose } = await import("./protocols");
    const drugs = [
      { ...drug("Ropivacaïne 0,5 %"), doseMode: "fixed" as const, amount: 150, unit: "mg" as const },
      { ...drug("Lidocaïne adrénalinée"), doseMode: "fixed" as const, amount: 200, unit: "mg" as const },
    ];
    const load = localAnaestheticLoad(drugs, 60, (d) => computeDose(d as ProtocolDrug, { weightKg: 60 }));
    // Ropivacaine 3 mg/kg × 60 = 180 mg, capped at 175 mg total → 86 % ; lidocaine with adrenaline 7 mg/kg × 60 = 420 mg → 48 %.
    expect(load.parts.map((x) => [x.name, x.maxMg])).toEqual([
      ["Ropivacaïne 0,5 %", 175],
      ["Lidocaïne adrénalinée", 420],
    ]);
    expect(Math.round(load.total * 100)).toBe(133);
    expect(drugReferenceFor("Lidocaïne adrénalinée")?.name).toBe("Lidocaïne");
  });

  it("warns against regional anaesthesia with a low platelet count, and a spinal with severe aortic stenosis", () => {
    const c: ConsultationState = { ...emptyConsultation(), techniques: ["neuraxial"], patient: { platelets: 40 }, conditions: { aortic_stenosis: { present: true, severe: true } } };
    const alr = attentionPoints(c, consultationScores(c)).find((p) => p.id === "alr-ci");
    expect(alr?.level).toBe("high");
    expect(alr?.detail).toMatch(/plaquettes 40 G\/L.*rétrécissement aortique serré/);
  });

  it("suggests a gastric ultrasound when the stomach may not be empty", () => {
    const c: ConsultationState = { ...emptyConsultation(), conditions: { diabetes_insulin: { present: true } } };
    expect(attentionPoints(c, consultationScores(c)).find((p) => p.id === "gastric-us")?.why).toBe("diabète");
  });
});
