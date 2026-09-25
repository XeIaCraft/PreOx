// The editable reference lists of the "Préop" module: antecedents,
// allergens, procedures, treatments and treatment classes — each with what
// it implies (ASA class, point of attention, equipment, antecedent implied,
// rule expected). PreOx ships defaults; the user's changes are stored as
// overrides (added, edited, hidden) so that improved defaults still reach
// them. Settings screen: components/preop/settings.tsx.

import type { AttentionLevel } from "./attention";
import type { Qualifier } from "./history";
import type { SurgeryGrade } from "./surgeries";
import type { Medication } from "./medications";

export interface AttentionSpec {
  level: AttentionLevel;
  text: string;
  material?: string[];
}

export type SystemCode = "cardio" | "resp" | "endo" | "renal" | "digest" | "neuro" | "psy" | "hemato" | "other" | "anaes";

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
  anaes: "Antécédents anesthésiques",
};

export const SYSTEM_ORDER: SystemCode[] = ["cardio", "resp", "endo", "renal", "digest", "neuro", "psy", "hemato", "other", "anaes"];

export interface ConditionItem {
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
}

export interface AllergenItem {
  id: string;
  label: string;
  /** Words recognised in what is typed in "Allergies". */
  keywords: string[];
  /** A plan drug whose name contains one of these words raises an alert. */
  drugWords: string[];
  attention: AttentionSpec;
}

export type BleedingRisk = "minimal" | "low" | "high";

export interface SurgeryItem {
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
}

export interface MedicationItem extends Medication {
  id: string;
  /** Antecedent (condition id) this treatment implies. */
  implies?: string;
  attention?: AttentionSpec;
  /** false: no perioperative rule expected (paracetamol…). Default: expected. */
  needsRule?: boolean;
}

/** Implications of a whole ATC class (all SSRIs, all opioids…). */
export interface DrugClassItem {
  id: string;
  atc: string;
  label: string;
  implies?: string;
  attention?: AttentionSpec;
  needsRule?: boolean;
}

export interface Catalogs {
  conditions: ConditionItem[];
  allergens: AllergenItem[];
  surgeries: SurgeryItem[];
  medications: MedicationItem[];
  drugClasses: DrugClassItem[];
}

export type CatalogKind = keyof Catalogs;

export const CATALOG_KINDS: CatalogKind[] = ["conditions", "allergens", "surgeries", "medications", "drugClasses"];

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
