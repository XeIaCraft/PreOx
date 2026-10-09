// « Traitements » tab: a patient's treatment list pasted as is (letter,
// prescription, GP summary), and for each treatment what the rules say —
// stop before the gesture (how long, before what), when to resume, what to
// check, in which patients (gesture, bleeding risk, renal function…), why,
// and from which source. Teaching first: every rule on the treatment is
// shown with its conditions; the optional context only says which ones apply.

import { classesOf, medicationOf, type Catalogs, type DrugClassItem, type Interaction, type MedicationItem } from "./catalog";
import { treatmentMatches } from "./medications";
import { compare } from "./rules/engine";
import { describeAction, describeCondition } from "./rules/describe";
import { INDICATIONS, type Condition, type Rule, type Technique } from "./rules/types";

export interface GuideTreatment {
  id: string;
  atc: string;
  name: string;
  components?: string[];
  catalogId?: string;
  dailyDoseMg?: number;
  /** The pasted text it was read from. */
  from?: string;
}

/** What is known of the patient and the gesture — all optional. */
export interface GuideContext {
  techniques?: Technique[];
  bleedingRisk?: "minimal" | "low" | "high";
  /** Creatinine clearance, mL/min. */
  crcl?: number;
}

export type Applies = "yes" | "no" | "unknown";

export interface GuideRule {
  rule: Rule;
  /** The rule's conditions other than the treatment itself, in plain French (« chez qui »). */
  when: string[];
  /** The action in plain French (« dernière prise au moins 72 h (3 jours) avant le geste »). */
  action: string;
  applies: Applies;
  draft: boolean;
}

export type GuideVerdict =
  /** At least one stop rule applies (or would, the context being unknown). */
  | { kind: "stop"; hours: number; text: string }
  | { kind: "depends"; minHours: number; maxHours: number; text: string }
  | { kind: "continue"; text: string }
  | { kind: "none"; text: string };

export interface TreatmentGuideEntry {
  treatment: GuideTreatment;
  medication?: MedicationItem;
  classes: DrugClassItem[];
  stop: GuideRule[];
  resume: GuideRule[];
  /** Requirements, exams and information rules. */
  other: GuideRule[];
  interactions: Interaction[];
  verdict: GuideVerdict;
}

const days = (hours: number) => (hours >= 24 ? `${Math.round((hours / 24) * 10) / 10} j`.replace(".", ",") : `${hours} h`);

function conditionApplies(c: Condition, t: GuideTreatment, ctx: GuideContext): Applies {
  switch (c.kind) {
    case "drug":
      if (!treatmentMatches(t, c.atc)) return "no";
      if (c.dailyDose) return t.dailyDoseMg === undefined ? "unknown" : compare(t.dailyDoseMg, c.dailyDose.op, c.dailyDose.mg) ? "yes" : "no";
      return c.indications?.length || c.monthsSinceEvent ? "unknown" : "yes";
    case "technique":
      if (!ctx.techniques?.length) return "unknown";
      return c.in.some((x) => ctx.techniques!.includes(x)) ? "yes" : "no";
    case "surgery":
      if (c.attribute !== "bleedingRisk" || !ctx.bleedingRisk) return "unknown";
      return c.in.includes(ctx.bleedingRisk) ? "yes" : "no";
    case "value":
      if (c.value !== "crcl" || ctx.crcl === undefined) return "unknown";
      return compare(ctx.crcl, c.op, c.threshold) ? "yes" : "no";
    default:
      return "unknown";
  }
}

function ruleApplies(rule: Rule, t: GuideTreatment, ctx: GuideContext): Applies {
  const all = rule.conditions.map((c) => conditionApplies(c, t, ctx));
  if (all.includes("no")) return "no";
  return all.every((a) => a === "yes") ? "yes" : "unknown";
}

/** The rules written for this treatment (its substance, a component, or its class). */
export function rulesFor(t: GuideTreatment, rules: Rule[]): Rule[] {
  return rules.filter((r) => r.status !== "archived" && r.conditions.some((c) => c.kind === "drug" && treatmentMatches(t, c.atc)));
}

const OP = { "<": "<", "<=": "≤", ">": ">", ">=": "≥" } as const;

/** « Chez qui » : the rule's conditions, the treatment itself left out (only its dose, indication or delay since the event stay). */
function whenOf(rule: Rule, t: GuideTreatment): string[] {
  return rule.conditions.flatMap((c) => {
    if (c.kind !== "drug" || !treatmentMatches(t, c.atc)) return [describeCondition(c)];
    const q: string[] = [];
    if (c.dailyDose) q.push(`dose ${OP[c.dailyDose.op]} ${c.dailyDose.mg} mg/j`);
    if (c.indications?.length) q.push(`traitement pris pour ${c.indications.map((i) => INDICATIONS.find((x) => x.code === i)?.label.toLowerCase() ?? i).join(" ou ")}`);
    if (c.monthsSinceEvent) q.push(`événement (stent, AVC, thrombose…) ${OP[c.monthsSinceEvent.op]} ${c.monthsSinceEvent.months} mois`);
    return q;
  });
}

function guideRule(rule: Rule, t: GuideTreatment, ctx: GuideContext): GuideRule {
  return { rule, when: whenOf(rule, t), action: describeAction(rule.action, rule.conditions), applies: ruleApplies(rule, t, ctx), draft: rule.status === "draft" };
}

const CONTINUE = /\b(poursuivre|maintenir|ne pas (l'|les )?(arrêter|interrompre)|ne jamais (l'|les )?(arrêter|interrompre)|sans interruption)/i;

/** No stop rule, but the class or an information rule says to go on with it (beta-blockers, statins…). */
function keepGoing(medication: MedicationItem | undefined, classes: DrugClassItem[], other: GuideRule[]): boolean {
  const texts = [medication?.attention?.text, ...classes.map((k) => k.attention?.text), ...other.filter((g) => !g.draft && g.rule.action.type === "info").map((g) => g.action)];
  return texts.some((t) => !!t && CONTINUE.test(t));
}

const rank = (g: GuideRule) => (g.applies === "yes" ? 0 : g.applies === "unknown" ? 1 : 2) + (g.draft ? 0.5 : 0);
const hoursOf = (g: GuideRule) => (g.rule.action.type === "stop_before" || g.rule.action.type === "resume_after" ? g.rule.action.hours : 0);

export function treatmentGuide(t: GuideTreatment, rules: Rule[], catalogs: Pick<Catalogs, "medications" | "drugClasses">, ctx: GuideContext = {}): TreatmentGuideEntry {
  const medication = medicationOf(t, catalogs.medications);
  const classes = classesOf(t, catalogs);
  const guides = rulesFor(t, rules).map((r) => guideRule(r, t, ctx));
  const sort = (list: GuideRule[]) => list.sort((a, b) => rank(a) - rank(b) || hoursOf(b) - hoursOf(a));
  const stop = sort(guides.filter((g) => g.rule.action.type === "stop_before"));
  const resume = sort(guides.filter((g) => g.rule.action.type === "resume_after"));
  const other = sort(guides.filter((g) => g.rule.action.type !== "stop_before" && g.rule.action.type !== "resume_after"));
  const interactions = [...(medication?.interactions ?? []), ...classes.flatMap((k) => k.interactions ?? [])];

  const active = stop.filter((g) => !g.draft && g.applies !== "no");
  const sure = active.filter((g) => g.applies === "yes");
  let verdict: GuideVerdict;
  if (sure.length) {
    const hours = Math.max(...sure.map(hoursOf));
    verdict = { kind: "stop", hours, text: `Arrêt ${days(hours)} avant le geste` };
  } else if (active.length) {
    const hs = active.map(hoursOf);
    const min = Math.min(...hs);
    const max = Math.max(...hs);
    verdict = { kind: "depends", minHours: min, maxHours: max, text: min === max ? `Arrêt ${days(max)} avant, selon le contexte` : `Arrêt de ${days(min)} à ${days(max)} avant, selon le contexte` };
  } else if (stop.some((g) => g.applies !== "no")) {
    verdict = { kind: "depends", minHours: 0, maxHours: Math.max(...stop.map(hoursOf)), text: "Règle d'arrêt en brouillon : à vérifier" };
  } else if (stop.length) {
    verdict = { kind: "continue", text: "Pas d'arrêt dans ce contexte" };
  } else if (keepGoing(medication, classes, other)) {
    verdict = { kind: "continue", text: "Poursuivre (voir « À savoir »)" };
  } else if (medication?.needsRule === false || classes.some((k) => k.needsRule === false)) {
    verdict = { kind: "continue", text: "Poursuivre (pas de règle d'arrêt attendue)" };
  } else {
    verdict = { kind: "none", text: "Pas de règle dans PreOx : à vérifier (RCP, CBIP)" };
  }
  return { treatment: t, medication, classes, stop, resume, other, interactions, verdict };
}
