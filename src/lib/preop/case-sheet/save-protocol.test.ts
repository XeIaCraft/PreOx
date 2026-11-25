import { describe, expect, it } from "vitest";
import { emptyProtocolContent, type Protocol, type ProtocolDrug } from "../protocols";
import { planForLibrary } from "./save-protocol";

const drug = (id: string, name: string, phase: ProtocolDrug["phase"] = "induction"): ProtocolDrug => ({ id, name, route: "bolus_iv", phase, doseMode: "fixed", amount: 1, unit: "mg", weightBasis: "total", maxAmount: null, redoseEveryMin: null, note: "" });
const base = (content = emptyProtocolContent()): Protocol => ({ id: "p", name: "Prothèse", surgery: "PTH", operation_category: "", hospital: "", content, source: "", created_at: "", updated_at: "" });

describe("an adapted plan saved in the library", () => {
  it("takes off what the patient's antecedents added, keeps what was changed", () => {
    const own = { ...emptyProtocolContent(), material: ["Garrot"], risks: [{ title: "Saignement", conduct: "Acide tranexamique" }] };
    const plan = { ...own, material: ["Garrot", "Échographe", "Matelas chauffant"], risks: [...own.risks, { title: "Voie aérienne difficile", conduct: "Vidéolaryngoscope" }] };
    const out = planForLibrary(plan, base(own), null, { material: ["Échographe"], risks: ["Voie aérienne difficile"] });
    expect(out.material).toEqual(["Garrot", "Matelas chauffant"]);
    expect(out.risks.map((r) => r.title)).toEqual(["Saignement"]);
  });

  it("puts back the drugs of the techniques the sheet left out", () => {
    const full = { ...emptyProtocolContent(), techniques: ["general", "neuraxial"] as never, drugs: [drug("a", "Propofol"), drug("b", "Bupivacaïne", "alr")] };
    const reduced = { ...full, techniques: ["general"] as never, drugs: [drug("a", "Propofol")] };
    const plan = { ...reduced, drugs: [{ ...drug("a", "Propofol"), amount: 2 }, drug("c", "Kétamine")] };
    const out = planForLibrary(plan, base(full), reduced, { material: [], risks: [] });
    expect(out.drugs.map((d) => d.id)).toEqual(["a", "c", "b"]);
    expect(out.drugs[0].amount).toBe(2);
    expect(out.techniques).toEqual(["general", "neuraxial"]);
  });
});

describe("a variant saved from a sheet", () => {
  it("never takes the place of the protocol it comes from when the intervention is matched", async () => {
    const { matchProtocol } = await import("../protocols");
    const { REFERENCE_PROTOCOLS } = await import("../reference-protocols");
    const ref = { ...REFERENCE_PROTOCOLS[0], created_at: "", updated_at: "" } as Protocol;
    const variant: Protocol = { ...ref, id: "v", name: `${ref.name} — variante`, source: `Variante de « ${ref.name} »` };
    const item = { name: ref.surgery, category: ref.operation_category };
    expect(matchProtocol([variant, ref], item, "")?.id).toBe(ref.id);
    expect(matchProtocol([ref, variant], item, "")?.id).toBe(ref.id);
  });
});
