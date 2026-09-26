import { describe, expect, it } from "vitest";
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

describe("normovolaemia (Manuel 2020, chap. 21)", () => {
  it("reproduces the first hour of the manual's example (70 kg, 8 h of fasting, digestive surgery)", async () => {
    const { normovolaemia } = await import("./fluids");
    const nv = normovolaemia({ weightKg: 70, fastingHours: 8, minutes: 60, loss: "major", bloodLossMl: 0, givenMl: 1500 })!;
    expect(nv.hourlyMl).toBe(110);
    expect(nv.deficitMl).toBe(880);
    expect(nv.deficitDueMl).toBe(440);
    expect(nv.expectedMl).toEqual([440 + 110 + 560, 440 + 110 + 700]);
    expect(nv.status).toBe("above");
  });
  it("whole deficit due after 3 h; blood loss replaced 3–4 × by crystalloids, 1 × by colloids", async () => {
    const { normovolaemia } = await import("./fluids");
    const nv = normovolaemia({ weightKg: 70, fastingHours: 2, minutes: 180, loss: "surface", bloodLossMl: 300, givenMl: 500, colloidMl: 100 })!;
    expect(nv.deficitDueMl).toBe(220);
    expect(nv.bloodReplaceMl).toEqual([100 + 600, 100 + 800]);
    expect(nv.status).toBe("below");
  });
});
