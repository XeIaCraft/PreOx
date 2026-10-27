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
});
