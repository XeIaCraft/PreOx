import { describe, expect, it } from "vitest";
import { nameResolver, planningCsv, roleResolver } from "./csv";

describe("CSV for =IMPORTDATA in the Planning tab", () => {
  const resolve = nameResolver([
    { initials: "He", name: "Dr Hennaut" },
    { initials: "Ze", name: "Zelie" },
    { initials: "Sad", name: "Dr Sadeghi" },
  ]);
  const rooms = [{ label: "SALLE 2" }, { label: "SALLE 1" }];

  it("one line per day, sorted, date JJ/MM/AAAA, senior then resident for each room in the export order", () => {
    const csv = planningCsv(
      [
        { date: "2026-11-10", cells: { "SALLE 1": "Sad" } },
        { date: "2026-11-09", cells: { "SALLE 1": "Ze-He", "SALLE 2": "sad" } },
      ],
      rooms,
      resolve
    );
    expect(csv).toBe("09/11/2026,Dr Sadeghi,,Dr Hennaut,Zelie\r\n10/11/2026,,,Dr Sadeghi,\r\n");
  });

  it("writes unknown initials as they are, and what cannot be read as written", () => {
    const csv = planningCsv([{ date: "2026-11-09", cells: { "SALLE 1": "Xy-He", "SALLE 2": "Ze/Fr" } }], rooms, resolve);
    expect(csv).toBe("09/11/2026,Ze/Fr,,Dr Hennaut,Xy\r\n");
  });

  it("quotes a field with a comma, and gives nothing for no day", () => {
    const r = nameResolver([{ initials: "He", name: "Hennaut, J." }]);
    expect(planningCsv([{ date: "2026-11-09", cells: { "SALLE 1": "He" } }], [{ label: "SALLE 1" }], r)).toBe('09/11/2026,"Hennaut, J.",\r\n');
    expect(planningCsv([], rooms, resolve)).toBe("");
  });

  it("puts someone alone in CON in the column of their role, and flags a role not known", () => {
    const people = [
      { initials: "Ze", name: "Zelie", role: "pg" as const },
      { initials: "He", name: "Dr Hennaut", role: "senior" as const },
      { initials: "Xy", name: "Dr X", role: null },
    ];
    const csv = (cell: string) => planningCsv([{ date: "2026-11-09", cells: { CON: cell } }], [{ label: "CON", solo: "either" }], nameResolver(people), roleResolver(people));
    expect(csv("Ze")).toBe("09/11/2026,,Zelie\r\n");
    expect(csv("He")).toBe("09/11/2026,Dr Hennaut,\r\n");
    expect(csv("Xy")).toBe("09/11/2026,Xy (PG ou sénior ?),\r\n");
    // Elsewhere, alone is the senior.
    expect(planningCsv([{ date: "2026-11-09", cells: { "SALLE 1": "Ze" } }], [{ label: "SALLE 1" }], nameResolver(people), roleResolver(people))).toBe("09/11/2026,Zelie,\r\n");
  });
});

