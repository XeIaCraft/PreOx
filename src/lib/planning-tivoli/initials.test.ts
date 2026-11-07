import { describe, expect, it } from "vitest";
import { learnedFrom, matchCell, matchToken, parseAssignment, rolesOf } from "./initials";

describe("a cell of the « Anesth » line", () => {
  it("reads a resident with a senior, a senior alone, nobody", () => {
    expect(parseAssignment("Ze-He")).toEqual({ kind: "ok", pg: "Ze", senior: "He", people: ["Ze", "He"] });
    expect(parseAssignment("  Ze - He ")).toEqual({ kind: "ok", pg: "Ze", senior: "He", people: ["Ze", "He"] });
    expect(parseAssignment("LM–To")).toEqual({ kind: "ok", pg: "LM", senior: "To", people: ["LM", "To"] });
    expect(parseAssignment("Sad")).toEqual({ kind: "ok", senior: "Sad", people: ["Sad"] });
    expect(parseAssignment("")).toEqual({ kind: "empty" });
    expect(parseAssignment("   ")).toEqual({ kind: "empty" });
  });

  it("reads « - », « + » and « / » alike between the resident and the senior", () => {
    for (const t of ["Ze/Fr", "Ze+Fr", "Ze - Fr", "Ze / Fr"]) expect(parseAssignment(t)).toMatchObject({ kind: "ok", pg: "Ze", senior: "Fr" });
  });

  it("keeps as written, flagged, what it cannot read for sure", () => {
    for (const t of ["?", "Ze-?", "A-B-C", "Ze/Fr+He", "Ze-H3"]) expect(parseAssignment(t).kind).toBe("invalid");
    expect(parseAssignment("Ze-?")).toMatchObject({ text: "Ze-?" });
  });
});

describe("initials matched to the known ones", () => {
  const known = ["He", "Ze", "Fatt", "LM", "To", "Sad", "Ha", "Hav"];

  it("finds them whatever the case and the spaces", () => {
    expect(matchToken("he", known)).toEqual({ value: "He", kind: "exact" });
    expect(matchToken("L M", known)).toEqual({ value: "LM", kind: "exact" });
  });

  it("corrects a letter misread, and says so — unless two are as close", () => {
    expect(matchToken("Fatl", known)).toEqual({ value: "Fatt", kind: "near", read: "Fatl" });
    // « Hx » is one letter off « He » and « Ha »: left as read.
    expect(matchToken("Hx", known)).toEqual({ value: "Hx", kind: "unknown" });
    expect(matchToken("Qq", known)).toEqual({ value: "Qq", kind: "unknown" });
    // One letter alone is never corrected.
    expect(matchToken("Z", known).kind).toBe("unknown");
  });

  it("uses a misreading learned from an earlier correction", () => {
    expect(matchToken("Hc", known, { hc: "He" })).toEqual({ value: "He", kind: "learned", read: "Hc" });
  });

  it("matches a whole cell and lists its changes and its unknown initials", () => {
    const m = matchCell("Ze-Hc", known, { hc: "He" });
    expect(m.text).toBe("Ze-He");
    expect(m.changes).toEqual([{ read: "Hc", value: "He", kind: "learned" }]);
    expect(matchCell("Xy-He", known).unknown).toEqual(["Xy"]);
    expect(matchCell("Ze/He", known)).toMatchObject({ text: "Ze-He", assignment: { kind: "ok" } });
    expect(matchCell("Ze-?", known)).toMatchObject({ assignment: { kind: "invalid" } });
  });

  it("reads « ZelFr » as « Ze-Fr » (a « / » read as « l »), and says so", () => {
    const m = matchCell("ZelFr", [...known, "Fr"]);
    expect(m).toMatchObject({ text: "Ze-Fr", assignment: { kind: "ok" }, changes: [{ read: "ZelFr", value: "Ze-Fr", kind: "near" }] });
  });

  it("learns from a correction which initials were misread", () => {
    expect(learnedFrom("Ze-Hc", "Ze-He")).toEqual({ hc: "He" });
    expect(learnedFrom("Sad", "Sad")).toEqual({});
    expect(learnedFrom("Ze/Fr", "Ze-Fr")).toEqual({});
  });

  it("puts someone alone in the senior's place — or, where either can be alone (CON), where the role says", () => {
    const role = (i: string) => ({ ze: "pg", he: "senior" })[i.toLowerCase()] as "pg" | "senior" | undefined ?? null;
    expect(rolesOf(parseAssignment("Ze"))).toEqual({ senior: "Ze" });
    expect(rolesOf(parseAssignment("Ze"), "either", role)).toEqual({ pg: "Ze" });
    expect(rolesOf(parseAssignment("He"), "either", role)).toEqual({ senior: "He" });
    expect(rolesOf(parseAssignment("Xy"), "either", role)).toEqual({ undecided: "Xy" });
    expect(rolesOf(parseAssignment("Ze-He"), "either", role)).toEqual({ pg: "Ze", senior: "He" });
    expect(rolesOf(parseAssignment(""), "either", role)).toEqual({});
  });

  it("gives one person of the cell to a room that takes one (END: the 1st to Endo C24, the 2nd to Endo 3)", () => {
    expect(rolesOf(parseAssignment("Ze"), "senior", undefined, 1)).toEqual({ senior: "Ze" });
    expect(rolesOf(parseAssignment("Ze"), "senior", undefined, 2)).toEqual({});
    expect(rolesOf(parseAssignment("Ze+He"), "senior", undefined, 1)).toEqual({ senior: "Ze" });
    expect(rolesOf(parseAssignment("Ze+He"), "senior", undefined, 2)).toEqual({ senior: "He" });
  });
});

