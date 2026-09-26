// Two active rules that answer the same question differently: same kind of
// delay (stop before / resume after), same target, same conditions — but not
// the same number of hours. The engine would then apply both and keep the
// longest; the library shows them so that one of them gets archived.

import { canonical } from "../reference-sync";
import { ruleTarget } from "./target";
import type { Rule } from "./types";

type Delayed = Pick<Rule, "id" | "title" | "status" | "conditions" | "action">;

export interface RuleConflict<T extends Delayed = Delayed> {
  /** « Délai d'arrêt » or « Délai de reprise ». */
  kind: "stop_before" | "resume_after";
  rules: T[];
  hours: number[];
}

const conditionKey = (r: Delayed) => canonical([...r.conditions].map(canonical).sort());

export function ruleConflicts<T extends Delayed>(rules: T[]): RuleConflict<T>[] {
  const groups = new Map<string, T[]>();
  for (const r of rules) {
    if (r.status !== "active" || (r.action.type !== "stop_before" && r.action.type !== "resume_after")) continue;
    const key = `${r.action.type}|${ruleTarget(r)}|${conditionKey(r)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: RuleConflict<T>[] = [];
  for (const g of groups.values()) {
    const hours = [...new Set(g.map((r) => (r.action as { hours: number }).hours))].sort((a, b) => a - b);
    if (hours.length > 1) out.push({ kind: g[0].action.type as RuleConflict["kind"], rules: g, hours });
  }
  return out;
}
