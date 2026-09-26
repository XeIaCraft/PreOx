import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";

const settingOf = (name: string) => DEFAULT_CATALOGS.surgeries.find((s) => s.name === name)?.setting;

describe("usual care setting of the interventions", () => {
  it("every intervention has one", () => {
    expect(DEFAULT_CATALOGS.surgeries.filter((s) => !s.setting).map((s) => s.name)).toEqual([]);
  });

  it("ambulatory, hospitalisation, intensive care where expected", () => {
    expect(settingOf("Cataracte")).toBe("ambulatory");
    expect(settingOf("Arthroscopie du genou")).toBe("ambulatory");
    expect(settingOf("Cure de hernie inguinale")).toBe("ambulatory");
    expect(settingOf("Trachéotomie")).toBe("inpatient");
    expect(settingOf("Syndrome des loges : fasciotomie")).toBe("inpatient");
    expect(settingOf("Valves de l'urètre postérieur")).not.toBe("icu");
    expect(settingOf("Transplantation rénale")).toBe("inpatient");
    expect(settingOf("Chirurgie cardiaque sous CEC")).toBe("icu");
    expect(settingOf("Œsophagectomie")).toBe("icu");
  });

  it("nothing major, bleeding or urgent is proposed as ambulatory", () => {
    const amb = DEFAULT_CATALOGS.surgeries.filter((s) => s.setting === "ambulatory");
    expect(amb.filter((s) => s.grade === "major" || s.bleedingRisk === "high" || /perfor|étrangl|occlusion|rompu/i.test(s.name)).map((s) => s.name)).toEqual([]);
  });
});
