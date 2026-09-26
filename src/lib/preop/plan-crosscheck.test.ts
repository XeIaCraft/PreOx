import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type GasPlan, type ProtocolContent, type ProtocolDrug } from "./protocols";

const drug = (name: string): ProtocolDrug => ({ id: name, name, route: "bolus_iv", phase: "induction", doseMode: "fixed", amount: null, unit: "mg", weightBasis: "total", maxAmount: null, redoseEveryMin: null, note: "" });
const planOf = (names: string[], gases?: GasPlan): ProtocolContent => ({ ...emptyProtocolContent(), drugs: names.map(drug), gases });
const points = (c: ConsultationState, plan: ProtocolContent) => attentionPoints(c, consultationScores(c, { plan }), plan);
const patient = (conditions: string[], atcs: string[] = []): ConsultationState => ({
  ...emptyConsultation(),
  conditions: Object.fromEntries(conditions.map((id) => [id, { present: true }])),
  treatments: atcs.map((atc) => ({ id: atc, atc, name: atc })),
});
const titled = (ps: ReturnType<typeof points>, start: string) => ps.filter((p) => p.title.startsWith(start));

describe("the plan checked against the patient", () => {
  it("NSAIDs: lithium and kidney failure forbid them, an anticoagulant makes them relative", () => {
    expect(titled(points(patient([], ["N05AN01"]), planOf(["Kétorolac"])), "Kétorolac au plan")[0]?.level).toBe("high");
    expect(titled(points(patient(["ckd"]), planOf(["Ibuprofène"])), "Ibuprofène au plan")[0]?.level).toBe("high");
    expect(titled(points(patient([], ["B01AF02"]), planOf(["Diclofénac"])), "Diclofénac au plan")[0]?.level).toBe("medium");
    expect(titled(points(patient([]), planOf(["Ibuprofène"])), "Ibuprofène au plan")).toEqual([]);
  });

  it("enoxaparin after HIT, metoclopramide in Parkinson's disease", () => {
    expect(titled(points(patient(["hit_history"]), planOf(["Énoxaparine 40 mg"])), "Énoxaparine au plan")[0]?.level).toBe("high");
    expect(titled(points(patient(["parkinson"]), planOf(["Métoclopramide"])), "Métoclopramide au plan")[0]?.level).toBe("high");
  });

  it("gases: halogenated agent with malignant hyperthermia, N₂O with a pneumothorax, desflurane in asthma", () => {
    const sevo: GasPlan = { agent: "sevoflurane", carrier: "air", fio2: [0.4, 0.5], mac: [0.7, 1] };
    expect(points(patient(["malignant_hyperthermia"]), planOf([], sevo)).find((p) => p.id === "plan-gases-mh")?.level).toBe("high");
    expect(points(patient(["malignant_hyperthermia"]), planOf([], { ...sevo, agent: "tiva" })).find((p) => p.id === "plan-gases-mh")).toBeUndefined();
    expect(points(patient(["pneumothorax"]), planOf([], { ...sevo, carrier: "n2o" })).find((p) => p.id === "plan-gases-n2o")?.level).toBe("high");
    expect(points(patient(["ponv"]), planOf([], { ...sevo, carrier: "n2o" })).find((p) => p.id === "plan-gases-n2o")?.level).toBe("medium");
    expect(points(patient(["pneumothorax"]), planOf([], sevo)).find((p) => p.id === "plan-gases-n2o")).toBeUndefined();
    expect(points(patient(["asthma"]), planOf([], { ...sevo, agent: "desflurane" })).find((p) => p.id === "plan-gases-des-asthma")).toBeDefined();
  });
});

describe("doses adapted to the kidney and the liver", () => {
  it("kidney: from the Cockcroft-Gault clearance, or dialysis", async () => {
    const { organAdjustments } = await import("./organ-dosing");
    expect(organAdjustments(["Morphine", "Kétorolac", "Propofol"], { crcl: 25 }).map((o) => o.drug)).toEqual(["Morphine", "Kétorolac"]);
    expect(organAdjustments(["Morphine"], { crcl: 45 })[0].text).toMatch(/doses réduites/);
    expect(organAdjustments(["Morphine"], { crcl: 90 })).toEqual([]);
    expect(organAdjustments(["Sugammadex"], { dialysis: true })[0].text).toMatch(/non recommandé/);
    expect(organAdjustments(["Métoclopramide"], { crcl: 10 })[0].text).toMatch(/75 %/);
  });

  it("liver: cirrhosis, stronger for Child B or C; shown as a point of attention", async () => {
    const { organAdjustments } = await import("./organ-dosing");
    expect(organAdjustments(["Paracétamol"], { liver: "any" })[0].text).toBe("3 g/j au maximum");
    expect(organAdjustments(["Paracétamol"], { liver: "severe" })[0].text).toBe("2 g/j au maximum");
    const c = patient(["cirrhosis"]);
    c.conditions.cirrhosis = { present: true, details: { child: "c" } };
    const p = points(c, planOf(["Paracétamol", "Midazolam"])).find((x) => x.id === "plan-hepatic-doses");
    expect(p?.level).toBe("high");
    expect(p?.detail).toMatch(/Paracétamol : 2 g\/j/);
    expect(p?.why).toMatch(/Child C/);
  });
});

describe("children at respiratory risk", () => {
  it("asks for an IV induction, and says which induction of the plan to keep", () => {
    const c = patient(["recent_uri", "child_wheeze"]);
    c.patient = { ...c.patient, age: 5, weightKg: 18 };
    c.surgery = { ...c.surgery, name: "Amygdalectomie" };
    const choice = planOf(["Propofol", "Sévoflurane"]);
    choice.drugs = choice.drugs.map((x) => ({ ...x, choice: "induction" }));
    const p = points(c, choice).find((x) => x.id === "paediatric-prae");
    expect(p?.level).toBe("high");
    expect(p?.detail).toMatch(/retenir le propofol/);
    expect(p?.why).toMatch(/chirurgie des voies aériennes/);
    const adult = patient(["recent_uri"]);
    adult.patient = { ...adult.patient, age: 40 };
    expect(points(adult, choice).find((x) => x.id === "paediatric-prae")).toBeUndefined();
  });
});
