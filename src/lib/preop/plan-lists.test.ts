import { describe, expect, it } from "vitest";
import { bodySurface, haemodynamics, monitoringFor } from "./monitoring";
import { crisesOf, restored, templateOf, withChange, withoutItem, monitoringOf, planListsSchema, positionsOf, pumpsOf, riskLibraryOf } from "./plan-lists";
import { RISK_LIBRARY } from "./plan-catalog";
import { suggestedRisks } from "./plan-catalog";
import { crises } from "./crises";
import { alarmSettings, predictedWeight, ventilationSettings } from "./ventilation";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("fiches de monitorage", () => {
  it("retrouve les fiches d'après les lignes du plan", () => {
    const found = ids(monitoringFor(["Swan-Ganz : PAPO 8–12 mmHg", "SvO₂ > 65 %", "Cathéter artériel radial", "PAM ≥ 65 mmHg"]));
    expect(found).toEqual(expect.arrayContaining(["swan", "scvo2", "arterial", "nibp"]));
  });

  it("ne confond pas des mots proches", () => {
    expect(ids(monitoringFor(["Transport vers la salle de réveil"]))).not.toContain("spo2");
    expect(ids(monitoringFor(["Étomidate 0,3 mg/kg"]))).not.toContain("tee");
    expect(ids(monitoringFor(["Précautions contact"]))).not.toContain("act");
    expect(ids(monitoringFor(["PiCCO"]))).not.toContain("icp");
  });

  it("calcule RVS, RVP et index cardiaque", () => {
    // RVS = 80 × (PAM − PVC) / DC ; RVP = 80 × (PAPm − PAPO) / DC
    expect(haemodynamics({ map: 85, cvp: 5, mpap: 20, pawp: 10, co: 5, bsa: 2 })).toEqual({ svr: 1280, pvr: 160, pvrWood: 2, ci: 2.5 });
    expect(haemodynamics({ map: 85 })).toEqual({});
    expect(bodySurface(70, 170)).toBeCloseTo(1.82, 2);
  });
});

describe("listes personnelles", () => {
  it("garde les défauts et applique ajout, modification et masquage", () => {
    const [first, second] = monitoringOf({});
    let c = withChange(undefined, { ...first, label: "ECG 5 brins" }, true);
    c = withoutItem(c, second.id, true);
    c = withChange(c, { ...first, id: "mine", label: "Mon moniteur" }, false);
    const list = monitoringOf({ monitoring: c });
    expect(list[0].label).toBe("ECG 5 brins");
    expect(ids(list)).not.toContain(second.id);
    expect(list.at(-1)!.id).toBe("mine");
    expect(monitoringOf({ monitoring: restored(c, second.id) }).some((m) => m.id === second.id)).toBe(true);
  });

  it("une procédure d'urgence modifiée recalcule les doses au poids du patient", () => {
    const t = templateOf(crises().find((c) => c.id === "anaphylaxis")!);
    const edited = { ...t, title: "Anaphylaxie (service)" };
    const [c70] = crisesOf({ crises: withChange(undefined, edited, true) }, { weightKg: 70 }).filter((c) => c.id === "anaphylaxis");
    const [c20] = crisesOf({ crises: withChange(undefined, edited, true) }, { weightKg: 20 }).filter((c) => c.id === "anaphylaxis");
    expect(c70.title).toBe("Anaphylaxie (service)");
    const doses70 = c70.steps.filter((s) => s.dose?.spec?.kind === "perKg").map((s) => s.dose!.dose);
    const doses20 = c20.steps.filter((s) => s.dose?.spec?.kind === "perKg").map((s) => s.dose!.dose);
    expect(doses70.length).toBeGreaterThan(0);
    expect(doses70).not.toEqual(doses20);
    // Les doses d'origine au même poids sont retrouvées
    const original = crises({ weightKg: 70 }).find((c) => c.id === "anaphylaxis")!;
    expect(c70.steps.map((s) => s.dose?.dose)).toEqual(original.steps.map((s) => s.dose?.dose));
  });

  it("bibliothèque de risques : ajout, modification, masquage, proposition", () => {
    const mine = { id: "u-risk-x", title: "Garrot prolongé", words: ["garrot"], conduct: "Relâcher 10 min toutes les 2 h" };
    let c = withChange(undefined, mine, false);
    c = withChange(c, { ...RISK_LIBRARY[0], conduct: "Ma conduite" }, true);
    c = withoutItem(c, RISK_LIBRARY[1].id, true);
    const lib = riskLibraryOf({ risks: c });
    expect(lib.find((r) => r.id === RISK_LIBRARY[0].id)!.conduct).toBe("Ma conduite");
    expect(lib.some((r) => r.id === RISK_LIBRARY[1].id)).toBe(false);
    expect(suggestedRisks("prothèse de genou sous garrot", [], lib).map((r) => r.id)).toContain("u-risk-x");
    expect(planListsSchema.safeParse({ risks: c }).success).toBe(true);
  });

  it("positions et pompes : défauts de PreOx ou les vôtres", () => {
    expect(positionsOf({}).length).toBeGreaterThan(5);
    const pumps = { pcea: { solution: "Ropivacaïne 0,1 % + sufentanil 0,5 µg/mL", rateMlH: 8, bolusMl: 5, lockoutMin: 30 } };
    expect(pumpsOf({ pumps }).pcea.rateMlH).toBe(8);
    expect(pumpsOf({ pumps }).perineural.solution).toMatch(/Ropivacaïne/);
    expect(planListsSchema.safeParse({ positions: [{ label: "Décubitus latéral", hint: "Billot" }], pumps }).success).toBe(true);
  });

  it("chaque procédure par défaut passe la validation une fois modifiée", () => {
    const edited = Object.fromEntries(crises().map((c) => [c.id, templateOf(c)]));
    expect(planListsSchema.safeParse({ crises: { added: [], edited, hidden: [] }, monitoring: { added: [], edited: Object.fromEntries(monitoringOf({}).map((m) => [m.id, m])), hidden: [] } }).success).toBe(true);
  });
});

describe("réglages du respirateur et alarmes", () => {
  it("volume courant sur le poids idéal, pas le poids réel", () => {
    const p = { age: 50, sex: "M" as const, heightCm: 175, weightKg: 130 };
    const w = predictedWeight(p)!;
    expect(w).toBeGreaterThan(65);
    expect(w).toBeLessThan(75);
    const vt = ventilationSettings(p).find((l) => l.label === "Volume courant")!;
    expect(vt.value).toMatch(/^(4|5)\d0–(5|6)\d0 mL$/);
    expect(vt.why).toContain("pas le poids réel");
    expect(ventilationSettings(p).find((l) => l.label === "PEP")!.value).toBe("8–10 cmH₂O");
  });

  it("unipulmonaire, obstructif, HTIC", () => {
    const p = { age: 60, sex: "F" as const, heightCm: 160, copd: true, raisedIcp: true };
    const one = ventilationSettings(p, { oneLung: true });
    expect(one[0].label).toContain("unipulmonaire");
    expect(one.find((l) => l.label === "I:E")!.value).toBe("1:3 à 1:4");
    expect(one.find((l) => l.label === "EtCO₂ visée")!.value).toBe("35–40 mmHg");
    expect(alarmSettings(p).find((a) => a.label === "SpO₂")!.low).toBe("88 %");
  });

  it("alarmes tensionnelles sur la PA de base", () => {
    const a = alarmSettings({ age: 70, sbp: 160, dbp: 90, hr: 80 });
    // PAM de base ≈ 113 : borne basse 90 (−20 %), jamais < 65
    expect(a.find((l) => l.label === "PAM")!.low).toBe("90 mmHg");
    expect(alarmSettings({ age: 30, sbp: 90, dbp: 50 }).find((l) => l.label === "PAM")!.low).toBe("65 mmHg");
    expect(alarmSettings({ age: 70, hr: 70, coronary: true }).find((l) => l.label === "FC")!.high).toBe("100/min");
  });

  it("enfant : normes selon l'âge et poids pour l'âge", () => {
    expect(predictedWeight({ age: 4 })).toBe(16);
    const a = alarmSettings({ age: 0.5 });
    expect(a.find((l) => l.label === "FC")!.low).toBe("100/min");
    expect(ventilationSettings({ age: 4, weightKg: 16 }).find((l) => l.label === "Fréquence")!.value).toBe("20–25/min");
  });
});
