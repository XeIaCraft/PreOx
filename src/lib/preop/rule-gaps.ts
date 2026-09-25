// What PreOx doesn't know how to handle for this patient: every treatment
// (unless marked as needing no rule in Paramètres) and every antecedent
// marked "needs a rule" with no active rule speaking about it. Each comes
// with the question to paste into a search tool; the answer, checked,
// becomes the missing rule.

import { treatmentMatches } from "./medications";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { classesOf, medicationOf, type Catalogs } from "./catalog";
import type { Conditions } from "./history";
import type { ConsultationState } from "./dossier";
import { penFast } from "./scores";
import { questionForAllergy, questionForCondition, questionForTreatment, type CaseContext, type QuestionInput } from "./rules/question";
import { INDICATIONS, type Rule, type Technique } from "./rules/types";
import { SURGERY_GRADES } from "./surgeries";

export interface RuleGap {
  key: string;
  kind: "treatment" | "condition" | "allergy";
  /** "Rivaroxaban", "Pacemaker / DAI". */
  subject: string;
  label: string;
  question: QuestionInput;
}

const BLEEDING_EN: Record<string, string> = { minimal: "minimal", low: "low", high: "high" };

export function treatmentNeedsRule(t: { atc: string; catalogId?: string; components?: string[] }, catalogs: Pick<Catalogs, "medications" | "drugClasses">): boolean {
  const own = medicationOf(t, catalogs.medications);
  if (own?.needsRule !== undefined) return own.needsRule;
  return classesOf(t, catalogs).find((k) => k.needsRule !== undefined)?.needsRule ?? true;
}

export function missingRules(
  rules: Rule[],
  c: ConsultationState,
  conditions: Conditions,
  opts: { catalogs?: Catalogs; techniques?: Technique[]; crcl?: number } = {}
): RuleGap[] {
  const catalogs = opts.catalogs ?? DEFAULT_CATALOGS;
  // Drafts count: a rule being written shouldn't be asked for again.
  const usable = rules.filter((r) => r.status !== "archived");
  const techniques = opts.techniques ?? c.techniques;
  const ctx: CaseContext = {
    surgery: c.surgery.name || undefined,
    grade: c.surgery.kce ? SURGERY_GRADES.find((g) => g.code === c.surgery.kce)?.label.toLowerCase() : undefined,
    bleedingRisk: c.surgery.bleedingRisk ? BLEEDING_EN[c.surgery.bleedingRisk] : undefined,
    techniques,
    crcl: opts.crcl,
  };
  const gaps: RuleGap[] = [];

  for (const t of c.treatments) {
    if (!treatmentNeedsRule(t, catalogs)) continue;
    const covered = usable.some((r) => r.conditions.some((k) => k.kind === "drug" && treatmentMatches(t, k.atc)));
    if (covered) continue;
    const indication = t.indication ? INDICATIONS.find((i) => i.code === t.indication)?.label.toLowerCase() : undefined;
    gaps.push({
      key: `t:${t.id}`,
      kind: "treatment",
      subject: t.name,
      label: `${t.name} : aucune règle — le poursuivre, l'arrêter (quand), le reprendre ?`,
      question: questionForTreatment({ drug: t.name.toLowerCase(), atc: t.atc, dailyDoseMg: t.dailyDoseMg, indication, ...ctx }),
    });
  }

  for (const item of catalogs.conditions) {
    if (!item.needsRule || !conditions[item.id]?.present) continue;
    const covered = usable.some((r) => r.conditions.some((k) => k.kind === "history" && k.condition === item.id && k.present));
    if (covered) continue;
    gaps.push({
      key: `c:${item.id}`,
      kind: "condition",
      subject: item.label,
      label: `${item.label} : aucune règle de prise en charge périopératoire`,
      question: questionForCondition({ condition: item.label.toLowerCase(), id: item.id, label: item.label, ...ctx }),
    });
  }

  for (const a of c.patient.allergyList ?? []) {
    const item = a.allergenId ? catalogs.allergens.find((x) => x.id === a.allergenId) : undefined;
    if (!item?.needsRule || gaps.some((g) => g.key === `a:${item.id}`)) continue;
    const covered = usable.some((r) => r.conditions.some((k) => k.kind === "allergy" && k.allergen === item.id && k.present));
    if (covered) continue;
    const pf = item.assessment === "pen-fast" && a.penFast ? penFast(a.penFast) : null;
    const decided = pf && (pf.value >= 3 || pf.level === "low");
    gaps.push({
      key: `a:${item.id}`,
      kind: "allergy",
      subject: item.label,
      label: `Allergie ${item.label.toLowerCase()} : aucune règle — que proposer à la place, faut-il un bilan ?`,
      question: questionForAllergy({
        allergen: item.label.toLowerCase(),
        id: item.id,
        label: item.label,
        reaction: a.reaction,
        penFast: decided ? { value: pf.value, low: pf.value < 3 } : undefined,
        ...ctx,
      }),
    });
  }
  return gaps;
}
