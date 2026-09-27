// What you actually use: drugs (by name, class and route), procedures and
// equipment (airway devices, lines, monitoring…), regional techniques and
// technical acts, over a period — from the cases' optional details. The
// official carnet never shows this; « hors carnet » cases are counted only
// when asked (they are part of your practice, not of the carnet).

import { DRUG_CLASSES, DRUG_ROUTES, PROCEDURE_GROUPS, drugClassOf } from "./pharmaco";
import { OPERATION_CATEGORIES, REGIONAL_TYPES, TECHNICAL_ACTS } from "./referentiel";
import type { CarnetCase } from "./types";

export interface Count {
  code: string;
  label: string;
  count: number;
}

export interface DrugUsage {
  name: string;
  /** Code of DRUG_CLASSES, or null for a drug typed freely. */
  klass: string | null;
  /** Cases where it was given. */
  cases: number;
  routes: Count[];
}

export interface UsageStats {
  cases: number;
  /** Cases with at least one drug or procedure recorded (the base of the percentages). */
  detailed: number;
  drugs: DrugUsage[];
  drugClasses: Count[];
  procedures: { code: string; label: string; items: Count[] }[];
  techniques: Count[];
  regional: Count[];
  acts: Count[];
  categories: Count[];
  pediatricUnder4: number;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const byCount = (a: Count, b: Count) => b.count - a.count || a.label.localeCompare(b.label, "fr");
const labelOf = (list: { code: string; label: string; short?: string }[], code: string) => list.find((x) => x.code === code)?.label ?? code;

function tally(map: Map<string, Count>, code: string, label: string) {
  const c = map.get(code);
  if (c) c.count++;
  else map.set(code, { code, label, count: 1 });
}

export interface StatsFilter {
  from?: string;
  to?: string;
  stageId?: string;
}

export function filterCases(cases: CarnetCase[], f: StatsFilter): CarnetCase[] {
  return cases.filter((c) => (!f.from || c.case_date >= f.from) && (!f.to || c.case_date <= f.to) && (!f.stageId || c.stage_id === f.stageId));
}

export function usageStats(cases: CarnetCase[]): UsageStats {
  const drugs = new Map<string, { name: string; klass: string | null; cases: number; routes: Map<string, Count> }>();
  const classes = new Map<string, Count>();
  const procedures = new Map<string, Count>();
  const techniques = new Map<string, Count>();
  const regional = new Map<string, Count>();
  const acts = new Map<string, Count>();
  const categories = new Map<string, Count>();
  let detailed = 0;
  let pediatricUnder4 = 0;

  for (const c of cases) {
    const d = c.details ?? {};
    if (d.drugs?.length || d.procedures?.length) detailed++;
    if (c.pediatric_under_4) pediatricUnder4++;
    tally(categories, c.operation_category, labelOf(OPERATION_CATEGORIES, c.operation_category));
    if (c.general_anesthesia) tally(techniques, "ag", "AG / sédation");
    if (c.regional_types.length) tally(techniques, "alr", "ALR");
    if (c.general_anesthesia && c.regional_types.length) tally(techniques, "ag_alr", "AG + ALR");
    for (const r of new Set(c.regional_types)) tally(regional, r, c.other_labels?.[r] || labelOf(REGIONAL_TYPES, r));
    for (const a of new Set(c.technical_acts)) tally(acts, a, c.other_labels?.[a] || labelOf(TECHNICAL_ACTS, a));
    for (const p of new Set(d.procedures ?? [])) tally(procedures, p, p);

    // A drug given twice in one case (bolus then PSE) counts once for the case, each route once.
    const seen = new Map<string, Set<string>>();
    for (const drug of d.drugs ?? []) {
      const key = fold(drug.name);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(drug.route);
      if (!drugs.has(key)) drugs.set(key, { name: drug.name.trim(), klass: drugClassOf(drug.name), cases: 0, routes: new Map() });
    }
    const classesInCase = new Set<string>();
    for (const [key, routes] of seen) {
      const entry = drugs.get(key)!;
      entry.cases++;
      for (const r of routes) tally(entry.routes, r, labelOf(DRUG_ROUTES, r));
      classesInCase.add(entry.klass ?? "autre");
    }
    for (const k of classesInCase) tally(classes, k, labelOf(DRUG_CLASSES, k));
  }

  const procedureGroups = PROCEDURE_GROUPS.map((g) => ({
    code: g.code,
    label: g.label,
    items: g.items.flatMap((i) => (procedures.has(i.code) ? [{ ...procedures.get(i.code)!, label: i.label }] : [])).sort(byCount),
  })).filter((g) => g.items.length);
  const known = new Set(PROCEDURE_GROUPS.flatMap((g) => g.items.map((i) => i.code)));
  const others = [...procedures.values()].filter((p) => !known.has(p.code)).sort(byCount);
  if (others.length) procedureGroups.push({ code: "autres", label: "Autres", items: others });

  return {
    cases: cases.length,
    detailed,
    drugs: [...drugs.values()]
      .map((d) => ({ name: d.name, klass: d.klass, cases: d.cases, routes: [...d.routes.values()].sort(byCount) }))
      .sort((a, b) => b.cases - a.cases || a.name.localeCompare(b.name, "fr")),
    drugClasses: [...classes.values()].sort(byCount),
    procedures: procedureGroups,
    techniques: [...techniques.values()].sort(byCount),
    regional: [...regional.values()].sort(byCount),
    acts: [...acts.values()].sort(byCount),
    categories: [...categories.values()].sort(byCount),
    pediatricUnder4,
  };
}
