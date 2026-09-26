import { describe, expect, it } from "vitest";
import { emptyConsultation, emptyDossier } from "./dossier";
import { buildBrief, buildIsbar, isbarText } from "./isbar";

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

  it("gives the gases of the plan, at the patient's age", () => {
    const c = emptyConsultation();
    c.patient = { ...c.patient, age: 80 };
    const d = emptyDossier("CD", c);
    d.plan = { ...d.plan, techniques: ["general"], gases: { agent: "sevoflurane", carrier: "air", fio2: [0.4, 0.5], mac: [0.7, 1], freshGasLMin: 1 } };
    // MAC sevoflurane at 80 years: 1.8 × 10^(−0.00269 × 40) ≈ 1.40 %.
    expect(buildBrief(d, "2026-10-01T11:05:00Z")[2].lines).toContain("Gaz : Sévoflurane CAM 0,7–1 (Fet 1,0–1,4 %), air/O₂ FiO₂ 40–50 %, 1 L/min");
    expect(buildIsbar(d, "2026-10-01T11:05:00Z")[1].lines.join(" ")).toContain("Gaz : Sévoflurane");
    d.plan = { ...d.plan, techniques: ["neuraxial"] };
    expect(buildBrief(d, "2026-10-01T11:05:00Z")[2].lines.join(" ")).not.toContain("Gaz");
  });
});
