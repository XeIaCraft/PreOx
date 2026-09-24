// Preoperative scores and derived values — pure functions, no I/O, unit
// tested (scores.test.ts). Each score carries its reference so the screens
// can show where the interpretation comes from. Inputs left undefined make
// the score "incomplete" rather than silently counting them as 0: a
// partially filled consultation shows what is still missing.

export type Sex = "M" | "F";

export interface ScoreReference {
  /** Author, journal, year — identifiers (DOI, PMID) are added once checked against PubMed, never from memory. */
  label: string;
  id?: string;
}

export type RiskLevel = "low" | "intermediate" | "high" | "info";

export interface ScoreResult {
  /** Points (or value) computed from the answered items. */
  value: number;
  /** Items still unanswered — the result is provisional while > 0. */
  missing: number;
  /** Short interpretation ("Classe II", "Risque élevé"…), empty while incomplete if it can't be decided yet. */
  label: string;
  level: RiskLevel;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Anthropometry and renal function
// ---------------------------------------------------------------------------

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Ideal body weight, Devine formula (kg). */
export function idealBodyWeight(sex: Sex, heightCm: number): number {
  return (sex === "M" ? 50 : 45.5) + 0.91 * (heightCm - 152.4);
}

/** Lean body weight, Janmahasatian formula (kg). */
export function leanBodyWeight(sex: Sex, weightKg: number, heightCm: number): number {
  const b = bmi(weightKg, heightCm);
  return sex === "M" ? (9270 * weightKg) / (6680 + 216 * b) : (9270 * weightKg) / (8780 + 244 * b);
}

/** Adjusted body weight: IBW + 0.4 × (TBW − IBW). */
export function adjustedBodyWeight(sex: Sex, weightKg: number, heightCm: number): number {
  const ibw = idealBodyWeight(sex, heightCm);
  return ibw + 0.4 * (weightKg - ibw);
}

export const CREATININE_UMOL_PER_MG_DL = 88.4;

/**
 * Creatinine clearance, Cockcroft-Gault (mL/min), actual body weight —
 * the formula the DOAC labels and their perioperative rules are written with.
 */
export function cockcroftGault(p: { age: number; weightKg: number; sex: Sex; creatinineMgDl: number }): number {
  return ((140 - p.age) * p.weightKg * (p.sex === "F" ? 0.85 : 1)) / (72 * p.creatinineMgDl);
}

/** eGFR, CKD-EPI 2021 race-free equation (mL/min/1.73 m²). */
export function ckdEpi2021(p: { age: number; sex: Sex; creatinineMgDl: number }): number {
  const kappa = p.sex === "F" ? 0.7 : 0.9;
  const alpha = p.sex === "F" ? -0.241 : -0.302;
  const ratio = p.creatinineMgDl / kappa;
  return 142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** p.age * (p.sex === "F" ? 1.012 : 1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Answers<K extends string> = Partial<Record<K, boolean>>;

function tally<K extends string>(answers: Answers<K>, weights: Record<K, number>): { value: number; missing: number } {
  let value = 0;
  let missing = 0;
  for (const key of Object.keys(weights) as K[]) {
    const a = answers[key];
    if (a === undefined) missing++;
    else if (a) value += weights[key];
  }
  return { value, missing };
}

// ---------------------------------------------------------------------------
// Classifications entered as such (no computation)
// ---------------------------------------------------------------------------

export const ASA_CLASSES = [
  { code: 1, label: "ASA I", detail: "Patient en bonne santé" },
  { code: 2, label: "ASA II", detail: "Maladie systémique légère" },
  { code: 3, label: "ASA III", detail: "Maladie systémique sévère" },
  { code: 4, label: "ASA IV", detail: "Maladie systémique sévère, menace vitale constante" },
  { code: 5, label: "ASA V", detail: "Moribond, ne survivrait pas sans l'intervention" },
  { code: 6, label: "ASA VI", detail: "Mort encéphalique, prélèvement d'organes" },
] as const;

export const MALLAMPATI_CLASSES = [
  { code: 1, label: "I", detail: "Palais mou, luette, piliers visibles" },
  { code: 2, label: "II", detail: "Palais mou, luette visibles" },
  { code: 3, label: "III", detail: "Palais mou, base de la luette" },
  { code: 4, label: "IV", detail: "Palais dur seul" },
] as const;

/** Cormack-Lehane — graded at laryngoscopy, not at the consultation. */
export const CORMACK_GRADES = [
  { code: "1", detail: "Glotte entièrement visible" },
  { code: "2a", detail: "Glotte partiellement visible" },
  { code: "2b", detail: "Commissure postérieure / aryténoïdes seuls" },
  { code: "3a", detail: "Épiglotte seule, soulevable" },
  { code: "3b", detail: "Épiglotte seule, collée au pharynx" },
  { code: "4", detail: "Ni glotte ni épiglotte" },
] as const;

export const NYHA_CLASSES = [
  { code: 1, detail: "Pas de limitation" },
  { code: 2, detail: "Limitation légère à l'effort ordinaire" },
  { code: 3, detail: "Limitation marquée, symptômes à l'effort léger" },
  { code: 4, detail: "Symptômes au repos" },
] as const;

/** Clinical Frailty Scale (Rockwood), 1–9. */
export const CLINICAL_FRAILTY_SCALE = [
  { code: 1, detail: "Très en forme" },
  { code: 2, detail: "En forme" },
  { code: 3, detail: "Gère bien ses problèmes de santé" },
  { code: 4, detail: "Très légèrement fragile" },
  { code: 5, detail: "Légèrement fragile" },
  { code: 6, detail: "Modérément fragile" },
  { code: 7, detail: "Sévèrement fragile" },
  { code: 8, detail: "Très sévèrement fragile" },
  { code: 9, detail: "En phase terminale" },
] as const;

// ---------------------------------------------------------------------------
// RCRI (Lee)
// ---------------------------------------------------------------------------

export const RCRI_ITEMS = {
  highRiskSurgery: "Chirurgie à haut risque (intrapéritonéale, intrathoracique, vasculaire sus-inguinale)",
  ischemicHeartDisease: "Cardiopathie ischémique",
  heartFailure: "Antécédent d'insuffisance cardiaque",
  cerebrovascularDisease: "Antécédent d'AVC ou d'AIT",
  insulin: "Diabète traité par insuline",
  creatinineOver2: "Créatinine > 2 mg/dL (177 µmol/L)",
} as const;
export type RcriItem = keyof typeof RCRI_ITEMS;

export const RCRI_REFERENCE: ScoreReference = { label: "Lee et al., Circulation 1999" };

export function rcri(answers: Answers<RcriItem>): ScoreResult {
  const { value, missing } = tally(answers, { highRiskSurgery: 1, ischemicHeartDisease: 1, heartFailure: 1, cerebrovascularDisease: 1, insulin: 1, creatinineOver2: 1 });
  const cls = value === 0 ? "I" : value === 1 ? "II" : value === 2 ? "III" : "IV";
  // With items still unanswered, the class can only go up: show it once it can't change, or when it's already IV.
  const decided = missing === 0 || value >= 3;
  return { value, missing, label: decided ? `Classe ${cls}` : "", level: value >= 2 ? "high" : value === 1 ? "intermediate" : "low" };
}

// ---------------------------------------------------------------------------
// STOP-BANG
// ---------------------------------------------------------------------------

export const STOP_BANG_ITEMS = {
  snoring: "Ronflement bruyant",
  tired: "Fatigue ou somnolence diurne",
  observed: "Apnées observées",
  pressure: "Hypertension artérielle (traitée ou non)",
  bmiOver35: "IMC > 35",
  ageOver50: "Âge > 50 ans",
  neckOver40: "Tour de cou > 40 cm",
  male: "Sexe masculin",
} as const;
export type StopBangItem = keyof typeof STOP_BANG_ITEMS;

export const STOP_BANG_REFERENCE: ScoreReference = { label: "Chung et al., Chest 2016" };

export function stopBang(answers: Answers<StopBangItem>): ScoreResult {
  const weights = { snoring: 1, tired: 1, observed: 1, pressure: 1, bmiOver35: 1, ageOver50: 1, neckOver40: 1, male: 1 };
  const { value, missing } = tally(answers, weights);
  const stop = (["snoring", "tired", "observed", "pressure"] as const).filter((k) => answers[k]).length;
  // Also high risk: STOP ≥ 2 with male sex, BMI > 35 or neck > 40 cm.
  const highByRule = stop >= 2 && (answers.male || answers.bmiOver35 || answers.neckOver40);
  if (value >= 5 || highByRule) return { value, missing, label: "Risque élevé de SAOS", level: "high" };
  const level: RiskLevel = value >= 3 ? "intermediate" : "low";
  // Unanswered items could still raise the class: no label until they can't.
  if (missing > 0 && value + missing >= (value >= 3 ? 5 : 3)) return { value, missing, label: "", level };
  return { value, missing, label: level === "intermediate" ? "Risque intermédiaire de SAOS" : "Risque faible de SAOS", level };
}

// ---------------------------------------------------------------------------
// Apfel (PONV)
// ---------------------------------------------------------------------------

export const APFEL_ITEMS = {
  female: "Sexe féminin",
  nonSmoker: "Non-fumeur",
  history: "Antécédent de NVPO ou de mal des transports",
  postopOpioids: "Opioïdes postopératoires prévus",
} as const;
export type ApfelItem = keyof typeof APFEL_ITEMS;

export const APFEL_REFERENCE: ScoreReference = { label: "Apfel et al., Anesthesiology 1999" };
const APFEL_RISK = [10, 21, 39, 61, 79];

export function apfel(answers: Answers<ApfelItem>): ScoreResult {
  const { value, missing } = tally(answers, { female: 1, nonSmoker: 1, history: 1, postopOpioids: 1 });
  return {
    value,
    missing,
    label: missing === 0 ? `Risque de NVPO ≈ ${APFEL_RISK[value]} %` : "",
    level: value >= 3 ? "high" : value === 2 ? "intermediate" : "low",
  };
}

// ---------------------------------------------------------------------------
// ARISCAT (postoperative pulmonary complications)
// ---------------------------------------------------------------------------

export interface AriscatInput {
  age?: number;
  spo2?: number;
  respiratoryInfectionLastMonth?: boolean;
  /** Preoperative haemoglobin ≤ 10 g/dL. */
  anemia?: boolean;
  incision?: "peripheral" | "upper_abdominal" | "intrathoracic";
  durationHours?: number;
  emergency?: boolean;
}

export const ARISCAT_REFERENCE: ScoreReference = { label: "Canet et al., Anesthesiology 2010" };

export function ariscat(p: AriscatInput): ScoreResult {
  let value = 0;
  let missing = 0;
  const add = (defined: boolean, points: () => number) => {
    if (!defined) missing++;
    else value += points();
  };
  add(p.age !== undefined, () => (p.age! > 80 ? 16 : p.age! > 50 ? 3 : 0));
  add(p.spo2 !== undefined, () => (p.spo2! <= 90 ? 24 : p.spo2! <= 95 ? 8 : 0));
  add(p.respiratoryInfectionLastMonth !== undefined, () => (p.respiratoryInfectionLastMonth ? 17 : 0));
  add(p.anemia !== undefined, () => (p.anemia ? 11 : 0));
  add(p.incision !== undefined, () => (p.incision === "intrathoracic" ? 24 : p.incision === "upper_abdominal" ? 15 : 0));
  add(p.durationHours !== undefined, () => (p.durationHours! > 3 ? 23 : p.durationHours! >= 2 ? 16 : 0));
  add(p.emergency !== undefined, () => (p.emergency ? 8 : 0));
  const level: RiskLevel = value >= 45 ? "high" : value >= 26 ? "intermediate" : "low";
  const label = missing === 0 || value >= 45 ? (level === "high" ? "Risque élevé" : level === "intermediate" ? "Risque intermédiaire" : "Risque faible") : "";
  return { value, missing, label, level };
}

// ---------------------------------------------------------------------------
// DASI → METs
// ---------------------------------------------------------------------------

export const DASI_ITEMS = {
  selfCare: { label: "S'occuper de soi (manger, s'habiller, se laver)", weight: 2.75 },
  walkIndoors: { label: "Marcher à l'intérieur de la maison", weight: 1.75 },
  walkBlocks: { label: "Marcher 100 à 200 m à plat", weight: 2.75 },
  climbStairs: { label: "Monter un étage ou une côte", weight: 5.5 },
  runShort: { label: "Courir une courte distance", weight: 8 },
  lightHousework: { label: "Travaux ménagers légers (poussière, vaisselle)", weight: 2.7 },
  moderateHousework: { label: "Travaux ménagers modérés (aspirateur, courses)", weight: 3.5 },
  heavyHousework: { label: "Gros travaux ménagers (frotter les sols, déplacer des meubles)", weight: 8 },
  yardWork: { label: "Jardinage (tondre, ratisser)", weight: 4.5 },
  sexualRelations: { label: "Relations sexuelles", weight: 5.25 },
  moderateRecreation: { label: "Loisirs modérés (golf, danse, bowling)", weight: 6 },
  strenuousSports: { label: "Sports intenses (natation, tennis, vélo)", weight: 7.5 },
} as const;
export type DasiItem = keyof typeof DASI_ITEMS;

export const DASI_REFERENCE: ScoreReference = { label: "Hlatky et al., Am J Cardiol 1989 ; seuil 34 : Wijeysundera et al., Lancet 2018 (METS)" };

export function dasi(answers: Answers<DasiItem>): ScoreResult & { mets: number } {
  const weights = Object.fromEntries(Object.entries(DASI_ITEMS).map(([k, v]) => [k, v.weight])) as Record<DasiItem, number>;
  const { value, missing } = tally(answers, weights);
  const mets = (0.43 * value + 9.6) / 3.5;
  const score = Math.round(value * 100) / 100;
  return {
    value: score,
    missing,
    mets: Math.round(mets * 10) / 10,
    label: missing === 0 || value > 34 ? `${Math.round(mets * 10) / 10} METs${value > 34 ? " · DASI > 34" : ""}` : "",
    level: value > 34 ? "low" : mets >= 4 ? "intermediate" : "high",
  };
}

// ---------------------------------------------------------------------------
// CHA₂DS₂-VASc and HAS-BLED (anticoagulated atrial fibrillation — bridging / resumption decisions)
// ---------------------------------------------------------------------------

export interface Cha2ds2vascInput {
  heartFailure?: boolean;
  hypertension?: boolean;
  age?: number;
  diabetes?: boolean;
  strokeTiaThromboembolism?: boolean;
  vascularDisease?: boolean;
  sex?: Sex;
}

export const CHA2DS2VASC_REFERENCE: ScoreReference = { label: "Lip et al., Chest 2010" };

export function cha2ds2vasc(p: Cha2ds2vascInput): ScoreResult {
  let value = 0;
  let missing = 0;
  const flag = (v: boolean | undefined, points: number) => (v === undefined ? missing++ : v && (value += points));
  flag(p.heartFailure, 1);
  flag(p.hypertension, 1);
  flag(p.diabetes, 1);
  flag(p.strokeTiaThromboembolism, 2);
  flag(p.vascularDisease, 1);
  if (p.age === undefined) missing++;
  else value += p.age >= 75 ? 2 : p.age >= 65 ? 1 : 0;
  if (p.sex === undefined) missing++;
  else if (p.sex === "F") value += 1;
  return { value, missing, label: missing === 0 ? `${value} point${value > 1 ? "s" : ""}` : "", level: value >= 4 ? "high" : value >= 2 ? "intermediate" : "low" };
}

export const HAS_BLED_ITEMS = {
  hypertension: "HTA non contrôlée (PAS > 160 mmHg)",
  renal: "Fonction rénale anormale (dialyse, greffe, créatinine ≥ 2,26 mg/dL)",
  liver: "Fonction hépatique anormale (cirrhose, bilirubine > 2× N, transaminases > 3× N)",
  stroke: "Antécédent d'AVC",
  bleeding: "Antécédent ou prédisposition hémorragique",
  labileInr: "INR labile (sous AVK)",
  elderly: "Âge > 65 ans",
  drugs: "Antiagrégant ou AINS",
  alcohol: "Alcool (≥ 8 unités/semaine)",
} as const;
export type HasBledItem = keyof typeof HAS_BLED_ITEMS;

export const HAS_BLED_REFERENCE: ScoreReference = { label: "Pisters et al., Chest 2010" };

export function hasBled(answers: Answers<HasBledItem>): ScoreResult {
  const { value, missing } = tally(answers, { hypertension: 1, renal: 1, liver: 1, stroke: 1, bleeding: 1, labileInr: 1, elderly: 1, drugs: 1, alcohol: 1 });
  const high = value >= 3;
  return { value, missing, label: high ? "Risque hémorragique élevé" : missing === 0 ? "Risque hémorragique non élevé" : "", level: high ? "high" : "low" };
}

// ---------------------------------------------------------------------------
// Bleeding history questionnaire (HEMSTOP) — count only
// ---------------------------------------------------------------------------

export const HEMSTOP_ITEMS = {
  hematoma: "Hématomes ou ecchymoses sans traumatisme",
  hemorrhage: "Saignement prolongé après une coupure ou une plaie",
  menorrhagia: "Règles abondantes ayant nécessité un traitement",
  surgery: "Saignement anormal lors d'une intervention",
  tooth: "Saignement prolongé après une extraction dentaire",
  obstetrics: "Hémorragie du post-partum",
  parents: "Trouble de la coagulation connu dans la famille",
} as const;
export type HemstopItem = keyof typeof HEMSTOP_ITEMS;

/** Belgian bleeding questionnaire; interpretation threshold deliberately not hard-coded — read it in the source. */
export const HEMSTOP_REFERENCE: ScoreReference = { label: "Bonhomme et al., Eur J Anaesthesiol 2016 (questionnaire HEMSTOP)" };

export function hemstop(answers: Answers<HemstopItem>): ScoreResult {
  const { value, missing } = tally(answers, { hematoma: 1, hemorrhage: 1, menorrhagia: 1, surgery: 1, tooth: 1, obstetrics: 1, parents: 1 });
  return {
    value,
    missing,
    label: value > 0 ? `${value} réponse${value > 1 ? "s" : ""} positive${value > 1 ? "s" : ""}` : missing === 0 ? "Aucune réponse positive" : "",
    level: value > 0 ? "intermediate" : "low",
    detail: "Seuil d'interprétation à lire dans la publication de référence.",
  };
}

// ---------------------------------------------------------------------------
// El-Ganzouri (risk index for difficult laryngoscopy)
// ---------------------------------------------------------------------------

export interface ElGanzouriInput {
  mouthOpeningUnder4cm?: boolean;
  thyromentalCm?: number;
  mallampati?: 1 | 2 | 3 | 4;
  neckMovementDeg?: number;
  /** Able to advance the lower incisors beyond the upper ones. */
  canProtrudeMandible?: boolean;
  weightKg?: number;
  difficultIntubationHistory?: "none" | "questionable" | "definite";
}

export const EL_GANZOURI_REFERENCE: ScoreReference = { label: "El-Ganzouri et al., Anesth Analg 1996" };

export function elGanzouri(p: ElGanzouriInput): ScoreResult {
  let value = 0;
  let missing = 0;
  const add = (defined: boolean, points: () => number) => (defined ? (value += points()) : missing++);
  add(p.mouthOpeningUnder4cm !== undefined, () => (p.mouthOpeningUnder4cm ? 1 : 0));
  add(p.thyromentalCm !== undefined, () => (p.thyromentalCm! < 6 ? 2 : p.thyromentalCm! <= 6.5 ? 1 : 0));
  add(p.mallampati !== undefined, () => (p.mallampati! >= 3 ? 2 : p.mallampati === 2 ? 1 : 0));
  add(p.neckMovementDeg !== undefined, () => (p.neckMovementDeg! < 80 ? 2 : p.neckMovementDeg! <= 90 ? 1 : 0));
  add(p.canProtrudeMandible !== undefined, () => (p.canProtrudeMandible ? 0 : 1));
  add(p.weightKg !== undefined, () => (p.weightKg! > 110 ? 2 : p.weightKg! >= 90 ? 1 : 0));
  add(p.difficultIntubationHistory !== undefined, () => (p.difficultIntubationHistory === "definite" ? 2 : p.difficultIntubationHistory === "questionable" ? 1 : 0));
  const high = value >= 4;
  return { value, missing, label: high ? "Laryngoscopie difficile prévisible" : missing === 0 ? "Pas de prédiction de difficulté" : "", level: high ? "high" : "low" };
}
