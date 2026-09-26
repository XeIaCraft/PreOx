import { describe, expect, it } from "vitest";
import { SURGERY_CATALOG } from "./surgeries";
import { EXISTING_FAMILIES, EXISTING_SPECIFICS } from "./surgeries-variants";
import { fold } from "./catalog";
import { searchSurgeries, surgeryVariants } from "./surgery-search";
import { prospectFor, prospectLinkedIds } from "./prospect";
import { erasFor, erasLinkedIds } from "./eras";
import type { SurgeryItem } from "./catalog";

const items = SURGERY_CATALOG as SurgeryItem[];

describe("catalogue of interventions: approaches, children, sex", () => {
  it("unique ids, approach derived from the name", () => {
    expect(new Set(items.map((s) => s.id)).size).toBe(items.length);
    expect(items.find((s) => s.id === "prostatectomie-radicale-robot-assistee")!.approach).toBe("robotic");
    expect(items.find((s) => s.id === "hysterectomie-par-c-lioscopie-ou-robot")!.approach).toBe("laparoscopic");
    expect(items.find((s) => s.id === "fracture-du-col-du-femur")!.sex).toBeUndefined();
    expect(items.find((s) => s.id === "embolisation-uterine-ou-prostatique")!.sex).toBeUndefined();
    expect(items.find((s) => s.id === "cure-de-prolapsus-rectal-par-voie-perineale")!.sex).toBeUndefined();
    expect(items.find((s) => s.id === "cure-de-prolapsus-par-voie-vaginale")!.sex).toBe("F");
  });
  it("families and specifics point at real entries, no near-duplicate names", () => {
    const ids = new Set(items.map((s) => s.id));
    const missing = [...Object.values(EXISTING_FAMILIES).flat(), ...Object.keys(EXISTING_SPECIFICS)].filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
    const names = new Map<string, string>();
    const dupes: string[] = [];
    for (const s of items) {
      const k = fold(s.name).replace(/[^a-z0-9]/g, "");
      if (names.has(k)) dupes.push(s.name);
      names.set(k, s.name);
    }
    expect(dupes).toEqual([]);
  });
  it("finds a variant by everyday words, for the patient", () => {
    expect(searchSurgeries(items, "colectomie coelio")[0].name).toBe("Colectomie par cœlioscopie");
    expect(searchSurgeries(items, "nephrectomie partielle robot")[0].name).toBe("Néphrectomie partielle robot-assistée");
    expect(searchSurgeries(items, "hernie inguinale", { age: 4 })[0].population).toBe("child");
    expect(searchSurgeries(items, "hernie inguinale", { age: 50 })[0].population).toBeUndefined();
    expect(searchSurgeries(items, "hysterectomie", { sex: "M" })).toEqual([]);
    expect(searchSurgeries(items, "prostatectomie", { sex: "F" }).filter((s) => s.name.startsWith("Prostatectomie"))).toEqual([]);
  });
  it("offers the other approaches of the same operation", () => {
    const v = surgeryVariants(items, { catalogId: "nephrectomie-partielle" }).map((x) => x.name);
    expect(v).toEqual(expect.arrayContaining(["Néphrectomie partielle robot-assistée", "Néphrectomie partielle par cœlioscopie", "Néphrectomie partielle par lombotomie"]));
  });
  it("children and newborns carry their specifics", () => {
    const pectus = items.find((s) => s.id === "correction-de-pectus-excavatum-nuss")!;
    expect(pectus.population).toBe("child");
    expect(pectus.specifics!.some((x) => x.startsWith("Enfant"))).toBe(true);
  });
});

describe("PROSPECT links", () => {
  it("every linked id exists in the catalogue", () => {
    const ids = new Set(items.map((s) => s.id));
    for (const id of prospectLinkedIds()) expect(ids.has(id), id).toBe(true);
  });
  it("finds the recommendation of an intervention and of its family", () => {
    expect(prospectFor(items.find((s) => s.id === "prothese-totale-de-hanche"))!.year).toBe(2026);
    expect(prospectFor(items.find((s) => s.id === "prostatectomie-radicale-robot-assistee"))!.id).toBe("prostatectomy");
    expect(prospectFor(items.find((s) => s.id === "amygdalectomie-de-l-enfant"))!.id).toBe("tonsillectomy");
  });
  it("ERAS guidelines point at real entries and follow the family", () => {
    const ids = new Set(items.map((s) => s.id));
    expect(erasLinkedIds().filter((id) => !ids.has(id))).toEqual([]);
    const get = (id: string) => items.find((s) => s.id === id)!;
    expect(erasFor(get("sigmoidectomie-par-c-lioscopie")).map((g) => g.id)).toEqual(["colorectal"]);
    expect(erasFor(get("hepatectomie-robot-assistee")).map((g) => g.id)).toEqual(["liver"]);
    expect(erasFor(get("cesarienne-programmee")).map((g) => g.id)).toEqual(["caesarean"]);
    expect(erasFor(get("atresie-de-l-sophage")).map((g) => g.id)).toEqual(["neonatal"]);
    expect(erasFor(get("prothese-totale-de-genou-robot-assistee")).map((g) => g.id)).toEqual(["hip_knee"]);
    expect(erasFor(get("cataracte"))).toEqual([]);
  });
});
