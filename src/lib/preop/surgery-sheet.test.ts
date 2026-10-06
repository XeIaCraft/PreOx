import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { emptyConsultation, type ConsultationState } from "./dossier";
import { recommendExams, type ExamCode } from "./exams";
import { surgerySheet } from "./surgery-sheet";
import type { SurgeryItem } from "./catalog";

// Exams that only come from the patient (antecedents, treatments), never from the procedure.
const PATIENT_ONLY: ExamCode[] = ["device", "albumin", "micronutrients", "abg", "sleep"];

function consultFor(s: SurgeryItem, patient: ConsultationState["patient"], conditions: ConsultationState["conditions"]): ConsultationState {
  const c = emptyConsultation();
  return {
    ...c,
    patient,
    conditions,
    surgery: { ...c.surgery, name: s.name, category: s.category, kce: s.grade, cardiacRisk: s.cardiacRisk, bleedingRisk: s.bleedingRisk, rcriHighRisk: s.rcriHighRisk, incision: s.incision, position: s.position ?? "", catalogId: s.id },
  };
}

describe("surgery sheet", () => {
  it("lists every exam the consultation would ask for this procedure", () => {
    const patients: [ConsultationState["patient"], ConsultationState["conditions"], number, number | undefined][] = [
      [{ age: 72, sex: "F" }, { coronary: { present: true }, diabetes_insulin: { present: true } }, 3, 3],
      [{ age: 40, sex: "M" }, {}, 1, undefined],
      [{ age: 66, sex: "M" }, { hypertension: { present: true } }, 2, 8],
    ];
    const misses: string[] = [];
    for (const s of DEFAULT_CATALOGS.surgeries) {
      const sheet = new Set(surgerySheet(s).exams.map((e) => e.code));
      for (const [patient, conditions, asa, mets] of patients) {
        const age = s.population === "child" ? 8 : s.population === "neonate" ? 0 : patient.age;
        const r = recommendExams({ consultation: consultFor(s, { ...patient, age }, conditions), asa, mets, surgeryProfile: s.examProfile });
        for (const rec of r.recommendations) if (!PATIENT_ONLY.includes(rec.code) && !sheet.has(rec.code)) misses.push(`${s.name}: ${rec.code}`);
      }
    }
    expect(misses.slice(0, 20)).toEqual([]);
  });

  it("asks a group and a full blood count for every patient of a bleeding procedure", () => {
    const s = DEFAULT_CATALOGS.surgeries.find((x) => x.bleedingRisk === "high" && x.grade === "major" && x.category !== "F")!;
    const sheet = surgerySheet(s);
    expect(sheet.exams.find((e) => e.code === "group")?.always).toBe(true);
    expect(sheet.exams.find((e) => e.code === "fbc")?.always).toBe(true);
    expect(sheet.exams[0].always).toBe(true);
  });

  it("asks nothing for everyone before minor surgery", () => {
    const s = DEFAULT_CATALOGS.surgeries.find((x) => x.grade === "minor" && x.cardiacRisk === "low" && x.bleedingRisk !== "high" && !x.examProfile && x.population !== "child")!;
    expect(surgerySheet(s).exams.filter((e) => e.always)).toEqual([]);
  });
});
