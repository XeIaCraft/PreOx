import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, emptySurgery, type ConsultationState } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { drugReferenceFor } from "./drug-reference";
import { recommendExams } from "./exams";
import { evaluateRule } from "./rules/engine";
import { MANUAL_RULES } from "./rules/proposed-manual";
import { parseQuickEntry } from "./quick-entry";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import type { PatientContext, Rule } from "./rules/types";

const base = (patch: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), ...patch });
const patient = (patch: Partial<ConsultationState["patient"]>) => ({ ...emptyConsultation().patient, ...patch });
const surgery = (name: string, patch: Partial<ConsultationState["surgery"]> = {}) => ({ ...emptySurgery(), name, ...patch });
const GA: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] };
const find = (c: ConsultationState, id: string, plan: ProtocolContent = GA) => attentionPoints(c, consultationScores(c, { plan }), plan).find((x) => x.id === id);

describe("Manuel pratique d'anesthésie 2020, chapitres 41–45", () => {
  it("plans a rapid sequence induction, with rocuronium when succinylcholine is contraindicated", () => {
    const c = base({ patient: patient({ weightKg: 80, sex: "M", heightCm: 180 }), conditions: { bowel_obstruction: { present: true }, hemiplegia: { present: true } }, surgery: surgery("Laparotomie pour occlusion") });
    const p = find(c, "rsi")!;
    expect(p.why).toMatch(/occlusion/);
    expect(p.detail).toMatch(/Succinylcholine contre-indiquée : rocuronium 1,2 mg\/kg du poids idéal \(≈ 90 mg\)/);
    expect(p.material).toContain("Sugammadex 16 mg/kg");
    expect(find(base({ surgery: surgery("Hernie inguinale") }), "rsi")).toBeUndefined();
    expect(parseQuickEntry("Antécédents : SAOS, RGO", DEFAULT_CATALOGS as never).conditions.map((x) => x.id)).toContain("gerd");
  });

  it("guides damage control in major trauma", () => {
    const p = find(base({ patient: patient({ sbp: 82, hr: 130 }), conditions: { major_trauma: { present: true } } }), "trauma")!;
    expect(p.detail).toMatch(/déjà PAS 82 < 90, FC 130 > 120/);
    expect(p.detail).toMatch(/Acide tranexamique 1 g en 10 min/);
  });

  it("computes burn resuscitation and the Ryan score", () => {
    const p = find(base({ patient: patient({ age: 65, weightKg: 70 }), conditions: { burns: { present: true, details: { tbsa: 45, inhalation: "yes" } } } }), "burns-plan")!;
    expect(p.detail).toMatch(/≈ 6300 ml de cristalloïde, la moitié \(3150 ml\)/);
    expect(p.detail).toMatch(/Score de Ryan 3\/3.*≈ 90 %/);
    expect(drugReferenceFor("Cyanokit")?.name).toBe("Hydroxocobalamine");
  });

  it("adapts to the elderly, the obese and sleep apnoea", () => {
    expect(find(base({ patient: patient({ age: 82 }) }), "elderly-plan")!.detail).toMatch(/succinylcholine inchangée/);
    const obese = base({ patient: patient({ sex: "F", heightCm: 165, weightKg: 130, neckCm: 45 }), conditions: { osa: { present: true, details: { ahi: "severe", cpap: "no" } } } });
    const o = find(obese, "obesity-plan")!;
    expect(o.level).toBe("medium");
    expect(o.detail).toMatch(/succinylcholine 1 mg\/kg au poids réel, ≤ 150 mg \(≈ 130 mg\)/);
    expect(o.detail).toMatch(/rocuronium 0,6 mg\/kg ≈ \d+ mg/);
    expect(find(obese, "osa-plan")!.level).toBe("medium");
    expect(drugReferenceFor("Rocuronium")!.doses[0].basis).toBe("ideal");
  });

  it("lists cancer treatment toxicities and exams", () => {
    const c = base({ conditions: { cancer: { present: true } }, treatments: [{ id: "t", atc: "L01DB01", name: "Doxorubicine" }, { id: "u", atc: "L01DC01", name: "Bléomycine" }] });
    const p = find(c, "oncology")!;
    expect(p.level).toBe("medium");
    expect(p.detail).toMatch(/Anthracyclines/);
    expect(p.detail).toMatch(/FiO₂ minimale/);
    const exams = recommendExams({ consultation: c, asa: 2 }).recommendations;
    expect(exams.find((r) => r.code === "echo")?.strength).toBe("recommended");
    expect(exams.some((r) => r.code === "pft")).toBe(true);
  });

  it("flags anaesthesia outside the theatre", () => {
    expect(find(base({ surgery: surgery("Cholangiopancréatographie rétrograde (CPRE)") }), "remote-location")!.detail).toMatch(/capnographie/);
  });

  it("adds the draft rules at the end", () => {
    const tx = MANUAL_RULES.find((r) => r.title.startsWith("Polytraumatisé"))! as Rule;
    const ctx = { treatments: [], techniques: [], conditions: { major_trauma: { present: true } } } as unknown as PatientContext;
    expect(evaluateRule(tx, ctx)).not.toBeNull();
    expect(MANUAL_RULES.at(-1)!.source.title).toMatch(/Chapitre 45/);
  });
});
