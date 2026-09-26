import { describe, expect, it } from "vitest";
import { evaluate } from "./engine";
import { PROPOSED_GROUPS, PROPOSED_RULES } from "./proposed";
import { ruleSchema } from "./schema";
import type { PatientContext, PatientTreatment, Rule, Technique } from "./types";
import { SUPERSEDES, VERIFIED_RULES } from "./verified";

const active: Rule[] = VERIFIED_RULES.map((r) => ({ ...r, created_at: "", updated_at: "" }));

// Cockcroft-Gault: a 70-year-old man of 70 kg with the given clearance.
const creatinineFor = (crcl: number) => ((140 - 70) * 70) / (72 * crcl);

function ctx(treatment: Omit<PatientTreatment, "id">, techniques: Technique[], surgery: PatientContext["surgery"] = {}, extra: Partial<PatientContext> = {}): PatientContext {
  return {
    age: 70,
    sex: "M",
    weightKg: 70,
    creatinineMgDl: creatinineFor(70),
    treatments: [{ id: "t", ...treatment }],
    techniques,
    surgery,
    conditions: {},
    ...extra,
  };
}

/** The delays that apply, by what they protect. */
function delays(c: PatientContext) {
  const res = evaluate(active, c, "2026-09-26T00:00:00Z");
  const out: Record<string, number[]> = {};
  for (const f of res.findings) {
    if (f.status !== "applies" || f.rule.action.type !== "stop_before") continue;
    const key = f.rule.action.target ?? "?";
    (out[key] ??= []).push(f.rule.action.hours);
  }
  return out;
}

describe("verified rules", () => {
  it("are active, valid for the server, and carry their exact quote and PubMed id", () => {
    const ids = new Set<string>();
    for (const r of VERIFIED_RULES) {
      const parsed = ruleSchema.safeParse(r);
      expect(parsed.success, `${r.title}: ${parsed.success ? "" : parsed.error.issues.map((i) => i.message).join(", ")}`).toBe(true);
      expect(r.status).toBe("active");
      expect(r.verified_at).not.toBeNull();
      expect(r.source.quote.length, r.title).toBeGreaterThan(10);
      expect(r.source.pmid, r.title).toMatch(/^\d{7,9}$/);
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
    }
  });

  it("replace only drafts that exist, and never collide with a draft id", () => {
    const draftIds = new Set(PROPOSED_RULES.map((r) => r.id));
    for (const [by, replaced] of Object.entries(SUPERSEDES)) {
      expect(VERIFIED_RULES.some((r) => r.id === by), by).toBe(true);
      for (const id of replaced) expect(draftIds.has(id), id).toBe(true);
    }
    for (const r of VERIFIED_RULES) expect(draftIds.has(r.id)).toBe(false);
    expect(PROPOSED_GROUPS[0].verified).toBe(true);
  });

  it("rivaroxaban 20 mg, hip replacement under spinal: 72 h for the puncture, 24 h for the surgery", () => {
    const d = delays(ctx({ atc: "B01AF01", name: "Xarelto", dailyDoseMg: 20, indication: "af" }, ["neuraxial"], { bleedingRisk: "low" }));
    expect(Math.max(...d.anaesthesia)).toBe(72);
    expect(d.surgery).toEqual([24]);
  });

  it("apixaban 2.5 mg twice daily for AF is a therapeutic dose", () => {
    const d = delays(ctx({ atc: "B01AF02", name: "Eliquis", dailyDoseMg: 5, indication: "af" }, ["neuraxial"]));
    expect(Math.max(...d.anaesthesia)).toBe(72);
    const prophylaxis = delays(ctx({ atc: "B01AF02", name: "Eliquis", dailyDoseMg: 5, indication: "other" }, ["neuraxial"]));
    expect(prophylaxis.anaesthesia).toEqual([36]);
  });

  it("dabigatran before surgery follows clearance and bleeding risk (ESC figure 10)", () => {
    const at = (crcl: number, bleedingRisk: string) =>
      delays(ctx({ atc: "B01AE07", name: "Pradaxa", dailyDoseMg: 300, indication: "af" }, ["general"], { bleedingRisk }, { creatinineMgDl: creatinineFor(crcl) })).surgery;
    expect(at(90, "low")).toEqual([24]);
    expect(at(60, "low")).toEqual([36]);
    expect(at(40, "high")).toEqual([96]);
  });

  it("enoxaparin 40 mg with a clearance of 25 ml/min: 24 h before the puncture", () => {
    const d = delays(ctx({ atc: "B01AB05", name: "Clexane", dailyDoseMg: 40 }, ["neuraxial"], {}, { creatinineMgDl: creatinineFor(25) }));
    expect(d.anaesthesia).toEqual([24]);
  });

  it("clopidogrel: 7 days before a puncture, 5 days before non-minor surgery", () => {
    const d = delays(ctx({ atc: "B01AC04", name: "Plavix", dailyDoseMg: 75 }, ["neuraxial"], { bleedingRisk: "high" }));
    expect(d.anaesthesia).toEqual([168]);
    expect(d.surgery).toEqual([120]);
  });

  it("ACE inhibitor without heart failure: held on the day of surgery; kept with heart failure", () => {
    const without = delays(ctx({ atc: "C09AA05", name: "Ramipril" }, ["general"], {}, { conditions: { heart_failure: { present: false } } }));
    expect(without.anaesthesia).toEqual([24]);
    const withHf = delays(ctx({ atc: "C09AA05", name: "Ramipril" }, ["general"], {}, { conditions: { heart_failure: { present: true } } }));
    expect(withHf.anaesthesia).toBeUndefined();
  });
});
