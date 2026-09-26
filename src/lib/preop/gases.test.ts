import { describe, expect, it } from "vitest";
import { describeGases, gasTarget, macAt, n2oMacShare } from "./gases";
import { REFERENCE_PROTOCOLS } from "./reference-protocols";

const byNumber = (n: number) => REFERENCE_PROTOCOLS.find((p) => Number(p.id.slice(-12)) === n)!;

describe("age-adjusted MAC (Mapleson 1996, Lerman 1994)", () => {
  it("matches the published values", () => {
    expect(macAt("sevoflurane", 40)).toBe(1.8);
    expect(macAt("sevoflurane", 80)).toBeCloseTo(1.4, 1);
    expect(macAt("isoflurane", 40)).toBe(1.17);
    expect(macAt("desflurane", 40)).toBe(6.6);
    expect(macAt("sevoflurane", 0.25)).toBe(3.2);
    expect(macAt("sevoflurane", 0)).toBe(3.3);
    expect(macAt("tiva", 40)).toBeNull();
  });
  it("counts N₂O in the volatile target", () => {
    expect(n2oMacShare(50, 40)).toBeCloseTo(0.48, 2);
    const air = gasTarget({ agent: "sevoflurane", carrier: "air", fio2: [0.5, 0.5], mac: [1, 1] }, 40)!;
    const n2o = gasTarget({ agent: "sevoflurane", carrier: "n2o", fio2: [0.5, 0.5], mac: [1, 1] }, 40)!;
    expect(air.fet).toEqual([1.8, 1.8]);
    expect(n2o.fet[0]).toBeLessThan(1);
  });
  it("describes the plan for the patient", () => {
    const lines = describeGases({ agent: "sevoflurane", carrier: "air", fio2: [0.4, 0.5], mac: [0.7, 1], freshGasLMin: 1 }, 70);
    expect(lines[0]).toBe("Air / O₂ — FiO₂ 40 %–50 %");
    expect(lines[1]).toMatch(/Fet 1,0–1,5 %/);
  });
});

describe("reference protocols: gases and induction choices", () => {
  it("every protocol with a general anaesthesia has a gas plan, the others none", () => {
    for (const p of REFERENCE_PROTOCOLS) expect(Boolean(p.content.gases), p.name).toBe(p.content.techniques.includes("general"));
  });
  it("laser: low FiO₂, no N₂O; one-lung ventilation: FiO₂ up to 100 %", () => {
    const laser = byNumber(68).content.gases!;
    expect(laser.fio2[1]).toBeLessThanOrEqual(0.3);
    expect(laser.noN2O).toBeTruthy();
    expect(byNumber(24).content.gases!.fio2[1]).toBe(1);
  });
  it("child protocols offer sevoflurane or propofol, IV first for ENT", () => {
    const ent = byNumber(70).content.drugs.filter((d) => d.choice === "induction");
    expect(ent.map((d) => d.name)).toEqual(["Propofol", "Sévoflurane (induction au masque)"]);
    for (const n of [74, 94, 97, 98, 100, 101, 102]) {
      const names = byNumber(n).content.drugs.filter((d) => d.choice === "induction").map((d) => d.name);
      expect(names, String(n)).toEqual(["Sévoflurane (induction au masque)", "Propofol"]);
    }
    // Full stomach: IV only.
    expect(byNumber(95).content.drugs.some((d) => /Sévoflurane/.test(d.name))).toBe(false);
  });
});
