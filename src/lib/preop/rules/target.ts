// What a rule protects — the surgery, the anaesthesia, or both — and how
// its consequences read: a treatment taken too recently doesn't forbid
// "the operation" as a whole, it forbids the gesture the rule is about.
import { TECHNIQUES, type Condition, type RuleAction, type RuleTarget, type Technique } from "./types";

const ANAESTHETIC: Technique[] = ["neuraxial", "deep_block", "superficial_block", "general", "sedation"];

/** The rule's own target, or the one its conditions imply: a technique → the anaesthesia, a surgical attribute only → the surgery. */
export function ruleTarget(rule: { conditions: Condition[]; action: RuleAction }): RuleTarget {
  if (rule.action.target) return rule.action.target;
  const techniques = rule.conditions.flatMap((c) => (c.kind === "technique" ? c.in : []));
  const surgical = rule.conditions.some((c) => c.kind === "surgery" && (c.attribute === "bleedingRisk" || c.attribute === "closedSpace"));
  if (techniques.length && techniques.every((t) => ANAESTHETIC.includes(t)) && !surgical) return "anaesthesia";
  if (surgical && !techniques.length) return "surgery";
  return "both";
}

/** « la ponction neuraxiale ou le bloc profond » — the techniques a rule is about, or a generic word. */
function gestureOf(conditions: Condition[]): string {
  const techniques = conditions.flatMap((c) => (c.kind === "technique" ? c.in : []));
  if (!techniques.length) return "le geste anesthésique";
  return techniques.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.replace(/\s*\(.*\)$/, "").toLowerCase() ?? t).join(" ou ");
}

/** « avant la chirurgie », « avant la ponction neuraxiale », « avant l'intervention ». */
export function beforeWhat(rule: { conditions: Condition[]; action: RuleAction }): string {
  const target = ruleTarget(rule);
  if (target === "surgery") return "avant la chirurgie";
  if (target === "anaesthesia") return `avant : ${gestureOf(rule.conditions)}`;
  return "avant l'intervention";
}

/** What a last dose taken too recently actually forbids, and what stays possible. */
export function conflictText(rule: { conditions: Condition[]; action: RuleAction }, earliest: string): string {
  const target = ruleTarget(rule);
  if (target === "surgery") return `Prise trop récente : chirurgie à reporter au ${earliest} au plus tôt. L'anesthésie elle-même n'est pas contre-indiquée par ce traitement.`;
  if (target === "anaesthesia")
    return `Prise trop récente : ${gestureOf(rule.conditions)} contre-indiqué avant le ${earliest}. La chirurgie reste possible avec une autre technique (anesthésie générale, par exemple), si d'autres règles ne s'y opposent pas.`;
  return `Prise trop récente : intervention possible à partir du ${earliest}.`;
}
