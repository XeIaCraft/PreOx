// Everything that has a date between the consultation and the day after
// the intervention, in order: last doses (your rules), exams to do within a
// delay (your rules), fasting (ESAIC), resumptions, and your own reminders
// ("appeler le patient", "récupérer l'INR"). Exportable to a calendar.

import type { ConsultationState, Reminder } from "./dossier";
import type { EvaluationResult } from "./rules/engine";

export type TimelineKind = "stop" | "exam" | "fasting" | "surgery" | "resume" | "reminder";

export interface TimelineItem {
  key: string;
  kind: TimelineKind;
  /** ISO date-time; null when the intervention date isn't set yet. */
  at: string | null;
  /** Days before the intervention, for reminders without a date. */
  daysBefore?: number;
  text: string;
  reminder?: Reminder;
}

const HOUR = 3_600_000;

export function plannedIso(c: Pick<ConsultationState, "plannedAt">): string | null {
  if (!c.plannedAt) return null;
  const d = new Date(c.plannedAt);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A reminder "J-2" falls at 9:00 that day — or just before the intervention on the day itself. */
export function reminderAt(planned: string, daysBefore: number): string {
  const p = new Date(planned);
  const d = new Date(p);
  d.setDate(d.getDate() - daysBefore);
  d.setHours(9, 0, 0, 0);
  if (daysBefore === 0 && d.getTime() >= p.getTime()) return new Date(p.getTime() - HOUR).toISOString();
  return d.toISOString();
}

export function consultationTimeline(c: ConsultationState, evaluation: EvaluationResult): TimelineItem[] {
  const planned = plannedIso(c);
  const items: TimelineItem[] = [];
  for (const f of evaluation.findings) {
    if (f.status !== "applies") continue;
    f.outcomes.forEach((o, i) => {
      const key = `${f.rule.id}:${i}`;
      if (o.kind === "stop_before") items.push({ key, kind: "stop", at: o.lastDoseBy, text: `Dernière prise de ${o.treatment.name}` });
      else if (o.kind === "resume_after") items.push({ key, kind: "resume", at: o.resumeFrom, text: `Reprise possible${o.treatment ? ` de ${o.treatment.name}` : ""}` });
      else if (o.kind === "exam" && o.withinDays !== undefined) items.push({ key, kind: "exam", at: o.notBefore, daysBefore: o.withinDays, text: `Examen à faire : ${o.exam} (${o.withinDays === 0 ? "le jour même" : `pas plus de ${o.withinDays} j avant`})` });
    });
  }
  if (planned) {
    const child = c.patient.age !== undefined && c.patient.age < 16;
    items.push({ key: "fasting-solids", kind: "fasting", at: new Date(new Date(planned).getTime() - 6 * HOUR).toISOString(), text: "Jeûne : fin des solides (6 h avant)" });
    items.push({ key: "fasting-clear", kind: "fasting", at: new Date(new Date(planned).getTime() - (child ? 1 : 2) * HOUR).toISOString(), text: `Jeûne : fin des liquides clairs (${child ? 1 : 2} h avant)` });
    items.push({ key: "surgery", kind: "surgery", at: planned, text: c.surgery.name || "Intervention" });
  }
  for (const r of c.reminders ?? []) items.push({ key: `r:${r.id}`, kind: "reminder", at: planned ? reminderAt(planned, r.daysBefore) : null, daysBefore: r.daysBefore, text: r.text, reminder: r });
  // Dated first, in order; undated reminders after, furthest from the day first.
  return items.sort((a, b) => {
    if (a.at && b.at) return a.at.localeCompare(b.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return (b.daysBefore ?? 0) - (a.daysBefore ?? 0);
  });
}

/** "J-3", "Jour J", "J+1" from a date (or a day count) relative to the intervention. */
export function relativeDay(item: Pick<TimelineItem, "at" | "daysBefore">, planned: string | null): string {
  let days = item.daysBefore;
  if (item.at && planned) {
    const a = new Date(item.at);
    const p = new Date(planned);
    const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    days = Math.round((day(p) - day(a)) / (24 * HOUR));
  }
  if (days === undefined) return "";
  return days === 0 ? "Jour J" : days > 0 ? `J-${days}` : `J+${-days}`;
}

export interface ReminderSuggestion {
  text: string;
  daysBefore: number;
}

/** Reminders worth adding for this consultation — never added by themselves. */
export function reminderSuggestions(c: ConsultationState, evaluation: EvaluationResult, pending: string[], undecided: string[]): ReminderSuggestion[] {
  const out: ReminderSuggestion[] = [];
  const planned = plannedIso(c);
  for (const f of evaluation.findings) {
    if (f.status !== "applies") continue;
    for (const o of f.outcomes) {
      if (o.kind !== "stop_before") continue;
      // The day before the last dose: time to remind the patient.
      const days = o.lastDoseBy && planned ? Math.max(0, Math.round((new Date(planned).getTime() - new Date(o.lastDoseBy).getTime()) / (24 * HOUR)) + 1) : 7;
      out.push({ text: `Rappeler au patient l'arrêt de ${o.treatment.name}`, daysBefore: days });
    }
  }
  for (const name of pending) out.push({ text: `Récupérer le résultat : ${name}`, daysBefore: 2 });
  for (const name of undecided) out.push({ text: `Décider et communiquer la conduite pour ${name}`, daysBefore: 7 });
  for (const m of evaluation.missing) out.push({ text: `Obtenir : ${m.label}`, daysBefore: 3 });
  const existing = new Set((c.reminders ?? []).map((r) => r.text));
  const seen = new Set<string>();
  return out.filter((s) => !existing.has(s.text) && !seen.has(s.text) && (seen.add(s.text), true));
}

// ---------------------------------------------------------------------------
// Calendar export (iCalendar, RFC 5545)
// ---------------------------------------------------------------------------

const icsDate = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (t: string) => t.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

/** Dated items as calendar events with a reminder; the label prefix (initials) is yours to choose. */
export function timelineIcs(items: TimelineItem[], prefix: string, now: string = new Date().toISOString()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PreOx//Preop//FR", "CALSCALE:GREGORIAN"];
  for (const it of items) {
    if (!it.at || it.reminder?.done) continue;
    const start = icsDate(it.at);
    const end = icsDate(new Date(new Date(it.at).getTime() + 15 * 60_000).toISOString());
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.key.replace(/[^A-Za-z0-9:-]/g, "")}-${start}@preox`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsText(`${prefix ? `${prefix} — ` : ""}${it.text}`)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(it.text)}`,
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
