import { describe, expect, it } from "vitest";
import { effectWindow, kineticsFor } from "./kinetics";
import { WAKE_CE, decrementTime } from "./tci";
import { macReduction, propofolForLaryngoscopy, remifentanilEquivalent, sevofluraneIsobole } from "./isoboles";
import { airwayPlan } from "./airway-plan";
import type { ScoreResult } from "./scores";
import { emptyConsultation, emptyDossier } from "./dossier";
import { buildRecovery } from "./isbar";
import { DEFAULT_CHECKLIST } from "./checklist";
import { checklistOf, planListsSchema } from "./plan-lists";

const score = (level: ScoreResult["level"], value = 0): ScoreResult => ({ value, missing: 0, label: "", level });

describe("pharmacocinétique", () => {
  it("reconnaît le produit (nom commercial, mot le plus long)", () => {
    expect(kineticsFor("Rocuronium 50 mg")?.name).toBe("Rocuronium");
    expect(kineticsFor("Dipidolor 3 mg")?.name).toBe("Piritramide");
    expect(kineticsFor("Ultiva AIVOC")?.name).toBe("Rémifentanil");
    expect(kineticsFor("Sérum physiologique")).toBeUndefined();
  });

  it("fenêtre d'effet après une dose", () => {
    const w = effectWindow(kineticsFor("rocuronium")!, "2026-10-01T08:00:00Z");
    expect(w).not.toBeNull();
    expect(Date.parse(`2026-10-01T${w!.to}:00`) - Date.parse(`2026-10-01T${w!.from}:00`)).toBe(10 * 60_000);
  });

  it("réveil : le rémifentanil reste court quelle que soit la durée, le propofol s'allonge", () => {
    const p = { age: 45, sex: "M" as const, weightKg: 75, heightCm: 178 };
    const remi1 = decrementTime("remifentanil", p, 4, 60, WAKE_CE.remifentanil.range[1])!;
    const remi8 = decrementTime("remifentanil", p, 4, 480, WAKE_CE.remifentanil.range[1])!;
    expect(remi8.minutes).toBeLessThan(10);
    expect(remi8.minutes - remi1.minutes).toBeLessThan(2);
    const half1 = decrementTime("propofol", p, 3, 60, 1.5)!;
    const half8 = decrementTime("propofol", p, 3, 480, 1.5)!;
    expect(half8.minutes).toBeGreaterThan(half1.minutes);
    expect(half1.minutes).toBeGreaterThan(3);
    expect(half1.minutes).toBeLessThan(25);
    expect(decrementTime("propofol", { age: 45 }, 3, 60, 1.5)).toBeNull();
  });
});

describe("isoboles", () => {
  it("la CAM est divisée par deux aux concentrations de Lang 1996", () => {
    expect(macReduction("fentanyl", 1.67)).toBeCloseTo(0.5, 2);
    expect(macReduction("remifentanil", 1.37)).toBeCloseTo(0.5, 2);
    expect(macReduction("sufentanil", 0.14)).toBeCloseTo(0.5, 2);
    expect(remifentanilEquivalent("sufentanil", 0.14)).toBeCloseTo(1.37, 2);
  });

  it("plafond de la réduction ; la CAM-réveil baisse peu", () => {
    const s = sevofluraneIsobole(40, "fentanyl", 12)!;
    expect(s.reduction).toBeCloseTo(0.8, 2);
    expect(s.fetAwake / (s.mac * 0.34)).toBeCloseTo(0.76, 2);
  });

  it("moins de propofol avec plus de rémifentanil, jamais sous 1,5 µg/mL", () => {
    expect(propofolForLaryngoscopy(4)[1]).toBeLessThan(propofolForLaryngoscopy(1)[0]);
    expect(propofolForLaryngoscopy(20)[0]).toBeGreaterThanOrEqual(1.5);
  });
});

describe("plan voies aériennes", () => {
  const base = { laryngoscopy: score("low"), mask: score("low"), conditions: new Set<string>() };
  it("standard sans prédicteur", () => {
    expect(airwayPlan(base).level).toBe("routine");
  });
  it("difficulté anticipée : vidéolaryngoscope d'emblée", () => {
    const p = airwayPlan({ ...base, laryngoscopy: score("high", 6) });
    expect(p.level).toBe("anticipated");
    expect(p.planA[0]).toMatch(/Vidéolaryngoscope d'emblée/);
    expect(p.material).toContain("Chariot d'intubation difficile");
  });
  it("intubation vigile si laryngoscopie et masque difficiles", () => {
    expect(airwayPlan({ ...base, laryngoscopy: score("high", 7), mask: score("high", 3) }).level).toBe("awake");
    expect(airwayPlan({ ...base, conditions: new Set(["head_neck_radiotherapy"]) }).level).toBe("awake");
  });
  it("estomac plein : séquence rapide", () => {
    const p = airwayPlan({ ...base, emergency: true });
    expect(p.strategy[0]).toMatch(/Séquence rapide/);
  });
});

describe("transmission SSPI en 10 étapes", () => {
  it("suit l'ordre du CHU et signale ce qui manque", () => {
    const c = emptyConsultation();
    c.patient = { ...c.patient, sex: "F", age: 62, weightKg: 70, noKnownAllergy: true, hb: 12.1 };
    c.surgery = { ...c.surgery, name: "Prothèse totale de hanche", side: "gauche" };
    const d = emptyDossier("CD", c);
    d.plan = { ...d.plan, techniques: ["general"] };
    d.intraop = { ...d.intraop, given: [{ id: "g", name: "Rocuronium", phase: "induction", route: "bolus_iv", dose: "40 mg", at: "2026-10-01T08:00:00Z" }] };
    d.transmission = { ...d.transmission, receiver: "Infirmière SSPI", stability: "stable", steps: { bracelet: true } };
    const s = buildRecovery(d, "2026-10-01T10:00:00Z");
    expect(s.map((x) => x.key)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(s[1].lines).toEqual(["Infirmière SSPI"]);
    expect(s[3].lines[0]).toBe("Patient stable");
    expect(s[4].lines.join(" ")).toContain("✓ Identité vérifiée sur le bracelet");
    expect(s[4].lines.join(" ")).toContain("côté gauche");
    expect(s[6].missing.join(" ")).toMatch(/TOF/);
    expect(s[7].lines.join(" ")).toContain("Hb 12.1");
    expect(s[9].lines[0]).toMatch(/^☐/);
  });
});

describe("check-list", () => {
  it("liste par défaut et remplacement validé", () => {
    expect(checklistOf({})).toBe(DEFAULT_CHECKLIST);
    expect(DEFAULT_CHECKLIST.daily).toHaveLength(8);
    expect(DEFAULT_CHECKLIST.perCase).toHaveLength(9);
    expect(planListsSchema.safeParse({ checklist: { daily: [{ id: "a", label: "Gaz" }], perCase: [] } }).success).toBe(true);
  });
});
