// The handover, built from the whole dossier (consultation, plan, theatre
// log) in the ISBAR structure. Each section lists what's missing so
// nothing is forgotten when handing over to the PACU or the ICU.

import { chronicPainRisk } from "./chronic-pain";
import { gasesShort } from "./gases";
import { consultationScores, consultationSummary } from "./consultation-scores";
import { attentionPoints } from "./attention";
import type { Catalogs } from "./catalog";
import { lowerFirst } from "./derive";
import { fold } from "./catalog";
import { conditionsSummary, substanceSummary } from "./history";
import { allergySummary } from "./dossier";
import { EXAM_LABELS, type ExamCode } from "./exams";
import { RISK_GRADES } from "./dossier";
import { COMPLICATION_TYPES, EVENT_TYPES, FLUID_CATEGORIES, type Dossier } from "./dossier";
import { durationTimers, fluidBalance, formatMinutes, lastDoses, redoseTimers } from "./intraop";
import { fluidPlan, normovolaemia, urineRate } from "./fluids";
import { POSTOP_DESTINATIONS, postopLines } from "./postop";
import { INDICATIONS, TECHNIQUES } from "./rules/types";
import type { EvaluationResult } from "./rules/engine";

export interface IsbarSection {
  /** « I », « S »… for the ISBAR; « 1 »…« 5 » for the short handover. */
  key: string;
  title: string;
  lines: string[];
  missing: string[];
}

export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
}

const DESTINATIONS: Record<string, string> = { uspa: "Salle de réveil (USPA)", usi: "Soins intensifs", ward: "Étage" };
const SEVERITY: Record<string, string> = { mild: "légère", moderate: "modérée", severe: "sévère" };

/** The post-operative orders of the plan computed for the patient, then the plan's free lines. */
function planPostop(d: Dossier, scores: ReturnType<typeof consultationScores>): string[] {
  const p = d.consultation.patient;
  const computed = postopLines(d.plan.postopPlan, {
    weightKg: p.weightKg,
    age: p.age,
    crcl: scores.derived.crcl,
    renalFailure: !!(scores.conditions.ckd?.present || scores.conditions.dialysis?.present),
    liverFailure: !!scores.conditions.cirrhosis?.present,
  })
    // The destination is said on its own line.
    .filter((l) => !l.text.startsWith("Destination"))
    .map((l) => (l.warning ? `${l.text} (${l.warning.replace(/\.$/, "")})` : l.text));
  return [...computed, ...d.plan.postop.filter((l) => l.trim()).map((l) => l.trim())];
}

function destinationOf(d: Dossier): string {
  if (d.transmission.destination) return DESTINATIONS[d.transmission.destination];
  const planned = POSTOP_DESTINATIONS.find((x) => x.code === d.plan.postopPlan?.destination);
  return planned ? planned.label : "";
}

/** Short notes typed in theatre for the handover. */
function theatreNotes(d: Dossier): string[] {
  return d.intraop.events.filter((e) => e.type === "note" && e.note.trim()).sort((a, b) => a.at.localeCompare(b.at)).map((e) => `${e.note.trim()} (${hhmm(e.at)})`);
}

export function buildIsbar(d: Dossier, now: string, evaluation?: EvaluationResult, catalogs?: Catalogs): IsbarSection[] {
  const c = d.consultation;
  const p = c.patient;
  const events = [...d.intraop.events].sort((a, b) => a.at.localeCompare(b.at));

  // I — Identification
  const I: IsbarSection = { key: "I", title: "Identification", lines: [], missing: [] };
  const who = [d.initials, p.sex === "M" ? "homme" : p.sex === "F" ? "femme" : "", p.age !== undefined ? `${p.age} ans` : "", p.weightKg ? `${p.weightKg} kg` : "", p.heightCm ? `${p.heightCm} cm` : ""].filter(Boolean);
  I.lines.push(who.join(", "));
  const scores = consultationScores(c, { plan: d.plan, catalogs });
  const summary = consultationSummary(c, scores);
  if (summary.status) I.lines.push(summary.status);
  if (!scores.asa) I.missing.push("Classe ASA");
  const allergyText = allergySummary(p);
  if (allergyText) I.lines.push(`Allergies : ${allergyText}`);
  else I.missing.push("Allergies (même « aucune connue »)");
  if (p.age === undefined || !p.weightKg) I.missing.push("Âge et poids");

  // S — Situation
  const S: IsbarSection = { key: "S", title: "Situation", lines: [], missing: [] };
  const s = d.consultation.surgery;
  if (s.name) {
    S.lines.push(`${s.name}${s.side ? ` (${s.side})` : ""}${s.emergency ? ", en urgence" : ""}${s.surgeon ? ` — ${s.surgeon}` : ""}`);
    const risks = [s.cardiacRisk && `risque cardiaque ${RISK_GRADES.find((g) => g.code === s.cardiacRisk)?.label.toLowerCase()}`, s.bleedingRisk && `risque hémorragique ${RISK_GRADES.find((g) => g.code === s.bleedingRisk)?.label.toLowerCase()}`].filter(Boolean);
    if (risks.length) S.lines.push(risks.join(", "));
  }
  else S.missing.push("Intervention");
  const techniques = d.plan.techniques.length ? d.plan.techniques : c.techniques;
  if (techniques.length) S.lines.push(`Anesthésie : ${techniques.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.split(" (")[0] ?? t).join(" + ")}`);
  else S.missing.push("Technique anesthésique");
  if (d.plan.gases && techniques.includes("general")) S.lines.push(`Gaz : ${gasesShort(d.plan.gases, p.age)}`);
  const keyTimes = events.filter((e) => e.type !== "note").map((e) => `${EVENT_TYPES.find((t) => t.code === e.type)?.short ?? e.type} ${hhmm(e.at)}`);
  if (keyTimes.length) S.lines.push(`Horaires : ${keyTimes.join(" · ")}`);
  const durations = durationTimers(d, now);
  if (durations.length) S.lines.push(`Durées : ${durations.map((t) => `${t.label.toLowerCase()} ${formatMinutes(t.minutes)}`).join(", ")}`);

  // B — Background
  const B: IsbarSection = { key: "B", title: "Antécédents", lines: [], missing: [] };
  const conditions = conditionsSummary(scores.conditions, scores.catalogs.conditions);
  if (conditions) B.lines.push(conditions);
  if (p.history?.trim()) B.lines.push(p.history.trim());
  if (!conditions && !p.history?.trim()) B.missing.push("Antécédents pertinents");
  if (p.surgicalHistory?.trim()) B.lines.push(`Chirurgie / anesthésie : ${p.surgicalHistory.trim()}`);
  const substances = substanceSummary(c.substances);
  if (substances) B.lines.push(substances);
  for (const t of c.treatments) {
    const indication = t.indication ? INDICATIONS.find((i) => i.code === t.indication)?.label.toLowerCase() : "";
    B.lines.push(`${t.name}${t.dailyDoseMg ? ` ${t.dailyDoseMg} mg/j` : ""}${indication ? ` (${indication})` : ""}${t.lastDoseAt ? ` — dernière prise ${new Date(t.lastDoseAt).toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`);
  }
  if (summary.risks) B.lines.push(summary.risks);
  const airway = [
    summary.airway,
    d.intraop.cormack ? `Cormack ${d.intraop.cormack}` : "",
    d.intraop.airwayDevice,
    d.intraop.airwayNote,
  ].filter(Boolean);
  if (airway.length) B.lines.push(`Voies aériennes : ${airway.join(", ")}`);
  if (c.notes.trim()) B.lines.push(c.notes.trim());

  // A — Assessment
  const A: IsbarSection = { key: "A", title: "Évaluation", lines: [], missing: [] };
  const available = Object.entries(c.exams)
    .filter(([, e]) => e?.status === "available")
    .map(([code, e]) => `${EXAM_LABELS[code as ExamCode]?.split(" (")[0] ?? code}${e?.note ? ` : ${e.note}` : ""}`);
  if (available.length) A.lines.push(`Examens : ${available.join(" ; ")}`);
  const doses = lastDoses(d, now);
  if (doses.length) A.lines.push(`Dernières doses : ${doses.map((x) => `${x.name} ${x.dose} à ${hhmm(x.at)}`).join(" ; ")}`);
  for (const r of redoseTimers(d, now)) {
    if (r.dueAt) A.lines.push(`${r.name} : prochaine dose à ${hhmm(r.dueAt)}${r.remainingMin !== null && r.remainingMin < 0 ? " (dépassée)" : ""}`);
  }
  const fb = fluidBalance(d);
  if (d.intraop.fluids.length) {
    const detail = FLUID_CATEGORIES.filter((cat) => fb.byCategory[cat.code]).map((cat) => `${cat.label.toLowerCase()} ${fb.byCategory[cat.code]} mL`);
    A.lines.push(`Entrées ${fb.inMl} mL, sorties ${fb.outMl} mL, bilan ${fb.balanceMl >= 0 ? "+" : ""}${fb.balanceMl} mL (${detail.join(", ")})`);
  } else A.missing.push("Bilan entrées/sorties");
  if (d.intraop.complications.length) {
    for (const x of d.intraop.complications) A.lines.push(`${x.type} (${SEVERITY[x.severity]}) à ${hhmm(x.at)}${x.management ? ` : ${x.management}` : ""}`);
  } else A.lines.push("Pas de complication notée");
  if (d.intraop.alrAssessment.trim()) A.lines.push(`ALR : ${d.intraop.alrAssessment.trim()}`);
  if (d.intraop.lastVitals.trim()) A.lines.push(`Dernières constantes : ${d.intraop.lastVitals.trim()}`);
  else A.missing.push("Dernières constantes");
  if (d.intraop.painScore !== undefined) A.lines.push(`Douleur : EVA ${d.intraop.painScore}/10`);
  else A.missing.push("Score de douleur");

  // R — Recommendations
  const R: IsbarSection = { key: "R", title: "Recommandations", lines: [], missing: [] };
  const t = d.transmission;
  const dest = destinationOf(d);
  if (dest) R.lines.push(`Destination : ${dest}`);
  else R.missing.push("Destination");
  if (t.prescriptions.trim()) R.lines.push(t.prescriptions.trim());
  const postop = planPostop(d, scores);
  for (const line of postop) R.lines.push(line);
  if (!t.prescriptions.trim() && postop.length === 0) R.missing.push("Prescriptions post-opératoires (analgésie, NVPO…)");
  const vigilance = attentionPoints(c, scores, d.plan).filter((x) => x.level !== "info");
  if (vigilance.length) R.lines.push(`Vigilance : ${vigilance.map((x) => lowerFirst(x.title)).join(", ")}`);
  for (const f of evaluation?.findings ?? []) {
    for (const o of f.outcomes) if (o.kind === "resume_after" && o.resumeFrom) R.lines.push(`Reprise ${o.treatment?.name ?? ""} au plus tôt le ${new Date(o.resumeFrom).toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`.replace("  ", " "));
  }
  if (t.callCriteria.trim()) R.lines.push(`Appeler si : ${t.callCriteria.trim()}`);
  else R.missing.push("Critères d'appel");
  if (t.contact.trim()) R.lines.push(`Contact : ${t.contact.trim()}`);
  if (t.notes.trim()) R.lines.push(t.notes.trim());

  return [I, S, B, A, R];
}

/** Call criteria proposed for the ward or the recovery room (Manuel pratique d'anesthésie 2020, chap. 24). */
export function suggestedCallCriteria(d: Dossier): string[] {
  const w = d.consultation.patient.weightKg;
  const techs = new Set([...d.plan.techniques, ...d.consultation.techniques]);
  const cond = d.consultation.conditions;
  const name = fold(d.consultation.surgery.name ?? "");
  const age = d.consultation.patient.age;
  return [
    "saignement des drains ou du pansement > 200 ml/h",
    /cesarienne|accouchement/.test(name) || cond.pregnancy?.present ? "saignement vaginal > 500 ml ou utérus mou (atonie)" : "",
    cond.preeclampsia?.present ? "PA ≥ 160/110 mmHg, céphalées, troubles visuels ou convulsions ; sous magnésium : réflexes ostéotendineux abolis ou FR < 12/min" : "",
    (age !== undefined && age < 1) || cond.ex_premature?.present ? "apnée > 15 s, bradycardie ou désaturation (nourrisson, ancien prématuré)" : "",
    age !== undefined && age < 16 ? "enfant : agitation persistante (douleur ? hypoxie ?) ou vomissements répétés" : "",
    /fracture|ecrasement|crush|garrot/.test(name) || d.consultation.surgery.tourniquet ? "douleur croissante malgré l'analgésie ou à l'étirement passif des doigts ou des orteils (syndrome des loges)" : "",
    /thyroid|cervicotom|curage|evidement|laryng|pharyng|amygdal|rachis cervical|arthrodese cervicale|cervicale anterieure/.test(name) ? "stridor, dyspnée, dysphonie ou gonflement cervical (hématome)" : "",
    `diurèse < 0,5 ml/kg/h${w ? ` (< ${Math.round(w * 0.5)} ml/h)` : ""} ou globe vésical (agitation)`,
    "SpO₂ < 90 %, fréquence respiratoire < 10/min ou somnolence",
    "PA systolique < 90 mmHg ou variation > 20 % par rapport à la valeur préopératoire",
    techs.has("neuraxial") ? "bloc moteur non levé 6 h après la rachianesthésie" : "",
    techs.has("deep_block") ? "bloc moteur non levé 24 h après le bloc plexique ou tronculaire" : "",
    "EVA > 3 malgré le traitement, nausées ou vomissements persistants",
    "douleur disproportionnée par rapport à l'intervention (chercher une complication : loges, hématome, ischémie, infection, avant d'augmenter les antalgiques)",
  ].filter(Boolean);
}

/**
 * The short handover, in the order it is said at the bedside: who, why he
 * is here (and the history of the illness), how it went, what is planned,
 * then the antecedents. Built from the same dossier as the ISBAR.
 */
export function buildBrief(d: Dossier, now: string, evaluation?: EvaluationResult, catalogs?: Catalogs): IsbarSection[] {
  const c = d.consultation;
  const p = c.patient;
  const scores = consultationScores(c, { plan: d.plan, catalogs });
  const summary = consultationSummary(c, scores);

  const who: IsbarSection = { key: "1", title: "Qui", lines: [], missing: [] };
  who.lines.push(
    [d.initials, p.sex === "M" ? "homme" : p.sex === "F" ? "femme" : "", p.age !== undefined ? `${p.age} ans` : "", p.weightKg ? `${p.weightKg} kg` : "", scores.asa ? `ASA ${scores.asa}` : ""].filter(Boolean).join(", ")
  );
  const allergies = allergySummary(p);
  if (allergies) who.lines.push(`Allergies : ${allergies}`);
  else who.missing.push("Allergies");

  const why: IsbarSection = { key: "2", title: "Pourquoi il est là", lines: [], missing: [] };
  const s = c.surgery;
  if (s.name) why.lines.push(`${s.name}${s.side ? ` ${s.side}` : ""}${s.urgency === "urgent" || s.emergency ? ", en urgence" : ""}`);
  else why.missing.push("Intervention");
  if (s.indication?.trim()) why.lines.push(s.indication.trim());
  else why.missing.push("Indication / histoire de la maladie");

  const how: IsbarSection = { key: "3", title: "Comment ça s'est passé", lines: [], missing: [] };
  const techniques = d.plan.techniques.length ? d.plan.techniques : c.techniques;
  const airway = [d.intraop.airwayDevice, d.intraop.cormack ? `Cormack ${d.intraop.cormack}` : "", d.intraop.airwayNote].filter(Boolean).join(", ");
  if (techniques.length) how.lines.push(`${techniques.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.split(" (")[0] ?? t).join(" + ")}${airway ? ` — ${airway}` : ""}`);
  if (d.plan.gases && techniques.includes("general")) how.lines.push(`Gaz : ${gasesShort(d.plan.gases, p.age)}`);
  if (d.intraop.alrAssessment.trim()) how.lines.push(`ALR : ${d.intraop.alrAssessment.trim()}`);
  const durations = durationTimers(d, now).filter((t) => t.key !== "tourniquet" || t.minutes > 0);
  if (durations.length) how.lines.push(durations.map((t) => `${t.label.toLowerCase()} ${formatMinutes(t.minutes)}`).join(", "));
  how.lines.push(d.intraop.complications.length ? d.intraop.complications.map((x) => `${x.type} (${SEVERITY[x.severity]})${x.management ? ` : ${x.management}` : ""}`).join(" ; ") : "Sans complication");
  const doses = lastDoses(d, now);
  if (doses.length) how.lines.push(`Reçu : ${doses.map((x) => `${x.name}${x.dose ? ` ${x.dose}` : ""} (${hhmm(x.at)})`).join(", ")}`);
  const fb = fluidBalance(d);
  if (d.intraop.fluids.length) {
    const anaes = durationTimers(d, now).find((t) => t.key === "anaesthesia");
    const urine = fb.byCategory.urine ?? 0;
    const rate = anaes ? urineRate(urine, p.weightKg, anaes.minutes) : null;
    how.lines.push(
      [
        `Entrées ${fb.inMl} mL`,
        fb.byCategory.blood ? `dont produits sanguins ${fb.byCategory.blood} mL` : "",
        fb.byCategory.blood_loss ? `pertes sanguines ${fb.byCategory.blood_loss} mL` : "",
        urine ? `diurèse ${urine} mL${rate !== null ? ` (${String(rate).replace(".", ",")} mL/kg/h)` : ""}` : "",
        `bilan ${fb.balanceMl >= 0 ? "+" : ""}${fb.balanceMl} mL`,
      ]
        .filter(Boolean)
        .join(", ")
    );
    const by = (cat: string) => d.intraop.fluids.filter((f) => f.category === cat).reduce((n, f) => n + f.volumeMl, 0);
    const nv = anaes ? normovolaemia({ weightKg: p.weightKg, fastingHours: d.intraop.fastingHours, minutes: anaes.minutes, loss: d.intraop.insensibleLoss, bloodLossMl: by("blood_loss"), givenMl: by("crystalloid") + by("colloid") + by("blood") + by("other_in"), colloidMl: by("colloid") }) : null;
    if (nv && anaes && anaes.minutes >= 15 && d.intraop.fastingHours !== undefined) how.lines.push(nv.status === "above" ? `Remplissage au-dessus de l'estimation de normovolémie (${nv.expectedMl[0]}–${nv.expectedMl[1]} mL)` : nv.status === "below" ? `Remplissage sous l'estimation de normovolémie (${nv.expectedMl[0]}–${nv.expectedMl[1]} mL)` : "Remplissage dans l'estimation de normovolémie");
  } else how.missing.push("Entrées / sorties");
  for (const note of theatreNotes(d)) how.lines.push(note);
  if (d.intraop.lastVitals.trim()) how.lines.push(`Constantes : ${d.intraop.lastVitals.trim()}`);
  if (d.intraop.painScore !== undefined) how.lines.push(`Douleur EVA ${d.intraop.painScore}/10`);

  const plan: IsbarSection = { key: "4", title: "Ce qu'on prévoit", lines: [], missing: [] };
  const t = d.transmission;
  const dest = destinationOf(d);
  if (dest) plan.lines.push(dest);
  else plan.missing.push("Destination");
  const postop = planPostop(d, scores);
  for (const line of postop) plan.lines.push(line);
  if (t.prescriptions.trim()) plan.lines.push(t.prescriptions.trim());
  for (const r of redoseTimers(d, now)) if (r.dueAt) plan.lines.push(`${r.name} : prochaine dose à ${hhmm(r.dueAt)}`);
  for (const f of evaluation?.findings ?? [])
    for (const o of f.outcomes)
      if (o.kind === "resume_after" && o.resumeFrom) plan.lines.push(`Reprise ${o.treatment?.name ?? ""} au plus tôt le ${new Date(o.resumeFrom).toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`.replace("  ", " "));
  const fp = fluidPlan(p);
  if (fp) plan.lines.push(`Si pas de boissons : ${fp.postopMlH[0] === fp.postopMlH[1] ? fp.postopMlH[0] : `${fp.postopMlH[0]}–${fp.postopMlH[1]}`} mL/h`);
  if (postop.length === 0 && !t.prescriptions.trim()) plan.missing.push("Suite postopératoire (protocole ou prescriptions)");
  if (t.callCriteria.trim()) plan.lines.push(`Appeler si : ${t.callCriteria.trim().replace(/\n+/g, " ; ")}`);
  if (t.contact.trim()) plan.lines.push(`Contact : ${t.contact.trim()}`);
  if (t.notes.trim()) plan.lines.push(t.notes.trim());

  const history: IsbarSection = { key: "5", title: "Antécédents", lines: [], missing: [] };
  const conditions = conditionsSummary(scores.conditions, scores.catalogs.conditions);
  if (conditions) history.lines.push(conditions);
  if (p.history?.trim()) history.lines.push(p.history.trim());
  if (p.surgicalHistory?.trim()) history.lines.push(`Chirurgie / anesthésie : ${p.surgicalHistory.trim()}`);
  if (c.treatments.length) history.lines.push(`Traitements : ${c.treatments.map((x) => `${x.name}${x.dailyDoseMg ? ` ${x.dailyDoseMg} mg/j` : ""}`).join(", ")}`);
  const substances = substanceSummary(c.substances);
  if (substances) history.lines.push(substances);
  if (summary.airway) history.lines.push(`Voies aériennes : ${summary.airway}`);
  if (!history.lines.length) history.lines.push("Pas d'antécédent notable renseigné");

  return [who, why, how, plan, history];
}

export function isbarText(d: Dossier, sections: IsbarSection[]): string {
  const head = `Transmission — ${d.initials}${d.consultation.surgery.name ? ` — ${d.consultation.surgery.name}` : ""}`;
  return [head, ...sections.map((s) => `${s.key} — ${s.title}\n${s.lines.map((l) => `• ${l}`).join("\n")}`)].join("\n\n");
}

export { COMPLICATION_TYPES };

/** The steps said aloud, ticked in the handover screen. */
export const RECOVERY_STEPS = {
  urgent: "Tâches urgentes faites avant de parler (installation, monitorage, O₂)",
  ready: "Receveur identifié et prêt à écouter",
  bracelet: "Identité vérifiée sur le bracelet",
  questions: "« Avez-vous des questions ? »",
  loop: "Boucle fermée : le receveur a reformulé",
} as const;

const PHASE_LABEL: Record<string, string> = { analgesia: "Analgésie", ponv: "Nausées-vomissements", antibio: "Antibiotiques" };

/**
 * The handover to the recovery room in the order used by the university
 * hospitals: urgent tasks first, who takes over, ready?, stable or not,
 * then patient, procedure, drugs (done / to do), other (labs, anticipated
 * concerns), questions, loop closed by the receiver.
 */
export function buildRecovery(d: Dossier, now: string, evaluation?: EvaluationResult, catalogs?: Catalogs): IsbarSection[] {
  const c = d.consultation;
  const p = c.patient;
  const t = d.transmission;
  const steps = t.steps ?? {};
  const scores = consultationScores(c, { plan: d.plan, catalogs });
  const summary = consultationSummary(c, scores);
  const tick = (k: keyof typeof RECOVERY_STEPS) => (steps[k] ? "✓ " : "☐ ") + RECOVERY_STEPS[k];

  const s1: IsbarSection = { key: "1", title: "Avant de parler", lines: [tick("urgent")], missing: [] };
  const s2: IsbarSection = { key: "2", title: "Qui prend le patient en charge ?", lines: [], missing: [] };
  if (t.receiver?.trim()) s2.lines.push(t.receiver.trim());
  else s2.missing.push("Receveur");
  const s3: IsbarSection = { key: "3", title: "Êtes-vous prêt à recevoir les informations ?", lines: [tick("ready")], missing: [] };

  const s4: IsbarSection = { key: "4", title: "État clinique général", lines: [], missing: [] };
  if (t.stability) s4.lines.push(t.stability === "stable" ? "Patient stable" : "Patient INSTABLE");
  else s4.missing.push("Stable / instable");
  if (d.intraop.lastVitals.trim()) s4.lines.push(`Constantes : ${d.intraop.lastVitals.trim()}`);
  else s4.missing.push("Dernières constantes");

  const s5: IsbarSection = { key: "5", title: "Patient", lines: [], missing: [] };
  s5.lines.push(`${[d.initials, p.sex === "M" ? "homme" : p.sex === "F" ? "femme" : "", p.age !== undefined ? `${p.age} ans` : "", p.weightKg ? `${p.weightKg} kg` : ""].filter(Boolean).join(", ")} — ${tick("bracelet")}`);
  if (t.precautions?.trim()) s5.lines.push(`Précautions additionnelles : ${t.precautions.trim()}`);
  if (scores.asa) s5.lines.push(`ASA ${scores.asa}`);
  else s5.missing.push("Score ASA");
  const allergies = allergySummary(p);
  if (allergies) s5.lines.push(`Allergies : ${allergies}`);
  else s5.missing.push("Allergies");
  const conditions = conditionsSummary(scores.conditions, scores.catalogs.conditions);
  if (conditions || p.history?.trim()) s5.lines.push(`Antécédents : ${[conditions, p.history?.trim()].filter(Boolean).join(" ; ")}`);
  if (c.treatments.length) s5.lines.push(`Traitement habituel : ${c.treatments.map((x) => x.name).join(", ")}`);
  const sg = c.surgery;
  if (sg.name) s5.lines.push(`Chirurgie : ${sg.name}${sg.side ? `, côté ${sg.side}` : ""}`);
  else s5.missing.push("Type de chirurgie et côté");
  const techniques = d.plan.techniques.length ? d.plan.techniques : c.techniques;
  if (techniques.length) s5.lines.push(`Anesthésie : ${techniques.map((x) => TECHNIQUES.find((y) => y.code === x)?.label.split(" (")[0] ?? x).join(" + ")}${d.plan.gases && techniques.includes("general") ? ` (${gasesShort(d.plan.gases, p.age)})` : ""}`);
  else s5.missing.push("Type d'anesthésie");

  const s6: IsbarSection = { key: "6", title: "Procédure", lines: [], missing: [] };
  if (sg.position) s6.lines.push(`Position : ${sg.position}`);
  const airway = [d.intraop.airwayDevice, d.intraop.cormack ? `Cormack ${d.intraop.cormack}` : "", d.intraop.airwayNote].filter(Boolean).join(", ");
  if (airway) s6.lines.push(`Voies aériennes : ${airway}`);
  else if (techniques.includes("general")) s6.missing.push("Gestion des voies aériennes");
  const access = d.plan.material.filter((m) => /cath[eé]ter|voie|kt|picc|art[eé]riel/i.test(m));
  if (access.length) s6.lines.push(`Accès vasculaires : ${access.join(", ")}`);
  const fb = fluidBalance(d);
  if (d.intraop.fluids.length) {
    const blood = fb.byCategory.blood ?? 0;
    s6.lines.push(`Volémie : entrées ${fb.inMl} mL${blood ? ` dont produits sanguins ${blood} mL` : ""}, pertes sanguines ${fb.byCategory.blood_loss ?? 0} mL, diurèse ${fb.byCategory.urine ?? 0} mL, bilan ${fb.balanceMl >= 0 ? "+" : ""}${fb.balanceMl} mL`);
  } else s6.missing.push("Gestion volémique");
  if (d.intraop.complications.length) s6.lines.push(`Événements : ${d.intraop.complications.map((x) => `${x.type} (${SEVERITY[x.severity]})${x.management ? ` : ${x.management}` : ""}`).join(" ; ")}`);
  else s6.lines.push("Pas d'événement peropératoire");
  for (const note of theatreNotes(d)) s6.lines.push(note);

  const s7: IsbarSection = { key: "7", title: "Médicaments", lines: [], missing: [] };
  const given = [...d.intraop.given].sort((a, b) => a.at.localeCompare(b.at));
  const byPhase = (phases: string[], re?: RegExp) => given.filter((g) => phases.includes(g.phase) || (re && re.test(g.name)));
  const postop = planPostop(d, scores);
  const groups: { label: string; done: string[]; todo: string[] }[] = [
    { label: PHASE_LABEL.analgesia, done: byPhase(["analgesia"], /morphin|piritramid|dipidolor|oxycod|paracetamol|ketorolac|diclofenac/i).map((g) => `${g.name}${g.dose ? ` ${g.dose}` : ""} (${hhmm(g.at)})`), todo: postop.filter((l) => /analg|pca|pcea|morphin|paracetamol|ains|cath[eé]ter|piritram/i.test(l)) },
    { label: PHASE_LABEL.ponv, done: byPhase(["ponv"]).map((g) => `${g.name}${g.dose ? ` ${g.dose}` : ""} (${hhmm(g.at)})`), todo: postop.filter((l) => /nvpo|naus|vomis/i.test(l)) },
    {
      label: "Bloc neuromusculaire",
      done: given.filter((g) => /rocuronium|cisatracurium|atracurium|succinylcholine|mivacurium|sugammadex|neostigmine|bridion/i.test(g.name)).map((g) => `${g.name}${g.dose ? ` ${g.dose}` : ""} (${hhmm(g.at)})`),
      todo: [],
    },
    { label: PHASE_LABEL.antibio, done: byPhase(["antibio"]).map((g) => `${g.name}${g.dose ? ` ${g.dose}` : ""} (${hhmm(g.at)})`), todo: redoseTimers(d, now).filter((r) => r.dueAt).map((r) => `${r.name} à ${hhmm(r.dueAt!)}`) },
  ];
  for (const g of groups) s7.lines.push(`${g.label} — fait : ${g.done.length ? g.done.join(", ") : "rien"}${g.todo.length ? ` ; à faire : ${g.todo.join(", ")}` : ""}`);
  const nmbGiven = groups[2].done.some((x) => /rocuronium|cisatracurium|atracurium|mivacurium/i.test(x));
  if (nmbGiven && !groups[2].done.some((x) => /sugammadex|neostigmine|bridion/i.test(x))) s7.missing.push("Décurarisation vérifiée (TOF ≥ 0,9) ou antagonisation");

  const s8: IsbarSection = { key: "8", title: "Autre", lines: [], missing: [] };
  const labs = [p.hb !== undefined ? `Hb ${p.hb}` : "", p.potassium !== undefined ? `K⁺ ${p.potassium}` : "", p.glucose !== undefined ? `glycémie ${p.glucose}` : "", p.platelets !== undefined ? `plaquettes ${p.platelets}` : "", p.inr !== undefined ? `INR ${p.inr}` : ""].filter(Boolean);
  if (labs.length) s8.lines.push(`Biologie préopératoire : ${labs.join(", ")}`);
  if (t.labsToFollow?.trim()) s8.lines.push(`À suivre : ${t.labsToFollow.trim()}`);
  const vigilance = attentionPoints(c, scores, d.plan).filter((x) => x.level === "high");
  if (vigilance.length) s8.lines.push(`Préoccupations postopératoires : ${vigilance.map((x) => lowerFirst(x.title)).join(", ")}`);
  const pain = chronicPainRisk(c);
  if (pain.level === "high") s8.lines.push(`Risque de douleur chronique (drapeaux : ${pain.flags.filter((f) => f.present).map((f) => lowerFirst(f.flag.label)).join(", ")}) : traiter vite la douleur aiguë, réévaluer à 1 et 3 mois`);
  if (t.callCriteria.trim()) s8.lines.push(`Appeler si : ${t.callCriteria.trim().replace(/\n+/g, " ; ")}`);
  const dest = destinationOf(d);
  if (dest) s8.lines.push(`Destination : ${dest}`);
  for (const f of evaluation?.findings ?? [])
    for (const o of f.outcomes)
      if (o.kind === "resume_after" && o.resumeFrom) s8.lines.push(`Reprise ${o.treatment?.name ?? ""} au plus tôt le ${new Date(o.resumeFrom).toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`.replace("  ", " "));
  if (summary.airway) s8.lines.push(`Voies aériennes (consultation) : ${summary.airway}`);

  const s9: IsbarSection = { key: "9", title: "Avez-vous des questions ?", lines: [tick("questions")], missing: [] };
  const s10: IsbarSection = { key: "10", title: "Fermeture de la boucle par le receveur", lines: [tick("loop")], missing: [] };
  return [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10];
}
