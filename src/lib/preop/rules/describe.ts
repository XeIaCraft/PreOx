// A structured rule, read back in plain French — shown before saving it
// ("this is what the app understood") and in the library.
import { atcLabel } from "../medications";
import { INDICATIONS, PATIENT_VALUES, SURGERY_ATTRIBUTES, TECHNIQUES } from "./types";
import { CONDITION_DEFS } from "../history";
import type { Comparator, Condition, RuleAction } from "./types";

const OP: Record<Comparator, string> = { "<": "<", "<=": "≤", ">": ">", ">=": "≥" };

export function formatHours(hours: number): string {
  if (hours >= 48 && hours % 24 === 0) return `${hours} h (${hours / 24} jours)`;
  return `${hours} h`;
}

export function describeCondition(c: Condition): string {
  if (c.kind === "technique") return `geste : ${c.in.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.toLowerCase() ?? t).join(" ou ")}`;
  if (c.kind === "surgery") {
    const a = SURGERY_ATTRIBUTES.find((x) => x.code === c.attribute);
    return `${(a?.label ?? c.attribute).toLowerCase()} : ${c.in.map((v) => a?.values.find((x) => x.code === v)?.label ?? v).join(" ou ")}`;
  }
  if (c.kind === "history") return `antécédent ${c.present ? "" : "absent : "}${(CONDITION_DEFS.get(c.condition)?.label ?? c.condition).toLowerCase()}`;
  if (c.kind === "value") {
    const v = PATIENT_VALUES.find((x) => x.code === c.value);
    return `${v?.label ?? c.value} ${OP[c.op]} ${c.threshold}${v?.unit ? ` ${v.unit}` : ""}`;
  }
  const parts = [`traitement : ${atcLabel(c.atc)}`];
  if (c.dailyDose) parts.push(`dose ${OP[c.dailyDose.op]} ${c.dailyDose.mg} mg/j`);
  if (c.indications?.length) parts.push(`pour ${c.indications.map((i) => INDICATIONS.find((x) => x.code === i)?.label.toLowerCase() ?? i).join(" ou ")}`);
  if (c.monthsSinceEvent) parts.push(`événement ${OP[c.monthsSinceEvent.op]} ${c.monthsSinceEvent.months} mois`);
  return parts.join(", ");
}

export function describeAction(a: RuleAction): string {
  switch (a.type) {
    case "stop_before":
      return `dernière prise au moins ${formatHours(a.hours)} avant le geste`;
    case "resume_after":
      return `reprise au plus tôt ${formatHours(a.hours)} après le geste`;
    case "requirement":
      return `${a.blocking ? "condition obligatoire" : "à vérifier"} : ${a.text}`;
    case "exam":
      return `examen : ${a.exam}`;
    case "info":
      return `information : ${a.text}`;
  }
}

/** "Si traitement : Rivaroxaban, dose ≥ 20 mg/j et geste : … → dernière prise au moins 72 h (3 jours) avant le geste." */
export function describeRule(rule: { conditions: Condition[]; action: RuleAction }): string {
  const when = rule.conditions.map(describeCondition);
  const then = describeAction(rule.action);
  if (when.length === 0) return `Toujours : ${then}.`;
  return `Si ${when.join(" et ")} → ${then}.`;
}
