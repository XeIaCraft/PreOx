import { describe, expect, it } from "vitest";
import { suggestAsa } from "./asa";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, type ConsultationState } from "./dossier";
import { recommendExams } from "./exams";
import { conditionsSummary, substanceSummary } from "./history";
import { SURGERY_CATALOG, searchSurgeries } from "./surgeries";

function consult(patch: Partial<ConsultationState>): ConsultationState {
  return { ...emptyConsultation(), ...patch };
}

describe("ASA suggestion", () => {
  it("takes the most severe antecedent and says why", () => {
    const s = suggestAsa({ weightKg: 80, heightCm: 175 }, { hypertension: { present: true }, coronary: { present: true } }, { tobacco: "current" });
    expect(s.asa).toBe(3);
    expect(s.reasons.map((r) => r.label)).toEqual(["coronaropathie", "HTA", "tabagisme actif"]);
  });
  it("recent events and severity raise the class; qualifiers matter", () => {
    expect(suggestAsa({}, { coronary: { present: true, recent: true } }, {}).asa).toBe(4);
    expect(suggestAsa({}, { hypertension: { present: true, poorlyControlled: true } }, {}).asa).toBe(3);
    expect(suggestAsa({ weightKg: 130, heightCm: 170 }, {}, {}).asa).toBe(3);
  });
  it("healthy when answered, nothing when nothing asked", () => {
    expect(suggestAsa({}, {}, {}).asa).toBeNull();
    expect(suggestAsa({ weightKg: 70, heightCm: 175 }, { hypertension: { present: false } }, { tobacco: "never" }).asa).toBe(1);
  });
});

describe("scores fed by antecedents, surgery and substance use", () => {
  it("never asks twice", () => {
    const pick = SURGERY_CATALOG.find((x) => x.name === "Cholécystectomie cœlioscopique")!;
    const c = consult({
      patient: { age: 70, sex: "F", weightKg: 70, heightCm: 160 },
      conditions: { hypertension: { present: true }, diabetes_insulin: { present: true }, coronary: { present: false }, heart_failure: { present: false }, stroke: { present: false }, ponv: { present: true } },
      substances: { tobacco: "never" },
      surgery: { ...emptyConsultation().surgery, name: pick.name, kce: pick.grade, cardiacRisk: pick.cardiacRisk, rcriHighRisk: pick.rcriHighRisk, incision: pick.incision, durationHours: 1.5 },
    });
    const { results, merged, asa } = consultationScores(c);
    expect(merged.rcri.merged).toMatchObject({ highRiskSurgery: true, insulin: true, ischemicHeartDisease: false });
    expect(results.rcri.value).toBe(2);
    expect(merged.stopBang.merged.pressure).toBe(true);
    expect(merged.apfel.merged).toMatchObject({ female: true, nonSmoker: true, history: true });
    expect(results.ariscat.missing).toBe(3); // SpO₂, Hb, respiratory infection — incision, duration and "not urgent" come from the surgery
    expect(asa).toBe(2);
  });
});

describe("recommended tests", () => {
  it("NICE grid: major surgery, ASA III → FBC, renal, ECG; diabetes → HbA1c", () => {
    const c = consult({ patient: { age: 60, sex: "M" }, conditions: { diabetes_oral: { present: true, poorlyControlled: true } }, surgery: { ...emptyConsultation().surgery, kce: "major", cardiacRisk: "low" } });
    const r = recommendExams({ consultation: c, asa: 3 });
    expect(r.recommendations.map((x) => `${x.code}:${x.strength}`)).toEqual(["ecg:recommended", "fbc:recommended", "renal:recommended", "hba1c:recommended"]);
    expect(r.missing).toEqual([]);
  });
  it("minor surgery, healthy patient → nothing systematic", () => {
    const c = consult({ patient: { age: 30, sex: "M" }, conditions: {}, surgery: { ...emptyConsultation().surgery, kce: "minor", cardiacRisk: "low" } });
    expect(recommendExams({ consultation: c, asa: 1 }).recommendations).toEqual([]);
  });
  it("ESC 2022: intermediate-risk surgery with risk factors → ECG, troponin, BNP, Hb; high-risk + poor capacity → echo", () => {
    const c = consult({ patient: { age: 72, sex: "M" }, conditions: { hypertension: { present: true } }, surgery: { ...emptyConsultation().surgery, kce: "major", cardiacRisk: "high" } });
    const r = recommendExams({ consultation: c, asa: 2, mets: 3 });
    const codes = r.recommendations.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["ecg", "troponin", "bnp", "fbc", "echo"]));
    expect(r.recommendations.find((x) => x.code === "ecg")!.reasons.map((x) => x.source.short)).toEqual(["NICE 2016", "ESC 2022"]);
  });
  it("says what's missing to decide", () => {
    expect(recommendExams({ consultation: consult({}), asa: null }).missing).toHaveLength(3);
  });
});

describe("history", () => {
  it("summaries and catalogue search", () => {
    expect(conditionsSummary({ hypertension: { present: true, poorlyControlled: true }, copd: { present: false } })).toBe("HTA (mal contrôlée)");
    expect(substanceSummary({ tobacco: "current", packYears: 20, alcoholUnitsPerWeek: 10, drugs: ["cannabis"] })).toBe("Tabac actif (20 PA) · Alcool 10 U/sem · Drogues : Cannabis");
    expect(searchSurgeries("ptg")[0].name).toBe("Prothèse totale de genou");
    expect(searchSurgeries("vesicule")[0].name).toBe("Cholécystectomie cœlioscopique");
  });
});

describe("deductions", () => {
  it("antecedents from treatments, lab values and BP — never over an explicit answer", async () => {
    const { effectiveConditions } = await import("./derive");
    const c = consult({
      patient: { age: 70, sex: "F", hb: 10.8, sbp: 185, dbp: 95, creatinineMgDl: 1.6 },
      treatments: [
        { id: "1", atc: "A10AE04", name: "Insuline glargine" },
        { id: "2", atc: "A10BA02", name: "Metformine" },
        { id: "3", atc: "B01AC04", name: "Clopidogrel", indication: "coronary_stent", eventDate: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) },
      ],
      conditions: { hypertension: { present: true }, anemia: { present: false } },
    });
    const { conditions, deduced } = effectiveConditions(c);
    expect(conditions.diabetes_insulin?.present).toBe(true);
    expect(conditions.diabetes_oral).toBeUndefined();
    expect(conditions.coronary).toMatchObject({ present: true, recent: true });
    expect(conditions.hypertension).toMatchObject({ present: true, poorlyControlled: true });
    expect(conditions.anemia?.present).toBe(false); // explicit "no" wins
    expect(deduced.get("ckd")).toMatch(/^DFGe \(CKD-EPI\) \d+/);
    expect(consultationScores(c).asa).toBe(4);
  });
  it("tests already done are available with their value", async () => {
    const { autoExamState } = await import("./exams");
    expect(autoExamState("fbc", { hb: 13.2, platelets: 250 })).toEqual({ status: "available", note: "Hb 13,2 g/dL, plaquettes 250 G/L" });
    expect(autoExamState("ecg", { hb: 13 })).toBeNull();
  });
});

describe("points of attention and patient instructions", () => {
  it("derives precautions from the consultation and the plan", async () => {
    const { attentionPoints } = await import("./attention");
    const c = consult({
      patient: { age: 80, sex: "M", allergies: "Céfazoline (urticaire), latex" },
      conditions: { malignant_hyperthermia: { present: true }, pacemaker: { present: true }, osa: { present: true } },
      surgery: { ...emptyConsultation().surgery, bleedingRisk: "high" },
    });
    const plan = { ...(await import("./protocols")).emptyProtocolContent(), drugs: [{ id: "c", name: "Céfazoline", route: "bolus_iv", phase: "antibio" as const, doseMode: "fixed" as const, amount: 2, unit: "g" as const, weightBasis: "total" as const, maxAmount: null, redoseEveryMin: null, note: "" }] };
    const points = attentionPoints(c, consultationScores(c, { plan }), plan);
    const ids = points.map((p) => p.id);
    expect(ids.slice(0, 5)).toEqual(expect.arrayContaining(["cond-malignant_hyperthermia", "allergy-latex", "allergy-cephalosporins", "allergy-plan-cephalosporins-c", "cond-pacemaker"]));
    expect(ids).toEqual(expect.arrayContaining(["cond-osa", "bleeding", "delirium"]));
    expect(points.find((p) => p.id === "cond-osa")!.material).toEqual(["PPC du patient"]);
  });
  it("computes fasting times and treatment stops", async () => {
    const { patientInstructions } = await import("./instructions");
    const c = consult({ plannedAt: "2026-10-08T08:00", patient: { age: 40 }, treatments: [{ id: "t", atc: "C09AA05", name: "Ramipril" }] });
    const i = patientInstructions(c, { findings: [], gaps: [], missing: [] } as never);
    expect(i.fasting[0]).toMatch(/Repas léger au plus tard le jeudi 8 octobre à 0?2:00 \(6 h avant\)/);
    expect(i.fasting[1]).toMatch(/jeudi 8 octobre à 0?6:00 \(2 h avant\)/);
    expect(i.undecided).toEqual(["Ramipril"]);
  });
});

describe("consultation redesign", () => {
  it("RAS systems count as no, only unknowable questions remain, recap follows the sheet", async () => {
    const { remainingQuestions } = await import("./remaining-questions");
    const { consultationRecap } = await import("./recap");
    const { attentionPoints } = await import("./attention");
    const c = consult({
      patient: { age: 70, sex: "M", weightKg: 80, heightCm: 175, neckCm: 42, allergyList: [{ allergenId: "latex", label: "Latex" }] },
      conditions: { hypertension: { present: true } },
      historyReviewed: ["cardio", "resp", "endo", "neuro"],
      substances: { tobacco: "never" },
      surgery: { ...emptyConsultation().surgery, name: "PTG", kce: "major", cardiacRisk: "intermediate", bleedingRisk: "high", rcriHighRisk: false, incision: "peripheral" },
    });
    const scores = consultationScores(c);
    expect(scores.conditions.coronary?.present).toBe(false);
    expect(scores.merged.stopBang.merged.neckOver40).toBe(true);
    const groups = remainingQuestions(c, scores);
    expect(groups.map((g) => g.id)).toEqual(["sleep", "ponv", "bleeding", "dasi"]); // respiratory RAS answers the recent infection
    expect(groups.find((g) => g.id === "sleep")!.questions.map((q) => q.key)).toEqual(["sb-snoring", "sb-tired", "sb-observed"]);
    const answered = groups[0].questions[0].apply(c, true);
    expect(answered.stopBang.snoring).toBe(true);
    const points = attentionPoints(c, scores);
    const recap = consultationRecap(c, scores, { points, instructions: { fasting: [], treatments: [], undecided: [] }, initials: "AB" });
    expect(recap.map((s) => s.title)).toEqual(expect.arrayContaining(["Patient", "Intervention", "Antécédents médicaux", "Allergies", "Examen clinique", "Scores", "Points d'attention"]));
    expect(recap.find((s) => s.title === "Antécédents médicaux")!.lines).toEqual(["Cardiovasculaire : HTA", "Respiratoire : RAS", "Endocrinien et métabolique : RAS", "Neurologique : RAS"]);
    expect(recap.find((s) => s.title === "Allergies")!.lines).toEqual(["Latex"]);
  });
});

describe("reported penicillin allergy (PEN-FAST)", () => {
  it("a low score softens the alert, a high one keeps it, and the recap says so", async () => {
    const { attentionPoints } = await import("./attention");
    const { allergySummary } = await import("./dossier");
    const { emptyProtocolContent } = await import("./protocols");
    const plan = { ...emptyProtocolContent(), drugs: [{ id: "c", name: "Céfazoline", route: "bolus_iv", phase: "antibio" as const, doseMode: "fixed" as const, amount: 2, unit: "g" as const, weightBasis: "total" as const, maxAmount: null, redoseEveryMin: null, note: "" }] };
    const withPenFast = (penFast: Record<string, boolean>) => consult({ patient: { allergyList: [{ allergenId: "betalactams", label: "Pénicilline", reaction: "éruption", penFast }] } });
    const low = withPenFast({ withinFiveYears: false, anaphylaxisOrSevere: false, treatmentRequired: false });
    const pLow = attentionPoints(low, consultationScores(low, { plan }), plan);
    expect(pLow.find((x) => x.id === "allergy-betalactams")).toMatchObject({ level: "medium" });
    expect(pLow.find((x) => x.id === "allergy-plan-betalactams-c")).toMatchObject({ level: "medium" });
    expect(allergySummary(low.patient)).toBe("Pénicilline (éruption) — PEN-FAST 0/5 : allergie vraie peu probable (risque très faible)");
    const high = withPenFast({ withinFiveYears: true, anaphylaxisOrSevere: true });
    const pHigh = attentionPoints(high, consultationScores(high, { plan }), plan);
    expect(pHigh.find((x) => x.id === "allergy-betalactams")).toMatchObject({ level: "high" });
    expect(pHigh.find((x) => x.id === "allergy-plan-betalactams-c")).toMatchObject({ level: "high" });
    const unscored = consult({ patient: { allergyList: [{ allergenId: "betalactams", label: "Pénicilline" }] } });
    expect(attentionPoints(unscored, consultationScores(unscored)).some((x) => x.id === "penfast-betalactams")).toBe(true);
  });
});

describe("completeness", () => {
  it("says what each step still lacks", async () => {
    const { stepMissing } = await import("./completeness");
    const { remainingQuestions } = await import("./remaining-questions");
    const c = consult({ patient: { sex: "F", age: 50, weightKg: 60, heightCm: 165, noKnownAllergy: true }, noTreatment: true, historyReviewed: ["cardio", "resp", "endo", "renal", "digest", "neuro", "psy", "hemato", "other", "surgical", "anaes"], substances: { tobacco: "never" } });
    const scores = consultationScores(c);
    const m = stepMissing(c, scores, remainingQuestions(c, scores));
    expect(m.patient).toEqual([]);
    expect(m.history).toEqual([]);
    expect(m.treatments).toEqual([]);
    expect(m.surgery).toEqual(["intervention", "grade", "risque cardiaque", "risque hémorragique", "technique envisagée", "date prévue"]);
    expect(m.airway).toEqual(["Mallampati", "ouverture de bouche", "distance thyro-mentonnière"]);
  });
});
