import { describe, expect, it } from "vitest";
import { caseSheetHtml } from "./html";
import type { CaseSheet } from "./build";

const sheet: CaseSheet = {
  initials: "AB",
  surgery: "Fissure anale",
  tags: ["HDJ"],
  body: "42 ans, M, 110 kg",
  technique: "Rachianesthésie",
  rows: [{ label: "Analgésie", parts: [{ text: "Paracétamol 1 g" }, { text: "Kétorolac 30 mg" }] }],
  antecedents: [{ text: "Diabète", strong: true }],
  implications: ["Diabète → glycémies"],
  surgical: "",
  treatments: [{ text: "lisinopril → arrêt 1 j" }],
  allergies: [{ text: "Allergies non renseignées" }],
  alerts: ["Kétorolac au plan : à éviter", "Allergies non renseignées dans la consultation"],
  notes: [],
  kinetics: [{ text: "Propofol : onset 30–45 s · ½-vie contextuelle ≈ 10 min (1 h)" }],
};

describe("lines taken off the sheet", () => {
  it("leaves them out of the print, one product or a whole line", () => {
    const html = caseSheetHtml(sheet, 1, { hidden: new Set(["Analgésie:Kétorolac 30 mg", "alert:Kétorolac au plan : à éviter", "row:Allergies"]) });
    expect(html).toContain("Paracétamol 1 g");
    expect(html).not.toContain("Kétorolac 30 mg");
    expect(html).not.toContain("Kétorolac au plan");
    expect(html).not.toContain("Allergies :");
    expect(html).toContain("Allergies non renseignées dans la consultation");
    expect(html).not.toContain("data-k");
  });

  it("drops a line whose items are all taken off", () => {
    const html = caseSheetHtml(sheet, 1, { hidden: new Set(["Analgésie:Paracétamol 1 g", "Analgésie:Kétorolac 30 mg"]) });
    expect(html).not.toContain("Analgésie");
  });

  it("shows them struck through in the preview, ready to bring back", () => {
    const html = caseSheetHtml(sheet, 1, { hidden: new Set(["Analgésie:Kétorolac 30 mg"]), editable: true });
    expect(html).toMatch(/class="off" data-k="Analgésie:Kétorolac 30 mg"[^>]*aria-pressed="true"/);
  });

  it("prints plan B under the plan, its lines removable on their own", () => {
    const withB: CaseSheet = { ...sheet, fallback: { mode: "general", technique: "AG, ML i-gel 5", rows: [{ label: "Induction", parts: [{ text: "Propofol 200 mg" }] }] } };
    const html = caseSheetHtml(withB, 1);
    expect(html).toMatch(/Plan B \(refus \/ échec\) → AG :<\/span> ML i-gel 5/);
    expect(html).toContain("Induction :</span> <span>Propofol 200 mg");
    expect(caseSheetHtml(withB, 1, { hidden: new Set(["planb"]) })).not.toContain("Plan B");
  });

  it("shows the onsets and context-sensitive half-times only when asked", () => {
    expect(caseSheetHtml(sheet, 1)).not.toContain("½-vie contextuelle");
    expect(caseSheetHtml(sheet, 1, { kinetics: true })).toContain("Pharmaco :</span> <span>Propofol : onset 30–45 s");
  });
});
