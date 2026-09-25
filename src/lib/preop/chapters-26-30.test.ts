import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, emptySurgery, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { recommendExams } from "./exams";
import { MANUAL_RULES } from "./rules/proposed-manual";

const base = (patch: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), ...patch });
const patient = (patch: Partial<ConsultationState["patient"]>) => ({ ...emptyConsultation().patient, ...patch });
const points = (c: ConsultationState, plan: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] }) => attentionPoints(c, consultationScores(c, { plan }), plan);

describe("Manuel pratique d'anesthésie 2020, chapitres 26–30", () => {
  it("reviews a day-case patient against the selection criteria", () => {
    const c = base({ surgery: { ...emptySurgery(), name: "Cure de hernie inguinale", setting: "ambulatory", durationHours: 2, bleedingRisk: "high" } });
    const p = points(c).find((x) => x.id === "day-case")!;
    expect(p.level).toBe("medium");
    expect(p.detail).toMatch(/durée prévue 2 h/);
  });

  it("gives the haemodynamic goals of each heart disease", () => {
    const c = base({ conditions: { aortic_stenosis: { present: true }, valve: { present: true, details: { which: "rétrécissement mitral" } }, pulmonary_hypertension: { present: true } } });
    const g = points(c).find((x) => x.id === "hemodynamic-goals")!;
    expect(g.detail).toMatch(/plein, régulier, vasoconstricté/);
    expect(g.detail).toMatch(/ventilé, lent, vasodilaté en pulmonaire/);
    expect(g.detail).toMatch(/PaCO₂ 25–30/);
    expect(points(c).find((x) => x.id === "drugs-avoid")?.detail).toMatch(/Kétamine — hypertension pulmonaire/);
  });

  it("prepares vascular, thoracic and digestive surgery", () => {
    const aorta = points(base({ surgery: { ...emptySurgery(), name: "Anévrisme de l'aorte thoraco-abdominale" } })).find((x) => x.id === "aortic-surgery")!;
    expect(aorta.detail).toMatch(/radial droit \(jamais gauche\)/);
    const lung = points(base({ patient: patient({ sex: "F" }), surgery: { ...emptySurgery(), name: "Lobectomie pulmonaire" } })).find((x) => x.id === "one-lung")!;
    expect(lung.detail).toMatch(/35–37 F/);
    expect(lung.detail).toMatch(/VEMS prédit postopératoire/);
    const lap = points(base({ patient: patient({ weightKg: 80 }), surgery: { ...emptySurgery(), name: "Hépatectomie droite", incision: "upper_abdominal" } })).find((x) => x.id === "laparotomy")!;
    expect(lap.detail).toMatch(/≈ 160–480 ml\/h/);
    const coelio = points(base({ conditions: { raised_icp: { present: true } }, surgery: { ...emptySurgery(), name: "Cholécystectomie par cœlioscopie" } }));
    expect(coelio.find((x) => x.id === "laparoscopy-ci")?.level).toBe("high");
  });

  it("adapts anaesthesia to neuromuscular diseases and cirrhosis", () => {
    const c = base({ conditions: { myotonic_dystrophy: { present: true }, cirrhosis: { present: true, details: { child: "b" } } } });
    const p = points(c, emptyProtocolContent());
    expect(p.find((x) => x.id === "neuro-disease")?.detail).toMatch(/ni étomidate ni succinylcholine/);
    expect(p.find((x) => x.id === "cirrhosis-plan")?.title).toBe("Cirrhose Child B : conduite");
    expect(p.find((x) => x.id === "drugs-avoid")?.detail).toMatch(/Étomidate — dystrophie myotonique/);
    const exams = recommendExams({ consultation: c, asa: 3 });
    expect(exams.recommendations.some((r) => r.code === "ecg" && r.reasons.some((x) => /myotonique/.test(x.text)))).toBe(true);
  });

  it("uses a restrictive lung tidal volume and flags a heavy smoker", () => {
    const c = base({ conditions: { restrictive: { present: true } }, patient: patient({ sex: "M", heightCm: 180 }), substances: { ...emptyConsultation().substances, tobacco: "current", packYears: 30 } });
    const p = points(c);
    expect(p.find((x) => x.id === "ventilation")?.title).toMatch(/Vt 300–450 ml/);
    expect(p.find((x) => x.id === "tobacco")?.level).toBe("medium");
  });

  it("adds the long half-life ACE inhibitors as drafts at the end", () => {
    const ramipril = MANUAL_RULES.find((r) => r.title.startsWith("Ramipril"))!;
    expect(ramipril.action).toMatchObject({ type: "stop_before", hours: 48 });
    expect(MANUAL_RULES.at(-1)!.source.title).toMatch(/Chapitre 51/);
  });
});
