import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { parseQuickEntry } from "./quick-entry";
import { VERIFIED_RULES } from "./rules/verified";
import { treatmentGuide } from "./treatment-guide";
import type { Rule } from "./rules/types";

const rules = VERIFIED_RULES.map((r) => ({ ...r, created_at: "", updated_at: "" })) as Rule[];
const parse = (text: string) => parseQuickEntry(`Traitements :\n${text}`, DEFAULT_CATALOGS).treatments;

describe("treatment guide", () => {
  it("reads a pasted list and finds the stop rules of an anticoagulant", () => {
    const [t] = parse("Eliquis 5 mg 2x/j");
    expect(t?.name.toLowerCase()).toContain("apixaban");
    const g = treatmentGuide(t, rules, DEFAULT_CATALOGS);
    expect(g.stop.length).toBeGreaterThan(0);
    expect(g.stop.every((s) => s.action.length > 0)).toBe(true);
    expect(["stop", "depends"]).toContain(g.verdict.kind);
  });

  it("says which rules apply once the gesture is known", () => {
    const [t] = parse("Xarelto 20 mg");
    const spinal = treatmentGuide(t, rules, DEFAULT_CATALOGS, { techniques: ["neuraxial"], bleedingRisk: "low", crcl: 80 });
    const general = treatmentGuide(t, rules, DEFAULT_CATALOGS, { techniques: ["general"], bleedingRisk: "minimal", crcl: 80 });
    const longest = (g: typeof spinal) => (g.verdict.kind === "stop" ? g.verdict.hours : 0);
    expect(longest(spinal)).toBeGreaterThan(0);
    expect(longest(spinal)).toBeGreaterThanOrEqual(longest(general));
    expect(spinal.stop.some((s) => s.applies === "no") || general.stop.some((s) => s.applies === "no")).toBe(true);
  });

  it("several pasted lines give several treatments", () => {
    const ts = parse("metformine 850 3x/j\nbisoprolol 5 mg\nAsaflow 80");
    expect(ts.length).toBe(3);
    for (const t of ts) expect(treatmentGuide(t, rules, DEFAULT_CATALOGS).classes.length).toBeGreaterThan(0);
  });
});

describe("treatment guide verdict", () => {
  it("a beta-blocker without a stop rule reads « poursuivre » when its class says so", () => {
    const [t] = parse("bisoprolol 5 mg");
    const g = treatmentGuide(t, rules, DEFAULT_CATALOGS);
    if (g.stop.length === 0) expect(["continue", "none"]).toContain(g.verdict.kind);
  });
});
