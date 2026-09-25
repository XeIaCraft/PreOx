// A rule of the library: short, structured so the app can apply it, and
// always tied to its source. Rules are written by the user from a verified
// answer (an AI search tool, a guideline PDF) — never generated in bulk.
import type { ConditionCode } from "../history";

import type { PenFastItem, Sex } from "../scores";

/** Where a source sits in the hierarchy (highest first) — see SOURCE_LEVELS. */
export type SourceLevel = "local" | "be_inst" | "be_soc" | "eu" | "int" | "article";

export const SOURCE_LEVELS: { code: SourceLevel; short: string; label: string }[] = [
  { code: "local", short: "LOCAL", label: "Protocole de service (s'applique dans cet hôpital)" },
  { code: "be_inst", short: "BE", label: "Belgique, institutionnel (KCE, CSS, CBIP, AFMPS)" },
  { code: "be_soc", short: "BE", label: "Société scientifique belge (SARB, BARA…)" },
  { code: "eu", short: "EU", label: "Recommandation européenne (ESAIC, ESRA, ESC, EHRA, ERC…)" },
  { code: "int", short: "INT", label: "Autre recommandation (SFAR, GIHP, ASRA, ASA…)" },
  { code: "article", short: "ART", label: "Article ou revue, pas une recommandation" },
];

export interface RuleSource {
  organisation: string;
  title: string;
  year: number | null;
  doi: string;
  pmid: string;
  /** Exact sentence from the source. */
  quote: string;
  /** Grade or level of evidence as stated by the source ("1C"), "" if none. */
  grade: string;
  level: SourceLevel;
  /** For local protocols: the hospital they apply in. */
  hospital?: string;
}

/** Planned anaesthetic gestures, grouped by bleeding risk of the puncture. */
export type Technique = "neuraxial" | "deep_block" | "superficial_block" | "general" | "sedation";

export const TECHNIQUES: { code: Technique; label: string }[] = [
  { code: "neuraxial", label: "Ponction neuraxiale (rachi, péridurale, cathéter)" },
  { code: "deep_block", label: "Bloc profond ou non compressible" },
  { code: "superficial_block", label: "Bloc superficiel ou compressible" },
  { code: "general", label: "Anesthésie générale" },
  { code: "sedation", label: "Sédation" },
];

/** Why a patient takes a treatment — changes what to do with it (primary vs secondary prevention, recent stent…). */
export type Indication =
  | "af"
  | "vte"
  | "mechanical_valve"
  | "coronary_stent"
  | "primary_prevention"
  | "secondary_prevention_coronary"
  | "secondary_prevention_stroke"
  | "peripheral_arterial_disease"
  | "other";

export const INDICATIONS: { code: Indication; label: string }[] = [
  { code: "af", label: "Fibrillation auriculaire" },
  { code: "vte", label: "Thrombose veineuse / embolie pulmonaire" },
  { code: "mechanical_valve", label: "Valve mécanique" },
  { code: "coronary_stent", label: "Stent coronaire" },
  { code: "primary_prevention", label: "Prévention primaire" },
  { code: "secondary_prevention_coronary", label: "Prévention secondaire coronaire" },
  { code: "secondary_prevention_stroke", label: "Prévention secondaire après AVC/AIT" },
  { code: "peripheral_arterial_disease", label: "Artériopathie des membres inférieurs" },
  { code: "other", label: "Autre" },
];

export type Comparator = "<" | "<=" | ">" | ">=";

/** Numeric patient values a rule can test. Derived ones (CrCl, BMI) are computed from the patient data. */
export type PatientValue = "age" | "weight" | "bmi" | "crcl" | "egfr" | "hb" | "platelets" | "inr";

export const PATIENT_VALUES: { code: PatientValue; label: string; unit: string }[] = [
  { code: "age", label: "Âge", unit: "ans" },
  { code: "weight", label: "Poids", unit: "kg" },
  { code: "bmi", label: "IMC", unit: "kg/m²" },
  { code: "crcl", label: "Clairance (Cockcroft-Gault)", unit: "mL/min" },
  { code: "egfr", label: "DFGe (CKD-EPI)", unit: "mL/min/1,73 m²" },
  { code: "hb", label: "Hémoglobine", unit: "g/dL" },
  { code: "platelets", label: "Plaquettes", unit: "G/L" },
  { code: "inr", label: "INR", unit: "" },
];

/** All conditions of a rule must hold (AND). */
export type Condition =
  | {
      kind: "drug";
      /** ATC code or group prefix. */
      atc: string;
      /** Daily dose of the matched treatment, mg. */
      dailyDose?: { op: Comparator; mg: number };
      /** The matched treatment is taken for one of these reasons. */
      indications?: Indication[];
      /** Months since the event behind the indication (stent, stroke, VTE). */
      monthsSinceEvent?: { op: Comparator; months: number };
    }
  | { kind: "technique"; in: Technique[] }
  | { kind: "value"; value: PatientValue; op: Comparator; threshold: number }
  /** The intervention: bleeding risk, ESC cardiac risk or grade among the listed ones. */
  | { kind: "surgery"; attribute: SurgeryAttribute; in: string[] }
  /** An antecedent of the consultation, present or absent. */
  | { kind: "history"; condition: ConditionCode; present: boolean; /** Kept for antecedents added by the user. */ label?: string }
  /**
   * A reported allergy (allergen of the catalogue), present or absent;
   * optionally only when the PEN-FAST score says a true allergy is unlikely
   * (< 3, "low") or possible (≥ 3, "high").
   */
  | { kind: "allergy"; allergen: string; present: boolean; label?: string; penFast?: "low" | "high" };

export type SurgeryAttribute = "bleedingRisk" | "cardiacRisk" | "grade";

export const SURGERY_ATTRIBUTES: { code: SurgeryAttribute; label: string; values: { code: string; label: string }[] }[] = [
  { code: "bleedingRisk", label: "Risque hémorragique de la chirurgie", values: [{ code: "minimal", label: "minime" }, { code: "low", label: "faible" }, { code: "high", label: "élevé" }] },
  { code: "cardiacRisk", label: "Risque cardiaque de la chirurgie (ESC)", values: [{ code: "low", label: "faible" }, { code: "intermediate", label: "intermédiaire" }, { code: "high", label: "élevé" }] },
  { code: "grade", label: "Grade de la chirurgie", values: [{ code: "minor", label: "mineure" }, { code: "intermediate", label: "intermédiaire" }, { code: "major", label: "majeure" }] },
];

export type RuleType = "stop_before" | "resume_after" | "requirement" | "exam" | "info";

export const RULE_TYPES: { code: RuleType; label: string }[] = [
  { code: "stop_before", label: "Délai d'arrêt avant le geste" },
  { code: "resume_after", label: "Délai de reprise après le geste" },
  { code: "requirement", label: "Condition à remplir avant le geste" },
  { code: "exam", label: "Examen à demander" },
  { code: "info", label: "Information (jamais appliquée automatiquement)" },
];

export type RuleAction =
  | { type: "stop_before"; hours: number }
  | { type: "resume_after"; hours: number }
  | { type: "requirement"; text: string; blocking: boolean }
  /** withinDays: to be done at most this many days before the gesture (INR the day before…). */
  | { type: "exam"; exam: string; withinDays?: number }
  | { type: "info"; text: string };

export type RuleStatus = "draft" | "active" | "archived";

export interface Rule {
  id: string;
  title: string;
  /** The rule in one sentence, as written in the source (or your own wording). */
  statement: string;
  conditions: Condition[];
  action: RuleAction;
  source: RuleSource;
  /** Other sources on the same point that disagree — shown, never applied. */
  divergences: { summary: string; source: string; level: SourceLevel }[];
  /** "Pourquoi ?" — explanations attached to the rule. */
  explanations: string[];
  status: RuleStatus;
  version: number;
  /** When you checked the quote in the source — null until then (a draft). */
  verified_at: string | null;
  /** Date after which the rule gets a "to re-check" badge. */
  review_at: string | null;
  /** How it was obtained: the question asked and the tool used. */
  question: string;
  tool: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// What the engine evaluates rules against
// ---------------------------------------------------------------------------

export interface PatientTreatment {
  id: string;
  atc: string;
  name: string;
  /** Substances of a fixed combination (ATC), copied from the catalogue. */
  components?: string[];
  /** Catalogue entry it was picked from (needed for CBIP products without an ATC code). */
  catalogId?: string;
  dailyDoseMg?: number;
  indication?: Indication;
  /** ISO date of the event behind the indication (stent, stroke…). */
  eventDate?: string;
  /** ISO date-time of the last dose, when known. */
  lastDoseAt?: string;
}

export interface PatientContext {
  age?: number;
  sex?: Sex;
  weightKg?: number;
  heightCm?: number;
  creatinineMgDl?: number;
  hb?: number;
  platelets?: number;
  inr?: number;
  treatments: PatientTreatment[];
  techniques: Technique[];
  /** ISO date-time of the planned gesture. */
  plannedAt?: string;
  /** Current hospital, for local protocols. */
  hospital?: string;
  surgery?: Partial<Record<SurgeryAttribute, string>>;
  /** Structured antecedents (tri-state). */
  conditions?: Partial<Record<ConditionCode, { present: boolean }>>;
  /** Allergies asked: the list, or "none known" confirmed. Neither: not asked. */
  allergyList?: { allergenId?: string; label: string; penFast?: Partial<Record<PenFastItem, boolean>> }[];
  noKnownAllergy?: boolean;
}
