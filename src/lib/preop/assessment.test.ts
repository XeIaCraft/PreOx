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
    expect(s.reasons.map((r) => r.label)).toEqual(["coronaropathie (> 3 mois)", "HTA contrôlée", "tabagisme actif"]);
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
    expect(results.ariscat.missing).toBe(4); // SpO₂, Hb, respiratory infection, emergency — incision and duration come from the surgery
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
    expect(conditionsSummary({ hypertension: { present: true, poorlyControlled: true }, copd: { present: false } })).toBe("HTA (mal contrôlé(e))");
    expect(substanceSummary({ tobacco: "current", packYears: 20, alcoholUnitsPerWeek: 10, drugs: ["cannabis"] })).toBe("Tabac actif (20 PA) · Alcool 10 U/sem · Drogues : Cannabis");
    expect(searchSurgeries("ptg")[0].name).toBe("Prothèse totale de genou");
    expect(searchSurgeries("vesicule")[0].name).toBe("Cholécystectomie cœlioscopique");
  });
});
