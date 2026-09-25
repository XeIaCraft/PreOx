import { describe, expect, it } from "vitest";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, type ConsultationState } from "./dossier";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { SURGERY_EXAM_PROFILES } from "./exams";
import { surgeryFromItem } from "@/components/preop/surgery-panel";
import { parseQuickEntry } from "./quick-entry";

function withSurgery(id: string, patch: Partial<ConsultationState> = {}): ConsultationState {
  const base = emptyConsultation();
  const item = DEFAULT_CATALOGS.surgeries.find((s) => s.id === id);
  if (!item) throw new Error(`no surgery ${id}`);
  return { ...base, ...patch, surgery: surgeryFromItem(base.surgery, item), patient: { age: 68, sex: "M", ...patch.patient } };
}

const codes = (c: ConsultationState) => consultationScores(c).exams.recommendations.map((r) => r.code);

describe("exams from the procedure and the recommendations", () => {
  it("cardiac surgery under bypass asks for the cardiovascular work-up, each with its guideline", () => {
    const c = withSurgery("chirurgie-cardiaque-sous-cec");
    const recs = consultationScores(c).exams.recommendations;
    expect(recs.map((r) => r.code)).toEqual(expect.arrayContaining(["echo", "coronary", "carotid", "staph", "group", "haemostasis"]));
    for (const r of recs) for (const why of r.reasons) expect(why.source.short.length).toBeGreaterThan(2);
    expect(recs.find((r) => r.code === "coronary")!.reasons[0].source.short).toBe("ESC/EACTS 2018");
  });

  it("valve surgery adds the dental work-up (ESC 2023 endocarditis)", () => {
    const recs = consultationScores(withSurgery("remplacement-valvulaire-aortique")).exams.recommendations;
    expect(recs.find((r) => r.code === "dental")?.reasons[0].source.short).toBe("ESC 2023 EI");
  });

  it("lung resection asks for spirometry with DLCO (ERS/ESTS)", () => {
    expect(codes(withSurgery("pneumonectomie"))).toEqual(expect.arrayContaining(["pft", "cpet", "vq"]));
  });

  it("the patient's own conditions add their exams", () => {
    const c = withSurgery("cataracte", { conditions: { pacemaker: { present: true }, anemia: { present: true } } });
    expect(codes(c)).toEqual(expect.arrayContaining(["device", "iron"]));
  });

  it("every procedure of the catalogue points to an existing work-up, and there are many more procedures", () => {
    expect(DEFAULT_CATALOGS.surgeries.length).toBeGreaterThan(300);
    for (const s of DEFAULT_CATALOGS.surgeries) if (s.examProfile) expect(SURGERY_EXAM_PROFILES[s.examProfile], s.id).toBeDefined();
    expect(new Set(DEFAULT_CATALOGS.surgeries.map((s) => s.id)).size).toBe(DEFAULT_CATALOGS.surgeries.length);
  });

  it("reads the new laboratory values from a pasted report", () => {
    const r = parseQuickEntry("Biologie : K+ 3,2 mmol/l, Na 128, glycémie 1,45 g/l, albumine 28 g/l, NT-proBNP 850, troponine T hs 18, ferritine 45", DEFAULT_CATALOGS);
    const v = Object.fromEntries(r.values.map((x) => [x.key, x.value]));
    expect(v).toMatchObject({ potassium: 3.2, sodium: 128, glucose: 145, albumin: 28, ntprobnp: 850, troponin: 18, ferritin: 45 });
  });
});
