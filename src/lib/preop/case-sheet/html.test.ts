import { describe, expect, it } from "vitest";
import { caseSheetDocument, caseSheetHtml, DEFAULT_SETTINGS } from "./html";
import type { CaseSheet } from "./build";

const sheet: CaseSheet = {
  initials: "AB",
  surgery: "Fissure anale",
  tags: ["HDJ"],
  body: "42 ans, M, 110 kg",
  technique: "Rachianesthésie",
  rows: [
    { label: "Analgésie", parts: [{ text: "Paracétamol 1 g" }, { text: "Kétorolac 30 mg" }] },
    { label: "Post-op", parts: [{ text: "Ambulatoire" }] },
  ],
  items: [
    { key: "atcd:Diabète", section: "atcd", text: "Diabète", strong: true, detail: "glycémies", detailFull: "glycémies ; antidiabétiques selon les règles", source: "Diabète" },
    { key: "habit:Tabagisme très ancien", section: "habit", text: "Tabagisme très ancien", source: "Tabagisme très ancien" },
    { key: "ttt:lisinopril", section: "ttt", text: "lisinopril", detail: "arrêt 1 j avant", conduct: "stop", strong: true, source: "lisinopril" },
    { key: "ttt:ésoméprazole", section: "ttt", text: "ésoméprazole", detail: "poursuivre", conduct: "continue", source: "ésoméprazole" },
    { key: "allergy:none", section: "allergy", text: "Allergies non renseignées" },
    { key: "alert:Kétorolac au plan", section: "alert", text: "Kétorolac au plan : à éviter", strong: true },
    { key: "alert:Ventilation", section: "alert", text: "Ventilation au masque difficile", strong: true, minor: true },
    { key: "note:Vit seul", section: "note", text: "Vit seul" },
  ],
  kinetics: [{ name: "Propofol", onset: "30–45 s", csht: "≈ 10 min (1 h)", duration: "5–10 min", wake: "Ce 1–1,5 µg/mL" }],
};

describe("printed case sheet", () => {
  it("prints the plan with the doses in bold, the patient, the alerts and the notes", () => {
    const html = caseSheetHtml(sheet, 1);
    expect(html).toContain("<b>AB</b> — Fissure anale");
    expect(html).toContain("Kétorolac <b>30 mg</b>");
    expect(html).toContain("<b>Diabète</b> → glycémies");
    expect(html).toContain("lisinopril</b> <span class=\"cd stop\">→ arrêt 1 j avant</span>");
    expect(html).toContain("Tabagisme très ancien");
    expect(html).toContain("Kétorolac au plan : à éviter");
    // Second-rank alerts only when every alert is asked for.
    expect(html).not.toContain("Ventilation au masque difficile");
    expect(caseSheetHtml(sheet, 1, { settings: { ...DEFAULT_SETTINGS, alerts: "all" } })).toContain("Ventilation au masque difficile");
    expect(html).toContain("Vit seul");
  });

  it("follows the settings: detail, treatments to act on only, sections", () => {
    const st = { ...DEFAULT_SETTINGS, detail: "full" as const, treatments: "action" as const, habits: false, postop: false, notes: false };
    const html = caseSheetHtml(sheet, 1, { settings: st });
    expect(html).toContain("antidiabétiques selon les règles");
    expect(html).not.toContain("ésoméprazole");
    expect(html).not.toContain("Tabagisme");
    expect(html).not.toContain("Ambulatoire");
    expect(html).not.toContain("Vit seul");
    expect(caseSheetHtml(sheet, 1, { settings: { ...DEFAULT_SETTINGS, detail: "none" } })).not.toContain("→ glycémies");
  });

  it("leaves hidden lines out of the print, and shows them struck through in the preview", () => {
    const hidden = new Set(["Analgésie:Kétorolac 30 mg", "alert:Kétorolac au plan", "atcd:Diabète"]);
    const html = caseSheetHtml(sheet, 1, { hidden });
    expect(html).toContain("Paracétamol");
    expect(html).not.toContain("Kétorolac 30");
    expect(html).not.toContain("Kétorolac au plan");
    expect(html).not.toContain("Diabète");
    expect(html).not.toContain("data-k");
    expect(caseSheetHtml(sheet, 1, { hidden, editable: true })).toMatch(/class="off" data-k="Analgésie:Kétorolac 30 mg"/);
  });

  it("prints a corrected product as corrected", () => {
    expect(caseSheetHtml(sheet, 1, { edits: { "Analgésie:Kétorolac 30 mg": "Kétorolac 15 mg" } })).toContain("Kétorolac <b>15 mg</b>");
  });

  it("lists the pharmacology once at the end of the day, when asked", () => {
    expect(caseSheetDocument([{ sheet }, { sheet }], "Jour")).not.toContain("Pharmaco");
    const html = caseSheetDocument([{ sheet }, { sheet }], "Jour", { settings: { ...DEFAULT_SETTINGS, pharmaco: "short" } });
    expect(html.match(/<td>Propofol<\/td>/g)).toHaveLength(1);
    expect(html.indexOf("Pharmaco")).toBeGreaterThan(html.lastIndexOf("</article>"));
    expect(html).not.toContain("Ce 1–1,5");
    expect(caseSheetDocument([{ sheet }], "Jour", { settings: { ...DEFAULT_SETTINGS, pharmaco: "full" } })).toContain("Ce 1–1,5");
  });
});
