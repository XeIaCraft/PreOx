import { describe, expect, it } from "vitest";
import { emptyConsultation } from "./dossier";
import { chronicPainRisk } from "./chronic-pain";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";

describe("douleur chronique postopératoire : drapeaux", () => {
  it("rien à signaler chez un homme de 60 ans pour une chirurgie banale", () => {
    const c = emptyConsultation();
    c.patient = { age: 60, sex: "M" };
    c.surgery = { ...c.surgery, name: "Cholécystectomie cœlioscopique" };
    expect(chronicPainRisk(c).level).toBe("low");
  });

  it("jeune femme seule : pas d'alerte ; avec une mastectomie : à surveiller", () => {
    const c = emptyConsultation();
    c.patient = { age: 35, sex: "F" };
    const r = chronicPainRisk(c);
    expect(r.flags.find((f) => f.flag.id === "young_female")!.present).toBe(true);
    expect(r.level).toBe("low");
    c.surgery = { ...c.surgery, name: "Mastectomie gauche avec curage axillaire" };
    const m = chronicPainRisk(c);
    expect(m.level).toBe("high");
    expect(m.surgeryRate).toContain("sein");
  });

  it("déduit opioïdes, douleur chronique et anxiété ; une coche manuelle l'emporte", () => {
    const c = emptyConsultation();
    c.patient = { age: 55, sex: "M" };
    c.conditions = { chronic_pain: { present: true }, anxiety: { present: true } };
    c.treatments = [{ id: "t", atc: "N02AX02", name: "Tramadol" }];
    const r = chronicPainRisk(c);
    expect(r.red).toBe(2);
    expect(r.yellow).toBe(1);
    expect(r.level).toBe("high");
    expect(r.prevention.join(" ")).toMatch(/kétamine/);
    c.painFlags = { long_term_opioids: false, sleep: true };
    const m = chronicPainRisk(c);
    expect(m.flags.find((f) => f.flag.id === "long_term_opioids")!.present).toBe(false);
    expect(m.flags.find((f) => f.flag.id === "sleep")!.present).toBe(true);
  });

  it("devient un point d'attention", () => {
    const c = emptyConsultation();
    c.patient = { age: 40, sex: "F" };
    c.surgery = { ...c.surgery, name: "Thoracotomie pour lobectomie" };
    const p = attentionPoints(c, consultationScores(c)).find((x) => x.id === "chronic-postop-pain");
    expect(p?.level).toBe("medium");
    expect(p?.detail).toMatch(/complication/);
  });
});
