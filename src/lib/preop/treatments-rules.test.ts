// Every treatment class that needs a rule has one (verified or draft), apart
// from the classes knowingly left to the « missing rule » question — their
// management depends on sources PreOx could not read (oncology, chronic
// opioids…).
import { expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { PROPOSED_GROUPS } from "./rules/proposed";

const LEFT_TO_THE_QUESTION: string[] = [];

const rules = PROPOSED_GROUPS.flatMap((g) => g.rules);
const atcs = rules.flatMap((r) => r.conditions.flatMap((c) => (c.kind === "drug" ? [c.atc] : [])));

it("each treatment class that needs a rule has one", () => {
  const missing = DEFAULT_CATALOGS.drugClasses
    .filter((k) => k.needsRule !== false && !LEFT_TO_THE_QUESTION.includes(k.id))
    .filter((k) => !atcs.some((a) => a.startsWith(k.atc) || k.atc.startsWith(a)))
    .map((k) => `${k.id} (${k.atc})`);
  expect(missing).toEqual([]);
});

it("the classes left to the question still exist and still have no rule", () => {
  for (const id of LEFT_TO_THE_QUESTION) {
    const k = DEFAULT_CATALOGS.drugClasses.find((x) => x.id === id);
    expect(k, id).toBeDefined();
    expect(atcs.some((a) => a.startsWith(k!.atc) || k!.atc.startsWith(a)), `${id} a maintenant une règle : le retirer de la liste`).toBe(false);
  }
});

it("rule ids are unique across all groups", () => {
  const ids = rules.map((r) => r.id);
  expect(ids.length).toBe(new Set(ids).size);
});

it("each drug of a rule is a known treatment or class", () => {
  const known = [...DEFAULT_CATALOGS.drugClasses.map((k) => k.atc), ...DEFAULT_CATALOGS.medications.map((m) => m.atc).filter(Boolean)];
  const unknown = [...new Set(atcs)].filter((a) => !known.some((k) => k.startsWith(a) || a.startsWith(k)));
  expect(unknown).toEqual([]);
});

it("each antecedent that needs a rule has one", () => {
  const conds = new Set(rules.flatMap((r) => r.conditions.flatMap((c) => (c.kind === "history" ? [c.condition] : []))));
  const missing = DEFAULT_CATALOGS.conditions.filter((c) => c.needsRule && !conds.has(c.id)).map((c) => c.id);
  expect(missing).toEqual([]);
});

it("a patient on any treatment gets a rule even with no other data (no creatinine, no surgery yet)", async () => {
  const { classesOf } = await import("./catalog");
  const { importPlan } = await import("./rules/activation");
  const { evaluate } = await import("./rules/engine");
  const now = "2026-09-27T10:00:00.000Z";
  let all: ReturnType<typeof importPlan> = [];
  for (const g of PROPOSED_GROUPS) {
    const p = importPlan(g, all, now);
    all = [...all.filter((e) => !p.some((x) => x.id === e.id)), ...p];
  }
  const active = all.filter((r) => r.status === "active").map((r) => ({ ...r, created_at: "", updated_at: "" }));
  const silent: string[] = [];
  for (const k of DEFAULT_CATALOGS.drugClasses) {
    if (k.needsRule === false || k.id === "maoi") continue; // IMAO irréversibles : pas commercialisés en Belgique
    const m = DEFAULT_CATALOGS.medications.find((x) => x.atc && classesOf({ atc: x.atc, catalogId: x.id, components: x.components }, DEFAULT_CATALOGS).some((c) => c.id === k.id));
    if (!m) {
      silent.push(`${k.id} : aucun médicament au catalogue`);
      continue;
    }
    const res = evaluate(active, { age: 50, treatments: [{ id: "t", atc: m.atc, name: m.name, catalogId: m.id, components: m.components }], techniques: [] }, now);
    if (!res.findings.some((f) => f.status !== "needs_info")) silent.push(`${k.id} (${m.name}) : aucune règle appliquée`);
  }
  expect(silent).toEqual([]);
});
