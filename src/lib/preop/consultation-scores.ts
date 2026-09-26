// Everything computed from a consultation: body measures, renal function
// and every score. Yes/no items the patient data already answers (age,
// sex, BMI, creatinine…) fill the unanswered ones — never overriding an
// explicit answer. Shared by the consultation screen, the dossier list and
// the handover.

import {
  ASA_CLASSES,
  DASI_ITEMS,
  CLINICAL_FRAILTY_SCALE,
  MALLAMPATI_CLASSES,
  adjustedBodyWeight,
  apfel,
  ariscat,
  bmi,
  cha2ds2vasc,
  ckdEpi2021,
  cockcroftGault,
  dasi,
  elGanzouri,
  hasBled,
  hemstop,
  idealBodyWeight,
  leanBodyWeight,
  maskVentilation,
  rcri,
  stopBang,
  type ScoreResult,
} from "./scores";
import { withNormalDefaults, type ConsultationState } from "./dossier";
import { anyOf, has, qualified } from "./history";
import { suggestAsa } from "./asa";
import { recommendExams } from "./exams";
import { treatmentMatches } from "./medications";
import { effectiveConditions } from "./derive";
import { drugClassOf } from "@/lib/carnet/pharmaco";
import type { ProtocolContent } from "./protocols";
import { postopHasOpioids } from "./postop";
import { fold, type Catalogs } from "./catalog";
import { DEFAULT_CATALOGS } from "./catalog-defaults";

type YesNo<K extends string> = Partial<Record<K, boolean>>;

export interface Merged<K extends string> {
  merged: YesNo<K>;
  derivedKeys: Set<K>;
}

export function withDerived<K extends string>(answers: YesNo<K>, derived: Partial<Record<K, boolean | undefined>>): Merged<K> {
  const merged = { ...answers };
  const derivedKeys = new Set<K>();
  for (const [k, v] of Object.entries(derived) as [K, boolean | undefined][]) {
    if (merged[k] === undefined && v !== undefined) {
      merged[k] = v;
      derivedKeys.add(k);
    }
  }
  return { merged, derivedKeys };
}

/** Opioids planned after surgery: an opioid in the analgesia part of the plan, or named in its post-op orders. */
function plannedPostopOpioids(plan: ProtocolContent | undefined): boolean | undefined {
  if (!plan || (plan.drugs.length === 0 && plan.postop.length === 0 && !plan.postopPlan?.analgesia.length)) return undefined;
  if (postopHasOpioids(plan.postopPlan)) return true;
  if (plan.drugs.some((d) => d.phase === "analgesia" && drugClassOf(d.name) === "morphinique")) return true;
  if (plan.postop.some((l) => OPIOID_WORDS.test(l))) return true;
  return undefined;
}

const OPIOID_WORDS = /morphin|oxycodon|piritramid|dipidolor|tramadol|hydromorphon|tapentadol|fentanyl|sufentanil|PCA/i;

/** Unanswered yes/no items taken as « no problem » (DASI: « can do », up to the ordinary activities). */
function fillDefaults<K extends string>(answers: YesNo<K>, keys: readonly K[], value: (k: K) => boolean): Merged<K> {
  const merged = { ...answers };
  const derivedKeys = new Set<K>();
  for (const k of keys)
    if (merged[k] === undefined) {
      merged[k] = value(k);
      derivedKeys.add(k);
    }
  return { merged, derivedKeys };
}

/** DASI items a patient without limitation does (> 34 points, ≥ 4 METs): not running nor intense sports. */
const DASI_DEFAULT_NO = new Set(["runShort", "moderateRecreation", "strenuousSports"]);

export function consultationScores(input: ConsultationState, opts: { plan?: ProtocolContent; catalogs?: Catalogs } = {}) {
  const catalogs = opts.catalogs ?? DEFAULT_CATALOGS;
  // What was not examined or asked is normal: only problems are tapped.
  const c = withNormalDefaults(input);
  const p = c.patient;
  const hasBody = !!(p.weightKg && p.heightCm);
  const derived = {
    bmi: hasBody ? bmi(p.weightKg!, p.heightCm!) : undefined,
    ibw: p.sex && p.heightCm ? idealBodyWeight(p.sex, p.heightCm) : undefined,
    lbw: p.sex && hasBody ? leanBodyWeight(p.sex, p.weightKg!, p.heightCm!) : undefined,
    abw: p.sex && hasBody ? adjustedBodyWeight(p.sex, p.weightKg!, p.heightCm!) : undefined,
    crcl: p.age !== undefined && p.weightKg && p.sex && p.creatinineMgDl ? cockcroftGault({ age: p.age, weightKg: p.weightKg, sex: p.sex, creatinineMgDl: p.creatinineMgDl }) : undefined,
    egfr: p.age !== undefined && p.sex && p.creatinineMgDl ? ckdEpi2021({ age: p.age, sex: p.sex, creatinineMgDl: p.creatinineMgDl }) : undefined,
  };

  const { conditions: cond, deduced } = effectiveConditions(c, catalogs);
  const sub = c.substances;
  const surgery = c.surgery;
  const merged = {
    stopBang: withDerived(c.stopBang, {
      pressure: has(cond, "hypertension"),
      neckOver40: p.neckCm !== undefined ? p.neckCm > 40 : undefined,
      bmiOver35: derived.bmi !== undefined ? derived.bmi > 35 : undefined,
      ageOver50: p.age !== undefined ? p.age > 50 : undefined,
      male: p.sex ? p.sex === "M" : undefined,
    }),
    rcri: withDerived(c.rcri, {
      highRiskSurgery: surgery.rcriHighRisk,
      ischemicHeartDisease: has(cond, "coronary"),
      heartFailure: has(cond, "heart_failure"),
      cerebrovascularDisease: has(cond, "stroke"),
      insulin: has(cond, "diabetes_insulin"),
      creatinineOver2: p.creatinineMgDl !== undefined ? p.creatinineMgDl > 2 : undefined,
    }),
    apfel: withDerived(c.apfel, {
      female: p.sex ? p.sex === "F" : undefined,
      nonSmoker: sub.tobacco ? sub.tobacco !== "current" : undefined,
      history: has(cond, "ponv"),
      postopOpioids: plannedPostopOpioids(opts.plan),
    }),
    hasBled: withDerived(c.hasBled, {
      hypertension: has(cond, "hypertension") === false ? false : qualified(cond, "hypertension", "poorlyControlled") || undefined,
      renal: anyOf(cond, ["dialysis"]) || qualified(cond, "ckd", "severe") || (has(cond, "ckd") === false && has(cond, "dialysis") === false ? false : undefined),
      liver: has(cond, "cirrhosis"),
      stroke: has(cond, "stroke"),
      bleeding: has(cond, "bleeding_disorder"),
      elderly: p.age !== undefined ? p.age > 65 : undefined,
      drugs: c.treatments.some((t) => treatmentMatches(t, "B01AC") || treatmentMatches(t, "M01A")) || undefined,
      alcohol: sub.alcoholUnitsPerWeek !== undefined ? sub.alcoholUnitsPerWeek >= 8 : undefined,
    }),
    cha: withDerived(c.cha, {
      heartFailure: has(cond, "heart_failure"),
      hypertension: has(cond, "hypertension"),
      diabetes: anyOf(cond, ["diabetes_oral", "diabetes_insulin"]),
      strokeTiaThromboembolism: has(cond, "stroke"),
      vascularDisease: anyOf(cond, ["coronary", "pad"]),
    }),
    mask: withDerived(c.maskVentilation, {
      bmiOver26: derived.bmi !== undefined ? derived.bmi > 26 : undefined,
      ageOver55: p.age !== undefined ? p.age > 55 : undefined,
      // Snoring is the same question as in STOP-BANG.
      snoring: c.stopBang.snoring,
    }),
  };

  // The questions nobody answered, as « no » — listed on screen as defaults (defaulted), never hidden.
  const no = () => false;
  const answers = {
    stopBang: fillDefaults(merged.stopBang.merged, ["snoring", "tired", "observed", "pressure", "neckOver40"] as const, no),
    rcri: fillDefaults(merged.rcri.merged, ["highRiskSurgery", "ischemicHeartDisease", "heartFailure", "cerebrovascularDisease", "insulin"] as const, no),
    apfel: fillDefaults(merged.apfel.merged, ["history", "postopOpioids"] as const, no),
    hemstop: fillDefaults(c.hemstop, ["hematoma", "hemorrhage", "menorrhagia", "surgery", "tooth", "obstetrics", "parents"] as const, no),
    hasBled: fillDefaults(merged.hasBled.merged, ["hypertension", "renal", "liver", "stroke", "bleeding", "labileInr", "drugs", "alcohol"] as const, no),
    cha: fillDefaults(merged.cha.merged, ["heartFailure", "hypertension", "diabetes", "strokeTiaThromboembolism", "vascularDisease"] as const, no),
    mask: fillDefaults(merged.mask.merged, ["beard", "edentulous", "snoring"] as const, no),
    dasi: fillDefaults(c.dasi, Object.keys(DASI_ITEMS) as (keyof typeof DASI_ITEMS)[], (k) => !DASI_DEFAULT_NO.has(k)),
  };
  const respiratoryInfection = c.ariscat.respiratoryInfectionLastMonth ?? has(cond, "recent_uri");

  // No known difficult intubation unless the antecedent says so (normal by default).
  const airwayHistory = c.airway.difficultIntubationHistory ?? (has(cond, "difficult_airway") === true ? "definite" : "none");
  const results = {
    stopBang: stopBang(answers.stopBang.merged),
    rcri: rcri(answers.rcri.merged),
    dasi: dasi(answers.dasi.merged),
    ariscat: ariscat({
      ...c.ariscat,
      respiratoryInfectionLastMonth: respiratoryInfection ?? false,
      age: c.ariscat.age ?? p.age,
      spo2: c.ariscat.spo2 ?? p.spo2,
      anemia: c.ariscat.anemia ?? (p.hb !== undefined ? p.hb <= 10 : undefined),
      incision: c.ariscat.incision ?? surgery.incision,
      durationHours: c.ariscat.durationHours ?? surgery.durationHours,
      // A surgery not marked urgent is scheduled.
      emergency: c.ariscat.emergency ?? surgery.emergency ?? (surgery.name ? false : undefined),
    }),
    apfel: apfel(answers.apfel.merged),
    hemstop: hemstop(answers.hemstop.merged),
    cha: cha2ds2vasc({ ...answers.cha.merged, age: p.age, sex: p.sex }),
    hasBled: hasBled(answers.hasBled.merged),
    airway: elGanzouri({ ...c.airway, difficultIntubationHistory: airwayHistory, mallampati: c.airway.mallampati ?? c.mallampati, weightKg: c.airway.weightKg ?? p.weightKg }),
    mask: maskVentilation(answers.mask.merged),
  };

  const asaSuggestion = suggestAsa(p, cond, sub, catalogs.conditions);
  const asa = c.asa ?? asaSuggestion.asa;
  const surgeryItem = c.surgery.catalogId ? catalogs.surgeries.find((x) => x.id === c.surgery.catalogId) : c.surgery.name ? catalogs.surgeries.find((x) => fold(x.name) === fold(c.surgery.name)) : undefined;
  const exams = recommendExams({
    consultation: { ...c, conditions: cond },
    asa,
    mets: results.dasi.missing === 0 && results.dasi.value > 0 ? results.dasi.mets : undefined,
    surgeryProfile: surgeryItem?.examProfile,
    stopBang: results.stopBang.missing === 0 || results.stopBang.value >= 5 ? results.stopBang.value : undefined,
    crcl: derived.crcl,
    bleedingHistory: Object.values(c.hemstop).some((v) => v === true),
  });

  return { derived, merged, answers, respiratoryInfectionDefaulted: respiratoryInfection === undefined, results, asaSuggestion, asa, exams, conditions: cond, deduced, catalogs };
}

export type ConsultationScores = ReturnType<typeof consultationScores>;

const scoreText = (name: string, r: ScoreResult, withValue = true) => (r.label ? `${name}${withValue ? ` ${r.value}` : ""} : ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}` : "");

export interface ConsultationSummary {
  /** ASA, NYHA, frailty. */
  status: string;
  /** Mallampati and predicted difficulties. */
  airway: string;
  /** STOP-BANG, Lee, DASI, ARISCAT, Apfel, HEMSTOP — the ones answered. */
  risks: string;
}

export function consultationSummary(c: ConsultationState, scores = consultationScores(c)): ConsultationSummary {
  const r = scores.results;
  return {
    status: [scores.asa ? `${ASA_CLASSES[scores.asa - 1].label}${c.surgery.emergency ? "E" : ""}${c.asa ? "" : " (suggéré)"}` : "", c.nyha ? `NYHA ${["I", "II", "III", "IV"][c.nyha - 1]}` : "", c.frailty ? `CFS ${c.frailty} (${CLINICAL_FRAILTY_SCALE[c.frailty - 1].detail.toLowerCase()})` : ""]
      .filter(Boolean)
      .join(" · "),
    airway: [c.mallampati ? `Mallampati ${MALLAMPATI_CLASSES[c.mallampati - 1].label}` : "", r.airway.level === "high" ? r.airway.label.toLowerCase() : "", r.mask.level === "high" ? r.mask.label.toLowerCase() : ""]
      .filter(Boolean)
      .join(", "),
    risks: [
      scoreText("STOP-BANG", r.stopBang),
      scoreText("Lee", r.rcri),
      r.dasi.missing === 0 && r.dasi.value > 0 ? `DASI ${r.dasi.value} (${r.dasi.mets} METs)` : "",
      scoreText("ARISCAT", r.ariscat),
      scoreText("Apfel", r.apfel),
      r.hemstop.value > 0 ? `HEMSTOP positif (${r.hemstop.value})` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
