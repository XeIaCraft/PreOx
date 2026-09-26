// Every treatment class that needs a rule has one (verified or draft), apart
// from the classes knowingly left to the « missing rule » question — their
// management depends on sources PreOx could not read (oncology, chronic
// opioids…).
import { expect, it } from "vitest";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { PROPOSED_GROUPS } from "./rules/proposed";

const LEFT_TO_THE_QUESTION = ["opioids", "nalmefene", "disulfiram", "imids", "checkpoint", "btk", "vegf", "abiraterone", "platelet_reducers", "hydroxyurea", "mavacamten", "antifibrotics", "testosterone"];

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
