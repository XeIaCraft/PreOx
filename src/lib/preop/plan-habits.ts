// Habits: what is changed, case after case, in the plan a protocol gives.
// Each dossier keeps the protocol's plan as it was applied (Dossier.planBase);
// its final plan is compared with it. Over the last uses of a protocol:
// - the same change almost every time (≥ 3 uses and ≥ 80 %) → the protocol
//   itself should change (« mettre à jour le plan de base ») ;
// - a change made only once or twice → nothing, the base plan stays;
// - the same set of changes recurring (≥ 3 uses) while the base plan is still
//   used as it is the rest of the time → a variant of the protocol.
// Only the plans are compared (drugs, techniques, lists): no patient data.
// It is a suggestion: nothing changes until it is accepted.

import { fold } from "./catalog";
import type { Dossier } from "./dossier";
import type { Protocol, ProtocolContent, ProtocolDrug, ProtocolRisk } from "./protocols";
import type { Technique } from "./rules/types";

type ListField = "targets" | "material" | "postop" | "steps";
const LIST_FIELDS: { field: ListField; label: string }[] = [
  { field: "targets", label: "Objectif" },
  { field: "material", label: "Matériel" },
  { field: "postop", label: "Post-op" },
  { field: "steps", label: "Déroulé" },
];

export type PlanChange =
  | { key: string; label: string; kind: "technique"; op: "add" | "remove"; technique: Technique }
  | { key: string; label: string; kind: "drug"; op: "add" | "remove"; drug: ProtocolDrug }
  | { key: string; label: string; kind: "list"; op: "add" | "remove"; field: ListField; item: string }
  | { key: string; label: string; kind: "risk"; op: "add" | "remove"; risk: ProtocolRisk };

const TECHNIQUE_LABELS: Record<Technique, string> = { general: "AG", sedation: "sédation", neuraxial: "rachi/péri", deep_block: "bloc profond", superficial_block: "bloc superficiel" };
const drugId = (d: ProtocolDrug) => `${fold(d.name).trim()}|${d.route}|${d.phase}`;
const drugSig = (d: ProtocolDrug) => `${drugId(d)}|${d.doseMode}|${d.amount ?? ""}|${d.unit}|${d.maxAmount ?? ""}`;
function drugLabel(d: ProtocolDrug): string {
  const dose = d.amount !== null ? ` ${d.amount} ${d.unit}${d.doseMode === "per_kg" ? "/kg" : ""}` : "";
  return `${d.name}${dose}`;
}

/** What was changed in `plan` compared with `base`. A changed dose is the old drug removed and the new one added. */
export function planChanges(base: ProtocolContent, plan: ProtocolContent): PlanChange[] {
  const out: PlanChange[] = [];
  for (const t of plan.techniques) if (!base.techniques.includes(t)) out.push({ key: `t+:${t}`, label: `Technique ajoutée : ${TECHNIQUE_LABELS[t] ?? t}`, kind: "technique", op: "add", technique: t });
  for (const t of base.techniques) if (!plan.techniques.includes(t)) out.push({ key: `t-:${t}`, label: `Technique retirée : ${TECHNIQUE_LABELS[t] ?? t}`, kind: "technique", op: "remove", technique: t });
  const baseSigs = new Set(base.drugs.map(drugSig));
  const planSigs = new Set(plan.drugs.map(drugSig));
  for (const d of plan.drugs) if (!baseSigs.has(drugSig(d))) out.push({ key: `d+:${drugSig(d)}`, label: `${base.drugs.some((x) => drugId(x) === drugId(d)) ? "Dose modifiée" : "Ajout"} : ${drugLabel(d)}`, kind: "drug", op: "add", drug: d });
  for (const d of base.drugs) if (!planSigs.has(drugSig(d))) out.push({ key: `d-:${drugSig(d)}`, label: `Retrait : ${drugLabel(d)}`, kind: "drug", op: "remove", drug: d });
  for (const { field, label } of LIST_FIELDS) {
    const b = (base[field] ?? []).map((x) => x.trim()).filter(Boolean);
    const p = (plan[field] ?? []).map((x) => x.trim()).filter(Boolean);
    const bf = new Set(b.map(fold)), pf = new Set(p.map(fold));
    for (const x of p) if (!bf.has(fold(x))) out.push({ key: `l+:${field}:${fold(x)}`, label: `${label} ajouté : ${x}`, kind: "list", op: "add", field, item: x });
    for (const x of b) if (!pf.has(fold(x))) out.push({ key: `l-:${field}:${fold(x)}`, label: `${label} retiré : ${x}`, kind: "list", op: "remove", field, item: x });
  }
  const bt = new Set(base.risks.map((r) => fold(r.title))), pt = new Set(plan.risks.map((r) => fold(r.title)));
  for (const r of plan.risks) if (!bt.has(fold(r.title))) out.push({ key: `r+:${fold(r.title)}`, label: `Risque ajouté : ${r.title}`, kind: "risk", op: "add", risk: r });
  for (const r of base.risks) if (!pt.has(fold(r.title))) out.push({ key: `r-:${fold(r.title)}`, label: `Risque retiré : ${r.title}`, kind: "risk", op: "remove", risk: r });
  return out;
}

/** The protocol's content with the changes made. */
export function applyChanges(content: ProtocolContent, changes: PlanChange[]): ProtocolContent {
  const next: ProtocolContent = structuredClone(content);
  for (const c of changes) {
    if (c.kind === "technique") {
      next.techniques = c.op === "add" ? [...new Set([...next.techniques, c.technique])] : next.techniques.filter((t) => t !== c.technique);
    } else if (c.kind === "drug") {
      if (c.op === "remove") next.drugs = next.drugs.filter((d) => drugSig(d) !== drugSig(c.drug));
      else if (!next.drugs.some((d) => drugSig(d) === drugSig(c.drug))) next.drugs = [...next.drugs, { ...c.drug, id: crypto.randomUUID() }];
    } else if (c.kind === "list") {
      const list = next[c.field] ?? [];
      next[c.field] = c.op === "add" ? (list.some((x) => fold(x) === fold(c.item)) ? list : [...list, c.item]) : list.filter((x) => fold(x) !== fold(c.item));
    } else {
      next.risks = c.op === "add" ? (next.risks.some((r) => fold(r.title) === fold(c.risk.title)) ? next.risks : [...next.risks, c.risk]) : next.risks.filter((r) => fold(r.title) !== fold(c.risk.title));
    }
  }
  return next;
}

/** Already true of the protocol as it is now (the change was taken over since). */
function alreadyIn(content: ProtocolContent, c: PlanChange): boolean {
  return JSON.stringify(applyChanges(content, [c])) === JSON.stringify(content);
}

export interface HabitSuggestion {
  /** Stable id, to remember a suggestion that was set aside. */
  id: string;
  kind: "update" | "variant";
  protocolId: string;
  protocolName: string;
  changes: PlanChange[];
  /** Uses with these changes / uses looked at. */
  count: number;
  total: number;
}

export const HABIT_MIN_USES = 3;
export const HABIT_UPDATE_SHARE = 0.8;
const LOOK_BACK = 12;

/** Suggestions for one protocol, from the dossiers prepared with it. */
export function habitSuggestions(protocol: Protocol, dossiers: Dossier[], dismissed: ReadonlySet<string> = new Set()): HabitSuggestion[] {
  const uses = dossiers
    .filter((d) => d.protocolId === protocol.id && d.planBase && (d.status === "prepared" || d.status === "done"))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LOOK_BACK);
  const total = uses.length;
  if (total < HABIT_MIN_USES) return [];
  const perUse = uses.map((d) => planChanges(d.planBase!, d.plan).filter((c) => !alreadyIn(protocol.content, c)));
  const byKey = new Map<string, { change: PlanChange; count: number }>();
  for (const changes of perUse) for (const c of changes) {
    const e = byKey.get(c.key);
    if (e) e.count++;
    else byKey.set(c.key, { change: c, count: 1 });
  }
  const out: HabitSuggestion[] = [];
  // Almost always the same change: the base plan itself.
  const update = [...byKey.values()].filter((e) => e.count >= HABIT_MIN_USES && e.count / total >= HABIT_UPDATE_SHARE);
  if (update.length) {
    const keys = update.map((e) => e.change.key).sort();
    out.push({ id: `u:${protocol.id}:${keys.join(",")}`, kind: "update", protocolId: protocol.id, protocolName: protocol.name, changes: update.map((e) => e.change), count: Math.min(...update.map((e) => e.count)), total });
  }
  // Recurring but not the rule: the most frequent set of such changes made together → a variant.
  const updated = new Set(update.map((e) => e.change.key));
  const recurring = new Set([...byKey.values()].filter((e) => e.count >= HABIT_MIN_USES && !updated.has(e.change.key)).map((e) => e.change.key));
  const sets = new Map<string, { changes: PlanChange[]; count: number }>();
  for (const changes of perUse) {
    const kept = changes.filter((c) => recurring.has(c.key));
    if (!kept.length) continue;
    const sig = kept.map((c) => c.key).sort().join(",");
    const e = sets.get(sig);
    if (e) e.count++;
    else sets.set(sig, { changes: kept, count: 1 });
  }
  const best = [...sets.entries()].sort((a, b) => b[1].count - a[1].count || b[1].changes.length - a[1].changes.length)[0];
  if (best && best[1].count >= HABIT_MIN_USES) {
    out.push({ id: `v:${protocol.id}:${best[0]}`, kind: "variant", protocolId: protocol.id, protocolName: protocol.name, changes: best[1].changes, count: best[1].count, total });
  }
  return out.filter((s) => !dismissed.has(s.id));
}

/** Name of a new variant: the protocol's name and what sets it apart. */
export function variantName(protocol: Protocol, changes: PlanChange[]): string {
  const added = changes.filter((c) => c.op === "add").map((c) => (c.kind === "drug" ? c.drug.name : c.kind === "technique" ? TECHNIQUE_LABELS[c.technique] : c.kind === "list" ? c.item : c.risk.title));
  const removed = changes.filter((c) => c.op === "remove").map((c) => (c.kind === "drug" ? c.drug.name : c.kind === "technique" ? TECHNIQUE_LABELS[c.technique] : c.kind === "list" ? c.item : c.risk.title));
  const what = [added.length ? `+ ${added.slice(0, 2).join(", ")}` : "", removed.length ? `sans ${removed.slice(0, 2).join(", ")}` : ""].filter(Boolean).join(" ");
  return `${protocol.name} — variante${what ? ` (${what})` : ""}`.slice(0, 120);
}
