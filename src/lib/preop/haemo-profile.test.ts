import { describe, expect, it } from "vitest";
import { bloodVolume, haemoProfile } from "./haemo-profile";

describe("profil hémodynamique", () => {
  it("volume sanguin : Nadler chez l'adulte, Lemmens chez l'obèse, par kilo chez l'enfant", () => {
    const man = bloodVolume({ age: 40, sex: "M", weightKg: 75, heightCm: 178 })!;
    expect(man.ml).toBeGreaterThan(5000);
    expect(man.ml).toBeLessThan(5600);
    const obese = bloodVolume({ age: 40, sex: "F", weightKg: 130, heightCm: 165 })!;
    expect(obese.how).toMatch(/Lemmens/);
    expect(obese.ml / 130).toBeLessThan(50);
    expect(bloodVolume({ age: 0.5, weightKg: 8 })!.ml).toBe(640);
  });

  it("pertes tolérées (Gross) et classes d'hémorragie en mL", () => {
    const h = haemoProfile({ age: 40, sex: "M", weightKg: 75, heightCm: 178, hb: 14, sbp: 130, dbp: 80, hr: 70 });
    const to7 = h.bleeding.find((x) => x.label.includes("Hb 7"))!;
    // (14 − 7) / 10,5 × ~5300 ≈ 3 500 mL
    expect(Number(to7.value.replace(/\D/g, ""))).toBeGreaterThan(3200);
    expect(Number(to7.value.replace(/\D/g, ""))).toBeLessThan(3800);
    expect(h.bleeding.some((x) => x.label === "Hémorragie Classe III")).toBe(true);
    expect(h.pump.find((x) => x.label === "Cible de PAS")!.value).toBe("117–143 mmHg");
    expect(h.fluids.find((x) => x.label === "Entretien (4-2-1)")!.value).toBe("115 mL/h");
    expect(h.missing).toEqual([]);
  });

  it("dit ce qui manque", () => {
    expect(haemoProfile({ age: 40 }).missing).toContain("poids");
  });
});
