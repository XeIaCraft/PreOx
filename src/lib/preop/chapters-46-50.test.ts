import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, emptySurgery, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { drugReferenceFor } from "./drug-reference";
import { recommendExams } from "./exams";
import { evaluateRule } from "./rules/engine";
import { MANUAL_RULES } from "./rules/proposed-manual";
import type { PatientContext, Rule } from "./rules/types";

const base = (patch: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), ...patch });
const patient = (patch: Partial<ConsultationState["patient"]>) => ({ ...emptyConsultation().patient, ...patch });
const surgery = (name: string) => ({ ...emptySurgery(), name });
const GA: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] };
const find = (c: ConsultationState, id: string) => attentionPoints(c, consultationScores(c, { plan: GA }), GA).find((x) => x.id === id);

describe("Manuel pratique d'anesthésie 2020, chapitres 46–50", () => {
  it("gives the organ donor targets and the heparin dose", () => {
    const p = find(base({ patient: patient({ weightKg: 70 }), surgery: surgery("Prélèvement multi-organes") }), "organ-donor")!;
    expect(p.detail).toMatch(/PAM 60–90 mmHg/);
    expect(p.detail).toMatch(/≈ 21000–42000 UI/);
  });

  it("flags hyperbaric oxygen contraindications", () => {
    const p = find(base({ conditions: { home_o2: { present: true }, asthma: { present: true } }, surgery: surgery("Séance d'oxygénothérapie hyperbare (caisson)") }), "hyperbaric")!;
    expect(p.level).toBe("high");
    expect(p.detail).toMatch(/Contre-indication absolue : BPCO sous oxygène/);
    expect(p.detail).toMatch(/Contre-indication relative : asthme/);
  });

  it("prepares a septic patient and its exams", () => {
    const c = base({ patient: patient({ weightKg: 80 }), conditions: { septic_shock: { present: true } } });
    expect(find(c, "septic-shock")!.detail).toMatch(/\(≈ 2400 ml\)/);
    expect(recommendExams({ consultation: c, asa: 4 }).recommendations.find((r) => r.code === "abg")?.strength).toBe("recommended");
    expect(drugReferenceFor("Vasopressine")).toBeDefined();
  });

  it("sets the glucose target from HbA1c", () => {
    expect(find(base({ patient: patient({ hba1c: 8.2 }), conditions: { diabetes_insulin: { present: true } } }), "diabetes-plan")!.detail).toMatch(/6,1–8,9 mmol\/l/);
  });

  it("adds the draft rules at the end", () => {
    const rule = MANUAL_RULES.find((r) => r.title.startsWith("Choc septique : remplissage"))! as Rule;
    expect(evaluateRule(rule, { treatments: [], techniques: [], conditions: { septic_shock: { present: true } } } as unknown as PatientContext)).not.toBeNull();
    expect(MANUAL_RULES.at(-1)!.source.title).toMatch(/Chapitre 51/);
  });
});
