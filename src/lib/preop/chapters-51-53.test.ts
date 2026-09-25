import { describe, expect, it } from "vitest";
import { attentionPoints } from "./attention";
import { consultationScores } from "./consultation-scores";
import { emptyConsultation, ecgSummary, examSummary, type ConsultationState, type EcgFindings } from "./dossier";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import { cautionsFor, drugReferenceFor } from "./drug-reference";
import { deduceConditions } from "./derive";
import { parseQuickEntry } from "./quick-entry";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { MANUAL_RULES } from "./rules/proposed-manual";

const withEcg = (ecg: EcgFindings, patch: Partial<ConsultationState["patient"]> = {}): ConsultationState => {
  const c = emptyConsultation();
  return { ...c, patient: { ...c.patient, ...patch, exam: { ecg } } };
};
const GA: ProtocolContent = { ...emptyProtocolContent(), techniques: ["general"] };
const ecgPoint = (c: ConsultationState) => attentionPoints(c, consultationScores(c, { plan: GA }), GA).find((x) => x.id === "ecg-reading");

describe("Manuel pratique d'anesthésie 2020, chapitre 51 (ECG)", () => {
  it("summarises the ECG in the exam", () => {
    const ecg: EcgFindings = { rhythm: "af", qtcMs: 480, findings: ["lbbb"] };
    expect(ecgSummary(ecg)).toBe("Fibrillation auriculaire, QTc 480 ms, Bloc de branche G");
    expect(examSummary({ ecg })).toMatch(/^ECG : Fibrillation auriculaire/);
  });

  it("reads a long QT with the drugs in course", () => {
    const c = { ...withEcg({ qtcMs: 510 }, { sex: "F" }), treatments: [{ id: "t", atc: "N06AB04", name: "Citalopram" }] };
    const p = ecgPoint(c)!;
    expect(p.level).toBe("high");
    expect(p.detail).toMatch(/QTc 510 ms \(normale < 460\)/);
    expect(p.detail).toMatch(/en cours : Citalopram/);
  });

  it("flags high-grade blocks and pre-excitation", () => {
    const block = ecgPoint(withEcg({ findings: ["avb3"] }))!;
    expect(block.level).toBe("high");
    expect(block.material).toContain("Électrodes de stimulation externe");
    const tri = ecgPoint(withEcg({ prMs: 240, findings: ["avb1", "rbbb", "lafb"] }))!;
    expect(tri.detail).toMatch(/bloc trifasciculaire possible/);
    expect(ecgPoint(withEcg({ prMs: 100, findings: ["delta"] }))!.detail).toMatch(/ni adénosine/);
  });

  it("suggests antecedents from the ECG", () => {
    const codes = deduceConditions(withEcg({ rhythm: "af", qtcMs: 470, findings: ["delta", "mobitz2"] }), DEFAULT_CATALOGS).map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(["arrhythmia", "long_qt", "wpw", "av_block"]));
  });

  it("reads the ECG from a pasted report", () => {
    const r = parseQuickEntry("ECG : rythme sinusal, BBG, QTc 470 ms, PR 210 ms", DEFAULT_CATALOGS as never);
    expect(r.exam.ecg).toMatchObject({ rhythm: "sinus", qtcMs: 470, prMs: 210, findings: ["lbbb"] });
    expect(r.conditions.map((x) => x.id)).not.toContain("rheumatoid");
    expect(parseQuickEntry("Antécédents : FA paroxystique", DEFAULT_CATALOGS as never).exam.ecg).toBeUndefined();
  });

  it("warns against nodal blockers in pre-excitation and adds the drafts", () => {
    const found = cautionsFor(drugReferenceFor("Adénosine")!, { conditions: { wpw: { present: true } }, treatments: [], conditionLabel: (id) => id });
    expect(found.some((f) => /pré-excitation/.test(f.caution.text))).toBe(true);
    expect(drugReferenceFor("Isuprel")?.name).toBe("Isoprénaline");
    expect(MANUAL_RULES.at(-1)!.source.title).toMatch(/Chapitre 51/);
  });
});
