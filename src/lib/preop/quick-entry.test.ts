import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "./quick-entry";
import { DEFAULT_CATALOGS } from "./catalog-defaults";

describe("quick entry", () => {
  it("splits a dictated sentence into antecedents, treatments, allergies and substance use", () => {
    const r = parseQuickEntry(
      "HTA mal contrôlée, diabète de type 2 sous metformine 850 mg 2x/j, stent en 2021 sous Asaflow, SAOS appareillé, allergie à la pénicilline, fumeur 20 PA, 2 verres de vin par jour, prothèse de hanche 2019",
      DEFAULT_CATALOGS
    );
    expect(r.conditions.map((c) => `${c.id}${c.qualifiers.length ? `:${c.qualifiers.join("+")}` : ""}`)).toEqual(expect.arrayContaining(["hypertension:poorlyControlled", "diabetes_oral", "coronary", "osa"]));
    expect(r.treatments.map((t) => [t.name, t.dailyDoseMg])).toEqual([
      ["Metformine", 1700],
      ["Acide acétylsalicylique", undefined],
    ]);
    expect(r.allergies).toMatchObject([{ allergenId: "betalactams" }]);
    expect(r.substances).toMatchObject({ tobacco: "current", packYears: 20, alcoholUnitsPerWeek: 14 });
    expect(r.unknown).toEqual(["prothèse de hanche 2019"]);
  });

  it("doesn't take short words for acronyms, knows former smokers and free allergies", () => {
    const r = parseQuickEntry("ex-fumeur, allergique au kiwi, il a une IC", DEFAULT_CATALOGS);
    expect(r.substances.tobacco).toBe("former");
    expect(r.allergies).toEqual([{ label: "kiwi", from: "allergique au kiwi" }]);
    expect(r.conditions.map((c) => c.id)).toEqual(["heart_failure"]);
    expect(parseQuickEntry("une ic légère", DEFAULT_CATALOGS).conditions).toEqual([]);
  });
});

describe("applying a quick entry", () => {
  it("adds what's kept without duplicating or removing", async () => {
    const { applyQuickEntry, selectAll } = await import("./quick-entry");
    const { emptyConsultation } = await import("./dossier");
    const base = { ...emptyConsultation(), treatments: [{ id: "x", atc: "A10BA02", name: "Metformine", dailyDoseMg: undefined as number | undefined }] };
    const r = parseQuickEntry("HTA, metformine, Xarelto 20 mg, allergie latex, ex-fumeur, glaucome", DEFAULT_CATALOGS);
    const sel = { ...selectAll(r), conditions: [] };
    const next = applyQuickEntry(base, r, sel);
    expect(next.conditions.hypertension).toBeUndefined();
    expect(next.treatments.map((t) => [t.name, t.dailyDoseMg])).toEqual([
      ["Metformine", undefined],
      ["Rivaroxaban", 20],
    ]);
    expect(next.patient.allergyList).toEqual([{ allergenId: "latex", label: "Latex" }]);
    expect(next.substances.tobacco).toBe("former");
    expect(next.patient.history).toBe("glaucome");
  });
});

describe("quick entry, spoken style", () => {
  it("keeps the allergy context across « et », prefers insulin-treated diabetes", () => {
    const r = parseQuickEntry("allergie à la pénicilline et au latex, diabète sous insuline", DEFAULT_CATALOGS);
    expect(r.allergies.map((a) => a.allergenId)).toEqual(["betalactams", "latex"]);
    expect(r.conditions.map((c) => c.id)).toEqual(["diabetes_insulin"]);
    expect(parseQuickEntry("diabète", DEFAULT_CATALOGS).conditions.map((c) => c.id)).toEqual(["diabetes_oral"]);
  });
});
