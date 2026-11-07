import { describe, expect, it } from "vitest";
import { addDays, mondayOf, proposedCells, roomLabelOf } from "./match";
import type { PlanningRead } from "./ocr";

describe("matching a reading to the module", () => {
  it("dates the week from its Monday", () => {
    expect(mondayOf("2026-11-13")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(addDays("2026-11-09", 4)).toBe("2026-11-13");
  });

  it("finds the room of a column read, one character off at most", () => {
    const rooms = [{ image_label: "SALLE 1" }, { image_label: "SALLE 10" }, { image_label: "H.B." }, { image_label: "" }];
    expect(roomLabelOf("SALLE1", rooms)).toBe("SALLE 1");
    expect(roomLabelOf("SALLE 1O", rooms)).toBe("SALLE 10");
    expect(roomLabelOf("HB", rooms)).toBe("H.B.");
    expect(roomLabelOf("Garde", rooms)).toBe("Garde");
  });

  it("proposes each day's cells, initials matched, nothing without a week", () => {
    const read = {
      width: 1,
      height: 1,
      titleText: "",
      columns: ["SALLE 1", "H B"],
      warnings: [],
      days: [{ index: 1, label: "mardi", cells: [{ column: "SALLE 1", box: { x: 0, y: 0, w: 1, h: 1 }, text: "Ze-Hc", confidence: 80, empty: false }, { column: "H B", box: { x: 0, y: 0, w: 1, h: 1 }, text: "", confidence: 100, empty: true }] }],
    } satisfies PlanningRead;
    expect(proposedCells(read, "2026-11-09", [{ image_label: "SALLE 1" }, { image_label: "H.B." }], ["Ze", "He"], { hc: "He" })).toEqual({ "2026-11-10": { "SALLE 1": "Ze-He", "H.B.": "" } });
    expect(proposedCells(read, null, [], [], {})).toEqual({});
  });
});
