// Searching the rule library: by title, text, source, and by what the rule
// is about — the drugs it targets (INN and Belgian brands of the ATC code or
// group, « Glucophage » finds the metformin rules), the antecedents and
// allergens it names.

import { DEFAULT_CATALOGS } from "../catalog-defaults";
import { atcLabel, treatmentMatches } from "../medications";
import { describeRule } from "./describe";
import type { Rule } from "./types";

export const foldSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const drugWords = new Map<string, string>();

/** INN, brands and class label of every treatment an ATC code or group covers. */
function wordsForAtc(atc: string): string {
  let w = drugWords.get(atc);
  if (w === undefined) {
    const meds = DEFAULT_CATALOGS.medications.filter((m) => treatmentMatches(m, atc));
    const classes = DEFAULT_CATALOGS.drugClasses.filter((k) => k.atc.startsWith(atc) || atc.startsWith(k.atc)).map((k) => k.label);
    w = foldSearch([atc, atcLabel(atc), ...classes, ...meds.flatMap((m) => [m.name, ...(m.brands ?? []).slice(0, 12)])].join(" "));
    drugWords.set(atc, w);
  }
  return w;
}

type Searchable = Pick<Rule, "title" | "statement" | "conditions" | "action" | "source">;

export function ruleSearchText(r: Searchable): string {
  const parts = [r.title, r.statement, r.source.organisation, r.source.title, describeRule(r as Rule)];
  for (const c of r.conditions) {
    if (c.kind === "drug") parts.push(wordsForAtc(c.atc));
    if (c.kind === "history") parts.push(c.label ?? c.condition);
    if (c.kind === "allergy") parts.push(c.label ?? c.allergen);
  }
  return foldSearch(parts.join(" "));
}

/** Every word of the query starts a word of the rule (« metf » finds « metformine »). */
export function ruleMatches(r: Searchable, query: string): boolean {
  const words = foldSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const text = ` ${ruleSearchText(r)}`;
  return words.every((w) => text.includes(` ${w}`));
}
