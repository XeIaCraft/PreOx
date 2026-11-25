import { describe, expect, it } from "vitest";
import { emptyDossier, type Dossier } from "./dossier";
import { applyChanges, habitSuggestions, planChanges, variantName } from "./plan-habits";
import { emptyProtocolContent, type Protocol, type ProtocolContent } from "./protocols";
import { newDrug } from "./test-helpers";

const base: ProtocolContent = {
  ...emptyProtocolContent(),
  techniques: ["general"],
  drugs: [newDrug({ name: "Propofol", amount: 2, unit: "mg", doseMode: "per_kg", phase: "induction" }), newDrug({ name: "Céfazoline", amount: 2, unit: "g", phase: "induction" })],
  postop: ["Paracétamol 1 g/6 h"],
};
const protocol: Protocol = { id: "p1", name: "Cholécystectomie", surgery: "Cholécystectomie", operation_category: "D", hospital: "", content: base, source: "", created_at: "", updated_at: "" };

let n = 0;
function use(change: (c: ProtocolContent) => ProtocolContent): Dossier {
  const d = emptyDossier("AB");
  n++;
  return { ...d, status: "prepared", protocolId: "p1", protocolName: "Cholécystectomie", planBase: structuredClone(base), plan: change(structuredClone(base)), updatedAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00Z` };
}
const addDexa = (c: ProtocolContent) => ({ ...c, drugs: [...c.drugs, newDrug({ name: "Dexaméthasone", amount: 8, unit: "mg", phase: "induction" })] });
const addTap = (c: ProtocolContent) => ({ ...c, techniques: [...c.techniques, "deep_block" as const], postop: [...c.postop, "Cathéter TAP"] });
const same = (c: ProtocolContent) => c;

describe("plan habits", () => {
  it("lists the changes and applies them back", () => {
    const changes = planChanges(base, addTap(addDexa(base)));
    expect(changes.map((c) => c.label)).toEqual(["Technique ajoutée : bloc profond", "Ajout : Dexaméthasone 8 mg", "Post-op ajouté : Cathéter TAP"]);
    const applied = applyChanges(base, changes);
    expect(planChanges(applied, addTap(addDexa(base)))).toEqual([]);
    // A changed dose: the old one out, the new one in.
    const dose = { ...base, drugs: [{ ...base.drugs[1], amount: 3 }, base.drugs[0]] };
    expect(planChanges(base, dose).map((c) => c.label)).toEqual(["Dose modifiée : Céfazoline 3 g", "Retrait : Céfazoline 2 g"]);
  });

  it("changed once: nothing, the base plan stays", () => {
    expect(habitSuggestions(protocol, [use(addDexa), use(same), use(same), use(same)])).toEqual([]);
  });

  it("the same change almost every time: update the base plan", () => {
    const s = habitSuggestions(protocol, [use(addDexa), use(addDexa), use(addDexa), use(addDexa), use(same)]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "update", count: 4, total: 5 });
    expect(s[0].changes.map((c) => c.label)).toEqual(["Ajout : Dexaméthasone 8 mg"]);
  });

  it("recurring while the base plan is still used as it is: a variant", () => {
    const s = habitSuggestions(protocol, [use(addTap), use(same), use(addTap), use(same), use(addTap), use(same), use(same)]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "variant", count: 3, total: 7 });
    expect(variantName(protocol, s[0].changes)).toBe("Cholécystectomie — variante (+ bloc profond, Cathéter TAP)");
  });

  it("forgets what the protocol has taken over since, and what was set aside", () => {
    const dossiers = [use(addDexa), use(addDexa), use(addDexa)];
    const s = habitSuggestions(protocol, dossiers);
    expect(s).toHaveLength(1);
    expect(habitSuggestions({ ...protocol, content: applyChanges(base, s[0].changes) }, dossiers)).toEqual([]);
    expect(habitSuggestions(protocol, dossiers, new Set([s[0].id]))).toEqual([]);
  });
});
