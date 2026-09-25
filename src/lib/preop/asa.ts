// ASA class suggested from the structured antecedents, following the
// examples of the ASA Physical Status Classification (ASA, update 2020).
// ASA remains a clinical judgement: the suggestion comes with its reasons
// and the class you choose always wins.

import { bmi } from "./scores";
import { QUALIFIER_LABELS, type Conditions, type Qualifier, type Substances } from "./history";
import { DEFAULT_CONDITIONS } from "./catalog-conditions";
import type { ConditionItem } from "./catalog";
import { lowerFirst } from "./derive";
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

export function suggestAsa(patient: ConsultationPatient, conditions: Conditions, substances: Substances, items: ConditionItem[] = DEFAULT_CONDITIONS): AsaSuggestion {
  const reasons: AsaReason[] = [];
  for (const item of items) {
    const e = conditions[item.id];
    if (!e?.present || item.asa === undefined) continue;
    // The most severe qualifier set wins.
    let asa = item.asa;
    const labels: string[] = [];
    for (const [q, value] of Object.entries(item.asaIf ?? {}) as [Qualifier, number][]) {
      if (e[q] && value > asa) asa = value;
      if (e[q]) labels.push(item.qualifiers?.[q] ?? QUALIFIER_LABELS[q]);
    }
    reasons.push({ asa, label: `${lowerFirst(item.label)}${labels.length ? ` (${labels.join(", ")})` : ""}` });
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
