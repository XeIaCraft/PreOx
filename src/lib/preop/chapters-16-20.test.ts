import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, emptySurgery, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { recommendExams } from "./exams";
import { drugReferenceFor } from "./drug-reference";
import { MANUAL_RULES } from "./rules/proposed-manual";

const base = (patch: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), ...patch });
const points = (c: ConsultationState, plan: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] }) => attentionPoints(c, consultationScores(c, { plan }), plan);

describe("Manuel pratique d'anesthésie 2020, chapitres 16–20", () => {
  it("gives starting ventilator settings and sizes from the ideal body weight", () => {
    const c = base({ patient: { ...emptyConsultation().patient, sex: "M", heightCm: 180, weightKg: 110 } });
    const v = points(c).find((p) => p.id === "ventilation")!;
    // Devine: 50 + 0.91 × (180 − 152.4) ≈ 75 kg → 450–600 ml; BMI 34 → PEEP 5.
    expect(v.title).toBe("Réglages de départ : Vt 450–600 ml, PEP 5");
    expect(v.detail).toMatch(/7,5–8 mm, repère 23 cm/);
    expect(v.detail).toMatch(/masque laryngé taille 6/);
    expect(points(c, emptyProtocolContent()).some((p) => p.id === "ventilation")).toBe(false);
  });

  it("plans a risky extubation after long prone surgery or head and neck surgery", () => {
    const prone = base({ surgery: { ...emptySurgery(), name: "Arthrodèse rachidienne", position: "Décubitus ventral", durationHours: 5 } });
    expect(points(prone).find((p) => p.id === "extubation-risk")?.why).toMatch(/décubitus ventral de 5 h/);
    expect(points(prone).find((p) => p.id === "position-prone")?.material).toContain("Protection oculaire");
    const larynx = base({ surgery: { ...emptySurgery(), name: "Laryngectomie totale" } });
    expect(points(larynx).some((p) => p.id === "extubation-risk")).toBe(true);
  });

  it("asks for a PFO search before the sitting position, not the beach chair", () => {
    const sit = base({ surgery: { ...emptySurgery(), name: "Chirurgie de la fosse postérieure", position: "Assise" } });
    expect(points(sit).find((p) => p.id === "position-sitting")?.level).toBe("medium");
    const exams = recommendExams({ consultation: sit, asa: 2 });
    expect(exams.recommendations.find((r) => r.code === "echo")?.reasons.some((r) => /foramen ovale/.test(r.text))).toBe(true);
    const beach = base({ surgery: { ...emptySurgery(), name: "Arthroscopie de l'épaule", position: "Semi-assise (beach chair)" } });
    expect(points(beach).some((p) => p.id === "position-sitting")).toBe(false);
  });

  it("adapts the antibiotic prophylaxis to allergy, weight and colorectal surgery", () => {
    const patient = { ...emptyConsultation().patient, weightKg: 130, allergyList: [{ allergenId: "betalactams", label: "Pénicilline", timing: "immediate" as const }] };
    const c = base({ patient, surgery: { ...emptySurgery(), name: "Colectomie", category: "A" } });
    const abx = points(c).find((p) => p.id === "antibioprophylaxis")!;
    expect(abx.level).toBe("medium");
    expect(abx.detail).toMatch(/≈ 1950 mg/);
    expect(abx.detail).toMatch(/3 g/);
    expect(abx.detail).toMatch(/gentamicine/);
    const delayed = base({ patient: { ...patient, weightKg: 70, allergyList: [{ allergenId: "betalactams", label: "Pénicilline", timing: "delayed" }] }, surgery: { ...emptySurgery(), name: "Prothèse totale de hanche", category: "K" } });
    expect(points(delayed).find((p) => p.id === "antibioprophylaxis")?.detail).toMatch(/céfazoline utilisable/);
  });

  it("restricts endocarditis prophylaxis to risky dental care in high-risk patients", () => {
    const valve = { mechanical_valve: { present: true } };
    const dental = base({ conditions: valve, surgery: { ...emptySurgery(), name: "Extractions dentaires", category: "E" } });
    expect(points(dental).find((p) => p.id === "endocarditis-prophylaxis")?.title).toBe("Prophylaxie de l'endocardite indiquée");
    const hip = base({ conditions: valve, surgery: { ...emptySurgery(), name: "Prothèse totale de hanche", category: "K" } });
    expect(points(hip).find((p) => p.id === "endocarditis-prophylaxis")?.level).toBe("info");
  });

  it("warns against nasal intubation with a haemostasis disorder, and against the LMA with a full stomach", () => {
    const c = base({ conditions: { hemophilia: { present: true }, gerd: { present: true } }, surgery: { ...emptySurgery(), name: "Ostéotomie mandibulaire", category: "E" } });
    const p = points(c);
    expect(p.some((x) => x.id === "nasal-intubation")).toBe(true);
    expect(p.find((x) => x.id === "lma-caution")?.why).toMatch(/reflux/);
  });

  it("keeps antibiotic cautions for when they are in the plan", () => {
    const c = base({ conditions: { ckd: { present: true } } });
    expect(points(c, emptyProtocolContent()).find((p) => p.id === "drugs-avoid")?.detail ?? "").not.toMatch(/Gentamicine/);
    expect(drugReferenceFor("Céfazoline 2 g")?.name).toBe("Céfazoline");
  });

  it("adds the chapter 20 draft rules after the existing ones (stable ids)", () => {
    const last = MANUAL_RULES.at(-1)!;
    expect(MANUAL_RULES.some((r) => /Chapitre 20/.test(r.source.title))).toBe(true);
    expect(MANUAL_RULES.some((r) => /Chapitre 23/.test(r.source.title))).toBe(true);
    expect(last.source.title).toMatch(/Chapitre 29/);
    expect(new Set(MANUAL_RULES.map((r) => r.id)).size).toBe(MANUAL_RULES.length);
    expect(MANUAL_RULES.find((r) => r.title.startsWith("Infection à distance"))?.action.target).toBe("surgery");
  });
});
