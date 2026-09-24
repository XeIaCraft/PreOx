// Everything computed from a consultation: body measures, renal function
// and every score. Yes/no items the patient data already answers (age,
// sex, BMI, creatinine…) fill the unanswered ones — never overriding an
// explicit answer. Shared by the consultation screen, the dossier list and
// the handover.

import {
  ASA_CLASSES,
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
import type { ConsultationState } from "./dossier";

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

export function consultationScores(c: ConsultationState) {
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

  const merged = {
    stopBang: withDerived(c.stopBang, {
      bmiOver35: derived.bmi !== undefined ? derived.bmi > 35 : undefined,
      ageOver50: p.age !== undefined ? p.age > 50 : undefined,
      male: p.sex ? p.sex === "M" : undefined,
    }),
    rcri: withDerived(c.rcri, { creatinineOver2: p.creatinineMgDl !== undefined ? p.creatinineMgDl > 2 : undefined }),
    apfel: withDerived(c.apfel, { female: p.sex ? p.sex === "F" : undefined }),
    hasBled: withDerived(c.hasBled, { elderly: p.age !== undefined ? p.age > 65 : undefined }),
    mask: withDerived(c.maskVentilation, {
      bmiOver26: derived.bmi !== undefined ? derived.bmi > 26 : undefined,
      ageOver55: p.age !== undefined ? p.age > 55 : undefined,
      // Snoring is the same question as in STOP-BANG.
      snoring: c.stopBang.snoring,
    }),
  };

  const results = {
    stopBang: stopBang(merged.stopBang.merged),
    rcri: rcri(merged.rcri.merged),
    dasi: dasi(c.dasi),
    ariscat: ariscat({ ...c.ariscat, age: c.ariscat.age ?? p.age, spo2: c.ariscat.spo2 ?? p.spo2, anemia: c.ariscat.anemia ?? (p.hb !== undefined ? p.hb <= 10 : undefined) }),
    apfel: apfel(merged.apfel.merged),
    hemstop: hemstop(c.hemstop),
    cha: cha2ds2vasc({ ...c.cha, age: p.age, sex: p.sex }),
    hasBled: hasBled(merged.hasBled.merged),
    airway: elGanzouri({ ...c.airway, mallampati: c.airway.mallampati ?? c.mallampati, weightKg: c.airway.weightKg ?? p.weightKg }),
    mask: maskVentilation(merged.mask.merged),
  };

  return { derived, merged, results };
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
    status: [c.asa ? ASA_CLASSES[c.asa - 1].label : "", c.nyha ? `NYHA ${["I", "II", "III", "IV"][c.nyha - 1]}` : "", c.frailty ? `CFS ${c.frailty} (${CLINICAL_FRAILTY_SCALE[c.frailty - 1].detail.toLowerCase()})` : ""]
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
