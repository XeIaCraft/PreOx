import { describe, expect, it } from "vitest";
import { suggestAsa } from "./asa";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { DEFAULT_CONDITIONS } from "./catalog-conditions";
import { parseQuickEntry } from "./quick-entry";

const parse = (t: string) => parseQuickEntry(t, DEFAULT_CATALOGS as never);
const patient = { sex: "M" as const, age: 58, weightKg: 75, heightCm: 178 };

describe("surgical and anaesthetic antecedents", () => {
  it("are grouped apart, with a point of attention each", () => {
    const surgical = DEFAULT_CONDITIONS.filter((c) => c.system === "surgical");
    expect(surgical.length).toBeGreaterThanOrEqual(20);
    for (const c of surgical) expect(c.attention?.text.length, c.id).toBeGreaterThan(20);
    expect(DEFAULT_CONDITIONS.find((c) => c.id === "delayed_emergence")?.system).toBe("anaes");
  });

  it("a delayed emergence and a past hip replacement are recognised in a free report", () => {
    const r = parse("Antécédents : PTH droite 2019, réveil long après une AG");
    expect(r.conditions.map((c) => c.id)).toEqual(expect.arrayContaining(["joint_prosthesis", "delayed_emergence"]));
  });

  it("the planned intervention is not taken for a past one", () => {
    expect(parse("Mastectomie prévue").conditions.map((c) => c.id)).not.toContain("axillary_dissection");
    expect(parse("Intervention prévue : thyroïdectomie totale").conditions).toEqual([]);
  });

  it("a partial nephrectomy for a renal mass is a localised tumour, not a single kidney", () => {
    const ids = parse("Néphrectomie partielle pour masse rénale").conditions.map((c) => c.id);
    expect(ids).toContain("cancer");
    expect(ids).not.toContain("single_kidney");
  });

  it("ASA: a localised tumour without systemic effect does not raise the class; a metastatic one does", () => {
    const at = (extent?: string) =>
      suggestAsa(patient, { cancer: { present: true, ...(extent ? { details: { extent } } : {}) } }, { tobacco: "never" }).asa;
    expect(at("local")).toBe(1);
    expect(at("metastatic")).toBe(3);
    expect(at()).toBe(2);
  });
});
