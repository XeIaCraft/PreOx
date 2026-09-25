import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, emptySurgery, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { drugReferenceFor, formatReferenceDose } from "./drug-reference";

const base = (patch: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), ...patch });
const patient = (patch: Partial<ConsultationState["patient"]>) => ({ ...emptyConsultation().patient, ...patch });
const points = (c: ConsultationState, plan: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] }) => attentionPoints(c, consultationScores(c, { plan }), plan);

describe("Manuel pratique d'anesthésie 2020, chapitres 21–25", () => {
  it("estimates the tolerated blood loss (book example: 70 kg, Hb 14 → 7)", () => {
    const c = base({ patient: patient({ age: 40, weightKg: 70, hb: 14 }) });
    const p = points(c).find((x) => x.id === "blood-loss")!;
    // (14 − 7) / 10,5 × 4 900 ml = 3 267 ml → 3 250 when rounded to 50 ml.
    expect(p.title).toBe("Pertes sanguines tolérables ≈ 3250 ml avant transfusion");
    const elderlyCardiac = base({ patient: patient({ age: 78, weightKg: 70, hb: 9 }), conditions: { coronary: { present: true } } });
    expect(points(elderlyCardiac).find((x) => x.id === "blood-loss")?.title).toMatch(/déjà au seuil transfusionnel \(9\)/);
  });

  it("chooses saline and warns against colloids when relevant", () => {
    const c = base({ conditions: { heart_failure: { present: true } }, patient: patient({ sodium: 130 }) });
    const f = points(c).find((x) => x.id === "fluids")!;
    expect(f.detail).toMatch(/NaCl 0,9 %/);
    expect(f.detail).toMatch(/Colloïdes contre-indiqués \(insuffisance cardiaque\)/);
  });

  it("organises the day for a malignant hyperthermia susceptible patient", () => {
    const c = base({ conditions: { malignant_hyperthermia: { present: true } }, patient: patient({ weightKg: 80 }) });
    const mh = points(c).find((x) => x.id === "mh-plan")!;
    expect(mh.detail).toMatch(/≈ 200 mg, 10 flacons/);
    expect(mh.material?.[0]).toMatch(/40 flacons/);
  });

  it("adapts the analgesia to renal failure and sleep apnoea", () => {
    const c = base({ conditions: { ckd: { present: true }, osa: { present: true } } });
    const a = points(c).find((x) => x.id === "analgesia-strategy")!;
    expect(a.detail).toMatch(/AINS proscrits/);
    expect(a.detail).toMatch(/CPAP/);
  });

  it("flags laryngospasm, PONV surgery and a prolonged motor block to watch", () => {
    const c = base({ patient: patient({ age: 8 }), conditions: { recent_uri: { present: true } }, surgery: { ...emptySurgery(), name: "Amygdalectomie" } });
    const p = points(c);
    expect(p.some((x) => x.id === "laryngospasm")).toBe(true);
    expect(p.find((x) => x.id === "ponv")?.title).toBe("Chirurgie émétisante : NVPO");
    const spinal = points(base(), { ...emptyProtocolContent(), techniques: ["neuraxial"] });
    expect(spinal.find((x) => x.id === "motor-block")?.risk?.title).toBe("Bloc moteur prolongé");
  });

  it("shows AIVOC targets in ng/ml without offering them as a plan dose", () => {
    const remi = drugReferenceFor("Rémifentanil")!.doses.find((d) => d.label.startsWith("AIVOC"))!;
    expect(remi.mode).toBe("rate");
    expect(formatReferenceDose(remi)).toBe("0,5–8 ng/ml");
    expect(drugReferenceFor("Novalgine 1 g")?.name).toBe("Métamizole");
  });
});
