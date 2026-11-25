// From a prepared dossier to a *planned* case of the carnet de stage: it
// counts nowhere until confirmed « Fait » (carnet or Préop), and « Pas
// fait » removes it. Only what the carnet already records goes there:
// initials, intervention, category, techniques, drugs of the plan.

import type { CarnetCase, CarnetData, CaseDrug } from "@/lib/carnet/types";
import { defaultParticipation, defaultTutorId, stageForDate, supervisorFromHint } from "@/lib/carnet/logic";
import { computeDose, formatDose } from "./protocols";
import type { Dossier } from "./dossier";

export interface PlanChoices {
  stageId: string;
  generalAnesthesia: boolean;
  regionalTypes: string[];
  technicalActs: string[];
  participation: 1 | 2 | 3;
  tutorId: string | null;
}

/** Carnet regional types suggested by the plan's techniques (the carnet splits them finer: the user confirms). */
export function suggestedRegionalTypes(d: Dossier): string[] {
  const t = d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques;
  const drugs = d.plan.drugs;
  const out = new Set<string>();
  if (t.includes("neuraxial")) {
    if (drugs.some((x) => x.route === "intrathecal")) out.add("rachianesthesie");
    if (drugs.some((x) => x.route === "peridural")) out.add("peridurale");
  }
  return [...out];
}

export function planDrugsForCarnet(d: Dossier): CaseDrug[] {
  const body = d.consultation.patient;
  return d.plan.drugs.map((x) => {
    const dose = computeDose(x, body);
    return { name: x.name, route: x.route, dose: dose ? formatDose(dose) : "" };
  });
}

export function plannedCaseFromDossier(d: Dossier, choices: PlanChoices, date: string, now = new Date().toISOString()): CarnetCase {
  const age = d.consultation.patient.age;
  return {
    id: d.carnetCaseId ?? crypto.randomUUID(),
    stage_id: choices.stageId,
    case_date: date,
    patient_initials: d.initials,
    operation: [d.consultation.surgery.name.trim(), d.consultation.surgery.side.trim() ? `(${d.consultation.surgery.side.trim()})` : ""].filter(Boolean).join(" ") || "Intervention à préciser",
    operation_category: d.consultation.surgery.category || "X",
    pediatric_under_4: age !== undefined && age < 4,
    general_anesthesia: choices.generalAnesthesia,
    regional_types: choices.regionalTypes,
    technical_acts: choices.technicalActs,
    other_labels: {},
    details: { drugs: planDrugsForCarnet(d) },
    planned: true,
    off_record: false,
    participation: choices.participation,
    tutor_id: choices.tutorId,
    signature_id: null,
    notes: "",
    created_at: now,
  };
}

/**
 * Choices for planning a dossier in the carnet without asking (a consultation brought from CARE): the stage of
 * that day, the techniques of the plan (else the consultation's; general anaesthesia when nothing says), the
 * supervisor named by EasyPM (else the last one that day). Null when no stage covers the day.
 * A planned case counts nowhere until confirmed « Fait ».
 */
export function autoPlanChoices(d: Dossier, data: Pick<CarnetData, "stages" | "cases" | "supervisors">, date: string): PlanChoices | null {
  const stage = stageForDate(data.stages, date);
  if (!stage) return null;
  const t = d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques;
  const regionalTypes = suggestedRegionalTypes(d);
  const technicalActs = t.some((x) => x === "deep_block" || x === "superficial_block") ? ["echo_alr"] : [];
  const generalAnesthesia = t.includes("general") || (!regionalTypes.length && !technicalActs.length && !t.includes("sedation") && !t.includes("neuraxial"));
  return {
    stageId: stage.id,
    generalAnesthesia,
    regionalTypes,
    technicalActs,
    participation: defaultParticipation(data.cases, stage.id),
    tutorId: supervisorFromHint(data.supervisors, d.supervisorHint) ?? defaultTutorId(data.cases, stage.id, date),
  };
}
