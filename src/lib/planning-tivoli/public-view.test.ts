import { describe, expect, it } from "vitest";
import { nameResolver } from "./csv";
import { publicDays } from "./public-view";

describe("the public planning", () => {
  const resolve = nameResolver([
    { initials: "He", name: "Dr Hennaut" },
    { initials: "Ze", name: "Zelie" },
  ]);
  const rooms = [
    { name: "Salle 1", label: "SALLE 1" },
    { name: "Endo C24", label: "END", part: 1 as const },
    { name: "Endo 3", label: "END", part: 2 as const },
  ];

  it("lists who is in each room, days sorted, empty rooms left out", () => {
    const v = publicDays([{ date: "2026-11-10", cells: { "SALLE 1": "He" } }, { date: "2026-11-09", cells: { "SALLE 1": "Ze+He", END: "He-Ze" } }], rooms, resolve);
    expect(v.map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(v[0].entries).toEqual([
      { room: "Salle 1", senior: "Dr Hennaut", pg: "Zelie", note: undefined },
      { room: "Endo C24", senior: "He", pg: undefined, note: undefined },
      { room: "Endo 3", senior: "Zelie", pg: undefined, note: undefined },
    ].map((e) => ({ ...e, senior: e.senior === "He" ? "Dr Hennaut" : e.senior })));
    expect(v[1].entries).toHaveLength(1);
  });

  it("shows what cannot be read as written", () => {
    const v = publicDays([{ date: "2026-11-09", cells: { "SALLE 1": "?" } }], rooms, resolve);
    expect(v[0].entries).toEqual([{ room: "Salle 1", note: "?" }]);
  });
});
