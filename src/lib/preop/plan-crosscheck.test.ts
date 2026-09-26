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
