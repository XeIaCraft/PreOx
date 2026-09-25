import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "./quick-entry";
import { DEFAULT_CATALOGS } from "./catalog-defaults";

describe("quick entry", () => {
  it("splits a dictated sentence into antecedents, treatments, allergies and substance use", () => {
    const r = parseQuickEntry(
      "HTA mal contrôlée, diabète de type 2 sous metformine 850 mg 2x/j, stent en 2021 sous Asaflow, SAOS appareillé, allergie à la pénicilline, fumeur 20 PA, 2 verres de vin par jour, prothèse de hanche 2019",
      DEFAULT_CATALOGS
    );
    expect(r.conditions.map((c) => `${c.id}${c.qualifiers.length ? `:${c.qualifiers.join("+")}` : ""}`)).toEqual(expect.arrayContaining(["hypertension:poorlyControlled", "diabetes_oral", "coronary", "osa"]));
    expect(r.treatments.map((t) => [t.name, t.dailyDoseMg])).toEqual([
      ["Metformine", 1700],
      ["Acide acétylsalicylique", undefined],
    ]);
    expect(r.allergies).toMatchObject([{ allergenId: "betalactams" }]);
    expect(r.substances).toMatchObject({ tobacco: "current", packYears: 20, alcoholUnitsPerWeek: 14 });
    // A known procedure with a year is a past operation.
    expect(r.surgicalHistory).toEqual(["prothèse de hanche 2019"]);
    expect(r.unknown).toEqual([]);
  });

  it("doesn't take short words for acronyms, knows former smokers and free allergies", () => {
    const r = parseQuickEntry("ex-fumeur, allergique aux fraises, il a une IC", DEFAULT_CATALOGS);
    expect(r.substances.tobacco).toBe("former");
    expect(r.allergies).toEqual([{ label: "fraises", from: "allergique aux fraises" }]);
    expect(r.conditions.map((c) => c.id)).toEqual(["heart_failure"]);
    expect(parseQuickEntry("une ic légère", DEFAULT_CATALOGS).conditions).toEqual([]);
  });
});

describe("applying a quick entry", () => {
  it("adds what's kept without duplicating or removing", async () => {
    const { applyQuickEntry, selectAll } = await import("./quick-entry");
    const { emptyConsultation } = await import("./dossier");
    const base = { ...emptyConsultation(), treatments: [{ id: "x", atc: "A10BA02", name: "Metformine", dailyDoseMg: undefined as number | undefined }] };
    const r = parseQuickEntry("HTA, metformine, Xarelto 20 mg, allergie latex, ex-fumeur, vitiligo", DEFAULT_CATALOGS);
    const sel = new Set([...selectAll(r)].filter((k) => !k.startsWith("c:")));
    const next = applyQuickEntry(base, r, sel);
    expect(next.conditions.hypertension).toBeUndefined();
    expect(next.treatments.map((t) => [t.name, t.dailyDoseMg])).toEqual([
      ["Metformine", undefined],
      ["Rivaroxaban", 20],
    ]);
    expect(next.patient.allergyList).toEqual([{ allergenId: "latex", label: "Latex" }]);
    expect(next.substances.tobacco).toBe("former");
    expect(next.patient.history).toBe("vitiligo");
  });

  it("words starting with « al » are not the allergy abbreviation", () => {
    const r = parseQuickEntry("alcool 20 U/sem, Alzheimer, AL : pénicilline, allergique aux fraises", DEFAULT_CATALOGS);
    expect(r.allergies.map((a) => a.allergenId ?? a.label)).toEqual(["betalactams", "fraises"]);
    expect(r.conditions.map((c) => c.id)).toEqual(["cognitive"]);
    expect(r.substances.alcoholUnitsPerWeek).toBe(20);
  });

  it("recognises the added antecedents, combinations and cross-reactive allergies", () => {
    const r = parseQuickEntry("Janumet 2x/j, glaucome, TIH en 2020, allergique au kiwi, Mounjaro", DEFAULT_CATALOGS);
    expect(r.conditions.map((c) => c.id)).toEqual(["glaucoma", "hit_history"]);
    expect(r.treatments.map((t) => [t.atc, t.components])).toEqual([
      ["A10BD07", ["A10BH01", "A10BA02"]],
      ["A10BX16", ["A10BJ"]],
    ]);
    expect(r.allergies[0].allergenId).toBe("latex_fruits");
  });
});

describe("quick entry, spoken style", () => {
  it("keeps the allergy context across « et », prefers insulin-treated diabetes", () => {
    const r = parseQuickEntry("allergie à la pénicilline et au latex, diabète sous insuline", DEFAULT_CATALOGS);
    expect(r.allergies.map((a) => a.allergenId)).toEqual(["betalactams", "latex"]);
    expect(r.conditions.map((c) => c.id)).toEqual(["diabetes_insulin"]);
    expect(parseQuickEntry("diabète", DEFAULT_CATALOGS).conditions.map((c) => c.id)).toEqual(["diabetes_oral"]);
  });
});

const REPORT = `Consultation d'anesthésie du 12/09/2026
Madame X, 72 ans
Intervention prévue : prothèse totale de genou droit le 08/10/2026
Antécédents médicaux :
- HTA traitée
- Diabète de type 2 (HbA1c 7,8 % en août)
- FA paroxystique
- Pas de coronaropathie connue
- SAOS sévère appareillé
- Arthrose diffuse
Antécédents familiaux : diabète chez la mère
Antécédents chirurgicaux : cholécystectomie (2015, AG sans particularité), NVPO après cholécystectomie
Allergies : pénicilline (urticaire)
Traitement :
- Xarelto 20 mg 1x/j
- Bisoprolol 5 mg 1-0-0
- Metformine 1 g 2x/j
- Pantomed 40 mg le matin
- Dafalgan 1 g si besoin
- Crème hydratante
Habitudes : ex-fumeuse (20 PA)
Examen : PA 145/85 mmHg, FC 68/min, SpO2 95 %, poids 92 kg, taille 1,65 m. Mallampati II. Auscultation cardio-pulmonaire normale, pas de souffle.
Biologie : Hb 12,1 g/dl, plaquettes 245 000/mm3, INR 1,1, créatinine 97 µmol/l
Conclusion : ASA III`;

describe("pasting a report", () => {
  const r = parseQuickEntry(REPORT, DEFAULT_CATALOGS);

  it("reads it section by section, with negations and family history apart", () => {
    expect(r.document).toBe(true);
    expect(r.conditions.map((c) => c.id)).toEqual(["hypertension", "diabetes_oral", "arrhythmia", "osa", "ponv"]);
    expect(r.conditions.find((c) => c.id === "osa")?.details).toEqual({ ahi: "severe" });
    expect(r.conditions.find((c) => c.id === "arrhythmia")?.details).toEqual({ type: "paroxysmal" });
    expect(r.negated.map((c) => c.id)).toEqual(["coronary"]);
    expect(r.ignored).toEqual(["diabète chez la mère"]);
    expect(r.history).toEqual(["Arthrose diffuse"]);
    expect(r.surgicalHistory).toEqual(["cholécystectomie (2015, AG sans particularité)", "NVPO après cholécystectomie"]);
  });

  it("finds treatments by any Belgian brand, with the daily dose, and keeps the unknown ones as free text", () => {
    expect(r.treatments.map((t) => [t.name, t.dailyDoseMg])).toEqual([
      ["Rivaroxaban", 20],
      ["Bisoprolol", 5],
      ["Metformine", 2000],
      ["Pantoprazole", 40],
      ["Paracétamol", undefined],
    ]);
    expect(r.freeTreatments).toEqual(["Crème hydratante"]);
    expect(r.allergies).toMatchObject([{ allergenId: "betalactams", reaction: "urticaire" }]);
  });

  it("picks up values, exam, scores and the planned intervention", () => {
    const v = Object.fromEntries(r.values.map((x) => [x.key, x.value]));
    expect(v).toMatchObject({ sbp: 145, dbp: 85, hr: 68, spo2: 95, weightKg: 92, heightCm: 165, age: 72, hb: 12.1, platelets: 245, inr: 1.1, hba1c: 7.8 });
    expect(v.creatinineMgDl).toBeCloseTo(1.1, 1);
    expect(r.sex).toBe("F");
    expect(r.exam).toEqual({ heart: "normal", lungs: "normal" });
    expect([r.asa, r.mallampati]).toEqual([3, 2]);
    expect(r.surgery).toMatchObject({ id: "prothese-totale-de-genou", side: "droit", plannedAt: "2026-10-08T08:00" });
  });

  it("applies everything recognised, never over an answer already given, and marks what is absent", async () => {
    const { applyQuickEntry } = await import("./quick-entry");
    const { emptyConsultation } = await import("./dossier");
    const base = { ...emptyConsultation(), patient: { age: 73 }, conditions: { arrhythmia: { present: true, details: { type: "permanent" } } } };
    const next = applyQuickEntry(base, r);
    expect(next.patient.age).toBe(73);
    expect(next.patient.sbp).toBe(145);
    expect(next.conditions.coronary).toEqual({ present: false });
    expect(next.conditions.arrhythmia?.details).toEqual({ type: "permanent" });
    expect(next.conditions.osa).toMatchObject({ present: true, details: { ahi: "severe" } });
    expect(next.treatments.map((t) => t.name)).toContain("Crème hydratante");
    expect(next.patient.history).toBe("Arthrose diffuse");
    expect(next.asa).toBe(3);
    // Leftovers of a pasted document are not added by default.
    expect(next.notes).toBe("");
  });
});
