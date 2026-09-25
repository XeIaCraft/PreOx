// Suggests the structured form of a rule from its text (RÈGLE + CONDITIONS
// of a parsed block): which drugs (ATC), which gesture, which delay, which
// thresholds. Plain pattern matching over a closed vocabulary — no AI. The
// suggestion is only a starting point: the user confirms or corrects every
// field before the rule can be applied.

import { CLASS_WORDS, MEDICATIONS } from "../medications";
import { DEFAULT_ALLERGENS } from "../catalog-defaults";
import type { Comparator, Condition, RuleAction, Technique } from "./types";

export interface StructureSuggestion {
  conditions: Condition[];
  action: RuleAction;
  /** Fields that couldn't be found in the text — to fill in by hand. */
  unresolved: string[];
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** ATC codes named in a text: substances and Belgian brands of the catalogue, then class words ("xabans", "AOD"…). */
export function findDrugs(text: string): string[] {
  const t = fold(text);
  const found = new Set<string>();
  for (const m of MEDICATIONS) {
    const names = [m.name, ...(m.brands ?? [])].map(fold);
    if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))) found.add(m.atc);
  }
  if (found.size === 0) for (const c of CLASS_WORDS) if (c.pattern.test(text)) c.atc.forEach((a) => found.add(a));
  return [...found];
}

const TECHNIQUE_WORDS: { technique: Technique; pattern: RegExp }[] = [
  { technique: "neuraxial", pattern: /neuraxia|rachi|p[ée]ridural|spinal|intrath[ée]cal|p[ée]rim[ée]dullaire|centra(l|ux)|ponction lombaire/i },
  { technique: "deep_block", pattern: /bloc[s]? profond|non compressible|plexus lombaire|paravert[ée]bral|infraclavicul|deep block/i },
  { technique: "superficial_block", pattern: /bloc[s]? superficiel|compressible|bloc[s]? p[ée]riph[ée]rique/i },
];

export function findTechniques(text: string): Technique[] {
  return TECHNIQUE_WORDS.filter((w) => w.pattern.test(text)).map((w) => w.technique);
}

/** "72 h", "72 heures", "3 jours", "cinq jours" → hours. */
export function findHours(text: string): number | null {
  const words: Record<string, number> = { un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, dix: 10 };
  const h = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|heures?|hours?)/i);
  if (h) return Number(h[1].replace(",", "."));
  const d = text.match(/(\d+|un|deux|trois|quatre|cinq|six|sept|dix)\s*(?:jours?|days?)/i);
  if (d) return (Number(d[1]) || words[d[1].toLowerCase()]) * 24;
  return null;
}

function toComparator(s: string): Comparator {
  return s === "<" ? "<" : s === "≤" || s === "<=" ? "<=" : s === ">" ? ">" : ">=";
}

/** "CrCl ≥ 30", "clairance < 30 mL/min", "CrCl 30–50". */
export function findClearance(text: string): { op: Comparator; threshold: number }[] {
  const out: { op: Comparator; threshold: number }[] = [];
  const re = /(?:CrCl|clairance|ClCr|DFG)[^\d<>≥≤]{0,25}(<=|>=|≤|≥|<|>)\s*(\d+)/gi;
  for (const m of text.matchAll(re)) out.push({ op: toComparator(m[1]), threshold: Number(m[2]) });
  const range = text.match(/(?:CrCl|clairance|ClCr|DFG)[^\d]{0,25}(\d+)\s*[–-]\s*(\d+)/i);
  if (out.length === 0 && range) out.push({ op: ">=", threshold: Number(range[1]) }, { op: "<", threshold: Number(range[2]) });
  return out;
}

/** "20 mg", "20 mg/jour", "dose élevée" is left to the user (definitions differ between sources). */
export function findDailyDose(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*mg\s*(?:\/\s*(?:j|jour|day)|une fois par jour|once daily|par jour)?/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/**
 * "allergie (déclarée) à la pénicilline", "PEN-FAST < 3": an allergy
 * condition — only when the text speaks of an allergy, not of the drug itself.
 */
export function findAllergies(text: string): Condition[] {
  const t = fold(text);
  if (!/allergi|pen-?fast/.test(t)) return [];
  const penFast: "low" | "high" | undefined = /pen-?fast[^.]{0,30}(<|inf[ée]rieur|faible|moins de)\s*(a\s*)?3|pen-?fast[^.]{0,20}(0|1|2)\b/.test(t)
    ? "low"
    : /pen-?fast[^.]{0,30}(≥|>=|sup[ée]rieur|[ée]lev[ée]|au moins)\s*(ou [ée]gal )?(a\s*)?3/.test(t)
      ? "high"
      : undefined;
  const out: Condition[] = [];
  for (const a of DEFAULT_ALLERGENS) {
    const words = [a.label, ...a.keywords].map(fold).filter((k) => k.length >= 4);
    if (!words.some((k) => new RegExp(`allergi[^.]{0,40}${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t))) continue;
    out.push({ kind: "allergy", allergen: a.id, present: true, label: a.label, ...(penFast && a.assessment === "pen-fast" ? { penFast } : {}) });
  }
  return out;
}

export function suggestStructure(statement: string, conditionsText: string): StructureSuggestion {
  const all = `${statement}\n${conditionsText}`;
  const unresolved: string[] = [];
  const conditions: Condition[] = [];

  const allergies = findAllergies(all);
  conditions.push(...allergies);
  // The drugs named in an allergy rule are the alternatives, not a condition.
  const drugs = allergies.length ? [] : findDrugs(all);
  const dose = findDailyDose(conditionsText) ?? findDailyDose(statement);
  if (drugs.length === 0 && allergies.length === 0) unresolved.push("Médicament concerné");
  for (const atc of drugs) conditions.push({ kind: "drug", atc, ...(dose && drugs.length === 1 ? { dailyDose: { op: ">=", mg: dose } } : {}) });

  const techniques = findTechniques(all);
  if (techniques.length > 0) conditions.push({ kind: "technique", in: techniques });

  for (const c of findClearance(all)) conditions.push({ kind: "value", value: "crcl", op: c.op, threshold: c.threshold });

  const hours = findHours(statement) ?? findHours(conditionsText);
  let action: RuleAction;
  if (/apr[èe]s|reprise|reprendre|after/i.test(statement) && hours !== null) action = { type: "resume_after", hours };
  else if (hours !== null && /avant|arr[êe]t|derni[èe]re (prise|dose)|before|interruption|intervalle/i.test(all)) action = { type: "stop_before", hours };
  else if (/test|dosage|anti-?xa|dans les normes|requis|seulement si|uniquement si|ne peut .* que si/i.test(statement)) action = { type: "requirement", text: statement, blocking: /ne peut|contre-indiqu|seulement si|uniquement si/i.test(statement) };
  else {
    action = { type: "info", text: statement };
    unresolved.push("Type de règle (délai, condition, examen…)");
  }
  if ((action.type === "stop_before" || action.type === "resume_after") && techniques.length === 0) unresolved.push("Geste concerné");

  return { conditions, action, unresolved };
}
