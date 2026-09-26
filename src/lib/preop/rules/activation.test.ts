import { describe, expect, it } from "vitest";
import { activateAllPlan, ALL_SUPERSEDES, importPlan, isUnchecked } from "./activation";
import { PROPOSED_GROUPS } from "./proposed";
import { ruleSchema } from "./schema";

const NOW = "2026-09-26T10:00:00.000Z";
const group = (id: string) => PROPOSED_GROUPS.find((g) => g.id === id)!;

describe("proposed rules are imported active", () => {
  it("every group imports as valid active (or archived) rules", () => {
    let existing: ReturnType<typeof importPlan> = [];
    for (const g of PROPOSED_GROUPS) {
      const plan = importPlan(g, existing, NOW);
      for (const r of plan) expect(ruleSchema.safeParse(r).success, r.title).toBe(true);
      existing = [...existing.filter((e) => !plan.some((p) => p.id === e.id)), ...plan];
    }
    const active = existing.filter((r) => r.status === "active");
    expect(active.length).toBeGreaterThan(150);
    // Nothing active is replaced by another active rule: one live answer per question.
    const liveIds = new Set(active.map((r) => r.id));
    for (const r of active) for (const old of ALL_SUPERSEDES[r.id] ?? []) expect(liveIds.has(old), `${r.title} remplace ${old}`).toBe(false);
  });

  it("the order of the imports does not matter", () => {
    const run = (groups: typeof PROPOSED_GROUPS) => {
      let existing: ReturnType<typeof importPlan> = [];
      for (const g of groups) {
        const plan = importPlan(g, existing, NOW);
        existing = [...existing.filter((e) => !plan.some((p) => p.id === e.id)), ...plan];
      }
      return existing.filter((r) => r.status === "active").map((r) => r.id).sort();
    };
    expect(run([...PROPOSED_GROUPS].reverse())).toEqual(run(PROPOSED_GROUPS));
  });

  it("unchecked rules say so; verified rules are left as they are", () => {
    const manual = importPlan(group("manual-2020"), [], NOW);
    expect(manual.every((r) => r.status !== "active" || isUnchecked(r))).toBe(true);
    const verified = importPlan(group("verified-2026"), [], NOW);
    expect(verified.some(isUnchecked)).toBe(false);
  });

  it("activating the drafts already imported archives the ones a newer rule replaces", () => {
    const drafts = [...group("manual-2020").rules, ...group("treatments-spaqi").rules];
    const plan = activateAllPlan(drafts, NOW);
    const myasthenia = plan.find((r) => r.title.startsWith("Myasthénie : anticholinestérasique arrêté"))!;
    expect(myasthenia.status).toBe("archived");
    expect(plan.find((r) => r.title === "Anticholinestérasiques (myasthénie) : poursuivre")!.status).toBe("active");
  });

  it("a rule you checked yourself is never archived", () => {
    const [newer, olds] = Object.entries(ALL_SUPERSEDES)[0];
    const mine = { ...PROPOSED_GROUPS.flatMap((g) => g.rules).find((r) => r.id === olds[0])!, status: "active" as const, verified_at: NOW, tool: "Moi" };
    const g = PROPOSED_GROUPS.find((x) => x.rules.some((r) => r.id === newer))!;
    const plan = importPlan(g, [mine], NOW);
    expect(plan.some((r) => r.id === mine.id)).toBe(false);
  });
});
