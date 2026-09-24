import { describe, expect, it } from "vitest";
import {
  adjustedBodyWeight,
  apfel,
  ariscat,
  bmi,
  cha2ds2vasc,
  ckdEpi2021,
  cockcroftGault,
  dasi,
  elGanzouri,
  hasBled,
  hemstop,
  idealBodyWeight,
  leanBodyWeight,
  maskVentilation,
  rcri,
  stopBang,
} from "./scores";

describe("anthropometry and renal function", () => {
  it("computes BMI and the usual dosing weights (values checked by hand)", () => {
    expect(bmi(88, 176)).toBeCloseTo(28.41, 2);
    expect(idealBodyWeight("M", 176)).toBeCloseTo(71.48, 2);
    expect(idealBodyWeight("F", 165)).toBeCloseTo(56.97, 2);
    expect(leanBodyWeight("M", 88, 176)).toBeCloseTo(63.65, 1);
    expect(adjustedBodyWeight("M", 88, 176)).toBeCloseTo(71.48 + 0.4 * (88 - 71.48), 2);
  });

  it("Cockcroft-Gault and CKD-EPI 2021", () => {
    // (140 − 72) × 88 / (72 × 1.5) = 55.4
    expect(cockcroftGault({ age: 72, weightKg: 88, sex: "M", creatinineMgDl: 1.5 })).toBeCloseTo(55.41, 1);
    expect(cockcroftGault({ age: 72, weightKg: 88, sex: "F", creatinineMgDl: 1.5 })).toBeCloseTo(55.41 * 0.85, 1);
    // 142 × (1.5/0.9)^−1.2 × 0.9938^72 ≈ 49
    expect(ckdEpi2021({ age: 72, sex: "M", creatinineMgDl: 1.5 })).toBeCloseTo(49.2, 0);
    // Normal creatinine, young woman: > 100
    expect(ckdEpi2021({ age: 30, sex: "F", creatinineMgDl: 0.6 })).toBeGreaterThan(115);
  });
});

describe("scores", () => {
  it("RCRI: class only once it can no longer change", () => {
    expect(rcri({ ischemicHeartDisease: true })).toMatchObject({ value: 1, missing: 5, label: "" });
    expect(rcri({ highRiskSurgery: false, ischemicHeartDisease: true, heartFailure: false, cerebrovascularDisease: false, insulin: false, creatinineOver2: false })).toMatchObject({
      value: 1,
      label: "Classe II",
    });
    expect(rcri({ highRiskSurgery: true, ischemicHeartDisease: true, insulin: true })).toMatchObject({ value: 3, label: "Classe IV", level: "high" });
  });

  it("STOP-BANG, including the STOP ≥ 2 + male/BMI/neck rule", () => {
    const none = { snoring: false, tired: false, observed: false, pressure: false, bmiOver35: false, ageOver50: false, neckOver40: false, male: false };
    expect(stopBang(none)).toMatchObject({ value: 0, level: "low", label: "Risque faible de SAOS" });
    expect(stopBang({ ...none, snoring: true, pressure: true, ageOver50: true })).toMatchObject({ value: 3, level: "intermediate" });
    expect(stopBang({ ...none, snoring: true, tired: true, male: true })).toMatchObject({ value: 3, level: "high" });
    expect(stopBang({ snoring: true, tired: true, observed: true, pressure: true, ageOver50: true })).toMatchObject({ value: 5, level: "high" });
    expect(stopBang({ snoring: true })).toMatchObject({ label: "" });
  });

  it("Apfel", () => {
    expect(apfel({ female: true, nonSmoker: true, history: false, postopOpioids: true })).toMatchObject({ value: 3, label: "Risque de NVPO ≈ 61 %", level: "high" });
    expect(apfel({ female: true })).toMatchObject({ label: "" });
  });

  it("ARISCAT", () => {
    expect(ariscat({ age: 72, spo2: 97, respiratoryInfectionLastMonth: false, anemia: false, incision: "upper_abdominal", durationHours: 2.5, emergency: false })).toMatchObject({
      value: 3 + 15 + 16,
      level: "intermediate",
    });
    expect(ariscat({ age: 85, spo2: 90, incision: "intrathoracic" })).toMatchObject({ value: 16 + 24 + 24, level: "high", label: "Risque élevé" });
  });

  it("DASI → METs", () => {
    const all = dasi({
      selfCare: true,
      walkIndoors: true,
      walkBlocks: true,
      climbStairs: true,
      runShort: true,
      lightHousework: true,
      moderateHousework: true,
      heavyHousework: true,
      yardWork: true,
      sexualRelations: true,
      moderateRecreation: true,
      strenuousSports: true,
    });
    expect(all.value).toBe(58.2);
    expect(all.mets).toBeCloseTo(9.9, 1);
    expect(all.level).toBe("low");
  });

  it("CHA₂DS₂-VASc and HAS-BLED", () => {
    expect(cha2ds2vasc({ heartFailure: false, hypertension: true, age: 76, diabetes: true, strokeTiaThromboembolism: false, vascularDisease: false, sex: "F" })).toMatchObject({ value: 5 });
    expect(hasBled({ hypertension: false, renal: false, liver: false, stroke: false, bleeding: true, labileInr: false, elderly: true, drugs: true, alcohol: false })).toMatchObject({ value: 3, level: "high" });
  });

  it("HEMSTOP counts without inventing a threshold, El-Ganzouri predicts at ≥ 4", () => {
    expect(hemstop({ tooth: true, parents: true })).toMatchObject({ value: 2, label: "2 réponses positives" });
    expect(elGanzouri({ mouthOpeningUnder4cm: true, thyromentalCm: 5.5, mallampati: 3, neckMovementDeg: 100, canProtrudeMandible: true, weightKg: 80, difficultIntubationHistory: "none" })).toMatchObject({
      value: 5,
      level: "high",
    });
  });
});

describe("difficult mask ventilation (Langeron)", () => {
  it("predicts it from 2 criteria, stays open while it could still get there", () => {
    expect(maskVentilation({ beard: true, snoring: true })).toMatchObject({ value: 2, level: "high" });
    expect(maskVentilation({ beard: true }).label).toBe("");
    expect(maskVentilation({ beard: true, bmiOver26: false, edentulous: false, ageOver55: false, snoring: false }).label).toBe("Pas de prédiction de difficulté");
  });
});
