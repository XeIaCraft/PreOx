// What each step of the consultation still lacks — for the ✓ in the step
// bar and the "still to do" list of the recap. A step is complete when
// what the scores, the ASA class and the rules need from it is there.

import { SYSTEM_ORDER } from "./catalog";
import type { ConsultationScores } from "./consultation-scores";
import type { ConsultationState } from "./dossier";
import { remainingCount, type QuestionGroup } from "./remaining-questions";
import { pendingExams } from "./exams";

export type ConsultationStep = "patient" | "surgery" | "history" | "treatments" | "airway" | "evaluation" | "exams" | "recap";

export function stepMissing(s: ConsultationState, scores: ConsultationScores, groups: QuestionGroup[]): Record<ConsultationStep, string[]> {
  const p = s.patient;
  const sg = s.surgery;
  const reviewed = new Set(s.historyReviewed ?? []);
  const systemsLeft = SYSTEM_ORDER.filter((sys) => !reviewed.has(sys) && !scores.catalogs.conditions.some((i) => i.system === sys && scores.conditions[i.id]?.present));
  return {
    patient: [
      !p.sex && "sexe",
      p.age === undefined && "âge",
      !p.weightKg && "poids",
      !p.heightCm && "taille",
      !(p.allergyList?.length || p.noKnownAllergy || p.allergies?.trim()) && "allergies (même « aucune connue »)",
    ].filter((x): x is string => !!x),
    surgery: [!sg.name && "intervention", !sg.kce && "grade", !sg.cardiacRisk && "risque cardiaque", !sg.bleedingRisk && "risque hémorragique", s.techniques.length === 0 && "technique envisagée", !s.plannedAt && "date prévue"].filter(
      (x): x is string => !!x
    ),
    history: [systemsLeft.length > 0 && `${systemsLeft.length} système(s) non revu(s)`, !s.substances.tobacco && "tabac"].filter((x): x is string => !!x),
    treatments: s.treatments.length === 0 && !s.noTreatment ? ["traitements (ou « aucun »)"] : [],
    airway: [!s.mallampati && "Mallampati", s.airway.mouthOpeningUnder4cm === undefined && "ouverture de bouche", s.airway.thyromentalCm === undefined && "distance thyro-mentonnière"].filter((x): x is string => !!x),
    evaluation: [!scores.asa && "classe ASA", remainingCount(groups) > 0 && `${remainingCount(groups)} question(s)`].filter((x): x is string => !!x),
    exams: pendingExams(s, scores.exams).length ? [`${pendingExams(s, scores.exams).length} examen(s) sans statut`] : [],
    recap: [],
  };
}
