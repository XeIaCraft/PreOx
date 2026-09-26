import { describe, expect, it } from "vitest";
import { emptyConsultation, type ConsultationState } from "./dossier";
import { nutritionGrade, thromboticRisk } from "./periop-risks";

const withTreatment = (t: Partial<ConsultationState["treatments"][number]>): ConsultationState => ({ ...emptyConsultation(), treatments: [{ id: "t", atc: "B01AF02", name: "Apixaban", ...t }] });
const now = new Date("2026-10-01T00:00:00Z");

describe("thrombotic risk (ESC 2022)", () => {
  it("none without an oral anticoagulant", () => {
    expect(thromboticRisk(emptyConsultation(), {}, null, now)).toBeNull();
  });
  it("high: AF with CHA2DS2-VASc > 6, recent stroke, recent VTE, mechanical valve", () => {
    expect(thromboticRisk(withTreatment({ indication: "af" }), {}, 7, now)!.level).toBe("high");
    expect(thromboticRisk(withTreatment({ indication: "secondary_prevention_stroke", eventDate: "2026-08-15" }), {}, 3, now)!.level).toBe("high");
    expect(thromboticRisk(withTreatment({ indication: "vte", eventDate: "2026-09-01" }), {}, 0, now)!.level).toBe("high");
    expect(thromboticRisk(withTreatment({ atc: "B01AA07", indication: "af" }), { mechanical_valve: { present: true } }, 2, now)!.level).toBe("high");
  });
  it("low or moderate otherwise: no bridging; unknown when the indication is missing", () => {
    expect(thromboticRisk(withTreatment({ indication: "af" }), {}, 4, now)!.level).toBe("low_moderate");
    expect(thromboticRisk(withTreatment({ indication: "vte", eventDate: "2025-01-01" }), {}, 0, now)!.level).toBe("low_moderate");
    expect(thromboticRisk(withTreatment({}), {}, 4, now)!.level).toBe("unknown");
  });
});

describe("nutritional grade (SFNEP / ESPEN)", () => {
  const c = (patch: Partial<ConsultationState["patient"]>, extra: Partial<ConsultationState> = {}): ConsultationState => {
    const base = emptyConsultation();
    return { ...base, patient: { ...base.patient, sex: "F", heightCm: 165, ...patch }, ...extra };
  };
  it("grade 1 for a healthy adult before minor surgery", () => {
    expect(nutritionGrade(c({ age: 40, weightKg: 62 }), {})!.grade).toBe(1);
  });
  it("grade 2 with a risk factor, 3 when malnourished, 4 when malnourished before heavy surgery", () => {
    expect(nutritionGrade(c({ age: 75, weightKg: 62 }), {})!.grade).toBe(2);
    expect(nutritionGrade(c({ age: 50, weightKg: 48 }), {})!.grade).toBe(3);
    const heavy = c({ age: 50, weightKg: 62, albumin: 26 });
    heavy.surgery = { ...heavy.surgery, kce: "major" };
    expect(nutritionGrade(heavy, {})!.grade).toBe(4);
  });
});

describe("thrombotic risk without an indication on the treatment", () => {
  it("a known AF stands for it", () => {
    expect(thromboticRisk(withTreatment({}), { arrhythmia: { present: true } }, 3, now)!.level).toBe("low_moderate");
  });
});
