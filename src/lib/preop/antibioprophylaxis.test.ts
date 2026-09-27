import { describe, expect, it } from "vitest";
import { REFERENCE_PROTOCOLS } from "./reference-protocols";

// SFAR 2024 (PMID 41628822), ASHP/IDSA 2013, AAAAI/ACAAI 2022 (PMID 36122788).
const antibiotics = REFERENCE_PROTOCOLS.flatMap((p) => p.content.drugs.filter((d) => d.phase === "antibio").map((d) => ({ p: p.name, d })));

describe("antibioprophylaxie des protocoles de référence", () => {
  it("céfazoline : 2 g (ou 30 mg/kg chez l'enfant), réinjection toutes les 4 h", () => {
    for (const { p, d } of antibiotics.filter((x) => /^Céfazoline/.test(x.d.name))) {
      if (d.doseMode === "per_kg") expect([p, d.amount, d.maxAmount]).toEqual([p, 30, 2000]);
      else expect([p, d.unit, (d.amount ?? 0) >= 2 && (d.amount ?? 0) <= 3]).toEqual([p, "g", true]);
      if (!/pacemaker/i.test(d.name)) expect([p, d.redoseEveryMin]).toEqual([p, 240]);
    }
  });

  it("clindamycine 900 mg, métronidazole 1 g", () => {
    for (const { p, d } of antibiotics.filter((x) => /^Clindamycine/.test(x.d.name))) expect([p, d.amount, d.unit]).toEqual([p, 900, "mg"]);
    for (const { p, d } of antibiotics.filter((x) => /^Métronidazole/.test(x.d.name))) expect([p, d.amount, d.unit]).toEqual([p, 1, "g"]);
  });

  it("pas de prolongation postopératoire systématique, pas d'alternative pour une simple allergie à la pénicilline", () => {
    for (const { p, d } of antibiotics) {
      expect([p, d.note]).not.toEqual([p, expect.stringMatching(/24 h au total/)]);
      expect([p, d.name]).not.toEqual([p, expect.stringMatching(/allergie immédiate aux bêtalactamines/)]);
    }
  });

  it("duodénopancréatectomie : pipéracilline-tazobactam", () => {
    const panc = REFERENCE_PROTOCOLS.find((p) => /pancréas/i.test(p.name))!;
    expect(panc.content.drugs.some((d) => /Pipéracilline/.test(d.name))).toBe(true);
  });

  it("hystérectomie cœlioscopique : céfazoline seule", () => {
    const h = REFERENCE_PROTOCOLS.find((p) => p.name === "Hystérectomie par cœlioscopie")!;
    expect(h.content.drugs.filter((d) => d.phase === "antibio").map((d) => d.name)).toEqual(["Céfazoline"]);
  });
});
