import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { emptyConsultation, type ConsultationState } from "./dossier";
import { consultationScores } from "./consultation-scores";
import { attentionPoints } from "./attention";
import { implausibleValues, valueFindings } from "./value-checks";
import { patientDerived } from "./derive";

const consult = (patient: ConsultationState["patient"], extra: Partial<ConsultationState> = {}): ConsultationState => ({ ...emptyConsultation(), patient, ...extra });
const points = (c: ConsultationState) => attentionPoints(c, consultationScores(c));

describe("values to flag", () => {
  // The case of the screenshot: 80 y, 180 kg, 172 cm, 157/96, HR 107, SpO2 98, Hb 16, platelets 50, INR 0,1, creat 10, HbA1c 12.
  const c = consult({ sex: "M", age: 80, weightKg: 180, heightCm: 172, sbp: 157, dbp: 96, hr: 107, spo2: 98, hb: 16, platelets: 50, inr: 0.1, creatinineMgDl: 10, hba1c: 12 });

  it("flags every abnormal value once, the most severe of its group", () => {
    const shown = valueFindings(c.patient, patientDerived(c.patient), DEFAULT_CATALOGS.values).filter((f) => f.primary).map((f) => f.check.id);
    // 50 G/L is under 100, not under 50.
    expect(shown).toEqual(expect.arrayContaining(["plt_100", "egfr_30", "hr_100", "hba1c_85", "bmi_40", "sbp_140"]));
    expect(shown).not.toContain("plt_150");
    expect(shown).not.toContain("bmi_30");
  });

  it("an impossible value is reported as a typing error and not used", () => {
    expect(implausibleValues(c.patient).map((x) => x.value)).toEqual(["inr"]);
    const p = points(c);
    expect(p.find((x) => x.id === "implausible-inr")?.title).toBe("Valeur à vérifier : INR 0,1");
    expect(p.some((x) => x.id === "value-inr")).toBe(false);
  });

  it("each point says why and on what source", () => {
    const hr = points(c).find((x) => x.id === "value-hr_high")!;
    expect(hr.title).toBe("Fréquence cardiaque 107 /min");
    expect(hr.why).toContain("FC > 100 /min");
    const mask = points(c).find((x) => x.id === "mask")!;
    expect(mask.why).toMatch(/Langeron : .*imc > 26.*âge > 55/i);
  });

  it("values suggest antecedents, with their qualifier", () => {
    const s = consultationScores(c);
    expect(s.conditions.thrombocytopenia).toEqual({ present: true });
    expect(consultationScores(consult({ platelets: 30 })).conditions.thrombocytopenia).toMatchObject({ present: true, severe: true });
    expect(s.conditions.diabetes_oral).toMatchObject({ present: true, poorlyControlled: true });
    expect(s.deduced.get("diabetes_oral")).toBe("HbA1c 12 %");
    expect(s.conditions.ckd).toMatchObject({ present: true, severe: true });
  });

  it("a high HbA1c qualifies the insulin-treated diabetes rather than adding another", () => {
    const s = consultationScores(consult({ hba1c: 9 }, { treatments: [{ id: "i", atc: "A10AE04", name: "Insuline glargine" }] }));
    expect(s.conditions.diabetes_insulin).toMatchObject({ present: true, poorlyControlled: true });
    expect(s.conditions.diabetes_oral).toBeUndefined();
  });
});

describe("clinical exam", () => {
  it("findings become antecedents and points of attention", () => {
    const c = consult({ exam: { heart: "murmur", lungs: "crackles", edema: true, veins: "difficult", punctureSite: true } });
    const s = consultationScores(c);
    expect(s.conditions.murmur?.present).toBe(true);
    expect(s.conditions.difficult_iv?.present).toBe(true);
    const ids = attentionPoints(c, s).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["exam-chf", "exam-puncture"]));
  });
});

describe("structured details of antecedents", () => {
  it("the detail answered sets the ASA class and the qualifier", () => {
    const mild = consultationScores(consult({}, { conditions: { aortic_stenosis: { present: true, details: { severity: "mild" } } } }));
    expect(mild.asa).toBe(2);
    const tight = consultationScores(consult({}, { conditions: { aortic_stenosis: { present: true, details: { severity: "severe" } } } }));
    expect(tight.asa).toBe(4);
    expect(tight.conditions.aortic_stenosis?.severe).toBe(true);
    const gold3 = consultationScores(consult({}, { conditions: { copd: { present: true, details: { gold: "3" } } } }));
    const p = attentionPoints(consult({}, { conditions: { copd: { present: true, details: { gold: "3" } } } }), gold3).find((x) => x.id === "cond-copd")!;
    expect(p.level).toBe("high");
    expect(p.why).toContain("GOLD 3");
  });
});

describe("interactions", () => {
  it("a treatment's interaction becomes major when the product is in the plan", () => {
    const c = consult({}, { treatments: [{ id: "s", atc: "N06AB06", name: "Sertraline" }] });
    const plan = { techniques: [], drugs: [{ id: "t", name: "Tramadol", route: "bolus_iv", phase: "analgesia", doseMode: "fixed", amount: 100, unit: "mg", weightBasis: "total", maxAmount: null, redoseEveryMin: null, note: "" }], targets: [], material: [], risks: [], postop: [], tourniquetAlertMin: null, notes: "" } as never;
    const without = attentionPoints(c, consultationScores(c)).find((x) => x.title.startsWith("Interaction : Sertraline ↔ tramadol"));
    expect(without?.level).toBe("medium");
    const withPlan = attentionPoints(c, consultationScores(c, { plan }), plan).find((x) => x.title.includes("(au plan)"));
    expect(withPlan?.level).toBe("high");
  });
});
