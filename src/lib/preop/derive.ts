// What the consultation can deduce by itself, so it doesn't have to be
// asked: antecedents implied by the treatments (insulin → insulin-treated
// diabetes…), by the lab values (Hb below the anaemia threshold…) and by
// the vitals (BP ≥ 180/110 → hypertension not controlled). A deduction
// only fills an unanswered item and always says where it comes from; an
// explicit answer is never overridden.

import { atcMatches } from "./medications";
import { ckdEpi2021 } from "./scores";
import type { ConditionCode, ConditionEntry, Conditions } from "./history";
import type { ConsultationState } from "./dossier";

export interface Deduction {
  code: ConditionCode;
  entry: ConditionEntry;
  /** Why ("Metformine", "Hb 11,2 g/dL"…). */
  because: string;
}

/** Treatment classes that imply an antecedent. Only unambiguous ones: an antiepileptic may be for pain, an inhaler for asthma or COPD. */
const BY_TREATMENT: { atc: string; code: ConditionCode }[] = [
  { atc: "A10A", code: "diabetes_insulin" },
  { atc: "A10B", code: "diabetes_oral" },
  { atc: "C10", code: "dyslipidemia" },
  { atc: "H03A", code: "thyroid" },
  { atc: "H03B", code: "thyroid" },
  { atc: "N04B", code: "neuromuscular" },
];

/** Antiplatelet / anticoagulant indications that imply an antecedent. */
const BY_INDICATION: Partial<Record<string, ConditionCode>> = {
  af: "arrhythmia",
  coronary_stent: "coronary",
  secondary_prevention_coronary: "coronary",
  secondary_prevention_stroke: "stroke",
  peripheral_arterial_disease: "pad",
  vte: "vte",
  mechanical_valve: "valve",
};

export function deduceConditions(c: ConsultationState): Deduction[] {
  const out: Deduction[] = [];
  const add = (code: ConditionCode, because: string, entry: Partial<ConditionEntry> = {}) => {
    if (out.some((d) => d.code === code)) return;
    out.push({ code, because, entry: { present: true, ...entry } });
  };

  for (const t of c.treatments) {
    for (const r of BY_TREATMENT) if (atcMatches(t.atc, r.atc)) add(r.code, t.name);
    const fromIndication = t.indication ? BY_INDICATION[t.indication] : undefined;
    if (fromIndication) {
      // A stent or an event of less than 3 months counts as recent.
      const months = t.eventDate ? (Date.now() - new Date(t.eventDate).getTime()) / (30.44 * 86_400_000) : undefined;
      add(fromIndication, `${t.name} (indication)`, months !== undefined && months < 3 && (fromIndication === "coronary" || fromIndication === "stroke") ? { recent: true } : {});
    }
  }
  // Insulin makes "diabetes without insulin" redundant.
  if (out.some((d) => d.code === "diabetes_insulin")) {
    const i = out.findIndex((d) => d.code === "diabetes_oral");
    if (i >= 0) out.splice(i, 1);
  }

  const p = c.patient;
  if (p.sbp !== undefined || p.dbp !== undefined) {
    if ((p.sbp ?? 0) >= 180 || (p.dbp ?? 0) >= 110) add("hypertension", bpLabel(p.sbp, p.dbp), { poorlyControlled: true });
  }
  if (p.hb !== undefined && p.sex) {
    // WHO anaemia thresholds: < 13 g/dL (men), < 12 g/dL (non-pregnant women).
    if (p.hb < (p.sex === "M" ? 13 : 12)) add("anemia", `Hb ${String(p.hb).replace(".", ",")} g/dL`);
  }
  if (p.age !== undefined && p.sex && p.creatinineMgDl) {
    const egfr = ckdEpi2021({ age: p.age, sex: p.sex, creatinineMgDl: p.creatinineMgDl });
    // One value doesn't make chronic kidney disease: suggested, to confirm.
    if (egfr < 60) add("ckd", `DFGe ${Math.round(egfr)} mL/min/1,73 m² (à confirmer : chronique ?)`);
  }
  return out;
}

/** The antecedents as used by the scores: explicit answers, completed by the deductions. */
export function effectiveConditions(c: ConsultationState): { conditions: Conditions; deduced: Map<ConditionCode, string> } {
  const conditions: Conditions = { ...c.conditions };
  const deduced = new Map<ConditionCode, string>();
  for (const d of deduceConditions(c)) {
    const explicit = c.conditions[d.code];
    if (explicit === undefined) {
      conditions[d.code] = d.entry;
      deduced.set(d.code, d.because);
    } else if (explicit.present && d.entry.poorlyControlled && explicit.poorlyControlled === undefined) {
      // "HTA: yes" answered, and the measured BP says it isn't controlled.
      conditions[d.code] = { ...explicit, poorlyControlled: true };
      deduced.set(d.code, d.because);
    }
  }
  return { conditions, deduced };
}

/** "PA 185/95 mmHg", or just the value that was measured. */
export function bpLabel(sbp?: number, dbp?: number): string {
  if (sbp !== undefined && dbp !== undefined) return `PA ${sbp}/${dbp} mmHg`;
  return sbp !== undefined ? `PAS ${sbp} mmHg` : `PAD ${dbp} mmHg`;
}

/** Lower-cases the first letter to run a title into a sentence — but not an acronym (« SAOS », « PA »). */
export function lowerFirst(t: string): string {
  return /^.[A-Z0-9ÀÉ]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}
