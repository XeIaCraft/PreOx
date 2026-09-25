// What PreOx doesn't know how to handle for this patient: every treatment
// (unless marked as needing no rule in Paramètres) and every antecedent
// marked "needs a rule" with no active rule speaking about it. Each comes
// with the question to paste into a search tool; the answer, checked,
// becomes the missing rule.

import { atcMatches } from "./medications";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import type { Catalogs } from "./catalog";
import type { Conditions } from "./history";
import type { ConsultationState } from "./dossier";
import { questionForCondition, questionForTreatment, type CaseContext, type QuestionInput } from "./rules/question";
import { INDICATIONS, type Rule, type Technique } from "./rules/types";
import { SURGERY_GRADES } from "./surgeries";

export interface RuleGap {
  key: string;
  kind: "treatment" | "condition";
  /** "Rivaroxaban", "Pacemaker / DAI". */
  subject: string;
  label: string;
  question: QuestionInput;
}

const BLEEDING_EN: Record<string, string> = { minimal: "minimal", low: "low", high: "high" };

export function treatmentNeedsRule(atc: string, catalogs: Pick<Catalogs, "medications" | "drugClasses">): boolean {
  const own = catalogs.medications.find((m) => m.atc === atc || m.id === atc);
  if (own?.needsRule !== undefined) return own.needsRule;
  const classes = catalogs.drugClasses.filter((k) => atcMatches(atc, k.atc) && k.needsRule !== undefined).sort((a, b) => b.atc.length - a.atc.length);
  return classes[0]?.needsRule ?? true;
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
    if (!treatmentNeedsRule(t.atc, catalogs)) continue;
    const covered = usable.some((r) => r.conditions.some((k) => k.kind === "drug" && atcMatches(t.atc, k.atc)));
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
  return gaps;
}
