// The rule engine: which rules apply to this patient and this plan, what
// they produce (a deadline for the last dose, a conflict, a requirement),
// which rule wins when sources disagree, what information is missing to
// decide, and which situations have no rule at all.
//
// Conditions are three-valued: true, false, or unknown (the data needed to
// decide isn't there). A rule with an unknown condition is never applied
// silently nor ignored silently — it comes back as "needs_info" with the
// exact questions to answer ("why does the patient take aspirin?", "what
// is the daily dose?"). That's how primary vs secondary prevention, a
// recent stent or a reduced creatinine clearance change the outcome.

import { cockcroftGault, bmi, ckdEpi2021, penFast } from "../scores";
import { atcMatches, treatmentMatches } from "../medications";
import { INDICATIONS, PATIENT_VALUES, SOURCE_LEVELS, SURGERY_ATTRIBUTES, TECHNIQUES } from "./types";
import { defaultConditionLabel } from "../catalog-conditions";
import { ruleTarget } from "./target";
import type { Comparator, Condition, PatientContext, PatientTreatment, PatientValue, Rule, RuleTarget, SourceLevel, Technique } from "./types";

export interface MissingInfo {
  /** Stable key, to de-duplicate the same question asked by several rules. */
  key: string;
  label: string;
  treatmentId?: string;
}

type Truth = true | false | "unknown";

interface ConditionResult {
  truth: Truth;
  missing: MissingInfo[];
  /** Treatments that satisfy a drug condition. */
  matched: PatientTreatment[];
}

export type Outcome =
  | { kind: "stop_before"; hours: number; treatment: PatientTreatment; lastDoseBy: string | null; conflict: { earliestAt: string } | null }
  | { kind: "resume_after"; hours: number; treatment: PatientTreatment | null; resumeFrom: string | null }
  | { kind: "requirement"; text: string; blocking: boolean }
  | { kind: "exam"; exam: string; withinDays?: number; notBefore: string | null }
  | { kind: "info"; text: string };

export interface Finding {
  rule: Rule;
  status: "applies" | "needs_info";
  missing: MissingInfo[];
  outcomes: Outcome[];
  /** Rules on the same point that lost to this one (lower level, or older) — shown as divergences. */
  overridden: Rule[];
  /** The rule's review date has passed. */
  toRecheck: boolean;
}

export interface Gap {
  treatment: PatientTreatment;
  technique: Technique | null;
  /** What the missing rule would protect. */
  target: RuleTarget;
  label: string;
}

export interface EvaluationResult {
  findings: Finding[];
  /** Draft rules that would apply — to show « à valider », never applied. */
  drafts: Finding[];
  /** Questions to answer, de-duplicated across rules. */
  missing: MissingInfo[];
  gaps: Gap[];
}

// ---------------------------------------------------------------------------
// Patient values
// ---------------------------------------------------------------------------

export function patientValue(ctx: PatientContext, value: PatientValue): number | undefined {
  switch (value) {
    case "age":
      return ctx.age;
    case "weight":
      return ctx.weightKg;
    case "bmi":
      return ctx.weightKg && ctx.heightCm ? bmi(ctx.weightKg, ctx.heightCm) : undefined;
    case "crcl":
      return ctx.age !== undefined && ctx.weightKg && ctx.sex && ctx.creatinineMgDl
        ? cockcroftGault({ age: ctx.age, weightKg: ctx.weightKg, sex: ctx.sex, creatinineMgDl: ctx.creatinineMgDl })
        : undefined;
    case "egfr":
      return ctx.age !== undefined && ctx.sex && ctx.creatinineMgDl ? ckdEpi2021({ age: ctx.age, sex: ctx.sex, creatinineMgDl: ctx.creatinineMgDl }) : undefined;
    case "hb":
      return ctx.hb;
    case "platelets":
      return ctx.platelets;
    case "inr":
      return ctx.inr;
  }
}

/** What to fill in to know a value — derived values name their inputs. */
function missingForValue(ctx: PatientContext, value: PatientValue): MissingInfo[] {
  const need = (key: string, label: string, present: unknown) => (present === undefined || present === null || present === "" ? [{ key, label }] : []);
  if (value === "crcl")
    return [...need("age", "Âge", ctx.age), ...need("weight", "Poids", ctx.weightKg), ...need("sex", "Sexe", ctx.sex), ...need("creatinine", "Créatinine", ctx.creatinineMgDl)];
  if (value === "egfr") return [...need("age", "Âge", ctx.age), ...need("sex", "Sexe", ctx.sex), ...need("creatinine", "Créatinine", ctx.creatinineMgDl)];
  if (value === "bmi") return [...need("weight", "Poids", ctx.weightKg), ...need("height", "Taille", ctx.heightCm)];
  const def = PATIENT_VALUES.find((v) => v.code === value);
  return [{ key: value, label: def?.label ?? value }];
}

export function compare(a: number, op: Comparator, b: number): boolean {
  return op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + (to.getDate() - from.getDate()) / 31;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function evaluateCondition(c: Condition, ctx: PatientContext, now: string): ConditionResult {
  if (c.kind === "technique") {
    if (ctx.techniques.length === 0) return { truth: "unknown", missing: [{ key: "technique", label: "Technique anesthésique prévue" }], matched: [] };
    return { truth: ctx.techniques.some((t) => c.in.includes(t)), missing: [], matched: [] };
  }

  if (c.kind === "surgery") {
    const v = ctx.surgery?.[c.attribute];
    const label = SURGERY_ATTRIBUTES.find((a) => a.code === c.attribute)?.label ?? c.attribute;
    if (!v) return { truth: "unknown", missing: [{ key: `surgery:${c.attribute}`, label }], matched: [] };
    return { truth: c.in.includes(v), missing: [], matched: [] };
  }

  if (c.kind === "history") {
    const e = ctx.conditions?.[c.condition];
    if (!e) return { truth: "unknown", missing: [{ key: `history:${c.condition}`, label: `Antécédent : ${c.label ?? defaultConditionLabel(c.condition) ?? c.condition}` }], matched: [] };
    return { truth: e.present === c.present, missing: [], matched: [] };
  }

  if (c.kind === "allergy") return evaluateAllergy(c, ctx);

  if (c.kind === "value") {
    const v = patientValue(ctx, c.value);
    if (v === undefined) return { truth: "unknown", missing: missingForValue(ctx, c.value), matched: [] };
    return { truth: compare(v, c.op, c.threshold), missing: [], matched: [] };
  }

  // drug: true if one treatment of that ATC meets every sub-condition; unknown if one might
  const candidates = ctx.treatments.filter((t) => treatmentMatches(t, c.atc));
  if (candidates.length === 0) return { truth: false, missing: [], matched: [] };
  const matched: PatientTreatment[] = [];
  const missing: MissingInfo[] = [];
  let anyUnknown = false;
  for (const t of candidates) {
    let truth: Truth = true;
    const tMissing: MissingInfo[] = [];
    if (c.dailyDose) {
      if (t.dailyDoseMg === undefined) {
        truth = "unknown";
        tMissing.push({ key: `dose:${t.id}`, label: `Dose quotidienne de ${t.name}`, treatmentId: t.id });
      } else if (!compare(t.dailyDoseMg, c.dailyDose.op, c.dailyDose.mg)) truth = false;
    }
    if (truth !== false && c.indications) {
      if (!t.indication) {
        truth = "unknown";
        tMissing.push({ key: `indication:${t.id}`, label: `Indication de ${t.name} (pourquoi le patient le prend)`, treatmentId: t.id });
      } else if (!c.indications.includes(t.indication)) truth = false;
    }
    if (truth !== false && c.monthsSinceEvent) {
      if (!t.eventDate) {
        truth = "unknown";
        tMissing.push({ key: `event:${t.id}`, label: `Date de l'événement à l'origine de ${t.name} (stent, AVC…)`, treatmentId: t.id });
      } else if (!compare(monthsBetween(t.eventDate, ctx.plannedAt ?? now), c.monthsSinceEvent.op, c.monthsSinceEvent.months)) truth = false;
    }
    if (truth === true) matched.push(t);
    else if (truth === "unknown") {
      anyUnknown = true;
      missing.push(...tMissing);
    }
  }
  if (matched.length > 0) return { truth: true, missing: [], matched };
  return anyUnknown ? { truth: "unknown", missing, matched: [] } : { truth: false, missing: [], matched: [] };
}

/**
 * An allergy is known present when it is in the list; known absent when
 * allergies were asked (a list, or "none known") and it isn't there.
 * A PEN-FAST condition stays unknown until enough items are answered to
 * know on which side of 3 the score falls.
 */
function evaluateAllergy(c: Extract<Condition, { kind: "allergy" }>, ctx: PatientContext): ConditionResult {
  const name = c.label ?? c.allergen;
  const entries = (ctx.allergyList ?? []).filter((a) => a.allergenId === c.allergen);
  const asked = ctx.noKnownAllergy || (ctx.allergyList?.length ?? 0) > 0;
  if (!entries.length) {
    if (!asked) return { truth: "unknown", missing: [{ key: "allergies", label: "Allergies (à demander au patient)" }], matched: [] };
    return { truth: !c.present, missing: [], matched: [] };
  }
  if (!c.present) return { truth: false, missing: [], matched: [] };
  if (!c.penFast) return { truth: true, missing: [], matched: [] };
  let undecided = false;
  for (const e of entries) {
    const r = penFast(e.penFast ?? {});
    const side = r.value >= 3 ? "high" : r.level === "low" ? "low" : null;
    if (side === c.penFast) return { truth: true, missing: [], matched: [] };
    if (side === null) undecided = true;
  }
  return undecided ? { truth: "unknown", missing: [{ key: `penfast:${c.allergen}`, label: `Score PEN-FAST de l'allergie : ${name}` }], matched: [] } : { truth: false, missing: [], matched: [] };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function outcomesOf(rule: Rule, ctx: PatientContext, matched: PatientTreatment[]): Outcome[] {
  const a = rule.action;
  switch (a.type) {
    case "stop_before":
      return matched.map((t) => {
        const lastDoseBy = ctx.plannedAt ? addHours(ctx.plannedAt, -a.hours) : null;
        const conflict = lastDoseBy && t.lastDoseAt && t.lastDoseAt > lastDoseBy ? { earliestAt: addHours(t.lastDoseAt, a.hours) } : null;
        return { kind: "stop_before", hours: a.hours, treatment: t, lastDoseBy, conflict };
      });
    case "resume_after": {
      const resumeFrom = ctx.plannedAt ? addHours(ctx.plannedAt, a.hours) : null;
      return matched.length > 0 ? matched.map((t) => ({ kind: "resume_after", hours: a.hours, treatment: t, resumeFrom })) : [{ kind: "resume_after", hours: a.hours, treatment: null, resumeFrom }];
    }
    case "requirement":
      return [{ kind: "requirement", text: a.text, blocking: a.blocking }];
    case "exam":
      return [{ kind: "exam", exam: a.exam, withinDays: a.withinDays, notBefore: a.withinDays !== undefined && ctx.plannedAt ? addHours(ctx.plannedAt, -a.withinDays * 24) : null }];
    case "info":
      return [{ kind: "info", text: a.text }];
  }
}

/** Evaluates one rule — null when it doesn't concern this patient. */
export function evaluateRule(rule: Rule, ctx: PatientContext, now: string = new Date().toISOString()): Omit<Finding, "overridden"> | null {
  const results = rule.conditions.map((c) => evaluateCondition(c, ctx, now));
  if (results.some((r) => r.truth === false)) return null;
  const toRecheck = !!rule.review_at && rule.review_at < now.slice(0, 10);
  if (results.some((r) => r.truth === "unknown")) {
    return { rule, status: "needs_info", missing: results.flatMap((r) => r.missing), outcomes: [], toRecheck };
  }
  const matched = results.flatMap((r) => r.matched);
  return { rule, status: "applies", missing: [], outcomes: outcomesOf(rule, ctx, matched), toRecheck };
}

const LEVEL_RANK: Record<SourceLevel, number> = { local: 0, be_inst: 1, be_soc: 2, eu: 3, int: 4, book: 5, article: 6 };

/**
 * Same point, allowing for classes: a rule on "all xabans" (B01AF) and one on
 * rivaroxaban (B01AF01) overlap; so do two rules sharing a technique (or
 * without any technique condition).
 */
export function samePoint(a: Rule, b: Rule): boolean {
  if (a.action.type !== b.action.type) return false;
  // A delay before the surgery and a delay before the puncture are two different points.
  if (ruleTarget(a) !== ruleTarget(b)) return false;
  const drugs = (r: Rule) => r.conditions.flatMap((c) => (c.kind === "drug" ? [c.atc] : []));
  const techs = (r: Rule) => r.conditions.flatMap((c) => (c.kind === "technique" ? c.in : []));
  const da = drugs(a);
  const db = drugs(b);
  // Two exams are the same point only when they ask for the same exam; two
  // messages (info, condition) only when they are about exactly the same drugs.
  if (a.action.type === "exam" && b.action.type === "exam") return a.action.exam.trim().toLowerCase() === b.action.exam.trim().toLowerCase();
  if ((a.action.type === "info" || a.action.type === "requirement") && (da.length === 0 || [...da].sort().join() !== [...db].sort().join())) return false;
  const drugsOverlap = (da.length === 0 && db.length === 0) || da.some((x) => db.some((y) => atcMatches(x, y) || atcMatches(y, x)));
  const ta = techs(a);
  const tb = techs(b);
  const techsOverlap = ta.length === 0 || tb.length === 0 || ta.some((t) => tb.includes(t));
  return drugsOverlap && techsOverlap;
}

/** Which of two rules on the same point wins: higher source level, then the most recent, then (for delays) the longest. */
export function outranks(a: Rule, b: Rule): boolean {
  const ra = LEVEL_RANK[a.source.level];
  const rb = LEVEL_RANK[b.source.level];
  if (ra !== rb) return ra < rb;
  const ya = a.source.year ?? 0;
  const yb = b.source.year ?? 0;
  if (ya !== yb) return ya > yb;
  const ha = "hours" in a.action ? a.action.hours : 0;
  const hb = "hours" in b.action ? b.action.hours : 0;
  return ha > hb;
}

function localAppliesHere(rule: Rule, ctx: PatientContext): boolean {
  if (rule.source.level !== "local") return true;
  return !!ctx.hospital && !!rule.source.hospital && rule.source.hospital.trim().toLowerCase() === ctx.hospital.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Rules that should exist
// ---------------------------------------------------------------------------

/**
 * Treatments for which a rule is expected, per gesture. "surgery": what to
 * do for the operation itself (bleeding) — a separate question from the
 * anaesthetic gesture: a rule on neuraxial puncture says nothing about the
 * surgery, and the reverse. When the patient takes one of these and no
 * active rule covers it, the app says so and offers to prepare the question.
 */
export const WATCHED: { atc: string; techniques: Technique[] | "any" | "surgery"; type: "stop_before" }[] = [
  { atc: "B01", techniques: "surgery", type: "stop_before" },
  { atc: "B01", techniques: ["neuraxial", "deep_block"], type: "stop_before" },
  { atc: "A10BK", techniques: "any", type: "stop_before" },
  { atc: "A10BJ", techniques: ["general", "sedation"], type: "stop_before" },
];

/** A rule that says what to do with this treatment (stop, keep, condition) for this gesture — or for the surgery when technique is "surgery". */
function ruleCovers(rule: Rule, t: PatientTreatment, technique: Technique | "surgery" | null): boolean {
  if (rule.status !== "active" || rule.action.type === "exam" || rule.action.type === "resume_after") return false;
  const drugConds = rule.conditions.filter((c): c is Extract<Condition, { kind: "drug" }> => c.kind === "drug");
  if (!drugConds.some((c) => treatmentMatches(t, c.atc))) return false;
  const target = ruleTarget(rule);
  if (technique === "surgery") return target !== "anaesthesia";
  if (!technique) return rule.action.type === "stop_before";
  if (target === "surgery") return false;
  const techConds = rule.conditions.filter((c): c is Extract<Condition, { kind: "technique" }> => c.kind === "technique");
  return techConds.length === 0 || techConds.some((c) => c.in.includes(technique));
}

export function findGaps(rules: Rule[], ctx: PatientContext): Gap[] {
  const gaps: Gap[] = [];
  for (const t of ctx.treatments) {
    for (const watch of WATCHED.filter((w) => treatmentMatches(t, w.atc))) {
      if (watch.techniques === "surgery") {
        if (rules.some((r) => ruleCovers(r, t, "surgery"))) continue;
        gaps.push({ treatment: t, technique: null, target: "surgery", label: `Aucune règle pour ${t.name} vis-à-vis de la chirurgie (risque hémorragique) — la règle d'anesthésie ne suffit pas` });
        continue;
      }
      const techniques: (Technique | null)[] = watch.techniques === "any" ? [null] : ctx.techniques.filter((x) => (watch.techniques as Technique[]).includes(x));
      for (const technique of techniques) {
        if (rules.some((r) => ruleCovers(r, t, technique))) continue;
        const techniqueLabel = technique ? TECHNIQUES.find((x) => x.code === technique)?.label.toLowerCase() : "l'intervention";
        gaps.push({ treatment: t, technique, target: technique ? "anaesthesia" : "both", label: `Aucune règle d'arrêt de ${t.name} avant ${techniqueLabel}` });
      }
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Everything at once
// ---------------------------------------------------------------------------

type Evaluated = Omit<Finding, "overridden">;

const pointOf = (f: Evaluated) => {
  const treatments = f.outcomes.flatMap((o) => ("treatment" in o && o.treatment ? [o.treatment.id] : [])).sort();
  return `${f.rule.action.type}|${ruleTarget(f.rule)}|${treatments.join(",")}`;
};
const sameFindingPoint = (a: Evaluated, b: Evaluated) => (pointOf(a) === pointOf(b) && pointOf(b).split("|")[2] !== "") || samePoint(a.rule, b.rule);

/**
 * Same point for the same treatment (a class-wide rule and a drug-specific one both matching
 * rivaroxaban, say): the highest source wins, the others are shown under it as divergences.
 */
function groupApplying(applying: Evaluated[]): Finding[] {
  const groups: Evaluated[][] = [];
  for (const f of applying) {
    const group = groups.find((g) => g.some((o) => sameFindingPoint(o, f)));
    if (group) group.push(f);
    else groups.push([f]);
  }
  return groups.map((group) => {
    const [winner, ...others] = [...group].sort((a, b) => (outranks(a.rule, b.rule) ? -1 : outranks(b.rule, a.rule) ? 1 : 0));
    // Same source saying the same thing (the ECG asked for age and for HTA) isn't another opinion.
    const sameSay = (o: Rule) => o.source.organisation === winner.rule.source.organisation && o.source.year === winner.rule.source.year && JSON.stringify(o.action) === JSON.stringify(winner.rule.action);
    return { ...winner, overridden: others.map((o) => o.rule).filter((o) => !sameSay(o)) };
  });
}

export function evaluate(rules: Rule[], ctx: PatientContext, now: string = new Date().toISOString()): EvaluationResult {
  const here = rules.filter((r) => localAppliesHere(r, ctx));
  const active = here.filter((r) => r.status === "active");
  const evaluated = active.map((r) => evaluateRule(r, ctx, now)).filter((f): f is Evaluated => f !== null);
  const applying = evaluated.filter((f) => f.status === "applies");
  const findings = groupApplying(applying);

  // An exam already asked for by an applying rule doesn't need the other rules' questions (ECG after 65 → no need to ask about HTA for the ECG).
  const examsAsked = new Set(findings.flatMap((f) => f.outcomes.flatMap((o) => (o.kind === "exam" ? [o.exam] : []))));
  for (const f of evaluated.filter((f) => f.status === "needs_info")) {
    if (f.rule.action.type === "exam" && examsAsked.has(f.rule.action.exam)) continue;
    findings.push({ ...f, overridden: [] });
  }

  const seen = new Set<string>();
  const missing = findings
    .flatMap((f) => f.missing)
    .filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));

  // Drafts: shown « à valider », never applied — nor used for the timeline or the patient's instructions.
  // A draft on a point an active rule already settles adds nothing.
  const draftApplying = here
    .filter((r) => r.status === "draft")
    .map((r) => evaluateRule({ ...r, status: "active" }, ctx, now))
    .filter((f): f is Evaluated => f !== null && f.status === "applies")
    .map((f) => ({ ...f, rule: rules.find((r) => r.id === f.rule.id)! }))
    .filter((d) => !applying.some((a) => sameFindingPoint(a, d)));

  return { findings, missing, gaps: findGaps(active, ctx), drafts: groupApplying(draftApplying) };
}

export function sourceLevelShort(level: SourceLevel): string {
  return SOURCE_LEVELS.find((l) => l.code === level)?.short ?? level;
}

export function indicationLabel(code: string): string {
  return INDICATIONS.find((i) => i.code === code)?.label ?? code;
}
