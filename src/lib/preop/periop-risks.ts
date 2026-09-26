// Two decisions of the consultation that the scores alone do not make:
// - the thrombotic risk of a patient on an oral anticoagulant, which decides
//   a bridging (ESC 2022, Halvorsen et al., PMID 36017553: « Bridging therapy
//   may be considered for patients with a high thrombotic risk (i.e. AF with
//   CHA2DS2-VASc score > 6, recent cardioembolic stroke < 3 months, or high
//   risk of VTE recurrence) » ; mechanical valves: LMWH bridging, I B);
// - the nutritional grade 1 to 4 (SFNEP / ESPEN, as taught in the BeSARPP
//   course « Nutrition péri-opératoire », G. Patrubani, CHU Saint-Pierre
//   2022): malnutrition = BMI ≤ 18.5 (< 21 after 70), weight loss > 10 % or
//   albumin < 30 g/l; crossed with the patient's risk factors and the
//   morbidity of the surgery.

import type { ConsultationState } from "./dossier";
import type { Conditions } from "./history";
import { bmi } from "./scores";

const ANTICOAGULANT = /^B01A(A|E|F)/;
const monthsSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / (30.44 * 24 * 3_600_000) : undefined);

export interface ThromboticRisk {
  level: "high" | "low_moderate" | "unknown";
  label: string;
  reasons: string[];
  conduct: string;
  source: string;
}

export function thromboticRisk(c: ConsultationState, conditions: Conditions, chaScore: number | null, now = new Date()): ThromboticRisk | null {
  const anticoag = c.treatments.filter((t) => ANTICOAGULANT.test(t.atc));
  if (anticoag.length === 0) return null;
  const reasons: string[] = [];
  if (conditions.mechanical_valve?.present || anticoag.some((t) => t.indication === "mechanical_valve")) reasons.push("valve mécanique");
  for (const t of anticoag) {
    const m = monthsSince(t.eventDate, now);
    if (t.indication === "secondary_prevention_stroke" && m !== undefined && m < 3) reasons.push("AVC cardioembolique < 3 mois");
    if (t.indication === "vte" && m !== undefined && m < 3) reasons.push("thrombose ou embolie < 3 mois (récidive à haut risque)");
  }
  const af = anticoag.some((t) => t.indication === "af") || conditions.arrhythmia?.present;
  if (af && chaScore !== null && chaScore > 6) reasons.push(`FA avec CHA₂DS₂-VASc ${chaScore}`);
  const source = "ESC 2022 (Halvorsen et al., PMID 36017553)";
  if (reasons.length)
    return {
      level: "high",
      label: "Élevé",
      reasons,
      conduct: "Relais à discuter avec le prescripteur (HBPM pour une valve mécanique à haut risque), en pesant le risque hémorragique.",
      source,
    };
  // Without an indication on the treatment, a known AF is taken as its indication.
  const known = anticoag.every((t) => t.indication || conditions.arrhythmia?.present);
  return {
    level: known ? "low_moderate" : "unknown",
    label: known ? "Faible à modéré" : "Indication à préciser",
    reasons: known ? [] : ["indication de l'anticoagulant non renseignée"],
    conduct: known ? "Pas de relais (ESC 2022, III B) : interruption selon la molécule, la fonction rénale et le risque hémorragique." : "Renseigner l'indication (FA, MTEV, valve…) et sa date pour classer le risque.",
    source,
  };
}

export interface NutritionGrade {
  grade: 1 | 2 | 3 | 4;
  malnourished: boolean;
  why: string[];
  conduct: string;
  source: string;
}

const RISK_CONDITIONS: [string, string][] = [
  ["cancer", "cancer"],
  ["leukemia_lymphoma", "hémopathie maligne"],
  ["septic_shock", "sepsis"],
  ["diabetes_oral", "diabète"],
  ["diabetes_insulin", "diabète"],
  ["ckd", "insuffisance d'organe"],
  ["heart_failure", "insuffisance d'organe"],
  ["cirrhosis", "insuffisance d'organe"],
  ["copd", "insuffisance d'organe"],
  ["neuromuscular", "pathologie neuromusculaire"],
  ["hiv", "VIH"],
  ["short_bowel", "chirurgie digestive majeure antérieure"],
  ["bariatric_history", "chirurgie digestive majeure antérieure"],
  ["oesophagectomy", "chirurgie digestive majeure antérieure"],
  ["depression", "syndrome dépressif"],
  ["cognitive", "troubles cognitifs"],
  ["chemotherapy", "traitement carcinologique"],
];

export function nutritionGrade(c: ConsultationState, conditions: Conditions): NutritionGrade | null {
  const p = c.patient;
  if (!p.weightKg || !p.heightCm) return null;
  const b = bmi(p.weightKg, p.heightCm);
  const why: string[] = [];
  const old = p.age !== undefined && p.age > 70;
  if (b <= 18.5 || (old && b < 21)) why.push(`IMC ${Math.round(b * 10) / 10}`);
  if (p.albumin !== undefined && p.albumin < 30) why.push(`albumine ${p.albumin} g/l`);
  if (conditions.malnutrition?.present) why.push("dénutrition connue (perte de poids > 10 %)");
  const malnourished = why.length > 0;
  const risk = new Set<string>();
  if (old) risk.add("âge > 70 ans");
  for (const [id, label] of RISK_CONDITIONS) if (conditions[id]?.present) risk.add(label);
  if (c.treatments.some((t) => t.atc.startsWith("H02AB"))) risk.add("corticothérapie");
  if (c.treatments.length > 5) risk.add("polymédication > 5");
  const heavySurgery = c.surgery.kce === "major" || c.surgery.cardiacRisk === "high";
  if (heavySurgery) risk.add("chirurgie à risque élevé de morbidité");
  const grade: NutritionGrade["grade"] = malnourished ? (heavySurgery ? 4 : 3) : risk.size ? 2 : 1;
  const conduct =
    grade === 1
      ? "Pas de prise en charge spécifique ; réalimentation précoce."
      : grade === 2
        ? "Conseils diététiques et compléments oraux conseillés ; chirurgie digestive carcinologique : immunonutrition préopératoire (5–7 jours)."
        : grade === 3
          ? "Conseils diététiques et compléments oraux ; nutrition artificielle si insuffisant ou dénutrition très sévère."
          : "Nutrition préopératoire 7–14 jours (entérale de préférence) avant une chirurgie programmée ; immunonutrition si chirurgie digestive carcinologique.";
  return {
    grade,
    malnourished,
    why: malnourished ? [...why, ...risk] : [...risk],
    conduct,
    source: "Grade nutritionnel SFNEP / ESPEN (cours BeSARPP G. Patrubani, CHU Saint-Pierre 2022)",
  };
}
