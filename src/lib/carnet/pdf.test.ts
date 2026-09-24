import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildCarnetPdf, buildEvaluationGridPdf, toWinAnsi } from "./pdf";
import { emptyCarnetData, type CarnetData } from "./types";

// 1x1 transparent PNG — stands in for a drawn signature.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function sample(): CarnetData {
  const data = emptyCarnetData();
  data.profile = {
    last_name: "Leblanc",
    first_name: "Alexandre",
    nationality: "Belge",
    birth_place: "Liège",
    birth_date: "1996-04-12",
    addresses: [{ address: "Rue de l'Hôpital 12, 1000 Bruxelles", since: "2024-09-01" }],
    email: "a@example.org",
    phone: "0470 00 00 00",
    university: "ULB",
    graduation_year: 2022,
    pre_training_activities: "Assistant en médecine interne — 2022-2023 (≥ 6 mois).",
  };
  data.supervisors = [{ id: "sup1", last_name: "Martin", first_name: "Claire", role: "Maître de stage coordinateur", usual_hospital: "CHU Saint-Pierre", archived: false, created_at: "2025-01-01T00:00:00Z" }];
  data.stages = [
    { id: "st1", hospital: "CHU Saint-Pierre", city: "Bruxelles", sector: "Bloc opératoire", activity: "Anesthésie", coordinator_id: "sup1", training_year: 2, start_date: "2025-10-01", end_date: "2026-03-31", created_at: "2025-10-01T00:00:00Z" },
  ];
  data.signatures = [{ id: "sig1", supervisor_id: "sup1", supervisor_name: "Claire Martin", image: PNG, signed_at: "2025-10-02T18:00:00Z" }];
  for (let i = 0; i < 70; i++) {
    data.cases.push({
      id: `c${i}`,
      stage_id: "st1",
      case_date: `2025-10-${String(1 + (i % 28)).padStart(2, "0")}`,
      patient_initials: "JD",
      operation: i % 3 ? "Prothèse totale de hanche sous rachianesthésie avec sédation légère" : "Césarienne",
      operation_category: i % 3 ? "K" : "B",
      pediatric_under_4: false,
      general_anesthesia: i % 2 === 0,
      regional_type: i % 3 ? "rachianesthesie" : "peridurale",
      technical_act: null,
      participation: 2,
      tutor_id: "sup1",
      signature_id: i < 10 ? "sig1" : null,
      notes: "",
      created_at: `2025-10-01T08:${String(i % 60).padStart(2, "0")}:00Z`,
    });
  }
  data.duties = [{ id: "d1", stage_id: "st1", duty_date: "2025-10-04", duty_type: "on_site", institution: "CHU Saint-Pierre", city: "Bruxelles", head_of_department: "Pr Dupont", supervisor_id: "sup1", signature_id: "sig1", notes: "", created_at: "2025-10-04T20:00:00Z" }];
  data.courses = [{ id: "co1", kind: "course", start_date: "2025-11-05", end_date: "2025-11-06", city: "Bruxelles", institution: "SARB", subject: "Airway management — cours avancé 😀", exam_result: "Réussi", teacher: "Dr X", created_at: "2025-11-05T00:00:00Z" }];
  data.stage_reviews = [{ id: "r1", stage_id: "st1", global_impression: "Très formateur.", liked: "Autonomie", disliked: "Horaires", would_change: "—", would_return: true, score_interest: 9, score_clinical_guidance: 8, score_atmosphere: 7, score_theoretical_guidance: 6, score_responsibilities: 0 }];
  data.years = [{ id: "y2", training_year: 2, absences: { A: 2.5, E: 210 }, activity_counts: { smur: 12 } }];
  return data;
}

describe("PDF export", () => {
  it("replaces characters the standard fonts can't draw", () => {
    expect(toWinAnsi("≥ 6 mois – « ok » 😀")).toBe(">= 6 mois – « ok » ?");
  });

  it("builds the whole carnet and a blank evaluation grid", async () => {
    const data = sample();
    const bytes = await buildCarnetPdf(data, 2);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(10);
    const grid = await PDFDocument.load(await buildEvaluationGridPdf(data, data.stages[0]));
    expect(grid.getPageCount()).toBeGreaterThanOrEqual(1);
    if (process.env.CARNET_PDF_OUT) {
      writeFileSync(`${process.env.CARNET_PDF_OUT}/carnet.pdf`, bytes);
      writeFileSync(`${process.env.CARNET_PDF_OUT}/grille.pdf`, await grid.save());
    }
  });

  it("handles an empty carnet", async () => {
    const doc = await PDFDocument.load(await buildCarnetPdf(emptyCarnetData(), "all"));
    expect(doc.getPageCount()).toBeGreaterThan(5);
  });
});
