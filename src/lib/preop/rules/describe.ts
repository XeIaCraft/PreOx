// A structured rule, read back in plain French — shown before saving it
// ("this is what the app understood") and in the library.
import { atcLabel } from "../medications";
import { INDICATIONS, PATIENT_VALUES, SURGERY_ATTRIBUTES, TECHNIQUES } from "./types";
import { defaultConditionLabel } from "../catalog-conditions";
import { beforeWhat, ruleTarget } from "./target";
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
  if (c.kind === "history") return `antécédent ${c.present ? "" : "absent : "}${(c.label ?? defaultConditionLabel(c.condition) ?? c.condition).toLowerCase()}`;
  if (c.kind === "allergy") {
    const pf = c.penFast === "low" ? " avec PEN-FAST < 3 (allergie vraie peu probable)" : c.penFast === "high" ? " avec PEN-FAST ≥ 3 (allergie vraie possible)" : "";
    return `allergie ${c.present ? "" : "absente : "}${(c.label ?? c.allergen).toLowerCase()}${c.present ? pf : ""}`;
  }
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

export function describeAction(a: RuleAction, conditions: Condition[] = []): string {
  const after = { surgery: "après la chirurgie", anaesthesia: "après le geste anesthésique (ou le retrait du cathéter)", both: "après l'intervention" }[ruleTarget({ conditions, action: a })];
  switch (a.type) {
    case "stop_before":
      return `dernière prise au moins ${formatHours(a.hours)} ${beforeWhat({ conditions, action: a })}`;
    case "resume_after":
      return `reprise au plus tôt ${formatHours(a.hours)} ${after}`;
    case "requirement":
      return `${a.blocking ? "condition obligatoire" : "à vérifier"} : ${a.text}`;
    case "exam":
      return `examen : ${a.exam}${a.withinDays !== undefined ? (a.withinDays === 0 ? " (le jour même)" : ` (dans les ${a.withinDays} jour${a.withinDays > 1 ? "s" : ""} avant le geste)`) : ""}`;
    case "info":
      return `information : ${a.text}`;
  }
}

/** "Si traitement : Rivaroxaban, dose ≥ 20 mg/j et geste : … → dernière prise au moins 72 h (3 jours) avant le geste." */
export function describeRule(rule: { conditions: Condition[]; action: RuleAction }): string {
  const when = rule.conditions.map(describeCondition);
  const then = describeAction(rule.action, rule.conditions).replace(/[.\s]+$/, "");
  if (when.length === 0) return `Toujours : ${then}.`;
  return `Si ${when.join(" et ")} → ${then}.`;
}
