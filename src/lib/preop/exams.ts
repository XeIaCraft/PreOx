// Preoperative tests suggested from the patient and the procedure — a
// built-in starting point, displayed with its source so it can be checked:
// - NICE NG45 (2016) "Routine preoperative tests for elective surgery",
//   by surgery grade × ASA class (the grid the Belgian KCE report on
//   preoperative tests built on);
// - ESC 2022 guidelines on non-cardiac surgery (ECG, biomarkers,
//   echocardiography, haemoglobin).
// Your own rules (action "exam") are shown next to these, and a rule of a
// higher level (Belgian institution or society) is what you should follow.

import { anyOf, has, type Conditions, type Substances } from "./history";
import type { ConsultationState } from "./dossier";
import type { PatientTreatment } from "./rules/types";
import { treatmentMatches } from "./medications";

export type ExamCode = "fbc" | "renal" | "haemostasis" | "ecg" | "hba1c" | "pregnancy" | "troponin" | "bnp" | "echo" | "lung";
export type ExamStrength = "recommended" | "consider";

export const EXAM_LABELS: Record<ExamCode, string> = {
  fbc: "Hémogramme",
  renal: "Créatinine, ionogramme (fonction rénale)",
  haemostasis: "Bilan d'hémostase (TP/INR, TCA)",
  ecg: "ECG",
  hba1c: "HbA1c",
  pregnancy: "Test de grossesse",
  troponin: "Troponine hs (avant, puis J1 et J2)",
  bnp: "BNP / NT-proBNP",
  echo: "Échocardiographie",
  lung: "EFR / gazométrie ou avis",
};

export interface ExamSource {
  label: string;
  /** Short reference shown on the badge. */
  short: string;
  level: "eu" | "int";
}

export const NICE_NG45: ExamSource = { label: "NICE NG45 (2016), tests préopératoires en chirurgie programmée", short: "NICE 2016", level: "int" };
export const ESC_2022: ExamSource = { label: "ESC 2022, évaluation cardiovasculaire en chirurgie non cardiaque", short: "ESC 2022", level: "eu" };

export interface ExamRecommendation {
  code: ExamCode;
  label: string;
  strength: ExamStrength;
  reasons: { text: string; source: ExamSource }[];
}

export interface ExamResult {
  recommendations: ExamRecommendation[];
  /** What must be filled for the suggestion to be complete. */
  missing: string[];
}

export interface ExamInput {
  consultation: ConsultationState;
  /** Chosen or suggested ASA class. */
  asa: number | null;
  /** METs from DASI when the questionnaire is complete. */
  mets?: number;
}

const isAnticoagulated = (t: PatientTreatment[]) => t.some((x) => treatmentMatches(x, "B01AA") || treatmentMatches(x, "B01AF") || treatmentMatches(x, "B01AE"));

/** Known cardiovascular disease (ESC 2022). */
function cardiovascularDisease(c: Conditions): boolean | undefined {
  return anyOf(c, ["coronary", "heart_failure", "stroke", "pad", "valve", "arrhythmia"]);
}

/** Cardiovascular risk factors (ESC 2022): hypertension, dyslipidaemia, diabetes, smoking, CKD. */
function riskFactors(c: Conditions, s: Substances): boolean | undefined {
  if (s.tobacco === "current") return true;
  return anyOf(c, ["hypertension", "dyslipidemia", "diabetes_oral", "diabetes_insulin", "ckd", "dialysis"]);
}

export function recommendExams({ consultation: c, asa, mets }: ExamInput): ExamResult {
  const recs = new Map<ExamCode, ExamRecommendation>();
  const missing: string[] = [];
  const add = (code: ExamCode, strength: ExamStrength, text: string, source: ExamSource) => {
    const r = recs.get(code);
    if (!r) recs.set(code, { code, label: EXAM_LABELS[code], strength, reasons: [{ text, source }] });
    else {
      r.reasons.push({ text, source });
      if (strength === "recommended") r.strength = "recommended";
    }
  };

  const grade = c.surgery.kce;
  const risk = c.surgery.cardiacRisk;
  const age = c.patient.age;
  const cond = c.conditions;
  const diabetic = anyOf(cond, ["diabetes_oral", "diabetes_insulin"]);
  const cvd = cardiovascularDisease(cond);
  const rf = riskFactors(cond, c.substances);
  const renalDisease = anyOf(cond, ["ckd", "dialysis"]);
  const respiratory = anyOf(cond, ["copd", "asthma", "home_o2", "osa"]);
  // "At risk of acute kidney injury" (NICE): CKD, diabetes, heart failure, age ≥ 65, nephrotoxic drugs…
  const akiRisk = renalDisease === true || diabetic === true || has(cond, "heart_failure") === true || (age !== undefined && age >= 65);
  const high = asa !== null && asa >= 3;

  if (!grade) missing.push("Grade de la chirurgie (mineure, intermédiaire, majeure)");
  if (!risk) missing.push("Risque cardiaque de la chirurgie (ESC)");
  if (asa === null) missing.push("Classe ASA");

  // --- NICE NG45: surgery grade × ASA -----------------------------------------
  if (grade && asa !== null) {
    const g = grade === "minor" ? "mineure" : grade === "intermediate" ? "intermédiaire" : "majeure";
    const ctx = `chirurgie ${g}, ASA ${["I", "II", "III", "IV", "V"][asa - 1] ?? asa}`;
    if (grade === "minor") {
      if (high) {
        add("ecg", "consider", `${ctx} : si pas d'ECG dans les 12 derniers mois`, NICE_NG45);
        if (akiRisk) add("renal", "consider", `${ctx}, risque d'insuffisance rénale aiguë`, NICE_NG45);
      }
    } else if (grade === "intermediate") {
      if (high) {
        add("ecg", "recommended", ctx, NICE_NG45);
        add("renal", "recommended", ctx, NICE_NG45);
        if (cvd || renalDisease) add("fbc", "consider", `${ctx}, maladie cardiovasculaire ou rénale`, NICE_NG45);
        if (respiratory) add("lung", "consider", `${ctx}, pathologie respiratoire : avis d'un anesthésiste senior`, NICE_NG45);
      } else {
        if (asa === 2 && (cvd || renalDisease || diabetic)) add("ecg", "consider", `${ctx}, comorbidité cardiovasculaire, rénale ou diabète`, NICE_NG45);
        if (akiRisk) add("renal", "consider", `${ctx}, risque d'insuffisance rénale aiguë`, NICE_NG45);
      }
    } else {
      add("fbc", "recommended", ctx, NICE_NG45);
      if (asa >= 2) {
        add("renal", "recommended", ctx, NICE_NG45);
        add("ecg", "recommended", ctx, NICE_NG45);
      } else {
        if (akiRisk) add("renal", "consider", `${ctx}, risque d'insuffisance rénale aiguë`, NICE_NG45);
        if (age !== undefined && age > 65) add("ecg", "consider", `${ctx}, plus de 65 ans sans ECG dans les 12 derniers mois`, NICE_NG45);
      }
      if (high && respiratory) add("lung", "consider", `${ctx}, pathologie respiratoire : avis d'un anesthésiste senior`, NICE_NG45);
    }
    if (grade !== "minor" && high && (has(cond, "cirrhosis") || has(cond, "bleeding_disorder"))) add("haemostasis", "consider", `${ctx}, hépatopathie ou trouble de l'hémostase`, NICE_NG45);
  }
  if (has(cond, "bleeding_disorder")) add("haemostasis", "consider", "trouble de l'hémostase connu", NICE_NG45);
  if (isAnticoagulated(c.treatments)) add("haemostasis", "consider", "patient anticoagulé : selon la molécule et la gestion prévue", NICE_NG45);
  if (diabetic) add("hba1c", "recommended", "diabète, si pas d'HbA1c dans les 3 derniers mois", NICE_NG45);
  if (c.patient.sex === "F" && age !== undefined && age >= 12 && age <= 55 && has(cond, "pregnancy") !== true) add("pregnancy", "consider", "femme en âge de procréer : proposer, avec son accord", NICE_NG45);

  // --- ESC 2022 -----------------------------------------------------------------
  if (risk === "intermediate" || risk === "high") {
    const r = risk === "high" ? "chirurgie à haut risque" : "chirurgie à risque intermédiaire";
    if (cvd || rf) add("ecg", "recommended", `${r}, ${cvd ? "maladie cardiovasculaire" : "facteurs de risque cardiovasculaire"}`, ESC_2022);
    const targeted = cvd || rf || (age !== undefined && age >= 65);
    if (targeted) {
      const who = cvd ? "maladie cardiovasculaire" : rf ? "facteurs de risque" : "65 ans ou plus";
      add("troponin", "recommended", `${r}, ${who}`, ESC_2022);
      add("bnp", "consider", `${r}, ${who}`, ESC_2022);
    }
    add("fbc", "recommended", `${r} : dosage de l'hémoglobine`, ESC_2022);
  }
  if (risk === "high") {
    const poor = mets !== undefined && mets < 4;
    if (poor || has(cond, "murmur")) add("echo", "recommended", `chirurgie à haut risque${poor ? ", capacité fonctionnelle < 4 METs" : ""}${has(cond, "murmur") ? ", souffle" : ""}`, ESC_2022);
  }
  if (has(cond, "murmur") && (has(cond, "heart_failure") || risk !== "low")) add("echo", "consider", "souffle non exploré", ESC_2022);

  const order: ExamCode[] = ["ecg", "fbc", "renal", "haemostasis", "hba1c", "troponin", "bnp", "echo", "lung", "pregnancy"];
  return { recommendations: order.filter((k) => recs.has(k)).map((k) => recs.get(k)!), missing };
}

/** A test whose result is already in the consultation counts as available, with its value. */
export function autoExamState(code: ExamCode, p: ConsultationState["patient"]): { status: "available"; note: string } | null {
  const n = (v: number) => String(v).replace(".", ",");
  switch (code) {
    case "fbc":
      return p.hb !== undefined ? { status: "available", note: [`Hb ${n(p.hb)} g/dL`, p.platelets !== undefined ? `plaquettes ${n(p.platelets)} G/L` : ""].filter(Boolean).join(", ") } : null;
    case "renal":
      return p.creatinineMgDl !== undefined ? { status: "available", note: `créatinine ${n(p.creatinineMgDl)} mg/dL` } : null;
    case "haemostasis":
      return p.inr !== undefined ? { status: "available", note: `INR ${n(p.inr)}` } : null;
    case "hba1c":
      return p.hba1c !== undefined ? { status: "available", note: `HbA1c ${n(p.hba1c)} %` } : null;
    default:
      return null;
  }
}

/** Suggested tests not yet requested, available or set aside. */
export function pendingExams(c: ConsultationState, result: ExamResult): ExamRecommendation[] {
  return result.recommendations.filter((r) => (c.exams[r.code]?.status ?? autoExamState(r.code, c.patient)?.status ?? "todo") === "todo");
}
