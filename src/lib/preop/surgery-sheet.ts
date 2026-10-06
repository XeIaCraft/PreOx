// « Fiche par intervention »: what to ask before a given procedure, without
// a patient — each exam with the conditions that call for it (age,
// comorbidities, ASA…), as recommendExams (exams.ts) applies them to a
// patient. Same sources, same thresholds: a test checks that whatever
// recommendExams asks for a patient appears on the sheet of the procedure.

import {
  EXAM_LABELS,
  ESAIC_2018,
  ESC_2022,
  KCE_280,
  MANUAL_2020,
  MANUAL_2020_POSITION,
  MANUAL_2020_SPECIALTIES,
  MUNOZ_2017,
  NICE_NG45,
  SURGERY_EXAM_PROFILES,
  type ExamCode,
  type ExamSource,
  type ExamStrength,
} from "./exams";
import { fold, type SurgeryItem } from "./catalog";

export interface SheetCondition {
  /** « Tous » when the exam is asked for every patient of this procedure. */
  when: string;
  strength: ExamStrength;
  source: ExamSource;
}

export interface SheetExam {
  code: ExamCode;
  label: string;
  conditions: SheetCondition[];
  /** Asked for every patient (one unconditional recommended line at least). */
  always: boolean;
}

export interface SurgerySheet {
  exams: SheetExam[];
  /** Which grid applies (KCE for adults in planned non-cardiothoracic surgery, NICE otherwise). */
  scope: string;
}

export const RCRI_FACTORS = "cardiopathie ischémique, insuffisance cardiaque, AVC ou AIT, insuffisance rénale (créatinine > 2 mg/dl ou ClCr < 60), diabète sous insuline";
const ALL = "Tous les patients";

const ORDER: ExamCode[] = ["group", "fbc", "renal", "haemostasis", "ecg", "troponin", "bnp", "echo", "stress", "coronary", "lung", "pft", "abg", "hba1c", "iron", "pregnancy", "urine"];

export function surgerySheet(s: SurgeryItem): SurgerySheet {
  const exams = new Map<ExamCode, SheetExam>();
  const add = (code: ExamCode, strength: ExamStrength, when: string, source: ExamSource) => {
    let e = exams.get(code);
    if (!e) exams.set(code, (e = { code, label: EXAM_LABELS[code], conditions: [], always: false }));
    // The same reason twice (bleeding risk + the procedure's profile) adds nothing.
    const key = (w: string) => fold(w.replace(/^Tous les patients\s*\(?/, "").replace(/\)$/, ""));
    const same = e.conditions.find((c) => key(c.when) === key(when));
    if (same) {
      // Keep the « for everyone » wording when one of the two says so.
      if (when.startsWith(ALL) && !same.when.startsWith(ALL)) same.when = when;
      if (strength === "recommended") same.strength = "recommended";
      if (same.when.startsWith(ALL) && same.strength === "recommended") e.always = true;
      return;
    }
    e.conditions.push({ when, strength, source });
    if (when === ALL && strength === "recommended") e.always = true;
  };

  const grade = s.grade;
  const cardiac = s.category === "F";
  const child = s.population === "child" || s.population === "neonate";

  // --- KCE 280: adult, planned, non-cardiothoracic -----------------------------------
  const kce = !cardiac && s.category !== "G" && !child;
  if (kce) {
    if (grade === "minor") add("ecg", "consider", `Facteur de risque (${RCRI_FACTORS})`, KCE_280);
    else {
      add("ecg", "recommended", `Facteur de risque (${RCRI_FACTORS})`, KCE_280);
      add("ecg", "consider", "65 ans ou plus, sans facteur de risque", KCE_280);
    }
    if (grade === "major") add("fbc", "recommended", ALL, KCE_280);
    else if (grade === "intermediate") add("fbc", "consider", "ASA III ou plus", KCE_280);
    if (grade === "major") add("renal", "recommended", ALL, KCE_280);
    else if (grade === "intermediate") {
      add("renal", "recommended", "ASA III ou plus", KCE_280);
      add("renal", "consider", "ASA II avec risque rénal (âge ≥ 65 ans, diabète, insuffisance cardiaque, IEC/ARA II, diurétique)", KCE_280);
    } else {
      add("renal", "consider", "ASA III ou plus, si suspicion d'insuffisance rénale", KCE_280);
      add("renal", "consider", "ASA II avec risque rénal (âge ≥ 65 ans, diabète, insuffisance cardiaque, IEC/ARA II, diurétique)", KCE_280);
    }
    if (grade !== "minor") {
      add("haemostasis", "consider", "Anamnèse hémorragique positive, trouble de l'hémostase ou hépatopathie chronique (jamais en routine)", KCE_280);
      add("stress", "consider", "Facteur de risque et capacité fonctionnelle < 4 METs, seulement si le résultat change la stratégie", KCE_280);
    }
    if (s.category === "J2") add("urine", "consider", "Culture urinaire à envisager (pas d'analyse d'urine en routine)", KCE_280);
  } else {
    // --- NICE NG45: children, cardiothoracic, emergencies ---------------------------------
    if (grade === "minor") {
      add("ecg", "consider", "ASA III ou plus, sans ECG dans les 12 derniers mois", NICE_NG45);
      add("renal", "consider", "ASA III ou plus, à risque d'insuffisance rénale aiguë", NICE_NG45);
    } else if (grade === "intermediate") {
      add("ecg", "recommended", "ASA III ou plus", NICE_NG45);
      add("ecg", "consider", "ASA II avec comorbidité cardiovasculaire, rénale ou diabète", NICE_NG45);
      add("renal", "recommended", "ASA III ou plus", NICE_NG45);
      add("renal", "consider", "ASA I–II à risque d'insuffisance rénale aiguë", NICE_NG45);
      add("fbc", "consider", "ASA III ou plus avec maladie cardiovasculaire ou rénale", NICE_NG45);
      add("lung", "consider", "ASA III ou plus avec pathologie respiratoire : avis d'un anesthésiste senior", NICE_NG45);
    } else {
      add("fbc", "recommended", ALL, NICE_NG45);
      add("renal", "recommended", "ASA II ou plus", NICE_NG45);
      add("renal", "consider", "ASA I à risque d'insuffisance rénale aiguë", NICE_NG45);
      add("ecg", "recommended", "ASA II ou plus", NICE_NG45);
      add("ecg", "consider", "ASA I, plus de 65 ans", NICE_NG45);
      add("lung", "consider", "ASA III ou plus avec pathologie respiratoire : avis d'un anesthésiste senior", NICE_NG45);
    }
    if (grade !== "minor") add("haemostasis", "consider", "ASA III ou plus avec hépatopathie ou trouble de l'hémostase", NICE_NG45);
  }

  // --- Whatever the grid ---------------------------------------------------------------
  add("haemostasis", "consider", "Trouble de l'hémostase connu, ou patient anticoagulé (effet selon la molécule)", KCE_280);
  add("hba1c", "recommended", "Diabétique sans HbA1c dans les 3 derniers mois (jamais chez le non-diabétique)", KCE_280);
  if (s.sex !== "M") add("pregnancy", "consider", "Femme de 12 à 55 ans : proposer, avec son accord", NICE_NG45);

  // --- ESC 2022 (non-cardiac surgery) ------------------------------------------------------
  if (!cardiac && (s.cardiacRisk === "intermediate" || s.cardiacRisk === "high")) {
    const r = s.cardiacRisk === "high" ? "Chirurgie à haut risque cardiaque" : "Chirurgie à risque cardiaque intermédiaire";
    add("ecg", "recommended", `${r} : maladie cardiovasculaire ou facteurs de risque cardiovasculaire`, ESC_2022);
    add("troponin", "recommended", `${r} : maladie cardiovasculaire, facteurs de risque ou 65 ans ou plus`, ESC_2022);
    add("bnp", "consider", `${r} : maladie cardiovasculaire, facteurs de risque ou 65 ans ou plus`, ESC_2022);
    add("fbc", "recommended", `${ALL} (${r.toLowerCase()} : hémoglobine)`, ESC_2022);
    add("echo", "recommended", "Valvulopathie connue ou suspectée", ESC_2022);
    add("echo", "consider", "Insuffisance cardiaque sans échographie récente ; souffle non exploré", ESC_2022);
  }
  if (!cardiac && s.cardiacRisk === "high") {
    add("echo", "recommended", "Capacité fonctionnelle < 4 METs ou souffle", ESC_2022);
    add("stress", "recommended", "Programmée, capacité fonctionnelle < 4 METs et risque clinique élevé", ESC_2022);
  }
  if (/(?<!semi-)assis/.test(fold(s.position ?? "")) || /position assise/.test(fold(s.name)))
    add("echo", "recommended", "Position assise : recherche d'un foramen ovale perméable (épreuve de contraste)", MANUAL_2020_POSITION);

  // --- The procedure's own work-up ---------------------------------------------------------
  const profile = s.examProfile ? SURGERY_EXAM_PROFILES[s.examProfile] : undefined;
  for (const item of profile?.items ?? []) add(item.code, item.strength, item.text.charAt(0).toUpperCase() + item.text.slice(1), item.source);

  // --- Named procedures (as in recommendExams) --------------------------------------------
  const name = fold(s.name);
  if (/col du femur|col femoral|fracture.*(hanche|femur)|pertrochanter|sous-trochanter|hemiarthroplast|prothese intermediaire|osteosynthese de la hanche|\bpih\b/.test(name)) {
    add("group", "recommended", `${ALL} (fracture du fémur proximal : deux concentrés érythrocytaires disponibles)`, MANUAL_2020_SPECIALTIES);
    add("fbc", "recommended", `${ALL} (fracture du fémur proximal : pertes de 500 à 1 000 ml)`, MANUAL_2020_SPECIALTIES);
  }
  if (/scoliose/.test(name)) {
    add("group", "recommended", `${ALL} (correction de scoliose : pertes sanguines importantes)`, MANUAL_2020_SPECIALTIES);
    add("pft", "consider", "Syndrome restrictif (complications pulmonaires si courbure > 60°)", MANUAL_2020_SPECIALTIES);
    add("echo", "consider", "Hypertension pulmonaire ou cardiomyopathie (myopathie associée)", MANUAL_2020_SPECIALTIES);
  }

  // --- Bleeding ------------------------------------------------------------------------------
  if (s.bleedingRisk === "high") {
    add("group", "recommended", `${ALL} (intervention potentiellement hémorragique)`, MANUAL_2020);
    add("fbc", "recommended", `${ALL} (risque hémorragique important)`, ESAIC_2018);
    add("iron", "consider", "Chirurgie programmée : carence martiale à traiter avant", MUNOZ_2017);
  }

  for (const e of exams.values()) {
    e.always ||= e.conditions.some((c) => c.strength === "recommended" && c.when.startsWith(ALL));
    e.conditions.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "recommended" ? -1 : 1));
  }
  const rank = (c: ExamCode) => (ORDER.includes(c) ? ORDER.indexOf(c) : ORDER.length);
  return {
    exams: [...exams.values()].sort((a, b) => Number(b.always) - Number(a.always) || rank(a.code) - rank(b.code)),
    scope: kce
      ? "Adulte, chirurgie programmée non cardio-thoracique : grille du KCE 280 (2016), selon le grade de l'intervention et la classe ASA."
      : `${child ? "Enfant" : "Chirurgie cardio-thoracique"} : hors du champ du KCE 280, grille NICE NG45 (2016).`,
  };
}
