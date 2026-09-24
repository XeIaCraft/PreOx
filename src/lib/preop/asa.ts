// ASA class suggested from the structured antecedents, following the
// examples of the ASA Physical Status Classification (ASA, update 2020).
// ASA remains a clinical judgement: the suggestion comes with its reasons
// and the class you choose always wins.

import { bmi } from "./scores";
import { has, qualified, type Conditions, type ConditionCode, type Substances } from "./history";
import type { ConsultationPatient } from "./dossier";

export interface AsaReason {
  asa: number;
  label: string;
}

export interface AsaSuggestion {
  /** null while nothing has been answered. */
  asa: number | null;
  reasons: AsaReason[];
}

export const ASA_REFERENCE = "ASA Physical Status Classification System, exemples de la mise à jour 2020";

type Rule = { code: ConditionCode; asa: number; label: string; when?: (c: Conditions) => boolean };

// Checked in order; for a condition, the first matching line (the most severe) is kept.
const RULES: Rule[] = [
  { code: "coronary", asa: 4, label: "IDM / stent / AVC < 3 mois ou ischémie en cours", when: (c) => qualified(c, "coronary", "recent") || qualified(c, "coronary", "severe") },
  { code: "coronary", asa: 3, label: "coronaropathie (> 3 mois)" },
  { code: "stroke", asa: 4, label: "AVC / AIT < 3 mois", when: (c) => qualified(c, "stroke", "recent") },
  { code: "stroke", asa: 3, label: "antécédent d'AVC / AIT (> 3 mois)" },
  { code: "heart_failure", asa: 4, label: "FEVG sévèrement réduite", when: (c) => qualified(c, "heart_failure", "severe") },
  { code: "heart_failure", asa: 3, label: "insuffisance cardiaque (FEVG modérément réduite)" },
  { code: "valve", asa: 4, label: "valvulopathie sévère", when: (c) => qualified(c, "valve", "severe") },
  { code: "valve", asa: 2, label: "valvulopathie non sévère" },
  { code: "ckd", asa: 4, label: "insuffisance rénale terminale non dialysée", when: (c) => qualified(c, "ckd", "severe") },
  { code: "ckd", asa: 2, label: "insuffisance rénale chronique" },
  { code: "dialysis", asa: 3, label: "dialyse régulière" },
  { code: "cirrhosis", asa: 4, label: "hépatopathie décompensée", when: (c) => qualified(c, "cirrhosis", "severe") },
  { code: "cirrhosis", asa: 3, label: "hépatopathie / hépatite active" },
  { code: "pacemaker", asa: 3, label: "pacemaker / DAI" },
  { code: "pad", asa: 3, label: "artériopathie" },
  { code: "copd", asa: 3, label: "BPCO" },
  { code: "home_o2", asa: 3, label: "oxygénothérapie à domicile" },
  { code: "hypertension", asa: 3, label: "HTA mal contrôlée", when: (c) => qualified(c, "hypertension", "poorlyControlled") },
  { code: "hypertension", asa: 2, label: "HTA contrôlée" },
  { code: "diabetes_insulin", asa: 3, label: "diabète mal contrôlé", when: (c) => qualified(c, "diabetes_insulin", "poorlyControlled") },
  { code: "diabetes_insulin", asa: 2, label: "diabète contrôlé" },
  { code: "diabetes_oral", asa: 3, label: "diabète mal contrôlé", when: (c) => qualified(c, "diabetes_oral", "poorlyControlled") },
  { code: "diabetes_oral", asa: 2, label: "diabète contrôlé" },
  { code: "asthma", asa: 3, label: "asthme mal contrôlé", when: (c) => qualified(c, "asthma", "poorlyControlled") },
  { code: "asthma", asa: 2, label: "asthme (maladie pulmonaire légère)" },
  { code: "osa", asa: 2, label: "SAOS" },
  { code: "arrhythmia", asa: 2, label: "trouble du rythme" },
  { code: "neuromuscular", asa: 3, label: "maladie neuromusculaire" },
  { code: "epilepsy", asa: 2, label: "épilepsie" },
  { code: "thyroid", asa: 2, label: "dysthyroïdie" },
  { code: "cancer", asa: 2, label: "cancer évolutif" },
  { code: "anemia", asa: 2, label: "anémie" },
  { code: "bleeding_disorder", asa: 2, label: "trouble de l'hémostase" },
  { code: "pregnancy", asa: 2, label: "grossesse" },
];

export function suggestAsa(patient: ConsultationPatient, conditions: Conditions, substances: Substances): AsaSuggestion {
  const reasons: AsaReason[] = [];
  const seen = new Set<ConditionCode>();
  for (const r of RULES) {
    if (seen.has(r.code) || !has(conditions, r.code)) continue;
    if (r.when && !r.when(conditions)) continue;
    seen.add(r.code);
    reasons.push({ asa: r.asa, label: r.label });
  }
  if (patient.weightKg && patient.heightCm) {
    const b = bmi(patient.weightKg, patient.heightCm);
    if (b >= 40) reasons.push({ asa: 3, label: `obésité morbide (IMC ${Math.round(b)})` });
    else if (b > 30) reasons.push({ asa: 2, label: `obésité (IMC ${Math.round(b)})` });
  }
  if (substances.tobacco === "current") reasons.push({ asa: 2, label: "tabagisme actif" });
  if (substances.alcoholDependence) reasons.push({ asa: 3, label: "dépendance à l'alcool" });
  else if (substances.alcoholUnitsPerWeek) reasons.push({ asa: 2, label: "consommation d'alcool" });
  if (substances.drugs?.some((d) => d === "cocaine" || d === "opioids" || d === "amphetamines")) reasons.push({ asa: 3, label: "usage de drogues (cocaïne, opioïdes, amphétamines)" });

  reasons.sort((a, b) => b.asa - a.asa);
  const answered = Object.keys(conditions).length > 0 || substances.tobacco !== undefined || !!patient.weightKg;
  if (reasons.length === 0) return { asa: answered ? 1 : null, reasons: answered ? [{ asa: 1, label: "pas de maladie systémique renseignée" }] : [] };
  return { asa: reasons[0].asa, reasons };
}
