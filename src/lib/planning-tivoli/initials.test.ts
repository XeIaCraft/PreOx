import { describe, expect, it } from "vitest";
import { learnedFrom, matchCell, matchToken, parseAssignment } from "./initials";

describe("a cell of the « Anesth » line", () => {
  it("reads a resident with a senior, a senior alone, nobody", () => {
    expect(parseAssignment("Ze-He")).toEqual({ kind: "ok", pg: "Ze", senior: "He" });
    expect(parseAssignment("  Ze - He ")).toEqual({ kind: "ok", pg: "Ze", senior: "He" });
    expect(parseAssignment("LM–To")).toEqual({ kind: "ok", pg: "LM", senior: "To" });
    expect(parseAssignment("Sad")).toEqual({ kind: "ok", senior: "Sad" });
    expect(parseAssignment("")).toEqual({ kind: "empty" });
    expect(parseAssignment("   ")).toEqual({ kind: "empty" });
  });

  it("keeps as written, flagged, what it cannot read for sure", () => {
    for (const t of ["Ze/Fr", "Ch+Fr", "?", "Is/Sad", "A-B-C", "Ze-H3"]) expect(parseAssignment(t).kind).toBe("invalid");
    expect(parseAssignment("Ze/Fr")).toMatchObject({ text: "Ze/Fr" });
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
    expect(matchCell("Ze/Fr", known)).toMatchObject({ text: "Ze/Fr", assignment: { kind: "invalid" } });
  });

  it("proposes « Ze/Fr » for « ZelFr » (a « / » read as « l ») — still to be settled", () => {
    const m = matchCell("ZelFr", [...known, "Fr"]);
    expect(m).toMatchObject({ text: "Ze/Fr", assignment: { kind: "invalid" }, changes: [{ read: "ZelFr", value: "Ze/Fr", kind: "near" }] });
  });

  it("learns from a correction which initials were misread", () => {
    expect(learnedFrom("Ze-Hc", "Ze-He")).toEqual({ hc: "He" });
    expect(learnedFrom("Sad", "Sad")).toEqual({});
    expect(learnedFrom("Ze/Fr", "Ze-Fr")).toEqual({});
  });
});
