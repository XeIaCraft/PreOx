// The editable reference lists of the "Préop" module: antecedents,
// allergens, procedures, treatments and treatment classes — each with what
// it implies (ASA class, point of attention, equipment, antecedent implied,
// rule expected). PreOx ships defaults; the user's changes are stored as
// overrides (added, edited, hidden) so that improved defaults still reach
// them. Settings screen: components/preop/settings.tsx.

import type { AttentionLevel } from "./attention";
import type { Qualifier } from "./history";
import type { Approach, Population, SurgeryGrade } from "./surgeries";
import { treatmentMatches, type Medication } from "./medications";
import type { Technique } from "./rules/types";
import type { SurgeryExamProfile } from "./exams";

export interface AttentionSpec {
  level: AttentionLevel;
  text: string;
  material?: string[];
}

export type SystemCode = "cardio" | "resp" | "endo" | "renal" | "digest" | "neuro" | "psy" | "hemato" | "other" | "surgical" | "anaes";

export const SYSTEM_LABELS: Record<SystemCode, string> = {
  cardio: "Cardiovasculaire",
  resp: "Respiratoire",
  endo: "Endocrinien et métabolique",
  renal: "Rénal",
  digest: "Hépatique et digestif",
  neuro: "Neurologique",
  psy: "Psychiatrique",
  hemato: "Hématologie",
  other: "Autres",
  surgical: "Antécédents chirurgicaux",
  anaes: "Antécédents anesthésiques",
};

export const SYSTEM_ORDER: SystemCode[] = ["cardio", "resp", "endo", "renal", "digest", "neuro", "psy", "hemato", "other", "surgical", "anaes"];

/** When and against what the item was last checked in the literature. */
export interface Verifiable {
  /** ISO date of the last check against the literature. */
  verifiedAt?: string;
  /** Guideline or reference it rests on. */
  source?: string;
}

/** One answer of a structured detail (stage, class…) and what it implies. */
export interface DetailOption {
  code: string;
  label: string;
  /** ASA class this answer suggests. */
  asa?: number;
  /** Replaces the antecedent's point of attention when chosen. */
  attention?: AttentionSpec;
  /** Also counts as this qualifier (scores and rules use qualifiers). */
  qualifier?: Qualifier;
}

/** A structured detail asked once the antecedent is present (stage, score, date of the event…). */
export interface ConditionDetail {
  id: string;
  label: string;
  kind: "choice" | "number" | "date" | "text";
  options?: DetailOption[];
  unit?: string;
  /** Short help shown under the field (how to grade it). */
  hint?: string;
}

export interface ConditionItem extends Verifiable {
  id: string;
  label: string;
  system: SystemCode;
  /** Other words it is typed as (searched, never shown). */
  keywords?: string[];
  /** Qualifiers offered once it is present, with their label for this antecedent. */
  qualifiers?: Partial<Record<Qualifier, string>>;
  /** ASA class it suggests, and the class when a qualifier is set. */
  asa?: number;
  asaIf?: Partial<Record<Qualifier, number>>;
  attention?: AttentionSpec;
  /** Replaces `attention` when the qualifier is set. */
  attentionIf?: Partial<Record<Qualifier, AttentionSpec>>;
  /** Its perioperative management should come from a rule: flagged when none exists. */
  needsRule?: boolean;
  female?: boolean;
  /** Structured details (stage, class, date…) asked once present. */
  details?: ConditionDetail[];
}

export interface AllergenItem extends Verifiable {
  id: string;
  label: string;
  /** Words recognised in what is typed in "Allergies". */
  keywords: string[];
  /** A plan drug whose name contains one of these words raises an alert. */
  drugWords: string[];
  attention: AttentionSpec;
  /** Score used to judge whether the reported allergy is likely true. */
  assessment?: "pen-fast";
  /** What to do (alternative product, test, referral) should come from a rule: flagged when none exists. */
  needsRule?: boolean;
}

export type BleedingRisk = "minimal" | "low" | "high";

export type CareSetting = "ambulatory" | "inpatient" | "icu";

export interface SurgeryItem extends Verifiable {
  id: string;
  name: string;
  aka?: string[];
  category: string;
  grade: SurgeryGrade;
  cardiacRisk: "low" | "intermediate" | "high";
  bleedingRisk: BleedingRisk;
  rcriHighRisk: boolean;
  incision: "peripheral" | "upper_abdominal" | "intrathoracic";
  position?: string;
  durationHours?: number;
  /** Usual anaesthetic techniques — pre-fill « Technique envisagée » when no protocol matches. */
  techniques?: Technique[];
  /** Protocol applied to this intervention (else matched by name). */
  protocolId?: string;
  setting?: CareSetting;
  tourniquet?: boolean;
  /** Closed space (intracranial, spinal canal, posterior chamber of the eye): a haematoma is serious whatever its volume. */
  closedSpace?: boolean;
  /** Usual work-up of the procedure (exams.ts), each exam tied to its guideline. */
  examProfile?: SurgeryExamProfile;
  approach?: Approach;
  /** Variants of the same operation share a family (open, laparoscopic, robotic, child…). */
  family?: string;
  population?: Population;
  sex?: "M" | "F";
  /** What the approach or the operation changes for the anaesthesia. */
  specifics?: string[];
  notes?: string;
}

/** A known interaction with a product anaesthesia may use. */
export interface Interaction {
  /** What it interacts with, as shown ("tramadol, péthidine"). */
  with: string;
  /** Words matched against the drugs of the plan (a planned drug raises an alert). */
  words: string[];
  effect: string;
  level: AttentionLevel;
}

export interface MedicationItem extends Medication, Verifiable {
  id: string;
  /** Antecedent (condition id) this treatment implies. */
  implies?: string;
  attention?: AttentionSpec;
  /** false: no perioperative rule expected (paracetamol…). Default: expected. */
  needsRule?: boolean;
  interactions?: Interaction[];
}

/** Implications of a whole ATC class (all SSRIs, all opioids…). */
export interface DrugClassItem extends Verifiable {
  id: string;
  atc: string;
  label: string;
  implies?: string;
  attention?: AttentionSpec;
  needsRule?: boolean;
  interactions?: Interaction[];
  /** CBIP chapter codes of the class (« HC » = opioids): for CBIP products the app has no ATC code for. */
  cbip?: string[];
}

/** Patient values (vitals, biology, body measures) a threshold can watch. */
export type WatchedValue =
  | "sbp"
  | "dbp"
  | "hr"
  | "spo2"
  | "hb"
  | "platelets"
  | "inr"
  | "hba1c"
  | "potassium"
  | "sodium"
  | "glucose"
  | "albumin"
  | "ntprobnp"
  | "troponin"
  | "ferritin"
  | "egfr"
  | "crcl"
  | "bmi"
  | "age";

/** A value to flag: « FC > 100 /min », with what it means and what it implies. */
export interface ValueCheckItem extends Verifiable {
  id: string;
  label: string;
  value: WatchedValue;
  op: "<" | "<=" | ">" | ">=";
  threshold: number;
  /** Only for this sex (WHO anaemia thresholds…). */
  sex?: "M" | "F";
  attention?: AttentionSpec;
  /** Antecedent it suggests (to confirm), with a qualifier. */
  implies?: string;
  qualifier?: Qualifier;
  /** Checks of the same group: only the most severe one met is shown. */
  group?: string;
}

export interface Catalogs {
  conditions: ConditionItem[];
  allergens: AllergenItem[];
  surgeries: SurgeryItem[];
  medications: MedicationItem[];
  drugClasses: DrugClassItem[];
  values: ValueCheckItem[];
}

export type CatalogKind = keyof Catalogs;

export const CATALOG_KINDS: CatalogKind[] = ["conditions", "allergens", "surgeries", "medications", "drugClasses", "values"];

/** The user's changes to one list. */
export interface CatalogOverrides<T extends { id: string }> {
  added: T[];
  edited: Record<string, T>;
  hidden: string[];
}

export type AllOverrides = { [K in CatalogKind]?: CatalogOverrides<Catalogs[K][number]> };

export function emptyOverrides<T extends { id: string }>(): CatalogOverrides<T> {
  return { added: [], edited: {}, hidden: [] };
}

export function mergeList<T extends { id: string }>(defaults: T[], o: CatalogOverrides<T> | undefined): T[] {
  if (!o) return defaults;
  const hidden = new Set(o.hidden);
  const base = defaults.filter((d) => !hidden.has(d.id)).map((d) => o.edited[d.id] ?? d);
  return [...base, ...o.added.filter((a) => !hidden.has(a.id))];
}

export function mergeCatalogs(defaults: Catalogs, overrides: AllOverrides): Catalogs {
  return {
    conditions: mergeList(defaults.conditions, overrides.conditions),
    allergens: mergeList(defaults.allergens, overrides.allergens),
    surgeries: mergeList(defaults.surgeries, overrides.surgeries),
    medications: mergeList(defaults.medications, overrides.medications),
    drugClasses: mergeList(defaults.drugClasses, overrides.drugClasses),
    values: mergeList(defaults.values, overrides.values),
  };
}

export const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Items whose label or keywords match what is typed (word starts first). */
export function searchItems<T>(items: T[], query: string, words: (t: T) => string[], limit = 8): T[] {
  const q = fold(query);
  if (q.length < 1) return [];
  const scored: { t: T; score: number }[] = [];
  for (const t of items) {
    const ws = words(t).map(fold);
    let score = 0;
    for (const w of ws) {
      if (w === q) score = Math.max(score, 3);
      else if (w.startsWith(q) || w.includes(` ${q}`)) score = Math.max(score, 2);
      else if (q.length >= 3 && w.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ t, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.t);
}

/** The catalogue entry of a patient's treatment: by the id it was picked with, else by ATC code. */
export function medicationOf(t: { atc: string; catalogId?: string }, list: MedicationItem[]): MedicationItem | undefined {
  if (t.catalogId) {
    const m = list.find((x) => x.id === t.catalogId);
    if (m) return m;
  }
  return t.atc ? list.find((m) => m.atc === t.atc || m.id === t.atc) : undefined;
}

/** The classes a treatment belongs to: by ATC code (itself or its components), or by CBIP chapter. Most specific first. */
export function classesOf(t: { atc: string; catalogId?: string; components?: string[] }, catalogs: Pick<Catalogs, "medications" | "drugClasses">): DrugClassItem[] {
  const chapter = medicationOf(t, catalogs.medications)?.cbip?.chapter;
  const score = (k: DrugClassItem) => Math.max(treatmentMatches(t, k.atc) ? k.atc.length : 0, chapter ? Math.max(0, ...(k.cbip ?? []).filter((p) => chapter.startsWith(p)).map((p) => p.length)) : 0);
  return catalogs.drugClasses
    .map((k) => ({ k, s: score(k) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.k);
}
