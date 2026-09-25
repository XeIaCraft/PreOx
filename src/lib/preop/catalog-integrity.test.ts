import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { MEDICATIONS } from "./medications";
import { SURGERY_CATALOG } from "./surgeries";

const dups = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

describe("default catalogues", () => {
  it("have unique ids", () => {
    for (const list of Object.values(DEFAULT_CATALOGS)) expect(dups(list.map((x: { id: string }) => x.id))).toEqual([]);
  });

  it("every intervention has an indicative duration", () => {
    expect(SURGERY_CATALOG.filter((s) => s.durationHours === undefined).map((s) => s.id)).toEqual([]);
  });

  it("implications point to existing antecedents", () => {
    const ids = new Set(DEFAULT_CATALOGS.conditions.map((c) => c.id));
    const implied = [...DEFAULT_CATALOGS.drugClasses, ...DEFAULT_CATALOGS.medications].flatMap((x) => (x.implies ? [x.implies] : []));
    expect(implied.filter((i) => !ids.has(i))).toEqual([]);
  });

  it("combination components are valid ATC codes or groups", () => {
    const bad = MEDICATIONS.flatMap((m) => (m.components ?? []).filter((c) => !/^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$/.test(c)));
    expect(bad).toEqual([]);
  });

  it("no keyword is shared by two antecedents (quick entry would pick both)", () => {
    const seen = new Map<string, string>();
    const shared: string[] = [];
    for (const c of DEFAULT_CATALOGS.conditions)
      for (const k of [c.label, ...(c.keywords ?? [])].map((x) => x.toLowerCase())) {
        if (seen.has(k) && seen.get(k) !== c.id) shared.push(`${k}: ${seen.get(k)} / ${c.id}`);
        seen.set(k, c.id);
      }
    expect(shared).toEqual([]);
  });
});
