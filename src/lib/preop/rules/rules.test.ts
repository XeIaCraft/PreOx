import { describe, expect, it } from "vitest";
import { evaluate, evaluateRule, findGaps } from "./engine";
import { detectLevel, parseAnswer } from "./parse-answer";
import { buildQuestion } from "./question";
import { findClearance, findDrugs, findHours, suggestStructure } from "./structure";
import type { PatientContext, Rule } from "./types";

function rule(partial: Partial<Rule> & Pick<Rule, "conditions" | "action">): Rule {
  return {
    id: partial.id ?? "r",
    title: "",
    statement: "",
    source: { organisation: "ESAIC/ESRA", title: "", year: 2022, doi: "", pmid: "", quote: "", grade: "1C", level: "eu" },
    divergences: [],
    explanations: [],
    status: "active",
    version: 1,
    verified_at: "2026-09-24T00:00:00Z",
    review_at: "2027-12-31",
    question: "",
    tool: "",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

// Fictitious rules, for the mechanics only.
const rivaroxaban72h = rule({
  id: "riva72",
  conditions: [
    { kind: "drug", atc: "B01AF01", dailyDose: { op: ">=", mg: 20 } },
    { kind: "technique", in: ["neuraxial"] },
    { kind: "value", value: "crcl", op: ">=", threshold: 30 },
  ],
  action: { type: "stop_before", hours: 72 },
});

const patient = (extra: Partial<PatientContext> = {}): PatientContext => ({
  age: 72,
  sex: "M",
  weightKg: 88,
  heightCm: 176,
  creatinineMgDl: 1.5,
  treatments: [{ id: "t1", atc: "B01AF01", name: "Rivaroxaban", dailyDoseMg: 20, lastDoseAt: "2026-10-05T20:00:00.000Z" }],
  techniques: ["neuraxial"],
  plannedAt: "2026-10-08T08:00:00.000Z",
  ...extra,
});

describe("engine", () => {
  it("applies a delay rule and computes the deadline and the conflict", () => {
    const f = evaluateRule(rivaroxaban72h, patient());
    expect(f?.status).toBe("applies");
    const out = f!.outcomes[0];
    expect(out).toMatchObject({ kind: "stop_before", lastDoseBy: "2026-10-05T08:00:00.000Z" });
    // Last dose 5 Oct 20:00 is after the deadline → earliest gesture 8 Oct 20:00.
    expect(out.kind === "stop_before" && out.conflict?.earliestAt).toBe("2026-10-08T20:00:00.000Z");
  });

  it("doesn't apply to another drug, another gesture or a lower dose", () => {
    expect(evaluateRule(rivaroxaban72h, patient({ techniques: ["general"] }))).toBeNull();
    expect(evaluateRule(rivaroxaban72h, patient({ treatments: [{ id: "t", atc: "B01AF02", name: "Apixaban" }] }))).toBeNull();
    expect(evaluateRule(rivaroxaban72h, patient({ treatments: [{ id: "t", atc: "B01AF01", name: "Rivaroxaban", dailyDoseMg: 10 }] }))).toBeNull();
  });

  it("asks for what's missing instead of guessing (dose, creatinine)", () => {
    const f = evaluateRule(rivaroxaban72h, patient({ creatinineMgDl: undefined, treatments: [{ id: "t1", atc: "B01AF01", name: "Rivaroxaban" }] }));
    expect(f?.status).toBe("needs_info");
    expect(f!.missing.map((m) => m.key)).toEqual(["dose:t1", "creatinine"]);
  });

  it("depends on the indication: primary vs secondary prevention", () => {
    const aspirinPrimary = rule({
      id: "asa-primary",
      conditions: [{ kind: "drug", atc: "B01AC06", indications: ["primary_prevention"] }],
      action: { type: "stop_before", hours: 7 * 24 },
    });
    const aspirinSecondary = rule({
      id: "asa-secondary",
      conditions: [{ kind: "drug", atc: "B01AC06", indications: ["secondary_prevention_coronary", "coronary_stent"] }],
      action: { type: "info", text: "Poursuivre l'aspirine" },
    });
    const base = patient({ treatments: [{ id: "a", atc: "B01AC06", name: "Acide acétylsalicylique" }] });
    // Indication unknown → both rules ask the same question, asked once.
    const unknown = evaluate([aspirinPrimary, aspirinSecondary], base);
    expect(unknown.missing).toEqual([{ key: "indication:a", label: "Indication de Acide acétylsalicylique (pourquoi le patient le prend)", treatmentId: "a" }]);
    const secondary = evaluate([aspirinPrimary, aspirinSecondary], { ...base, treatments: [{ ...base.treatments[0], indication: "coronary_stent" }] });
    expect(secondary.findings.map((f) => f.rule.id)).toEqual(["asa-secondary"]);
  });

  it("the time since a stent changes the rule that applies", () => {
    const recentStent = rule({
      id: "stent<6m",
      conditions: [{ kind: "drug", atc: "B01AC04", indications: ["coronary_stent"], monthsSinceEvent: { op: "<", months: 6 } }],
      action: { type: "requirement", text: "Avis cardiologique avant tout arrêt", blocking: true },
    });
    const ctx = patient({ treatments: [{ id: "c", atc: "B01AC04", name: "Clopidogrel", indication: "coronary_stent", eventDate: "2026-07-01" }] });
    expect(evaluateRule(recentStent, ctx)?.status).toBe("applies");
    expect(evaluateRule(recentStent, { ...ctx, treatments: [{ ...ctx.treatments[0], eventDate: "2025-01-01" }] })).toBeNull();
  });

  it("when two sources disagree, the higher level wins and the other is shown", () => {
    const gihp5days = rule({ ...rivaroxaban72h, id: "gihp", source: { ...rivaroxaban72h.source, organisation: "GIHP", level: "int", year: 2017 }, action: { type: "stop_before", hours: 120 } });
    const res = evaluate([gihp5days, rivaroxaban72h], patient());
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].rule.id).toBe("riva72");
    expect(res.findings[0].overridden.map((r) => r.id)).toEqual(["gihp"]);
  });

  it("a class-wide rule and a drug-specific one on the same point: hierarchy still applies", () => {
    const gihpClass = rule({
      id: "gihp-class",
      source: { ...rivaroxaban72h.source, organisation: "GIHP", level: "int", year: 2017 },
      conditions: [{ kind: "drug", atc: "B01AF" }, { kind: "technique", in: ["neuraxial"] }],
      action: { type: "stop_before", hours: 120 },
    });
    const res = evaluate([gihpClass, rivaroxaban72h], patient());
    expect(res.findings.map((f) => f.rule.id)).toEqual(["riva72"]);
    expect(res.findings[0].overridden.map((r) => r.id)).toEqual(["gihp-class"]);
    // With only the class-wide rule, it applies.
    expect(evaluate([gihpClass], patient()).findings[0].outcomes[0]).toMatchObject({ kind: "stop_before", hours: 120 });
  });

  it("a local protocol applies only in its hospital", () => {
    const local = rule({ ...rivaroxaban72h, id: "local", source: { ...rivaroxaban72h.source, level: "local", hospital: "CHU Tivoli" }, action: { type: "stop_before", hours: 96 } });
    expect(evaluate([local, rivaroxaban72h], patient({ hospital: "CHU Tivoli" })).findings[0].rule.id).toBe("local");
    expect(evaluate([local, rivaroxaban72h], patient({ hospital: "Erasme" })).findings[0].rule.id).toBe("riva72");
  });

  it("finds the situations that have no rule", () => {
    const ctx = patient({ treatments: [{ id: "e", atc: "B01AF03", name: "Edoxaban" }, { id: "s", atc: "A10BK03", name: "Empagliflozine" }, { id: "b", atc: "C07AB07", name: "Bisoprolol" }] });
    expect(findGaps([rivaroxaban72h], ctx).map((g) => g.label)).toEqual([
      "Aucune règle d'arrêt de Edoxaban avant ponction neuraxiale (rachi, péridurale, cathéter)",
      "Aucune règle d'arrêt de Empagliflozine avant l'intervention",
    ]);
    // A class-wide rule (all xabans) covers edoxaban.
    const xabans = rule({ id: "x", conditions: [{ kind: "drug", atc: "B01AF" }, { kind: "technique", in: ["neuraxial"] }], action: { type: "stop_before", hours: 72 } });
    expect(findGaps([xabans], ctx).map((g) => g.treatment.name)).toEqual(["Empagliflozine"]);
  });

  it("flags rules past their review date", () => {
    expect(evaluateRule({ ...rivaroxaban72h, review_at: "2026-01-01" }, patient(), "2026-09-24T00:00:00.000Z")?.toRecheck).toBe(true);
  });
});

// Written in the format of a real Consensus answer, with the same defects seen in the first test:
// a DOI re-typed differently in the block than in the bibliography, a block citing a paper absent
// from the bibliography, prose and a table around the blocks.
const ANSWER = `# Intervalle minimum 72 h

Les recommandations européennes convergent (Kietaibl et al., 2022).

## Recommandations

RÈGLE: Pour le rivaroxaban à dose élevée (20 mg une fois par jour), observer un minimum de 72 heures entre la dernière prise et toute procédure neuraxiale.
CONDITIONS: Rivaroxaban 20 mg/jour, CrCl ≥ 30 mL/min, bloc neuraxial électif.
SOURCE: ESAIC/ESRA, Regional anaesthesia in patients on antithrombotic drugs, 2022
PMID: aucun
DOI: 10.1097/EJA.0000000000009999
CITATION: In high doses of DOACs the last intake should be a minimum of 72h before neuraxial procedures.
NIVEAU: 1C

RÈGLE: Les xabans à dose thérapeutique peuvent nécessiter jusqu'à cinq jours d'arrêt avant une anesthésie neuraxiale.
CONDITIONS: Xabans, CrCl > 30 mL/min, anesthésie neuraxiale.
SOURCE: GIHP / SFAR, Management of direct oral anticoagulants, updated guidelines, 2015
PMID: 12345678
DOI: 10.1016/j.accpm.2016.09.002
CITATION: Neuraxial anesthesia needs a longer interruption time, up to five days for xabans.
NIVEAU: non précisé

RÈGLE: L'arrêt de 72 heures correspond à environ cinq demi-vies.
CONDITIONS: Rivaroxaban, fonction rénale normale.
SOURCE: Douketis et al., Comment on periprocedural management, 2015
PMID: 99999999
DOI: 10.1097/AAP.0000000000000001
CITATION: The interruption intervals allow at least 5 elimination half-lives.
NIVEAU: non précisé

## Désaccord

| Source | Intervalle |
|---|---|
| ESAIC | 72 h |

Points clés en prose, à ignorer.

## References

Albaladéjo, P., Bonhomme, F., & Susen, S. (2017). Management of direct oral anticoagulants in patients undergoing elective surgeries and invasive procedures: Updated guidelines from the French Working Group on Perioperative Hemostasis. *Anaesthesia, critical care & pain medicine, 36 1*, 73-76. https://doi.org/10.1016/j.accpm.2016.09.002

Kietaibl, S., Ferrandis, R., & Afshari, A. (2022). Regional anaesthesia in patients on antithrombotic drugs. *European Journal of Anaesthesiology, 39*, 100 - 132. https://doi.org/10.1097/eja.0000000000001600
`;

describe("parsing a pasted answer", () => {
  const parsed = parseAnswer(ANSWER);

  it("reads the blocks and the bibliography, ignores prose and tables", () => {
    expect(parsed.blocks).toHaveLength(3);
    expect(parsed.references.map((r) => r.firstAuthor)).toEqual(["Albaladéjo", "Kietaibl"]);
    expect(parsed.blocks[0]).toMatchObject({ grade: "1C", pmid: "", year: 2022, level: "eu" });
  });

  it("checks each block's DOI against the bibliography", () => {
    expect(parsed.blocks[0].checks).toContainEqual({ kind: "doi_mismatch", blockDoi: "10.1097/eja.0000000000009999", referenceDoi: "10.1097/eja.0000000000001600" });
    expect(parsed.blocks[1].checks).toContainEqual({ kind: "doi_matches_reference" });
    expect(parsed.blocks[2].checks).toContainEqual({ kind: "not_in_references" });
  });

  it("decides the source level itself and suggests rule vs explanation", () => {
    expect(parsed.blocks.map((b) => b.level)).toEqual(["eu", "int", "article"]);
    expect(parsed.blocks.map((b) => b.suggestedUse)).toEqual(["rule", "rule", "explanation"]);
    expect(detectLevel("KCE, Examens préopératoires, 2004")).toBe("be_inst");
    expect(detectLevel("SARB, consensus")).toBe("be_soc");
  });
});

describe("structuring a written rule", () => {
  it("finds drugs, gesture, delay and clearance thresholds", () => {
    expect(findDrugs("rivaroxaban (Xarelto) 20 mg")).toEqual(["B01AF01"]);
    expect(findDrugs("les xabans à dose thérapeutique")).toEqual(["B01AF"]);
    expect(findHours("minimum de 72 heures")).toBe(72);
    expect(findHours("jusqu'à cinq jours")).toBe(120);
    expect(findClearance("CrCl ≥ 30 mL/min")).toEqual([{ op: ">=", threshold: 30 }]);
    expect(findClearance("clairance 30–50 mL/min")).toEqual([
      { op: ">=", threshold: 30 },
      { op: "<", threshold: 50 },
    ]);
  });

  it("suggests the structured form of the first block", () => {
    const b = parseAnswer(ANSWER).blocks[0];
    const s = suggestStructure(b.statement, b.conditions);
    expect(s.action).toEqual({ type: "stop_before", hours: 72 });
    expect(s.conditions).toEqual([
      { kind: "drug", atc: "B01AF01", dailyDose: { op: ">=", mg: 20 } },
      { kind: "technique", in: ["neuraxial"] },
      { kind: "value", value: "crcl", op: ">=", threshold: 30 },
    ]);
    expect(s.unresolved).toEqual([]);
  });

  it("builds the question with the imposed answer format", () => {
    const q = buildQuestion({ question: "Delay before spinal for edoxaban?", context: "creatinine clearance 45 mL/min" });
    expect(q).toContain("Belgian guidance");
    expect(q).toContain("CITATION: exact sentence");
    expect(q).toContain("creatinine clearance 45 mL/min");
  });
});

describe("reading a rule back", () => {
  it("describes conditions and action in plain French", async () => {
    const { describeRule } = await import("./describe");
    expect(describeRule(rivaroxaban72h)).toBe(
      "Si traitement : Rivaroxaban, dose ≥ 20 mg/j et geste : ponction neuraxiale (rachi, péridurale, cathéter) et Clairance (Cockcroft-Gault) ≥ 30 mL/min → dernière prise au moins 72 h (3 jours) avant le geste."
    );
  });
});

describe("server validation of rules", () => {
  it("accepts a rule as the wizard builds it, refuses an unverified active rule", async () => {
    const { ruleSchema } = await import("./schema");
    const b = parseAnswer(ANSWER).blocks[0];
    const s = suggestStructure(b.statement, b.conditions);
    const draft = {
      ...rivaroxaban72h,
      id: "3f1c2a4e-9b7d-4c1e-8a2f-5d6e7f8a9b0c",
      statement: b.statement,
      conditions: s.conditions,
      action: s.action,
      source: { organisation: b.organisation, title: "Regional anaesthesia in patients on antithrombotic drugs", year: 2022, doi: b.reference?.doi ?? "", pmid: "", quote: b.quote, grade: b.grade, level: b.level },
      question: buildQuestion({ question: "q" }),
      tool: "Consensus",
    };
    const ok = ruleSchema.safeParse(draft);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    expect(ruleSchema.safeParse({ ...draft, status: "draft", verified_at: null }).success).toBe(true);
    expect(ruleSchema.safeParse({ ...draft, status: "active", verified_at: null }).success).toBe(false);
    expect(ruleSchema.safeParse({ ...draft, conditions: [] }).success).toBe(false);
  });
});

describe("surgery and antecedent conditions", () => {
  // Fictitious: aspirin in secondary prevention, kept unless the surgery bleeds a lot.
  const aspirin = rule({
    id: "asa",
    conditions: [
      { kind: "drug", atc: "B01AC06" },
      { kind: "history", condition: "coronary", present: true },
      { kind: "surgery", attribute: "bleedingRisk", in: ["low"] },
    ],
    action: { type: "info", text: "Poursuivre" },
  });
  const ctx = (extra: Partial<PatientContext>) => patient({ treatments: [{ id: "a", atc: "B01AC06", name: "Aspirine" }], ...extra });

  it("applies when the antecedent and the surgery match, asks for them when unknown", () => {
    expect(evaluateRule(aspirin, ctx({ conditions: { coronary: { present: true } }, surgery: { bleedingRisk: "low" } }), "2026-10-01T00:00:00Z")?.status).toBe("applies");
    expect(evaluateRule(aspirin, ctx({ conditions: { coronary: { present: true } }, surgery: { bleedingRisk: "high" } }), "2026-10-01T00:00:00Z")).toBeNull();
    const unknown = evaluateRule(aspirin, ctx({}), "2026-10-01T00:00:00Z");
    expect(unknown?.status).toBe("needs_info");
    expect(unknown!.missing.map((m) => m.label)).toEqual(["Antécédent : Coronaropathie", "Risque hémorragique de la chirurgie"]);
  });
});

describe("missing rules", () => {
  it("every treatment and flagged antecedent without a rule is a question to ask", async () => {
    const { missingRules } = await import("../rule-gaps");
    const { emptyConsultation } = await import("../dossier");
    const c = {
      ...emptyConsultation(),
      treatments: [
        { id: "a", atc: "B01AC06", name: "Aspirine" },
        { id: "p", atc: "N02BE01", name: "Paracétamol" },
        { id: "r", atc: "B01AF01", name: "Rivaroxaban" },
      ],
      surgery: { ...emptyConsultation().surgery, name: "PTG", bleedingRisk: "high" as const },
    };
    const gaps = missingRules([rivaroxaban72h], c, { pacemaker: { present: true }, hypertension: { present: true } }, { techniques: ["neuraxial"] });
    expect(gaps.map((g) => g.key)).toEqual(["t:a", "c:pacemaker"]);
    expect(gaps[0].question.question).toMatch(/aspirine .* neuraxial procedure/);
    expect(gaps[0].question.context).toContain("bleeding risk of the procedure: high");
    expect(gaps[0].question.preset).toEqual([{ kind: "drug", atc: "B01AC06" }]);
    expect(gaps[1].question.preset?.[0]).toMatchObject({ kind: "history", condition: "pacemaker" });
  });
});

describe("allergy conditions", () => {
  const cefazolinOk = rule({
    id: "cefa",
    conditions: [{ kind: "allergy", allergen: "betalactams", present: true, label: "Pénicillines", penFast: "low" }],
    action: { type: "info", text: "Céfazoline possible" },
  });
  const noAllergy = rule({ id: "none", conditions: [{ kind: "allergy", allergen: "betalactams", present: false }], action: { type: "info", text: "Céfazoline" } });
  const pen = (penFast: Record<string, boolean>) => patient({ allergyList: [{ allergenId: "betalactams", label: "Pénicilline", penFast }] });

  it("asks for allergies when they weren't asked, knows absence when they were", () => {
    expect(evaluateRule(noAllergy, patient())?.missing.map((m) => m.key)).toEqual(["allergies"]);
    expect(evaluateRule(noAllergy, patient({ noKnownAllergy: true }))?.status).toBe("applies");
    expect(evaluateRule(noAllergy, patient({ allergyList: [{ allergenId: "latex", label: "Latex" }] }))?.status).toBe("applies");
    expect(evaluateRule(noAllergy, pen({}))).toBeNull();
  });

  it("follows the side of the PEN-FAST threshold, and asks for the score while undecided", () => {
    expect(evaluateRule(cefazolinOk, pen({ withinFiveYears: false, anaphylaxisOrSevere: false }))?.status).toBe("applies");
    expect(evaluateRule(cefazolinOk, pen({ withinFiveYears: true, anaphylaxisOrSevere: true }))).toBeNull();
    const undecided = evaluateRule(cefazolinOk, pen({ withinFiveYears: true }));
    expect(undecided?.status).toBe("needs_info");
    expect(undecided?.missing[0].label).toContain("PEN-FAST");
  });

  it("an exam with a delay gives the date from which to do it", () => {
    const inr = rule({ id: "inr", conditions: [{ kind: "drug", atc: "B01AF" }], action: { type: "exam", exam: "INR", withinDays: 1 } });
    expect(evaluateRule(inr, patient())?.outcomes[0]).toMatchObject({ kind: "exam", notBefore: "2026-10-07T08:00:00.000Z" });
  });

  it("a reported allergy flagged in the catalogue is a question to ask, with the PEN-FAST score", async () => {
    const { missingRules } = await import("../rule-gaps");
    const { emptyConsultation } = await import("../dossier");
    const base = emptyConsultation();
    const c = { ...base, patient: { ...base.patient, allergyList: [{ allergenId: "betalactams", label: "Pénicilline", reaction: "urticaire", penFast: { withinFiveYears: false, anaphylaxisOrSevere: false, treatmentRequired: true } }] } };
    const gaps = missingRules([], c, {});
    expect(gaps.map((g) => g.key)).toEqual(["a:betalactams"]);
    expect(gaps[0].question.question).toContain("PEN-FAST score 1/5 (low risk");
    expect(gaps[0].question.preset?.[0]).toMatchObject({ kind: "allergy", allergen: "betalactams" });
    expect(missingRules([cefazolinOk], c, {})).toEqual([]);
  });
});

describe("structuring an allergy rule", () => {
  it("reads the allergy and the PEN-FAST side, not the alternative drug", () => {
    const s = suggestStructure("La céfazoline peut être utilisée si le score PEN-FAST est inférieur à 3.", "allergie déclarée à la pénicilline");
    expect(s.conditions).toEqual([{ kind: "allergy", allergen: "betalactams", present: true, label: "Pénicillines / bêtalactamines", penFast: "low" }]);
    expect(parseAnswer("RÈGLE: La céfazoline peut être utilisée si PEN-FAST < 3.\nSOURCE: ESAIC, x, 2023").blocks[0].suggestedUse).toBe("rule");
  });
});

describe("proposed rules", () => {
  it("are drafts the server accepts, with a verification question", async () => {
    const { PROPOSED_RULES } = await import("./proposed");
    const { ruleSchema } = await import("./schema");
    const ids = PROPOSED_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of PROPOSED_RULES) {
      const parsed = ruleSchema.safeParse(r);
      expect(parsed.success, `${r.title}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
      expect(r.status).toBe("draft");
      expect(r.verified_at).toBeNull();
      expect(r.question.length).toBeGreaterThan(20);
    }
  });

  it("the dabigatran drafts pick one delay per clearance band", async () => {
    const { PROPOSED_RULES } = await import("./proposed");
    const dabi = PROPOSED_RULES.filter((r) => r.title.startsWith("Dabigatran")).map((r) => ({ ...r, status: "active" as const, verified_at: "2026-01-01", created_at: "", updated_at: "" }));
    const at = (crcl: number) => {
      // Cockcroft-Gault ≈ crcl for these values: build a patient whose clearance is known.
      const ctx = patient({ treatments: [{ id: "d", atc: "B01AE07", name: "Dabigatran" }], age: 50, weightKg: 70, sex: "M", creatinineMgDl: (140 - 50) * 70 / (72 * crcl) });
      return evaluate(dabi, ctx, "2026-10-01T00:00:00Z").findings.filter((f) => f.status === "applies").map((f) => (f.rule.action as { hours: number }).hours);
    };
    expect(at(90)).toEqual([72]);
    expect(at(60)).toEqual([96]);
    expect(at(40)).toEqual([120]);
    expect(at(20)).toEqual([]);
  });
});
