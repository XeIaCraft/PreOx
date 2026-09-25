import { describe, expect, it } from "vitest";
import { emptyConsultation } from "./dossier";
import { evaluate } from "./rules/engine";
import { consultationTimeline, relativeDay, reminderAt, reminderSuggestions, timelineIcs } from "./timeline";
import type { Rule } from "./rules/types";

const rule = (partial: Pick<Rule, "id" | "conditions" | "action">): Rule => ({
  title: "",
  statement: "",
  source: { organisation: "Test", title: "", year: 2024, doi: "", pmid: "", quote: "", grade: "", level: "eu" },
  divergences: [],
  explanations: [],
  status: "active",
  version: 1,
  verified_at: "2026-01-01T00:00:00Z",
  review_at: null,
  question: "",
  tool: "",
  created_at: "",
  updated_at: "",
  ...partial,
});

describe("timeline", () => {
  const c = {
    ...emptyConsultation(),
    plannedAt: "2026-10-08T08:00",
    surgery: { ...emptyConsultation().surgery, name: "PTG" },
    treatments: [{ id: "r", atc: "B01AF01", name: "Rivaroxaban" }],
    reminders: [{ id: "x", text: "Appeler le patient", daysBefore: 2 }],
  };
  const rules = [
    rule({ id: "stop", conditions: [{ kind: "drug", atc: "B01AF" }], action: { type: "stop_before", hours: 72 } }),
    rule({ id: "inr", conditions: [{ kind: "drug", atc: "B01AF" }], action: { type: "exam", exam: "Anti-Xa", withinDays: 1 } }),
  ];
  const evaluation = evaluate(rules, { treatments: c.treatments, techniques: [], plannedAt: new Date(c.plannedAt).toISOString() }, "2026-10-01T00:00:00Z");

  it("puts last doses, exams, reminders, fasting and the intervention in order", () => {
    const items = consultationTimeline(c, evaluation);
    expect(items.map((i) => i.kind)).toEqual(["stop", "reminder", "exam", "fasting", "fasting", "surgery"]);
    const planned = new Date(c.plannedAt).toISOString();
    expect(items.map((i) => relativeDay(i, planned))).toEqual(["J-3", "J-2", "J-1", "Jour J", "Jour J", "Jour J"]);
  });

  it("a day-of reminder never falls after the intervention", () => {
    const planned = new Date("2026-10-08T08:00").toISOString();
    expect(new Date(reminderAt(planned, 0)).getTime()).toBeLessThan(new Date(planned).getTime());
    expect(new Date(reminderAt(planned, 1)).getHours()).toBe(9);
  });

  it("suggests reminding the patient the day before the last dose, without repeating existing reminders", () => {
    const s = reminderSuggestions(c, evaluation, ["ECG"], []);
    expect(s).toContainEqual({ text: "Rappeler au patient l'arrêt de Rivaroxaban", daysBefore: 4 });
    expect(s).toContainEqual({ text: "Récupérer le résultat : ECG", daysBefore: 2 });
  });

  it("exports dated items to an iCalendar file with an alarm", () => {
    const ics = timelineIcs(consultationTimeline(c, evaluation), "AB", "2026-10-01T00:00:00.000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(6);
    expect(ics).toContain("SUMMARY:AB — Dernière prise de Rivaroxaban");
    expect(ics).toContain("TRIGGER:-PT30M");
  });
});
