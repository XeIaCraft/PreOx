import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { buildCarnetPdf, buildEvaluationGridPdf, type CarnetPdfAssets } from "./pdf";
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
    signature: PNG,
  };
  data.supervisors = [
    { id: "sup1", last_name: "Martin", first_name: "Claire", role: "Maître de stage coordinateur", usual_hospital: "CHU Saint-Pierre", archived: false, created_at: "2025-01-01T00:00:00Z" },
    { id: "sup2", last_name: "Durant", first_name: "Paul", role: "Maître de stage", usual_hospital: "CHU Saint-Pierre", archived: false, created_at: "2025-01-01T00:00:00Z" },
  ];
  data.stages = [
    { id: "st1", hospital: "CHU Saint-Pierre", city: "Bruxelles", sector: "Anesthésie – bloc opératoire", coordinator_id: "sup1", supervisor_id: "sup2", training_year: 2, start_date: "2025-10-01", end_date: "2026-03-31", created_at: "2025-10-01T00:00:00Z" },
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
      regional_types: i % 3 ? ["rachianesthesie"] : ["peridurale"],
      technical_acts: i % 5 === 0 ? ["voie_centrale"] : [],
      other_labels: {},
      details: {},
      planned: false,
      participation: 2,
      tutor_id: "sup1",
      signature_id: i < 10 ? "sig1" : null,
      notes: "",
      created_at: `2025-10-01T08:${String(i % 60).padStart(2, "0")}:00Z`,
    });
  }
  data.duties = [{ id: "d1", stage_id: "st1", duty_date: "2025-10-04", duty_type: "on_site", institution: "CHU Saint-Pierre", city: "Bruxelles", head_of_department: "Pr Dupont", supervisor_id: "sup1", signature_id: "sig1", notes: "", created_at: "2025-10-04T20:00:00Z" }];
  data.courses = [{ id: "co1", kind: "course", start_date: "2025-11-05", end_date: "2025-11-06", city: "Bruxelles", institution: "SARB", subject: "Airway 😀", exam_result: "Réussi", signature_id: null, teacher: "Dr X", created_at: "2025-11-05T00:00:00Z" }];
  data.stage_reviews = [{ id: "r1", stage_id: "st1", global_impression: "Très formateur.", liked: "Autonomie", disliked: "Horaires", would_change: "—", would_return: true, score_interest: 9, score_clinical_guidance: 8, score_atmosphere: 7, score_theoretical_guidance: 6, score_responsibilities: 0 }];
  data.years = [{ id: "y2", training_year: 2, absences: { A: 2.5, E: 210 }, activity_counts: { smur: 12 } }];
  data.related_activities = [{ id: "ra1", nature: "SMUR", institution: "CHU Saint-Pierre", city: "Bruxelles", start_date: "2025-11-01", end_date: "2025-11-30", appraisal: "Très bonne expérience.", signature_id: null, responsible: "Dr Leroy", created_at: "2025-11-01T00:00:00Z" }];
  data.publications = [{ id: "pu1", title: "Rachianesthésie et chirurgie ambulatoire", details: "Poster, congrès BSAR", pub_date: "2025-12-01", created_at: "2025-12-01T00:00:00Z" }];
  return data;
}

const PUBLIC = join(__dirname, "../../../public/carnet");
const assets: CarnetPdfAssets = { template: readFileSync(join(PUBLIC, "modele-carnet-de-stage.pdf")), font: readFileSync(join(PUBLIC, "carlito.ttf")) };

// Building a whole carnet embeds the full font: a few seconds, more when the suite runs in parallel.
describe("PDF export (written over the official form)", { timeout: 60_000 }, () => {
  it("builds the whole carnet and an evaluation grid from the form's own pages", async () => {
    const data = sample();
    const bytes = await buildCarnetPdf(data, 2, assets);
    if (process.env.CARNET_PDF_OUT) writeFileSync(`${process.env.CARNET_PDF_OUT}/carnet.pdf`, bytes);
    const doc = await PDFDocument.load(bytes);
    // cover, declaration, contents, identification, grid ×2, 1 activity, courses, seminars, publications, legend,
    // 70 cases → 6 pages, duties, report ×3, personal evaluation, absences
    expect(doc.getPageCount()).toBe(1 + 1 + 1 + 1 + 2 + 1 + 1 + 1 + 1 + 1 + 6 + 1 + 3 + 1 + 1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(595.3, 0);
    expect(doc.getPage(12).getWidth()).toBeCloseTo(841.9, 0);
    const grid = await PDFDocument.load(await buildEvaluationGridPdf(data, data.stages[0], assets));
    expect(grid.getPageCount()).toBe(2);
    if (process.env.CARNET_PDF_OUT) {
      writeFileSync(`${process.env.CARNET_PDF_OUT}/carnet.pdf`, bytes);
      writeFileSync(`${process.env.CARNET_PDF_OUT}/grille.pdf`, await grid.save());
    }
  });

  it("keeps text the font can't draw from breaking the export, and continues cut fields in an annex", async () => {
    const data = sample();
    data.profile!.pre_training_activities = "Très long parcours 😀 ".repeat(200);
    const doc = await PDFDocument.load(await buildCarnetPdf(data, 2, assets));
    expect(doc.getPageCount()).toBe(24);
  });

  it("handles an empty carnet", async () => {
    const doc = await PDFDocument.load(await buildCarnetPdf(emptyCarnetData(), "all", assets));
    expect(doc.getPageCount()).toBeGreaterThan(10);
  });
});
