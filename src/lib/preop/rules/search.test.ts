import { expect, it } from "vitest";
import { PROPOSED_GROUPS } from "./proposed";
import { ruleMatches } from "./search";

const rules = PROPOSED_GROUPS.flatMap((g) => g.rules);
const titles = (q: string) => rules.filter((r) => ruleMatches(r, q)).map((r) => r.title);

it("finds rules by drug, brand, antecedent, source and prefix, accents ignored", () => {
  expect(titles("metformine").some((t) => /Metformine/.test(t))).toBe(true);
  expect(titles("Glucophage").some((t) => /Metformine/.test(t))).toBe(true);
  expect(titles("metf").some((t) => /Metformine/.test(t))).toBe(true);
  expect(titles("Eliquis").some((t) => /Apixaban/.test(t))).toBe(true);
  expect(titles("xaban").length).toBeGreaterThan(3);
  expect(titles("lithium 72").some((t) => /72 h/.test(t))).toBe(true);
  expect(titles("angio oedeme").some((t) => /Angio-œdème/.test(t))).toBe(true);
  expect(titles("SPAQI").length).toBeGreaterThan(20);
  expect(titles("zzzz")).toEqual([]);
});
