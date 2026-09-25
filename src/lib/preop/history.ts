import { DEFAULT_CONDITIONS } from "./catalog-conditions";
import type { ConditionItem } from "./catalog";

// Structured antecedents and substance use of the consultation. Each
// condition is tri-state (not asked / no / yes), with the qualifiers that
// change the anaesthetic assessment (poorly controlled, recent < 3 months,
// severe). They feed the scores (Lee, STOP-BANG, Apfel, CHA₂DS₂-VASc,
// HAS-BLED…), the ASA suggestion and the recommended tests — the same
// answer is never asked twice.

/** Id of an antecedent in the catalogue (built-in ones are listed in catalog-conditions.ts; users can add theirs). */
export type ConditionCode = string;

/** Qualifiers that change the class of risk. */
export type Qualifier = "poorlyControlled" | "recent" | "severe";

export const QUALIFIER_LABELS: Record<Qualifier, string> = { poorlyControlled: "mal contrôlé(e)", recent: "< 3 mois", severe: "sévère" };

export interface ConditionEntry {
  present: boolean;
  poorlyControlled?: boolean;
  /** Event (MI, stent, stroke/TIA) less than 3 months ago. */
  recent?: boolean;
  severe?: boolean;
  detail?: string;
}

export type Conditions = Partial<Record<ConditionCode, ConditionEntry>>;

/** true / false / undefined (not asked). */
export function has(c: Conditions, code: ConditionCode): boolean | undefined {
  const e = c[code];
  return e === undefined ? undefined : e.present;
}

export function qualified(c: Conditions, code: ConditionCode, q: Qualifier): boolean {
  const e = c[code];
  return !!e?.present && !!e[q];
}

/** Any of the codes present → true; all answered "no" → false; otherwise unknown. */
export function anyOf(c: Conditions, codes: ConditionCode[]): boolean | undefined {
  const values = codes.map((code) => has(c, code));
  if (values.some((v) => v === true)) return true;
  if (values.every((v) => v === false)) return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Substance use
// ---------------------------------------------------------------------------

export type TobaccoStatus = "never" | "current" | "former";
export type DrugCode = "cannabis" | "cocaine" | "opioids" | "amphetamines" | "other";

export const DRUGS: { code: DrugCode; label: string }[] = [
  { code: "cannabis", label: "Cannabis" },
  { code: "cocaine", label: "Cocaïne" },
  { code: "opioids", label: "Opioïdes (héroïne, méthadone…)" },
  { code: "amphetamines", label: "Amphétamines / MDMA" },
  { code: "other", label: "Autre" },
];

export interface Substances {
  tobacco?: TobaccoStatus;
  packYears?: number;
  /** Former smoker: when stopped (YYYY-MM). */
  quitDate?: string;
  /** Standard drinks (10 g) per week; 0 = none. */
  alcoholUnitsPerWeek?: number;
  alcoholDependence?: boolean;
  /** undefined = not asked, [] = none. */
  drugs?: DrugCode[];
  drugsDetail?: string;
}

export function substanceSummary(s: Substances): string {
  const parts: string[] = [];
  if (s.tobacco === "current") parts.push(`Tabac actif${s.packYears ? ` (${s.packYears} PA)` : ""}`);
  if (s.tobacco === "former") parts.push(`Ancien fumeur${s.packYears ? ` (${s.packYears} PA)` : ""}${s.quitDate ? `, arrêt ${s.quitDate}` : ""}`);
  if (s.alcoholUnitsPerWeek) parts.push(`Alcool ${s.alcoholUnitsPerWeek} U/sem${s.alcoholDependence ? " (dépendance)" : ""}`);
  else if (s.alcoholDependence) parts.push("Dépendance à l'alcool");
  if (s.drugs?.length) parts.push(`Drogues : ${s.drugs.map((d) => DRUGS.find((x) => x.code === d)?.label.split(" (")[0]).join(", ")}${s.drugsDetail ? ` (${s.drugsDetail})` : ""}`);
  return parts.join(" · ");
}

/** "HTA (mal contrôlée), coronaropathie (< 3 mois), diabète insulinotraité" — in catalogue order. */
export function conditionsSummary(c: Conditions, items: ConditionItem[] = DEFAULT_CONDITIONS): string {
  const out: string[] = [];
  const known = new Set<string>();
  for (const def of items) {
    known.add(def.id);
    const e = c[def.id];
    if (!e?.present) continue;
    const q = (Object.keys(def.qualifiers ?? {}) as Qualifier[]).filter((k) => e[k]).map((k) => def.qualifiers![k] ?? QUALIFIER_LABELS[k]);
    out.push(`${def.label}${q.length ? ` (${q.join(", ")})` : ""}${e.detail ? ` : ${e.detail}` : ""}`);
  }
  // Antecedents recorded with an item since removed from the catalogue.
  for (const [id, e] of Object.entries(c)) if (e?.present && !known.has(id)) out.push(e.detail ? `${id} : ${e.detail}` : id);
  return out.join(" ; ");
}
