import { describe, expect, it } from "vitest";
import { importPlan } from "./activation";
import { ruleConflicts } from "./conflicts";
import { PROPOSED_GROUPS } from "./proposed";

describe("contradictory active rules", () => {
  it("finds two active delays on exactly the same question", () => {
    const base = { status: "active" as const, conditions: [{ kind: "drug" as const, atc: "B01AF01" }, { kind: "technique" as const, in: ["neuraxial" as const] }] };
    const a = { ...base, id: "a", title: "A", action: { type: "stop_before" as const, hours: 72 } };
    const b = { ...base, id: "b", title: "B", conditions: [...base.conditions].reverse(), action: { type: "stop_before" as const, hours: 48 } };
    expect(ruleConflicts([a, b]).map((c) => c.hours)).toEqual([[48, 72]]);
    expect(ruleConflicts([a, { ...b, status: "archived" as const }])).toEqual([]);
    expect(ruleConflicts([a, { ...b, action: { type: "stop_before" as const, hours: 72 } }])).toEqual([]);
  });

  it("the proposed library, once imported, holds none", () => {
    let existing: ReturnType<typeof importPlan> = [];
    for (const g of PROPOSED_GROUPS) {
      const plan = importPlan(g, existing, "2026-09-26T10:00:00.000Z");
      existing = [...existing.filter((e) => !plan.some((p) => p.id === e.id)), ...plan];
    }
    expect(ruleConflicts(existing).map((c) => c.rules.map((r) => r.title))).toEqual([]);
  });
});
