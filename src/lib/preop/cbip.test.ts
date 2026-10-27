import { describe, expect, it } from "vitest";
import { buildMedicationList } from "./cbip";
import { parseQuickEntry } from "./quick-entry";
import { DEFAULT_CATALOGS } from "./catalog-defaults";

describe("CBIP brands", () => {
  const meds = buildMedicationList();
  const byBrand = (brand: string) => meds.filter((m) => m.brands?.includes(brand)).map((m) => m.name);

  it("keeps each « Co-… » combination with its own substances", () => {
    expect(byBrand("Lodoz")).toEqual(["Bisoprolol + hydrochlorothiazide"]);
    expect(byBrand("Co-Bisoprolol EG")).toEqual(["Bisoprolol + hydrochlorothiazide"]);
    expect(byBrand("Co-Diovane")).toEqual(["Valsartan + hydrochlorothiazide"]);
    expect(byBrand("Atacand Plus")).not.toContain("Valsartan + hydrochlorothiazide");
  });

  it("reads a pasted Lodoz as the beta-blocker combination", () => {
    const t = parseQuickEntry("Traitement :\nLodoz 5 mg 1-0-0", DEFAULT_CATALOGS).treatments;
    expect(t.map((x) => x.name)).toEqual(["Bisoprolol + hydrochlorothiazide"]);
    expect(t[0].components).toEqual(expect.arrayContaining(["C07AB07"]));
  });
});
