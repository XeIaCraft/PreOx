// Dates of the week and the matching of what the OCR read to the module's
// rooms and initials — shared by the import (server) and the review screen.

import { matchCell } from "./initials";
import type { PlanningRead } from "./ocr";
import type { PlanningCells, PlanningRoomRow } from "./types";

/** A header as compared: upper case, no spaces nor dots (« H.B. » → « HB », « SALLE 1 » → « SALLE1 »). */
export const normColumn = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s.]/g, "");

/** The Monday of an ISO date's week. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** A column read in the image → the configured room's label (« SALLE 1O » → « SALLE 10 »), or itself. */
export function roomLabelOf(read: string, rooms: Pick<PlanningRoomRow, "image_label">[]): string {
  const n = normColumn(read);
  const labels = rooms.map((r) => r.image_label).filter(Boolean);
  const exact = labels.find((l) => normColumn(l) === n);
  if (exact) return exact;
  const near = labels.filter((l) => editDistance(normColumn(l), n) === 1);
  // As close, a label of the same length wins (« SALLE 1O »: a letter misread, not one dropped).
  const sameLength = near.filter((l) => normColumn(l).length === n.length);
  return near.length === 1 ? near[0] : sameLength.length === 1 ? sameLength[0] : read;
}

/** The cells as first proposed: each day's « Anesth » cells, initials matched. */
export function proposedCells(read: PlanningRead, weekStart: string | null, rooms: Pick<PlanningRoomRow, "image_label">[], known: string[], learned: Record<string, string>): PlanningCells {
  if (!weekStart) return {};
  const cells: PlanningCells = {};
  for (const day of read.days) {
    const date = addDays(weekStart, day.index);
    cells[date] = {};
    for (const c of day.cells) cells[date][roomLabelOf(c.column, rooms)] = c.empty ? "" : matchCell(c.text, known, learned).text;
  }
  return cells;
}

