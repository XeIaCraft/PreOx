import { describe, expect, it } from "vitest";
import { parseText } from "./text";

describe("parseText", () => {
  it("reads paragraphs, lead lines and bullets", () => {
    expect(parseText("Une phrase.\nIndications :\n• A\n  ◦ B\n1. C")).toEqual([
      { kind: "para", text: "Une phrase." },
      { kind: "lead", text: "Indications :" },
      { kind: "bullet", text: "A", level: 0, marker: "•" },
      { kind: "bullet", text: "B", level: 1, marker: "•" },
      { kind: "bullet", text: "C", level: 0, marker: "1." },
    ]);
  });

  it("splits « • » items written on one line", () => {
    expect(parseText("Deux sources : • A • B")).toEqual([
      { kind: "lead", text: "Deux sources :" },
      { kind: "bullet", text: "A", level: 0, marker: "•" },
      { kind: "bullet", text: "B", level: 0, marker: "•" },
    ]);
    expect(parseText("• A • B").map((l) => l.text)).toEqual(["A", "B"]);
  });

  it("drops a leading block label, only as a whole word", () => {
    expect(parseText("À retenir — • A")).toEqual([{ kind: "bullet", text: "A", level: 0, marker: "•" }]);
    expect(parseText("Formule : x = y", "Formule")).toEqual([{ kind: "para", text: "x = y" }]);
    expect(parseText("Formules usuelles", "Formule")).toEqual([{ kind: "para", text: "Formules usuelles" }]);
  });
});
