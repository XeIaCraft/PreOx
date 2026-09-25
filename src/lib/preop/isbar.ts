// The handover, built from the whole dossier (consultation, plan, theatre
// log) in the ISBAR structure. Each section lists what's missing so
// nothing is forgotten when handing over to the PACU or the ICU.

import { consultationScores, consultationSummary } from "./consultation-scores";
import { attentionPoints } from "./attention";
import type { Catalogs } from "./catalog";
import { lowerFirst } from "./derive";
import { conditionsSummary, substanceSummary } from "./history";
import { allergySummary } from "./dossier";
import { EXAM_LABELS, type ExamCode } from "./exams";
import { RISK_GRADES } from "./dossier";
import { COMPLICATION_TYPES, EVENT_TYPES, FLUID_CATEGORIES, type Dossier } from "./dossier";
import { durationTimers, fluidBalance, formatMinutes, lastDoses, redoseTimers } from "./intraop";
import { INDICATIONS, TECHNIQUES } from "./rules/types";
import type { EvaluationResult } from "./rules/engine";

export interface IsbarSection {
  key: "I" | "S" | "B" | "A" | "R";
  title: string;
  lines: string[];
  missing: string[];
}

export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
}

const DESTINATIONS: Record<string, string> = { uspa: "Salle de réveil (USPA)", usi: "Soins intensifs", ward: "Étage" };
const SEVERITY: Record<string, string> = { mild: "légère", moderate: "modérée", severe: "sévère" };

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
  if (t.destination) R.lines.push(`Destination : ${DESTINATIONS[t.destination]}`);
  else R.missing.push("Destination");
  if (t.prescriptions.trim()) R.lines.push(t.prescriptions.trim());
  const postop = d.plan.postop.filter((l) => l.trim());
  for (const line of postop) R.lines.push(line.trim());
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

export function isbarText(d: Dossier, sections: IsbarSection[]): string {
  const head = `Transmission — ${d.initials}${d.consultation.surgery.name ? ` — ${d.consultation.surgery.name}` : ""}`;
  return [head, ...sections.map((s) => `${s.key} — ${s.title}\n${s.lines.map((l) => `• ${l}`).join("\n")}`)].join("\n\n");
}

export { COMPLICATION_TYPES };
