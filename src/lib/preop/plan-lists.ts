// Your own lists for the plan and the theatre screen (Réglages › Plan et bloc):
// the targets and the monitoring/equipment to tick, the reference cards of the
// monitoring, the general emergency procedures, the complications to note, and
// the order of the theatre sections. PreOx's defaults stay underneath: only
// your changes are stored (added, edited, hidden), so that improvements to the
// defaults still reach you.

import { z } from "zod";
import { MATERIAL_GROUPS, POSITIONS, RISK_LIBRARY, TARGET_GROUPS, type CatalogGroup, type RiskTemplate } from "./plan-catalog";
import { DEFAULT_PCEA, DEFAULT_PERINEURAL, type PostopInfusion } from "./postop";
import { DEFAULT_CHECKLIST, type ChecklistLists } from "./checklist";
import { MONITORING, type MonitoringItem } from "./monitoring";
import { crises, doseFromSpec, type Crisis, type CrisisCategory, type CrisisPatient, type DoseSpec } from "./crises";
import { COMPLICATION_TYPES } from "./dossier";

/** An emergency procedure as it is stored when edited or added: doses kept as formulas. */
export interface CrisisTemplate {
  id: string;
  title: string;
  category: CrisisCategory;
  words: string[];
  recognise: string[];
  steps: { text: string; urgent?: boolean; dose?: { drug: string; route?: string; spec: DoseSpec } }[];
  after?: string[];
  source: string;
}

export interface Changes<T> {
  added: T[];
  edited: Record<string, T>;
  hidden: string[];
}

export interface PlanLists {
  /** Replaces PreOx's groups when set (the whole list is yours). */
  targetGroups?: CatalogGroup[];
  materialGroups?: CatalogGroup[];
  monitoring?: Changes<MonitoringItem>;
  /** The risk library a plan picks its risks from. */
  risks?: Changes<RiskTemplate>;
  crises?: Changes<CrisisTemplate>;
  complications?: string[];
  /** Positions proposed for the surgery (replaces PreOx's list when set). */
  positions?: { label: string; hint: string }[];
  /** Default settings of the pumps proposed in the post-op orders. */
  pumps?: { pcea?: PostopInfusion; perineural?: PostopInfusion };
  /** Pre-anaesthesia checklist (replaces PreOx's when set). */
  checklist?: ChecklistLists;
  /** Order of the theatre sections (ids), yours first. */
  theatreOrder?: string[];
}

export const EMPTY_LISTS: PlanLists = {};

const emptyChanges = <T>(): Changes<T> => ({ added: [], edited: {}, hidden: [] });

function merge<T extends { id: string }>(defaults: T[], c: Changes<T> | undefined): T[] {
  if (!c) return defaults;
  return [...defaults.filter((d) => !c.hidden.includes(d.id)).map((d) => c.edited[d.id] ?? d), ...c.added.filter((a) => !c.hidden.includes(a.id))];
}

export const targetGroupsOf = (l: PlanLists): CatalogGroup[] => l.targetGroups ?? TARGET_GROUPS;
export const materialGroupsOf = (l: PlanLists): CatalogGroup[] => l.materialGroups ?? MATERIAL_GROUPS;
export const monitoringOf = (l: PlanLists): MonitoringItem[] => merge(MONITORING, l.monitoring);
export const riskLibraryOf = (l: PlanLists): RiskTemplate[] => merge(RISK_LIBRARY, l.risks);
export const positionsOf = (l: PlanLists): { label: string; hint: string }[] => l.positions ?? POSITIONS;
export const pumpsOf = (l: PlanLists): { pcea: PostopInfusion; perineural: PostopInfusion } => ({ pcea: l.pumps?.pcea ?? DEFAULT_PCEA, perineural: l.pumps?.perineural ?? DEFAULT_PERINEURAL });
export const checklistOf = (l: PlanLists): ChecklistLists => l.checklist ?? DEFAULT_CHECKLIST;
export const complicationsOf = (l: PlanLists): string[] => l.complications ?? [...COMPLICATION_TYPES];

/** A default crisis as an editable template (doses as formulas). */
export function templateOf(c: Crisis): CrisisTemplate {
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    words: c.words,
    recognise: c.recognise,
    steps: c.steps.map((s) => ({ text: s.text, ...(s.urgent ? { urgent: true } : {}), ...(s.dose?.spec ? { dose: { drug: s.dose.drug, ...(s.dose.route ? { route: s.dose.route } : {}), spec: s.dose.spec } } : {}) })),
    ...(c.after ? { after: c.after } : {}),
    source: c.source,
  };
}

/** A template with its doses computed for the patient. */
export function crisisFrom(t: CrisisTemplate, p: CrisisPatient): Crisis {
  return { ...t, steps: t.steps.map((s) => ({ text: s.text, ...(s.urgent ? { urgent: true } : {}), ...(s.dose ? { dose: doseFromSpec(s.dose.drug, s.dose.spec, s.dose.route, p.weightKg) } : {}) })) };
}

/** PreOx's procedures with yours applied, doses computed for this patient. */
export function crisesOf(l: PlanLists, p: CrisisPatient = {}): Crisis[] {
  const defaults = crises(p);
  const c = l.crises;
  if (!c) return defaults;
  return [...defaults.filter((d) => !c.hidden.includes(d.id)).map((d) => (c.edited[d.id] ? crisisFrom(c.edited[d.id], p) : d)), ...c.added.filter((a) => !c.hidden.includes(a.id)).map((a) => crisisFrom(a, p))];
}

export function withChange<T extends { id: string }>(c: Changes<T> | undefined, item: T, isDefault: boolean): Changes<T> {
  const base = c ?? emptyChanges<T>();
  return isDefault ? { ...base, edited: { ...base.edited, [item.id]: item } } : { ...base, added: [...base.added.filter((a) => a.id !== item.id), item] };
}

export function withoutItem<T extends { id: string }>(c: Changes<T> | undefined, id: string, isDefault: boolean): Changes<T> {
  const base = c ?? emptyChanges<T>();
  return isDefault ? { ...base, hidden: [...new Set([...base.hidden, id])] } : { ...base, added: base.added.filter((a) => a.id !== id) };
}

export function restored<T extends { id: string }>(c: Changes<T> | undefined, id: string): Changes<T> {
  const base = c ?? emptyChanges<T>();
  const edited = { ...base.edited };
  delete edited[id];
  return { ...base, edited, hidden: base.hidden.filter((h) => h !== id) };
}

// --- Validation (server) ------------------------------------------------------------------------

const text = (max: number) => z.string().max(max);
const group = z.object({ id: text(80), label: text(120), items: z.array(z.object({ label: text(200), hint: text(400).optional() })).max(80) });
const value = z.object({ label: text(120), normal: text(200), target: text(300).optional() });
const monitoringItem = z.object({
  id: text(80),
  label: text(160),
  group: z.enum(["base", "pressure", "output", "preload", "oxygenation", "ventilation", "neuro", "coagulation", "metabolic"]),
  words: z.array(text(60)).max(20),
  values: z.array(value).max(20),
  what: text(1500),
  how: text(2000),
  pitfalls: text(2000).optional(),
  formulas: z.array(text(300)).max(10).optional(),
  source: text(300).optional(),
});
const riskTemplate = z.object({
  id: text(80),
  title: text(200),
  words: z.array(text(60)).max(30),
  conduct: text(2000),
  why: text(2000).optional(),
  prevention: text(2000).optional(),
  source: text(400).optional(),
  crisis: text(80).optional(),
});
const infusion = z.object({ solution: text(200), rateMlH: z.number().min(0).max(100).nullable(), bolusMl: z.number().min(0).max(100).nullable(), lockoutMin: z.number().int().min(0).max(240).nullable() });
const spec = z.union([
  z.object({ kind: z.literal("perKg"), min: z.number(), max: z.number(), unit: text(20), per: text(20).optional() }),
  z.object({ kind: z.literal("rate"), min: z.number(), max: z.number(), unit: text(20) }),
  z.object({ kind: z.literal("fixed"), dose: text(80) }),
]);
const crisisTemplate = z.object({
  id: text(80),
  title: text(160),
  category: z.enum(["cardio", "airway", "allergy", "toxic", "metabolic", "bleeding", "neuro"]),
  words: z.array(text(60)).max(30),
  recognise: z.array(text(1500)).max(10),
  steps: z.array(z.object({ text: text(600), urgent: z.boolean().optional(), dose: z.object({ drug: text(80), route: text(30).optional(), spec }).optional() })).max(30),
  after: z.array(text(1000)).max(10).optional(),
  source: text(400),
});
const changes = <T extends z.ZodTypeAny>(item: T) => z.object({ added: z.array(item).max(100), edited: z.record(z.string().max(80), item), hidden: z.array(text(80)).max(200) });

export const planListsSchema = z.object({
  targetGroups: z.array(group).max(30).optional(),
  materialGroups: z.array(group).max(30).optional(),
  monitoring: changes(monitoringItem).optional(),
  risks: changes(riskTemplate).optional(),
  crises: changes(crisisTemplate).optional(),
  complications: z.array(text(120)).max(100).optional(),
  positions: z.array(z.object({ label: text(120), hint: text(300) })).max(60).optional(),
  pumps: z.object({ pcea: infusion.optional(), perineural: infusion.optional() }).optional(),
  checklist: z.object({ daily: z.array(z.object({ id: text(60), label: text(400) })).max(40), perCase: z.array(z.object({ id: text(60), label: text(400) })).max(40) }).optional(),
  theatreOrder: z.array(text(40)).max(40).optional(),
});
