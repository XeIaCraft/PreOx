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
    expect(settingOf("Craniotomie pour tumeur")).toBe("hdu");
    expect(settingOf("Lobectomie pulmonaire")).toBe("hdu");
    expect(settingOf("Cholécystectomie cœlioscopique")).toBe("inpatient");
    expect(settingOf("Valves endobronchiques (réduction de volume)")).toBe("inpatient");
  });

  it("nothing major, bleeding or urgent is proposed as ambulatory", () => {
    const amb = DEFAULT_CATALOGS.surgeries.filter((s) => s.setting === "ambulatory");
    expect(amb.filter((s) => s.grade === "major" || s.bleedingRisk === "high" || /perfor|étrangl|occlusion|rompu/i.test(s.name)).map((s) => s.name)).toEqual([]);
  });
});

describe("protocol of a laparoscopic or robotic intervention", () => {
  it("is never a spinal-only protocol", async () => {
    const { REFERENCE_PROTOCOLS } = await import("./reference-protocols");
    const { matchProtocol } = await import("./protocols");
    const protocols = REFERENCE_PROTOCOLS.map((p) => ({ ...p, created_at: "", updated_at: "" }));
    const bad = DEFAULT_CATALOGS.surgeries
      .filter((s) => s.approach === "laparoscopic" || s.approach === "thoracoscopic" || (s.approach === "robotic" && s.category !== "K"))
      .map((s) => [s.name, matchProtocol(protocols, { name: s.name, category: s.category, catalogId: s.id }, "", DEFAULT_CATALOGS.surgeries)] as const)
      .filter(([, p]) => p && !p.content.techniques.includes("general"))
      .map(([n, p]) => `${n} → ${p!.name}`);
    expect(bad).toEqual([]);
    const hernia = DEFAULT_CATALOGS.surgeries.find((s) => s.name === "Hernie inguinale par cœlioscopie")!;
    expect(matchProtocol(protocols, { name: hernia.name, category: hernia.category, catalogId: hernia.id }, "", DEFAULT_CATALOGS.surgeries)?.name).toMatch(/cœlioscopie ou robot/);
  });
});
