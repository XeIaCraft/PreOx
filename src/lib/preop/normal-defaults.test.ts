import { describe, expect, it } from "vitest";
import { emptyConsultation, withNormalDefaults } from "./dossier";
import { consultationScores } from "./consultation-scores";
import { remainingQuestions } from "./remaining-questions";

describe("normal by default: only problems are tapped", () => {
  const c = { ...emptyConsultation(), patient: { sex: "M" as const, age: 45, weightKg: 80, heightCm: 180 } };

  it("fills what was not examined or asked, without touching the saved state", () => {
    const d = withNormalDefaults(c);
    expect(d.mallampati).toBe(1);
    expect(d.substances.tobacco).toBe("never");
    expect(d.patient.exam).toMatchObject({ heart: "normal", lungs: "normal", veins: "good", spine: "normal" });
    expect(c.mallampati).toBeUndefined();
  });

  it("scores are complete, unanswered questions count as « no » but stay listed", () => {
    const s = consultationScores(c);
    expect(s.results.airway.missing).toBe(0);
    expect(s.results.stopBang.missing).toBe(0);
    expect(s.results.stopBang.value).toBe(1); // male only
    expect(s.results.hemstop.label).toBe("Aucune réponse positive");
    expect(s.answers.stopBang.derivedKeys.has("snoring")).toBe(true);
    expect(remainingQuestions(c, s).find((g) => g.id === "sleep")?.questions.length).toBeGreaterThan(0);
  });

  it("a tapped problem counts; DASI defaults to ordinary activities (> 34)", () => {
    const s = consultationScores({ ...c, stopBang: { snoring: true, observed: true }, airway: { shortThyromental: true, poorNeckMobility: true } });
    expect(s.results.stopBang.level).toBe("high");
    expect(s.results.airway.value).toBe(4);
    expect(s.results.dasi.value).toBeGreaterThan(34);
  });
});
