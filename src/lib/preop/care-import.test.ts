import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { careText, consultationFromCare, dossierFromCare, findCareDossier, isCarePayload, type CarePayload } from "./care-import";
import { emptyDossier } from "./dossier";

const payload = (extra: Partial<CarePayload> = {}): CarePayload => ({
  type: "easypm:care-consultation",
  version: 1,
  key: "k1",
  initials: "TA",
  age: 37,
  sex: "F",
  date: "2026-03-20",
  surgery: { name: "Abdominoplastie", side: "" },
  setting: "ambulatory",
  techniques: ["general"],
  values: { weightKg: 70, heightCm: 165, asa: 2, mallampati: 2, hr: 72, spo2: 98 },
  sections: { history: "HTA sous amlodipine", surgical: "abdominoplastie", allergy: "pénicilline", treatment: "Amlodipine 5 mg 1x/j", comments: "Patiente anxieuse" },
  answers: [
    { group: "Score HEMSTOP adulte", question: "4. Avez-vous saigné de manière anormale après une intervention chirurgicale ?", answer: "Oui" },
    { group: "Score HEMSTOP adulte", question: "3. Avez-vous reconsulté votre dentiste pour saignement après une extraction dentaire ?", answer: "Non" },
    { group: "Stop-Bang", question: "Ronflements", answer: "Oui" },
    { group: "Stop-Bang", question: "Sexe masculin", answer: "Non" },
  ],
  supervisor: "Dr Hecquet",
  ...extra,
});

describe("CARE consultation → dossier", () => {
  it("accepts only a well-formed message", () => {
    expect(isCarePayload(payload())).toBe(true);
    expect(isCarePayload({ ...payload(), initials: "Test, Anesthésie" })).toBe(false);
    expect(isCarePayload({ ...payload(), type: "autre" })).toBe(false);
    expect(isCarePayload(null)).toBe(false);
  });

  it("writes the form as a letter with headings", () => {
    expect(careText(payload())).toBe("Antécédents :\nHTA sous amlodipine\nAntécédents chirurgicaux :\nabdominoplastie\nAllergies :\npénicilline\nTraitement :\nAmlodipine 5 mg 1x/j");
  });

  it("fills the consultation: values, antecedents, treatments, allergies, scores, intervention", () => {
    const c = consultationFromCare(payload(), DEFAULT_CATALOGS);
    expect(c.patient).toMatchObject({ age: 37, sex: "F", weightKg: 70, heightCm: 165, hr: 72, spo2: 98 });
    expect(c.conditions.hypertension?.present).toBe(true);
    expect(c.treatments.map((t) => t.name)).toContain("Amlodipine");
    expect(c.patient.allergyList).toMatchObject([{ allergenId: "betalactams" }]);
    expect(c.asa).toBe(2);
    expect(c.mallampati).toBe(2);
    expect(c.surgery).toMatchObject({ name: "Abdominoplastie", setting: "ambulatory" });
    expect(c.plannedAt).toBe("2026-03-20T08:00");
    expect(c.techniques).toEqual(["general"]);
    expect(c.hemstop).toEqual({ surgery: true, tooth: false });
    expect(c.stopBang).toEqual({ snoring: true, male: false });
    expect(c.notes).toBe("Patiente anxieuse");
  });

  it("never overwrites what the dossier already says, and reading again adds nothing twice", () => {
    const first = dossierFromCare(payload(), DEFAULT_CATALOGS);
    const edited = { ...first, consultation: { ...first.consultation, asa: 3, patient: { ...first.consultation.patient, weightKg: 72 } } };
    const again = dossierFromCare(payload({ values: { weightKg: 70, asa: 2 } }), DEFAULT_CATALOGS, edited);
    expect(again.id).toBe(first.id);
    expect(again.consultation.asa).toBe(3);
    expect(again.consultation.patient.weightKg).toBe(72);
    expect(again.consultation.treatments).toHaveLength(first.consultation.treatments.length);
    expect(again.consultation.notes).toBe("Patiente anxieuse");
    expect(again.supervisorHint).toBe("Dr Hecquet");
    expect(again.careKey).toBe("k1");
  });

  it("finds the dossier made from the same CARE consultation, else the same initials that day", () => {
    const made = { ...emptyDossier("TA"), careKey: "k1" };
    const sameDay = emptyDossier("TA");
    sameDay.consultation.plannedAt = "2026-03-20T07:30";
    const otherDay = emptyDossier("TA");
    otherDay.consultation.plannedAt = "2026-03-21T07:30";
    expect(findCareDossier([sameDay, made], payload())?.id).toBe(made.id);
    expect(findCareDossier([otherDay, sameDay], payload({ key: "k2" }))?.id).toBe(sameDay.id);
    expect(findCareDossier([otherDay], payload({ key: "k2" }))).toBeUndefined();
  });
});
