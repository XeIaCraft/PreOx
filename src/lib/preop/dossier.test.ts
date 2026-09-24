import { describe, expect, it } from "vitest";
import { computeDose, doseBasis, type ProtocolDrug } from "./protocols";
import { emptyDossier, upgradeDossier, type Dossier } from "./dossier";
import { durationTimers, fluidBalance, lastDoses, redoseTimers, tourniquet } from "./intraop";
import { buildIsbar, isbarText } from "./isbar";

const drug = (p: Partial<ProtocolDrug>): ProtocolDrug => ({
  id: "d",
  name: "X",
  route: "bolus_iv",
  phase: "induction",
  doseMode: "per_kg",
  amount: 2,
  unit: "mg",
  weightBasis: "total",
  maxAmount: null,
  redoseEveryMin: null,
  note: "",
  ...p,
});

describe("doses", () => {
  const body = { sex: "M" as const, weightKg: 88, heightCm: 176 };
  it("computes per-kilo doses on the chosen weight, caps them, explains how", () => {
    expect(computeDose(drug({ amount: 2 }), body)).toEqual({ value: 176, unit: "mg", basisKg: 88, capped: false });
    // ideal weight 71.5 kg × 0.6 = 42.9 → 43
    expect(computeDose(drug({ amount: 0.6, weightBasis: "ideal" }), body)).toMatchObject({ value: 43, basisKg: 71.5 });
    expect(computeDose(drug({ amount: 3, maxAmount: 200 }), body)).toMatchObject({ value: 200, capped: true });
    expect(computeDose(drug({ doseMode: "fixed", amount: 2, unit: "g" }), {})).toMatchObject({ value: 2, unit: "g", basisKg: null });
    expect(computeDose(drug({ weightBasis: "lean" }), { weightKg: 88 })).toBeNull();
    expect(doseBasis(drug({ amount: 0.6, weightBasis: "ideal" }), computeDose(drug({ amount: 0.6, weightBasis: "ideal" }), body))).toBe("0,6 mg/kg × 71,5 kg (idéal)");
  });
});

function theatreDossier(): Dossier {
  const d = emptyDossier("dm");
  d.consultation.patient = { age: 72, sex: "M", weightKg: 88, heightCm: 176, allergies: "Aucune connue", history: "FA, DT2, HTA" };
  d.consultation.asa = 3;
  d.consultation.surgery = { ...d.consultation.surgery, name: "PTG", side: "droite", surgeon: "Dr X" };
  d.plan.techniques = ["neuraxial", "sedation"];
  d.plan.tourniquetAlertMin = 120;
  d.plan.drugs = [drug({ id: "cefa", name: "Céfazoline", phase: "antibio", doseMode: "fixed", amount: 2, unit: "g", redoseEveryMin: 240 })];
  const t = (h: number, m: number) => `2026-10-08T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
  d.intraop.events = [
    { id: "1", type: "room_in", at: t(8, 40), note: "" },
    { id: "2", type: "anaesthesia_start", at: t(8, 51), note: "" },
    { id: "3", type: "tourniquet_on", at: t(9, 5), note: "" },
    { id: "4", type: "incision", at: t(9, 12), note: "" },
    { id: "5", type: "tourniquet_off", at: t(10, 46), note: "" },
    { id: "6", type: "surgery_end", at: t(10, 48), note: "" },
  ];
  d.intraop.given = [
    { id: "g1", name: "Céfazoline", phase: "antibio", route: "bolus_iv", dose: "2 g", at: t(8, 45), planDrugId: "cefa" },
    { id: "g2", name: "Phényléphrine", phase: "haemodynamic", route: "bolus_iv", dose: "100 µg", at: t(9, 20) },
    { id: "g3", name: "Phényléphrine", phase: "haemodynamic", route: "bolus_iv", dose: "100 µg", at: t(9, 25) },
  ];
  d.intraop.fluids = [
    { id: "f1", category: "crystalloid", volumeMl: 1000, at: t(9, 0), note: "" },
    { id: "f2", category: "urine", volumeMl: 200, at: t(10, 0), note: "" },
    { id: "f3", category: "blood_loss", volumeMl: 250, at: t(10, 30), note: "" },
  ];
  d.intraop.complications = [{ id: "c1", type: "Hypotension prolongée", severity: "moderate", management: "phényléphrine", at: t(9, 20) }];
  return d;
}

describe("theatre", () => {
  const now = "2026-10-08T11:00:00.000Z";
  it("derives durations and the tourniquet total from the events", () => {
    const d = theatreDossier();
    expect(tourniquet(d, now)).toEqual({ totalMin: 101, currentSince: null });
    const timers = durationTimers(d, now);
    expect(timers.map((t) => [t.key, t.minutes])).toEqual([
      ["anaesthesia", 129],
      ["surgery", 96],
      ["tourniquet", 101],
    ]);
    // Still inflated at 11:00 → alert past 120 min
    const inflated = { ...d, intraop: { ...d.intraop, events: d.intraop.events.filter((e) => e.type !== "tourniquet_off") } };
    expect(durationTimers(inflated, now).find((t) => t.key === "tourniquet")).toMatchObject({ minutes: 115, alert: false });
    expect(durationTimers(inflated, "2026-10-08T11:10:00.000Z").find((t) => t.key === "tourniquet")).toMatchObject({ alert: true });
  });

  it("re-dosing timer, last doses, fluid balance", () => {
    const d = theatreDossier();
    expect(redoseTimers(d, now)[0]).toMatchObject({ name: "Céfazoline", dueAt: "2026-10-08T12:45:00.000Z", remainingMin: 105 });
    expect(lastDoses(d, now).map((x) => [x.name, x.at.slice(11, 16)])).toEqual([
      ["Phényléphrine", "09:25"],
      ["Céfazoline", "08:45"],
    ]);
    expect(fluidBalance(d)).toMatchObject({ inMl: 1000, outMl: 450, balanceMl: 550 });
  });
});

describe("handover", () => {
  it("fills every ISBAR section from the dossier and lists what's missing", () => {
    const d = theatreDossier();
    const sections = buildIsbar(d, "2026-10-08T11:00:00.000Z");
    const get = (k: string) => sections.find((s) => s.key === k)!;
    expect(get("I").lines[0]).toBe("DM, homme, 72 ans, 88 kg, 176 cm");
    expect(get("I").missing).toEqual([]);
    expect(get("S").lines.join(" ")).toContain("PTG (droite) — Dr X");
    expect(get("S").lines.join(" ")).toContain("garrot (total) 1 h 41");
    expect(get("A").lines.join(" ")).toContain("bilan +550 mL");
    expect(get("A").lines.join(" ")).toContain("Hypotension prolongée (modérée)");
    expect(get("A").missing).toEqual(["Dernières constantes", "Score de douleur"]);
    expect(get("R").missing).toEqual(["Destination", "Prescriptions post-opératoires (analgésie, NVPO…)", "Critères d'appel"]);
    expect(isbarText(d, sections)).toContain("R — Recommandations");
  });

  it("old dossiers get the fields added since", () => {
    const old = { ...emptyDossier("ab"), intraop: { events: [] } } as unknown as Dossier;
    expect(upgradeDossier(old).intraop.fluids).toEqual([]);
  });
});
