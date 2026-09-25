import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, emptySurgery, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { cautionsFor, drugReferenceFor } from "./drug-reference";
import { evaluateRule } from "./rules/engine";
import { MANUAL_RULES } from "./rules/proposed-manual";
import type { PatientContext, Rule } from "./rules/types";

const base = (patch: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), ...patch });
const patient = (patch: Partial<ConsultationState["patient"]>) => ({ ...emptyConsultation().patient, ...patch });
const points = (c: ConsultationState, plan: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] }) => attentionPoints(c, consultationScores(c, { plan }), plan);

describe("Manuel pratique d'anesthésie 2020, chapitres 31–35", () => {
  it("prepares a dialysis patient", () => {
    const p = points(base({ conditions: { dialysis: { present: true } } })).find((x) => x.id === "renal-plan")!;
    expect(p.level).toBe("medium");
    expect(p.detail).toMatch(/bras de la fistule/);
  });

  it("flags potassium and sodium disorders", () => {
    const high = points(base({ patient: patient({ potassium: 6.3 }) })).find((x) => x.id === "electrolytes")!;
    expect(high.level).toBe("high");
    expect(high.detail).toMatch(/pas de succinylcholine/);
    const mild = points(base({ patient: patient({ potassium: 3.2 }) })).find((x) => x.id === "electrolytes")!;
    expect(mild.level).toBe("medium");
    expect(points(base({ patient: patient({ sodium: 152 }) })).find((x) => x.id === "electrolytes")?.detail).toMatch(/> 150 mmol\/l/);
  });

  it("prepares a pheochromocytoma and blocks ketamine", () => {
    const c = base({ conditions: { pheochromocytoma: { present: true } } });
    expect(points(c).find((x) => x.id === "pheo-plan")?.detail).toMatch(/Alphabloquant d'abord/);
    const found = cautionsFor(drugReferenceFor("Kétamine")!, { conditions: c.conditions, treatments: [], conditionLabel: (id) => id });
    expect(found.some((f) => f.caution.level === "contraindicated")).toBe(true);
  });

  it("converts corticosteroids to prednisone equivalents", () => {
    const c = base({ treatments: [{ id: "t", atc: "H02AB04", name: "Médrol", dailyDoseMg: 8 }] });
    const p = points(c).find((x) => x.id === "steroid-cover")!;
    expect(p.title).toMatch(/≈ 10 mg\/j/);
    expect(p.material).toContain("Hydrocortisone 100 mg");
    const low = points(base({ treatments: [{ id: "t", atc: "H02AB07", name: "Prednisone", dailyDoseMg: 2.5 }] }));
    expect(low.some((x) => x.id === "steroid-cover")).toBe(false);
  });

  it("lists porphyrinogenic drugs", () => {
    const conditions = { porphyria: { present: true } };
    expect(points(base({ conditions })).find((x) => x.id === "porphyria-plan")?.level).toBe("high");
    expect(cautionsFor(drugReferenceFor("Tramadol")!, { conditions, treatments: [], conditionLabel: (id) => id }).length).toBeGreaterThan(0);
  });

  it("evaluates the potassium draft rule on the value and the urgency", () => {
    const rule = MANUAL_RULES.find((r) => r.title.startsWith("Hyperkaliémie"))! as Rule;
    const ctx = (potassium: number, urgency: string): PatientContext => ({ treatments: [], techniques: [], potassium, surgery: { urgency } }) as unknown as PatientContext;
    expect(evaluateRule(rule, ctx(6.1, "elective"))).not.toBeNull();
    expect(evaluateRule(rule, ctx(4.2, "elective"))).toBeNull();
    expect(evaluateRule(rule, ctx(6.1, "emergency"))).toBeNull();
    expect(MANUAL_RULES.at(-1)!.source.title).toMatch(/Chapitre 47/);
  });

  it("adds the prostate resection advice", () => {
    const p = points(base({ surgery: { ...emptySurgery(), name: "Résection endoscopique de prostate (RTUP)" } })).find((x) => x.id === "urology")!;
    expect(p.detail).toMatch(/Syndrome de résection/);
  });
});
