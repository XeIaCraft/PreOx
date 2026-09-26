import { describe, expect, it } from "vitest";
import { jamesLbm, tciPlan, tciSummary } from "./tci";

const adult = { age: 40, sex: "M" as const, weightKg: 70, heightCm: 175 };

describe("AIVOC", () => {
  it("James lean body mass as the pumps compute it", () => {
    expect(jamesLbm("M", 70, 175)).toBeCloseTo(56.5, 1);
  });
  it("Schnider: about 6 mg/kg/h at 1 h for Cp 3 µg/mL (Roberts' 10-8-6 scheme)", () => {
    const plan = tciPlan("propofol", adult)!.find((p) => p.model === "schnider")!;
    expect(plan.valid).toBe(true);
    const h1 = plan.rates.find((r) => r.minutes === 60)!;
    // middle of 2.5–4 µg/mL = 3.25
    expect(h1.perHour / 70).toBeGreaterThan(5);
    expect(h1.perHour / 70).toBeLessThan(8);
    expect(h1.mlPerHour).toBeCloseTo(h1.perHour / 10, 1);
  });
  it("remifentanil Minto: about 0.1–0.3 µg/kg/min at 1 h for Ce 3–8", () => {
    const plan = tciPlan("remifentanil", adult)!.find((p) => p.model === "minto")!;
    const h1 = plan.rates.find((r) => r.minutes === 60)!;
    const ugKgMin = h1.perHour / 60 / 70;
    expect(ugKgMin).toBeGreaterThan(0.1);
    expect(ugKgMin).toBeLessThan(0.4);
  });
  it("obesity: Schnider and Minto refused beyond the James limit, Marsh at the adjusted weight", () => {
    const obese = { age: 45, sex: "F" as const, weightKg: 130, heightCm: 165 };
    const p = tciPlan("propofol", obese)!;
    expect(p.find((x) => x.model === "schnider")!.valid).toBe(false);
    const marsh = p.find((x) => x.model === "marsh")!;
    expect(marsh.inputs[0]).toMatch(/Poids (8\d|9\d) kg/);
    expect(tciPlan("remifentanil", obese)!.find((x) => x.model === "minto")!.valid).toBe(false);
  });
  it("child: Paedfusor, not Schnider nor Marsh", () => {
    const p = tciPlan("propofol", { age: 6, sex: "F", weightKg: 20, heightCm: 115 })!;
    expect(p.find((x) => x.model === "paedfusor")!.valid).toBe(true);
    expect(p.find((x) => x.model === "schnider")!.valid).toBe(false);
    expect(p.find((x) => x.model === "marsh")!.valid).toBe(false);
  });
  it("elderly: lower targets", () => {
    const p = tciPlan("propofol", { ...adult, age: 82 })!.find((x) => x.model === "schnider")!;
    expect(p.targets[0].range[1]).toBeLessThanOrEqual(3);
  });
  it("summary for the product row, or nothing without height or sex", () => {
    expect(tciSummary("propofol", adult)).toMatch(/^AIVOC Schnider Ce 2,5–4 µg\/mL ≈ \d+(,\d)? mL\/h à 1 h/);
    expect(tciSummary("propofol", { age: 40, weightKg: 70 })).toBeNull();
  });
});
