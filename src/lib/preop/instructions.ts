// What to tell the patient, computed from the planned date-time and what
// your rules say about the treatments — ready to read out or copy.
// Fasting times: ESAIC guidelines (adults 2011: solids 6 h, clear fluids
// 2 h; children 2022: clear fluids 1 h, breast milk 3 h, formula 4 h).

import type { ConsultationState } from "./dossier";
import type { EvaluationResult } from "./rules/engine";

export interface Instructions {
  fasting: string[];
  treatments: string[];
  /** Treatments no rule speaks about — to decide and tell explicitly. */
  undecided: string[];
}

const when = (d: Date) => d.toLocaleString("fr-BE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const minus = (d: Date, hours: number) => new Date(d.getTime() - hours * 3_600_000);

export const FASTING_SOURCE = "ESAIC : adultes 2011, enfants 2022";

export function patientInstructions(c: ConsultationState, evaluation: EvaluationResult): Instructions {
  const fasting: string[] = [];
  const planned = c.plannedAt ? new Date(c.plannedAt) : null;
  if (planned && !Number.isNaN(planned.getTime())) {
    const child = c.patient.age !== undefined && c.patient.age < 16;
    fasting.push(`Repas léger au plus tard le ${when(minus(planned, 6))} (6 h avant).`);
    if (child) {
      fasting.push(`Lait maternisé au plus tard le ${when(minus(planned, 4))} (4 h avant), lait maternel ${when(minus(planned, 3))} (3 h avant).`);
      fasting.push(`Liquides clairs (eau, jus sans pulpe, thé ou café sans lait) jusqu'au ${when(minus(planned, 1))} (1 h avant).`);
    } else {
      fasting.push(`Liquides clairs (eau, jus sans pulpe, thé ou café sans lait) jusqu'au ${when(minus(planned, 2))} (2 h avant).`);
    }
    fasting.push("Pas de chewing-gum ni de bonbon le jour de l'intervention.");
    if (c.substances.tobacco === "current") fasting.push("Ne pas fumer le jour de l'intervention.");
  }

  const treatments: string[] = [];
  const spoken = new Set<string>();
  for (const f of evaluation.findings) {
    if (f.status !== "applies") continue;
    for (const o of f.outcomes) {
      if (o.kind === "stop_before") {
        spoken.add(o.treatment.id);
        treatments.push(o.lastDoseBy ? `${o.treatment.name} : dernière prise le ${when(new Date(o.lastDoseBy))} au plus tard.` : `${o.treatment.name} : arrêter ${o.hours} h avant l'intervention.`);
      } else if (o.kind === "resume_after" && o.treatment) {
        spoken.add(o.treatment.id);
        treatments.push(o.resumeFrom ? `${o.treatment.name} : reprise à partir du ${when(new Date(o.resumeFrom))}, si l'équipe le confirme.` : `${o.treatment.name} : reprise ${o.hours} h après l'intervention, si l'équipe le confirme.`);
      }
    }
  }
  const undecided = c.treatments.filter((t) => !spoken.has(t.id)).map((t) => t.name);
  return { fasting, treatments, undecided };
}

export function instructionsText(i: Instructions): string {
  const parts: string[] = [];
  if (i.fasting.length) parts.push(["Jeûne", ...i.fasting.map((l) => `• ${l}`)].join("\n"));
  if (i.treatments.length) parts.push(["Traitements", ...i.treatments.map((l) => `• ${l}`)].join("\n"));
  return parts.join("\n\n");
}

/** The sheet handed to the patient: plain words, no score, no jargon. */
export function patientSheet(c: ConsultationState, i: Instructions, conditions: Record<string, { present: boolean } | undefined>): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  if (c.surgery.name || c.plannedAt) {
    out.push({
      title: "Votre intervention",
      lines: [c.surgery.name, c.plannedAt ? new Date(c.plannedAt).toLocaleString("fr-BE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "", c.hospital].filter(Boolean),
    });
  }
  if (i.fasting.length) out.push({ title: "À jeun", lines: i.fasting });
  const meds = [...i.treatments];
  if (i.undecided.length) meds.push(`Autres médicaments (${i.undecided.join(", ")}) : selon ce que l'anesthésiste vous a indiqué.`);
  if (meds.length) out.push({ title: "Vos médicaments", lines: meds });
  const bring = ["La liste de vos médicaments (ou les boîtes).", "Vos derniers résultats d'examens et courriers médicaux."];
  if (conditions.osa?.present) bring.push("Votre appareil de PPC (CPAP) pour les apnées du sommeil.");
  if (conditions.pacemaker?.present) bring.push("La carte de votre pacemaker / défibrillateur.");
  if (conditions.diabetes_insulin?.present) bring.push("Votre lecteur de glycémie et vos insulines.");
  bring.push("Lunettes, appareils auditifs, prothèse dentaire, avec leur boîte.");
  out.push({ title: "À apporter", lines: bring });
  const advice: string[] = [];
  if (c.substances.tobacco === "current") advice.push("Arrêter de fumer dès maintenant diminue les complications : parlez-en à votre médecin (aide au sevrage).");
  advice.push("Retirez bijoux, piercings et vernis à ongles avant l'intervention.");
  advice.push("En cas de fièvre, de rhume important ou de changement de traitement avant l'intervention, prévenez le service.");
  out.push({ title: "Conseils", lines: advice });
  return out;
}
