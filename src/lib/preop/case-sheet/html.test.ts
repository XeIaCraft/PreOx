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
  workup: [
    { code: "group", label: "Groupe + RAI", status: "todo", reason: "intervention potentiellement hémorragique", strength: "recommended" },
    { code: "fbc", label: "Hb, plaquettes", status: "ok", value: "Hb 13,2, plaq. 245", reason: "rachi / péridurale : plaquettes", strength: "recommended" },
    { code: "ecg", label: "ECG", status: "asked", reason: "65 ans", strength: "recommended" },
    { code: "pregnancy", label: "β-hCG", status: "todo", reason: "femme en âge de procréer", strength: "consider" },
  ],
  steps: ["Installation, cadre sous AL", "Repérage : patient réveillé"],
  targets: ["PAS < 140 mmHg"],
  transmission: false,
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

  it("prints the work-up there, and what is still to plan in its own line", () => {
    const html = caseSheetHtml(sheet, 1);
    expect(html).toMatch(/Bilan<\/span><span class="vl">.*Hb 13,2, plaq\. 245.*ECG <i>demandé<\/i>/);
    expect(html).toMatch(/class="ln todo"><span class="lb">À prévoir<\/span><span class="vl"><span><b>Groupe \+ RAI<\/b>/);
    expect(html).not.toContain("β-hCG");
    expect(caseSheetHtml(sheet, 1, { settings: { ...DEFAULT_SETTINGS, workup: "all" } })).toContain("<b>β-hCG</b> ?");
    expect(caseSheetHtml(sheet, 1, { settings: { ...DEFAULT_SETTINGS, workup: "off" } })).not.toContain("Groupe");
    expect(caseSheetHtml(sheet, 1, { hidden: new Set(["bilan:group"]) })).not.toContain("À prévoir");
  });

  it("prints A5 pages two by two on a landscape A4, or on A5 paper", () => {
    const html = caseSheetDocument([{ sheet }, { sheet }], "Jour");
    expect(html).toContain("size:A4 landscape");
    expect(html).toContain("window.print()");
    expect(caseSheetDocument([{ sheet }], "Jour", { settings: { ...DEFAULT_SETTINGS, paper: "a5" }, print: false })).toContain("size:A5;");
    expect(caseSheetDocument([{ sheet }], "Jour", { print: false })).not.toContain("window.print()");
  });

  it("lists the treatments to act on with their conduct, the others in one line", () => {
    const html = caseSheetHtml(sheet, 1);
    expect(html).toMatch(/<span class="act">[^]*lisinopril[^]*?<\/span><span class="keep"><span class="cd">Poursuivre :<\/span> <span[^>]*>ésoméprazole<\/span>/);
  });

  it("names the patient in full on this device's sheet, or by initials only", () => {
    const named = { ...sheet, name: "DUPONT Jean", birthDate: "12/03/1958" };
    expect(caseSheetHtml(named, 1)).toContain('<b>DUPONT Jean</b> <span class="dob">12/03/1958</span>');
    expect(caseSheetHtml(named, 1, { settings: { ...DEFAULT_SETTINGS, identity: "initials" } })).not.toContain("DUPONT");
  });

  it("numbers the protocol's steps under the plan", () => {
    expect(caseSheetHtml(sheet, 1)).toMatch(/Déroulé<\/span><span class="vl"><ol class="steps"><li>Installation, cadre sous AL<\/li><li>Repérage : patient réveillé<\/li><\/ol>/);
    expect(caseSheetHtml(sheet, 1, { settings: { ...DEFAULT_SETTINGS, steps: false } })).not.toContain("Déroulé");
  });

  it("adds the intensive care handover on a page of its own, with blanks for the peroperative course", () => {
    expect(caseSheetDocument([{ sheet }], "Jour")).not.toContain("Transmission USI");
    const html = caseSheetDocument([{ sheet: { ...sheet, transmission: true, name: "DUPONT Jean" } }, { sheet }], "Jour");
    expect(html).toContain('<article class="case tx" data-newpage="1">');
    expect(html).toContain("Transmission USI — DUPONT Jean");
    expect(html).toMatch(/Pertes sanguines <span class="bl"><\/span> mL/);
    expect(html).toMatch(/Reprise TTT.*lisinopril/);
    expect(html).toContain("PAS &lt; 140 mmHg");
  });
});

