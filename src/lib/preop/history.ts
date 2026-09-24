// Structured antecedents and substance use of the consultation. Each
// condition is tri-state (not asked / no / yes), with the qualifiers that
// change the anaesthetic assessment (poorly controlled, recent < 3 months,
// severe). They feed the scores (Lee, STOP-BANG, Apfel, CHA₂DS₂-VASc,
// HAS-BLED…), the ASA suggestion and the recommended tests — the same
// answer is never asked twice.

export type ConditionCode =
  // Cardiovascular
  | "hypertension"
  | "dyslipidemia"
  | "coronary"
  | "heart_failure"
  | "valve"
  | "murmur"
  | "arrhythmia"
  | "pacemaker"
  | "pad"
  | "vte"
  // Respiratory
  | "asthma"
  | "copd"
  | "osa"
  | "home_o2"
  // Metabolic / endocrine
  | "diabetes_oral"
  | "diabetes_insulin"
  | "thyroid"
  // Renal / hepatic / digestive
  | "ckd"
  | "dialysis"
  | "cirrhosis"
  | "gerd"
  // Neurological
  | "stroke"
  | "epilepsy"
  | "neuromuscular"
  | "cognitive"
  // Haematology / other
  | "bleeding_disorder"
  | "anemia"
  | "cancer"
  | "pregnancy"
  // Anaesthetic history
  | "ponv"
  | "difficult_airway"
  | "malignant_hyperthermia"
  | "anaesthetic_allergy"
  | "pseudocholinesterase";

/** Qualifiers that change the class of risk. */
export type Qualifier = "poorlyControlled" | "recent" | "severe";

export interface ConditionEntry {
  present: boolean;
  poorlyControlled?: boolean;
  /** Event (MI, stent, stroke/TIA) less than 3 months ago. */
  recent?: boolean;
  severe?: boolean;
  detail?: string;
}

export type Conditions = Partial<Record<ConditionCode, ConditionEntry>>;

export interface ConditionDef {
  code: ConditionCode;
  label: string;
  qualifiers?: { key: Qualifier; label: string }[];
  /** Female patients only (pregnancy). */
  female?: boolean;
}

export interface SystemDef {
  code: string;
  label: string;
  conditions: ConditionDef[];
}

const POOR = { key: "poorlyControlled" as const, label: "mal contrôlé(e)" };
const RECENT = { key: "recent" as const, label: "< 3 mois" };
const SEVERE = (label: string) => ({ key: "severe" as const, label });

export const SYSTEMS: SystemDef[] = [
  {
    code: "cardio",
    label: "Cardiovasculaire",
    conditions: [
      { code: "hypertension", label: "HTA", qualifiers: [POOR] },
      { code: "dyslipidemia", label: "Dyslipidémie" },
      { code: "coronary", label: "Coronaropathie (IDM, stent, angor)", qualifiers: [RECENT, SEVERE("ischémie active")] },
      { code: "heart_failure", label: "Insuffisance cardiaque", qualifiers: [SEVERE("FEVG sévèrement ↓")] },
      { code: "valve", label: "Valvulopathie", qualifiers: [SEVERE("sévère")] },
      { code: "murmur", label: "Souffle non exploré" },
      { code: "arrhythmia", label: "FA / trouble du rythme" },
      { code: "pacemaker", label: "Pacemaker / DAI" },
      { code: "pad", label: "Artériopathie (AOMI, carotide)" },
      { code: "vte", label: "Antécédent de MTEV" },
    ],
  },
  {
    code: "resp",
    label: "Respiratoire",
    conditions: [
      { code: "asthma", label: "Asthme", qualifiers: [POOR] },
      { code: "copd", label: "BPCO", qualifiers: [SEVERE("sévère")] },
      { code: "osa", label: "SAOS connu", qualifiers: [{ key: "poorlyControlled", label: "non appareillé" }] },
      { code: "home_o2", label: "O₂ à domicile" },
    ],
  },
  {
    code: "metab",
    label: "Métabolique",
    conditions: [
      { code: "diabetes_oral", label: "Diabète (sans insuline)", qualifiers: [POOR] },
      { code: "diabetes_insulin", label: "Diabète insulinotraité", qualifiers: [POOR] },
      { code: "thyroid", label: "Dysthyroïdie" },
    ],
  },
  {
    code: "renal",
    label: "Rein, foie, digestif",
    conditions: [
      { code: "ckd", label: "Insuffisance rénale chronique", qualifiers: [SEVERE("terminale, non dialysée")] },
      { code: "dialysis", label: "Dialyse" },
      { code: "cirrhosis", label: "Cirrhose / hépatopathie", qualifiers: [SEVERE("décompensée")] },
      { code: "gerd", label: "RGO / estomac plein" },
    ],
  },
  {
    code: "neuro",
    label: "Neurologique",
    conditions: [
      { code: "stroke", label: "AVC / AIT", qualifiers: [RECENT] },
      { code: "epilepsy", label: "Épilepsie" },
      { code: "neuromuscular", label: "Maladie neuromusculaire" },
      { code: "cognitive", label: "Troubles cognitifs" },
    ],
  },
  {
    code: "other",
    label: "Hématologie et autres",
    conditions: [
      { code: "bleeding_disorder", label: "Trouble de l'hémostase" },
      { code: "anemia", label: "Anémie connue" },
      { code: "cancer", label: "Cancer évolutif" },
      { code: "pregnancy", label: "Grossesse", female: true },
    ],
  },
  {
    code: "anaes",
    label: "Antécédents anesthésiques",
    conditions: [
      { code: "ponv", label: "NVPO / mal des transports" },
      { code: "difficult_airway", label: "Intubation difficile" },
      { code: "malignant_hyperthermia", label: "Hyperthermie maligne (perso/famille)" },
      { code: "anaesthetic_allergy", label: "Allergie per-anesthésique" },
      { code: "pseudocholinesterase", label: "Déficit en pseudocholinestérase" },
    ],
  },
];

export const CONDITION_CODES: ConditionCode[] = SYSTEMS.flatMap((s) => s.conditions.map((c) => c.code));

export const CONDITION_DEFS: Map<ConditionCode, ConditionDef> = new Map(SYSTEMS.flatMap((s) => s.conditions.map((c) => [c.code, c] as [ConditionCode, ConditionDef])));

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

/** "HTA mal contrôlée, coronaropathie (< 3 mois), diabète insulinotraité" */
export function conditionsSummary(c: Conditions): string {
  const out: string[] = [];
  for (const s of SYSTEMS) {
    for (const def of s.conditions) {
      const e = c[def.code];
      if (!e?.present) continue;
      const q = (def.qualifiers ?? []).filter((x) => e[x.key]).map((x) => x.label);
      out.push(`${def.label}${q.length ? ` (${q.join(", ")})` : ""}${e.detail ? ` : ${e.detail}` : ""}`);
    }
  }
  return out.join(" ; ");
}
