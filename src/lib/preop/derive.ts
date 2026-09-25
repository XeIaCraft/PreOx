// What the consultation can deduce by itself, so it doesn't have to be
// asked: antecedents implied by the treatments (insulin → insulin-treated
// diabetes…), by the lab values (Hb below the anaemia threshold…) and by
// the vitals (BP ≥ 180/110 → hypertension not controlled). A deduction
// only fills an unanswered item and always says where it comes from; an
// explicit answer is never overridden.

import { bmi, ckdEpi2021, cockcroftGault } from "./scores";
import { valueFindings, type PatientValues } from "./value-checks";
import type { ConditionCode, ConditionEntry, Conditions } from "./history";
import type { ConsultationState } from "./dossier";
import { classesOf, medicationOf, type Catalogs } from "./catalog";
import { DEFAULT_CATALOGS } from "./catalog-defaults";

export interface Deduction {
  code: ConditionCode;
  entry: ConditionEntry;
  /** Why ("Metformine", "Hb 11,2 g/dL"…). */
  because: string;
}

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

/** BMI, eGFR and clearance from the patient data (what thresholds can watch). */
export function patientDerived(p: ConsultationState["patient"]): PatientValues {
  return {
    bmi: p.weightKg && p.heightCm ? bmi(p.weightKg, p.heightCm) : undefined,
    egfr: p.age !== undefined && p.sex && p.creatinineMgDl ? ckdEpi2021({ age: p.age, sex: p.sex, creatinineMgDl: p.creatinineMgDl }) : undefined,
    crcl: p.age !== undefined && p.weightKg && p.sex && p.creatinineMgDl ? cockcroftGault({ age: p.age, weightKg: p.weightKg, sex: p.sex, creatinineMgDl: p.creatinineMgDl }) : undefined,
  };
}

export function deduceConditions(c: ConsultationState, catalogs: Pick<Catalogs, "medications" | "drugClasses"> & Partial<Pick<Catalogs, "values">> = DEFAULT_CATALOGS): Deduction[] {
  const out: Deduction[] = [];
  const add = (code: ConditionCode, because: string, entry: Partial<ConditionEntry> = {}) => {
    if (out.some((d) => d.code === code)) return;
    out.push({ code, because, entry: { present: true, ...entry } });
  };

  for (const t of c.treatments) {
    // The treatment itself (Paramètres › Traitements), then its classes.
    const own = medicationOf(t, catalogs.medications)?.implies;
    if (own) add(own, t.name);
    for (const k of classesOf(t, catalogs)) if (k.implies) add(k.implies, t.name);
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

  // The clinical exam.
  const exam = c.patient.exam;
  if (exam?.heart === "murmur" && !c.conditions.valve?.present && !c.conditions.aortic_stenosis?.present) add("murmur", "examen : souffle");
  if (exam?.heart === "irregular") add("arrhythmia", "examen : rythme irrégulier (à confirmer à l'ECG)");
  if (exam?.veins === "difficult") add("difficult_iv", "examen : abord veineux difficile");
  if (exam?.spine === "difficult") add("scoliosis", "examen : repères rachidiens difficiles");
  if (exam?.neuroDeficit) add("neuropathy", "examen : déficit neurologique préexistant");
  // The ECG (manual, chap. 51).
  const ecg = exam?.ecg;
  const has = (f: string) => ecg?.findings?.includes(f as never) ?? false;
  if (ecg?.rhythm === "af" || ecg?.rhythm === "flutter") add("arrhythmia", `ECG : ${ecg.rhythm === "af" ? "fibrillation auriculaire" : "flutter"}`);
  if (ecg?.rhythm === "paced") add("pacemaker", "ECG : rythme électroentraîné");
  if (has("delta")) add("wpw", "ECG : onde delta (pré-excitation)");
  const qtcLimit = c.patient.sex === "F" ? 460 : 440;
  if ((ecg?.qtcMs !== undefined && ecg.qtcMs > qtcLimit) || has("brugada")) add("long_qt", ecg?.qtcMs !== undefined && ecg.qtcMs > qtcLimit ? `ECG : QTc ${ecg.qtcMs} ms` : "ECG : aspect de Brugada");
  if (has("mobitz2") || has("avb3") || (has("avb1") && (has("lbbb") || (has("rbbb") && (has("lafb") || has("lpfb")))))) add("av_block", "ECG : bloc de conduction de haut degré ou trifasciculaire");
  if (has("q_waves")) add("coronary", "ECG : ondes Q (séquelle d'infarctus ?)");

  // Values past a threshold of Paramètres › Valeurs à signaler (Hb below the WHO
  // anaemia threshold, eGFR < 60, BP ≥ 180/110…): suggested, to confirm.
  const p = c.patient;
  const derived = patientDerived(p);
  const insulin = c.conditions.diabetes_insulin?.present || out.some((d) => d.code === "diabetes_insulin");
  for (const f of valueFindings(p, derived, catalogs.values ?? DEFAULT_CATALOGS.values)) {
    if (!f.check.implies) continue;
    // A diabetes value applies to the diabetes the patient has.
    const code = f.check.implies === "diabetes_oral" && insulin ? "diabetes_insulin" : f.check.implies;
    const existing = out.find((d) => d.code === code);
    if (existing) {
      if (f.check.qualifier && !existing.entry[f.check.qualifier]) {
        existing.entry = { ...existing.entry, [f.check.qualifier]: true };
        existing.because = `${existing.because}, ${f.measured}`;
      }
      continue;
    }
    add(code, `${f.measured}${f.check.qualifier ? "" : ""}`, f.check.qualifier ? { [f.check.qualifier]: true } : {});
  }
  return out;
}

/** The antecedents as used by the scores: explicit answers, completed by the deductions. */
export function effectiveConditions(c: ConsultationState, catalogs: Pick<Catalogs, "medications" | "drugClasses" | "conditions"> & Partial<Pick<Catalogs, "values">> = DEFAULT_CATALOGS): { conditions: Conditions; deduced: Map<ConditionCode, string> } {
  const conditions: Conditions = { ...c.conditions };
  const deduced = new Map<ConditionCode, string>();
  for (const d of deduceConditions(c, catalogs)) {
    const explicit = c.conditions[d.code];
    if (explicit === undefined) {
      conditions[d.code] = d.entry;
      deduced.set(d.code, d.because);
    } else if (explicit.present) {
      // "HTA: yes" answered, and the measured BP says it isn't controlled (same for any qualifier).
      const added = (["poorlyControlled", "severe", "recent"] as const).filter((q) => d.entry[q] && explicit[q] === undefined);
      if (added.length) {
        conditions[d.code] = { ...explicit, ...Object.fromEntries(added.map((q) => [q, true])) };
        deduced.set(d.code, d.because);
      }
    }
  }
  // A structured detail answered (« GOLD 3 », « < 3 mois ») counts as its qualifier for the scores and rules.
  for (const item of catalogs.conditions) {
    const e = conditions[item.id];
    if (!e?.present || !e.details || !item.details) continue;
    for (const d of item.details) {
      const opt = d.kind === "choice" ? d.options?.find((x) => x.code === e.details![d.id]) : undefined;
      if (opt?.qualifier && e[opt.qualifier] === undefined) conditions[item.id] = { ...conditions[item.id]!, [opt.qualifier]: true };
    }
  }
  // Systems reviewed with nothing else (« RAS »): what isn't listed is absent.
  const reviewed = new Set(c.historyReviewed ?? []);
  if (reviewed.size) for (const item of catalogs.conditions) if (reviewed.has(item.system) && conditions[item.id] === undefined) conditions[item.id] = { present: false };
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
