import { describe, expect, it } from "vitest";
import { emptyConsultation, emptyDossier } from "./dossier";
import { buildBrief, isbarText } from "./isbar";

describe("short handover", () => {
  it("says who, why (with the history), how it went, what is planned, then the antecedents", () => {
    const c = emptyConsultation();
    c.patient = { ...c.patient, sex: "M", age: 58, weightKg: 80, heightCm: 178, noKnownAllergy: true };
    c.surgery = { ...c.surgery, name: "Néphrectomie partielle", side: "droite", indication: "Masse rénale droite de 3 cm, découverte fortuite." };
    c.conditions = { hypertension: { present: true } };
    const d = emptyDossier("AB", c);
    d.plan = { ...d.plan, techniques: ["general"], postop: ["Paracétamol 1 g × 4", "HBPM à J1"] };
    d.intraop = {
      ...d.intraop,
      airwayDevice: "sonde 7,5",
      cormack: "1",
      events: [
        { id: "1", type: "anaesthesia_start", at: "2026-10-01T08:00:00Z", note: "" },
        { id: "2", type: "room_out", at: "2026-10-01T11:00:00Z", note: "" },
      ],
      fluids: [
        { id: "f1", category: "crystalloid", volumeMl: 1500, at: "2026-10-01T09:00:00Z", note: "" },
        { id: "f2", category: "urine", volumeMl: 240, at: "2026-10-01T10:30:00Z", note: "" },
      ],
    };
    d.transmission = { ...d.transmission, destination: "uspa" };
    const s = buildBrief(d, "2026-10-01T11:05:00Z");
    expect(s.map((x) => x.title)).toEqual(["Qui", "Pourquoi il est là", "Comment ça s'est passé", "Ce qu'on prévoit", "Antécédents"]);
    expect(s[0].lines[0]).toContain("58 ans");
    expect(s[1].lines.join(" ")).toContain("Masse rénale droite");
    expect(s[2].lines.join(" ")).toContain("Cormack 1");
    expect(s[2].lines.join(" ")).toContain("diurèse 240 mL (1 mL/kg/h)");
    expect(s[3].lines).toEqual(expect.arrayContaining(["Salle de réveil (USPA)", "Paracétamol 1 g × 4"]));
    expect(s[4].lines.join(" ")).toMatch(/HTA/i);
    expect(isbarText(d, s)).toContain("3 — Comment ça s'est passé");
  });
});
