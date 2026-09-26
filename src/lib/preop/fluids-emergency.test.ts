import { describe, expect, it } from "vitest";
import { emergencySheet } from "./emergency";
import { fluidPlan, hollidaySegar, urineRate } from "./fluids";

describe("fluids", () => {
  it("Holliday–Segar 4-2-1", () => {
    expect(hollidaySegar(8)).toBe(32);
    expect(hollidaySegar(15)).toBe(50);
    expect(hollidaySegar(30)).toBe(70);
  });

  it("adult: 1–4 ml/kg/h in theatre, 25–30 ml/kg/24 h after, on ideal weight when obese", () => {
    const lean = fluidPlan({ age: 50, weightKg: 70, heightCm: 175, sex: "M" })!;
    expect(lean.intraopMlH).toEqual([70, 280]);
    expect(lean.postop24h).toEqual([1750, 2100]);
    expect(lean.basis).toBe("réel");
    const obese = fluidPlan({ age: 50, weightKg: 130, heightCm: 170, sex: "F" })!;
    expect(obese.basis).toBe("idéal");
    expect(obese.weightKg).toBeLessThan(70);
  });

  it("child: hourly 4-2-1, no formula to 'catch up' the fast", () => {
    const c = fluidPlan({ age: 4, weightKg: 16 })!;
    expect(c.population).toBe("child");
    expect(c.intraopMlH).toEqual([52, 52]);
  });

  it("urine output in ml/kg/h once 30 min have passed", () => {
    expect(urineRate(140, 70, 120)).toBe(1);
    expect(urineRate(50, 70, 20)).toBeNull();
  });
});

describe("emergency sheet", () => {
  it("computes every dose for the patient, from the reference only", () => {
    const s = emergencySheet({ age: 60, sex: "M", weightKg: 80, heightCm: 180 });
    const all = s.flatMap((x) => x.doses);
    expect(all.length).toBeGreaterThan(20);
    const dantrolene = all.find((d) => d.drug === "Dantrolène")!;
    expect(dantrolene.dose).toBe("200 mg");
    const sugammadex = all.find((d) => d.drug === "Sugammadex")!;
    expect(sugammadex.dose).toBe("1280 mg");
    const lipid = all.find((d) => d.drug.startsWith("Intralipide"))!;
    expect(lipid.dose).toBe("80–120 mL");
    const adre = s.find((x) => x.id === "arrest")!.doses[0];
    expect(adre.dose).toBe("1 mg");
  });

  it("child: weight-based arrest doses", () => {
    const s = emergencySheet({ age: 5, weightKg: 20 });
    const adre = s.find((x) => x.id === "arrest")!.doses.find((d) => d.drug === "Adrénaline")!;
    expect(adre.dose).toBe("0,2 mg");
  });

  it("says when the weight is missing instead of guessing", () => {
    const s = emergencySheet({ age: 60 });
    expect(s.flatMap((x) => x.doses).find((d) => d.drug === "Dantrolène")!.dose).toBeNull();
  });
});
