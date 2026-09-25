// The only yes/no questions left once everything that can be deduced has
// been (antecedents, treatments, measurements, airway examination,
// intervention): grouped by what they are for, each written back to the
// right place of the consultation. Scores that don't concern the patient
// aren't asked (CHA₂DS₂-VASc / HAS-BLED only with AF or an anticoagulant,
// DASI only before an intermediate/high cardiac-risk surgery).

import { APFEL_ITEMS, DASI_ITEMS, HAS_BLED_ITEMS, HEMSTOP_ITEMS, STOP_BANG_ITEMS } from "./scores";
import { atcMatches } from "./medications";
import { has } from "./history";
import type { ConsultationScores } from "./consultation-scores";
import type { ConsultationState } from "./dossier";

export interface Question {
  key: string;
  label: string;
  value: boolean | undefined;
  apply: (c: ConsultationState, v: boolean) => ConsultationState;
}

export interface QuestionGroup {
  id: string;
  title: string;
  /** What the answers feed. */
  feeds: string;
  questions: Question[];
}

const setCondition = (id: string) => (c: ConsultationState, v: boolean): ConsultationState => ({ ...c, conditions: { ...c.conditions, [id]: { ...c.conditions[id], present: v } } });

export function remainingQuestions(c: ConsultationState, scores: ConsultationScores): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  const cond = scores.conditions;
  const m = scores.merged;
  const unanswered = <K extends string>(merged: Partial<Record<K, boolean>>, keys: K[]) => keys.filter((k) => merged[k] === undefined);

  // Sleep apnoea: the subjective items of STOP-BANG (the rest comes from BP, BMI, age, sex, neck).
  const sleep = unanswered(m.stopBang.merged, ["snoring", "tired", "observed", "neckOver40"] as const);
  if (sleep.length && !has(cond, "osa"))
    groups.push({
      id: "sleep",
      title: "Sommeil",
      feeds: "STOP-BANG, Langeron",
      questions: sleep.map((k) => ({
        key: `sb-${k}`,
        label: STOP_BANG_ITEMS[k],
        value: undefined,
        apply: (x, v) => ({ ...x, stopBang: { ...x.stopBang, [k]: v } }),
      })),
    });

  // Cardiac risk (Lee): items not answered by the antecedents.
  const lee: Question[] = [];
  const leeMap = [
    ["coronary", "Cardiopathie ischémique"],
    ["heart_failure", "Insuffisance cardiaque"],
    ["stroke", "AVC ou AIT"],
    ["diabetes_insulin", "Diabète traité par insuline"],
  ] as const;
  for (const [id, label] of leeMap) if (cond[id] === undefined) lee.push({ key: `cond-${id}`, label, value: undefined, apply: setCondition(id) });
  if (m.rcri.merged.highRiskSurgery === undefined)
    lee.push({ key: "rcri-surgery", label: "Chirurgie intrapéritonéale, intrathoracique ou vasculaire sus-inguinale", value: undefined, apply: (x, v) => ({ ...x, surgery: { ...x.surgery, rcriHighRisk: v } }) });
  if (lee.length) groups.push({ id: "cardiac", title: "Cœur", feeds: "Lee (RCRI), ASA", questions: lee });

  // Lungs: recent respiratory infection (ARISCAT).
  if (c.ariscat.respiratoryInfectionLastMonth === undefined && cond.recent_uri === undefined)
    groups.push({ id: "lung", title: "Poumons", feeds: "ARISCAT", questions: [{ key: "cond-recent_uri", label: "Infection respiratoire le mois précédent", value: undefined, apply: setCondition("recent_uri") }] });

  // PONV (Apfel): opioids after surgery, history.
  const ponv = unanswered(m.apfel.merged, ["history", "postopOpioids", "nonSmoker"] as const);
  if (ponv.length)
    groups.push({
      id: "ponv",
      title: "Nausées et vomissements",
      feeds: "Apfel",
      questions: ponv.map((k) =>
        k === "history"
          ? { key: "cond-ponv", label: APFEL_ITEMS.history, value: undefined, apply: setCondition("ponv") }
          : k === "nonSmoker"
            ? { key: "apfel-nonSmoker", label: "Non-fumeur", value: undefined, apply: (x, v) => ({ ...x, substances: { ...x.substances, tobacco: v ? (x.substances.tobacco === "former" ? "former" : "never") : "current" } }) }
            : { key: "apfel-opioids", label: APFEL_ITEMS.postopOpioids, value: undefined, apply: (x, v) => ({ ...x, apfel: { ...x.apfel, postopOpioids: v } }) }
      ),
    });

  // Bleeding history (HEMSTOP) — always.
  const hem = (Object.keys(HEMSTOP_ITEMS) as (keyof typeof HEMSTOP_ITEMS)[]).filter((k) => c.hemstop[k] === undefined);
  if (hem.length)
    groups.push({
      id: "bleeding",
      title: "Saignement",
      feeds: "HEMSTOP",
      questions: hem.map((k) => ({ key: `hem-${k}`, label: HEMSTOP_ITEMS[k], value: undefined, apply: (x, v) => ({ ...x, hemstop: { ...x.hemstop, [k]: v } }) })),
    });

  // AF / anticoagulation: CHA₂DS₂-VASc and HAS-BLED items left.
  const anticoagulated = c.treatments.some((t) => atcMatches(t.atc, "B01AA") || atcMatches(t.atc, "B01AE") || atcMatches(t.atc, "B01AF"));
  if (has(cond, "arrhythmia") || anticoagulated) {
    const af: Question[] = [];
    if (m.cha.merged.vascularDisease === undefined) af.push({ key: "cond-pad", label: "Maladie vasculaire (artériopathie, antécédent d'IDM)", value: undefined, apply: setCondition("pad") });
    const hb = unanswered(m.hasBled.merged, ["hypertension", "renal", "liver", "bleeding", "labileInr", "drugs", "alcohol"] as const).filter((k) => k !== "labileInr" || c.treatments.some((t) => atcMatches(t.atc, "B01AA")));
    for (const k of hb) af.push({ key: `hb-${k}`, label: HAS_BLED_ITEMS[k], value: undefined, apply: (x, v) => ({ ...x, hasBled: { ...x.hasBled, [k]: v } }) });
    if (af.length) groups.push({ id: "af", title: "FA / anticoagulation", feeds: "CHA₂DS₂-VASc, HAS-BLED", questions: af });
  }

  // Functional capacity (DASI): before an intermediate/high cardiac-risk surgery.
  if ((c.surgery.cardiacRisk === "intermediate" || c.surgery.cardiacRisk === "high") && scores.results.dasi.missing > 0) {
    const dasi = (Object.keys(DASI_ITEMS) as (keyof typeof DASI_ITEMS)[]).filter((k) => c.dasi[k] === undefined);
    groups.push({
      id: "dasi",
      title: "Capacité fonctionnelle — le patient peut-il…",
      feeds: "DASI (METs)",
      questions: dasi.map((k) => ({ key: `dasi-${k}`, label: DASI_ITEMS[k].label, value: undefined, apply: (x, v) => ({ ...x, dasi: { ...x.dasi, [k]: v } }) })),
    });
  }
  return groups;
}

/** Number of questions left. */
export function remainingCount(groups: QuestionGroup[]): number {
  return groups.reduce((n, g) => n + g.questions.length, 0);
}
