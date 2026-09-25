import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, emptySurgery, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { cautionsFor, drugReferenceFor } from "./drug-reference";
import { recommendExams } from "./exams";
import { patientInstructions, patientSheet } from "./instructions";
import { evaluateRule } from "./rules/engine";
import { MANUAL_RULES } from "./rules/proposed-manual";
import type { PatientContext, Rule } from "./rules/types";

const base = (patch: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), ...patch });
const patient = (patch: Partial<ConsultationState["patient"]>) => ({ ...emptyConsultation().patient, ...patch });
const surgery = (name: string, patch: Partial<ConsultationState["surgery"]> = {}) => ({ ...emptySurgery(), name, ...patch });
const GA: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] };
const points = (c: ConsultationState, plan: ProtocolContent = GA) => attentionPoints(c, consultationScores(c, { plan }), plan);
const find = (c: ConsultationState, id: string, plan?: ProtocolContent) => points(c, plan).find((x) => x.id === id);

describe("Manuel pratique d'anesthésie 2020, chapitres 36–40", () => {
  it("advises against elective surgery in the first trimester", () => {
    const p = find(base({ conditions: { pregnancy: { present: true, details: { weeks: 10 } } }, surgery: surgery("Cholécystectomie par cœlioscopie") }), "pregnancy-plan")!;
    expect(p.title).toMatch(/10 SA, 1er trimestre/);
    expect(p.detail).toMatch(/déconseillée/);
    expect(p.detail).toMatch(/pas de protoxyde d'azote/);
    expect(p.detail).not.toMatch(/Dès 15 SA/);
  });

  it("prepares a caesarean section with pre-eclampsia", () => {
    const c = base({ patient: patient({ platelets: 70 }), conditions: { pregnancy: { present: true, details: { rhesus: "neg" } }, preeclampsia: { present: true } }, surgery: surgery("Césarienne en urgence") });
    const cs = find(c, "caesarean")!;
    expect(cs.detail).toMatch(/sauf prééclampsie \(rémifentanil/);
    expect(cs.detail).toMatch(/anti-D 200 µg/);
    expect(find(c, "preeclampsia-plan")!.detail).toMatch(/sous le seuil de 75 G\/L/);
    expect(find(c, "pregnancy-plan")).toBeUndefined();
  });

  it("gives a child's sizes, doses and fluids", () => {
    const c = base({ patient: patient({ age: 4, weightKg: 16, sex: "M", heightCm: 105 }) });
    const p = find(c, "paediatric")!;
    expect(p.title).toBe("Enfant de 4 ans (16 kg) : repères");
    expect(p.detail).toMatch(/sonde 5 sans ballonnet ou 4,5 à ballonnet/);
    expect(p.detail).toMatch(/14 cm aux lèvres/);
    expect(p.detail).toMatch(/masque laryngé 2/);
    expect(p.detail).toMatch(/Entretien 4-2-1 : 52 ml\/h/);
    expect(p.detail).toMatch(/atropine 0,02 mg\/kg \(0,32 mg\)/);
    expect(find(c, "ventilation")).toBeUndefined();
    expect(points(c).some((x) => /^IMC/.test(x.title))).toBe(false);
  });

  it("flags postoperative apnoea in a former preterm infant", () => {
    const c = base({ patient: patient({ age: 0.25, weightKg: 4 }), conditions: { ex_premature: { present: true, details: { birthWeeks: 32 } } }, surgery: surgery("Cure de hernie inguinale") });
    const p = find(c, "infant-apnoea")!;
    expect(p.level).toBe("high");
    expect(p.title).toMatch(/45 semaines/);
    expect(find(c, "paediatric")!.detail).toMatch(/pas d'AINS avant 6 mois/);
  });

  it("covers eye surgery and eye drops", () => {
    expect(find(base({ surgery: surgery("Chirurgie du strabisme", { category: "I" }) }), "eye-surgery")!.detail).toMatch(/Réflexe oculocardiaque/);
    const cataract = find(base({ surgery: surgery("Cataracte", { category: "I" }), treatments: [{ id: "t", atc: "B01AF02", name: "Apixaban" }] }), "eye-surgery")!;
    expect(cataract.detail).toMatch(/AVK et AOD poursuivis/);
    expect(find(base({ treatments: [{ id: "t", atc: "S01ED01", name: "Timolol collyre" }] }), "eye-drops")!.detail).toMatch(/bradycardie/);
    const sheet = patientSheet(base({ surgery: surgery("Vitrectomie") }), patientInstructions(base(), { findings: [], gaps: [], missing: [] } as never), {});
    expect(sheet.flatMap((s) => s.lines).join(" ")).toMatch(/ni avion ni montagne/);
  });

  it("prepares ENT laser surgery", () => {
    const p = find(base({ surgery: surgery("Laser laryngé ou trachéal", { category: "C" }) }), "ent-airway")!;
    expect(p.level).toBe("medium");
    expect(p.detail).toMatch(/FiO₂ 0,21–0,3/);
    expect(p.material).toContain("Sonde laser");
  });

  it("covers hip fracture, cement, knee strategy and tourniquet", () => {
    const hip = base({ patient: patient({ age: 86 }), surgery: surgery("Prothèse intermédiaire de hanche", { category: "K" }) });
    expect(find(hip, "hip-fracture")!.detail).toMatch(/ilio-fascial/);
    expect(find(hip, "cement")!.why).toMatch(/fracture de hanche, 86 ans/);
    expect(recommendExams({ consultation: hip, asa: 3 }).recommendations.some((r) => r.code === "group")).toBe(true);
    const knee = base({ patient: patient({ weightKg: 80 }), surgery: surgery("Prothèse totale de genou", { category: "K" }) });
    expect(find(knee, "ortho-strategy")!.detail).toMatch(/≈ 800–1200 mg/);
    const tq = find(base({ conditions: { pad: { present: true } }, patient: patient({ sbp: 140 }), surgery: surgery("Chirurgie de la main", { category: "K", tourniquet: true }) }), "tourniquet")!;
    expect(tq.level).toBe("high");
    expect(tq.detail).toMatch(/≈ 210–240 et 240–290 mmHg/);
  });

  it("adds cautions and draft rules", () => {
    const sux = cautionsFor(drugReferenceFor("Succinylcholine")!, { conditions: {}, treatments: [{ id: "t", atc: "S01EB03", name: "Échothiophate" }], conditionLabel: (id) => id });
    expect(sux.some((f) => /4–6 semaines/.test(f.caution.text))).toBe(true);
    const uri = MANUAL_RULES.find((r) => r.title.startsWith("Enfant avec infection"))! as Rule;
    const ctx = (age: number): PatientContext => ({ age, treatments: [], techniques: [], conditions: { recent_uri: { present: true } }, surgery: { urgency: "elective" } }) as unknown as PatientContext;
    expect(evaluateRule(uri, ctx(5))).not.toBeNull();
    expect(evaluateRule(uri, ctx(40))).toBeNull();
    expect(recommendExams({ consultation: base({ conditions: { preeclampsia: { present: true } } }), asa: 2 }).recommendations.find((r) => r.code === "haemostasis")?.strength).toBe("recommended");
    expect(MANUAL_RULES.at(-1)!.source.title).toMatch(/Chapitre 45/);
  });
});
