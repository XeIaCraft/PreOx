import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyDossier } from "./dossier";
import { plannedCaseFromDossier, suggestedRegionalTypes } from "./carnet-link";
import { consultationScores, consultationSummary } from "./consultation-scores";
import { buildIsbar } from "./isbar";
import { buildIsbarPdf } from "./isbar-pdf";
import { newDrug } from "./test-helpers";

function prepared() {
  const d = emptyDossier("dm");
  d.consultation.patient = { age: 72, sex: "M", weightKg: 88, heightCm: 176 };
  d.consultation.plannedAt = "2026-10-08T08:00";
  d.consultation.surgery = { ...d.consultation.surgery, name: "PTG", side: "droite", category: "K" };
  d.plan.techniques = ["neuraxial", "sedation"];
  d.plan.drugs = [newDrug({ name: "Bupivacaïne hyperbare", route: "intrathecal", doseMode: "fixed", amount: 10 }), newDrug({ name: "Céfazoline", doseMode: "fixed", amount: 2, unit: "g" }), newDrug({ name: "Propofol", doseMode: "per_kg", amount: 1, weightBasis: "ideal" })];
  return d;
}

describe("planned carnet case", () => {
  it("carries what the carnet records, planned, with the plan's doses", () => {
    const d = prepared();
    expect(suggestedRegionalTypes(d)).toEqual(["rachianesthesie"]);
    const c = plannedCaseFromDossier(d, { stageId: "s1", generalAnesthesia: false, regionalTypes: ["rachianesthesie"], technicalActs: [], participation: 2, tutorId: null }, "2026-10-08", "2026-10-07T18:00:00.000Z");
    expect(c).toMatchObject({ stage_id: "s1", case_date: "2026-10-08", patient_initials: "DM", operation: "PTG (droite)", operation_category: "K", planned: true, pediatric_under_4: false });
    expect(c.details.drugs).toEqual([
      { name: "Bupivacaïne hyperbare", route: "intrathecal", dose: "10 mg" },
      { name: "Céfazoline", route: "bolus_iv", dose: "2 g" },
      { name: "Propofol", route: "bolus_iv", dose: "71,5 mg" },
    ]);
    // Re-planning keeps the same carnet row.
    expect(plannedCaseFromDossier({ ...d, carnetCaseId: c.id }, { stageId: "s1", generalAnesthesia: false, regionalTypes: [], technicalActs: [], participation: 2, tutorId: null }, "2026-10-08").id).toBe(c.id);
  });
});

describe("consultation summary", () => {
  it("fills yes/no items from the patient data and summarises the notable scores", () => {
    const d = prepared();
    d.consultation.asa = 3;
    d.consultation.nyha = 2;
    d.consultation.mallampati = 3;
    d.consultation.maskVentilation = { beard: true };
    const scores = consultationScores(d.consultation);
    expect(scores.merged.mask.derivedKeys.has("ageOver55")).toBe(true);
    expect(scores.results.mask.level).toBe("high");
    const s = consultationSummary(d.consultation, scores);
    expect(s.status).toBe("ASA III · NYHA II");
    expect(s.airway).toBe("Mallampati III, ventilation au masque difficile prévisible");
  });
});

describe("handover PDF", () => {
  it("builds a PDF from the ISBAR sections", async () => {
    const d = prepared();
    const font = readFileSync(join(process.cwd(), "public/carnet/carlito.ttf"));
    const bytes = await buildIsbarPdf(d, buildIsbar(d, "2026-10-08T11:00:00.000Z"), font);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  }, 60_000);
});
