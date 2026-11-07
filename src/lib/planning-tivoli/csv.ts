// The validated weeks as the « Planning » tab of the Google Sheet reads
// them, through =IMPORTDATA(…) in A3: one line per day, no header — the
// date (JJ/MM/AAAA), then for each room in the export order its senior
// and its resident (PG). Names come from the initials table; initials not
// in it are written as they are, so nothing is lost.

import { normInitials, parseAssignment, rolesOf, type Role } from "./initials";

export interface ExportRoom {
  /** The room's column label in the planning image (« SALLE 1 », « END »…), the key of a day's cells. */
  label: string;
  /** Who is alone in the room: the senior, or either (« CON »: the initials' role decides). */
  solo?: "senior" | "either";
}

export interface ExportDay {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Validated cell text by room label (« Ze-He », « Sad »…). */
  cells: Record<string, string>;
}

/** « 2026-11-09 » → « 09/11/2026 ». */
export const frDate = (iso: string) => iso.split("-").reverse().join("/");

const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Initials → role (PG or senior), when the initials table says it. */
export function roleResolver(people: { initials: string; role?: Role | null }[]): (initials: string) => Role | null {
  const byInitials = new Map(people.map((p) => [normInitials(p.initials), p.role ?? null]));
  return (initials) => byInitials.get(normInitials(initials)) ?? null;
}

/** Initials → name, by the initials as compared (case, spaces, accents aside). */
export function nameResolver(people: { initials: string; name: string }[]): (initials: string) => string {
  const byInitials = new Map(people.map((p) => [normInitials(p.initials), p.name]));
  return (initials) => byInitials.get(normInitials(initials)) ?? initials;
}

export function planningCsv(days: ExportDay[], rooms: ExportRoom[], resolve: (initials: string) => string, roleOf: (initials: string) => Role | null = () => null): string {
  const lines = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const fields = [frDate(d.date)];
      for (const room of rooms) {
        const a = parseAssignment(d.cells[room.label] ?? "");
        if (a.kind === "ok") {
          const r = rolesOf(a, room.solo, roleOf);
          // Alone, role unknown (« CON »): in the senior's column, as initials, so it is seen and settled.
          fields.push(r.senior ? resolve(r.senior) : r.undecided ? `${r.undecided} (PG ou sénior ?)` : "", r.pg ? resolve(r.pg) : "");
        }
        // « Ze/Fr », « ? »: as written in the senior's column, so it is seen and settled in the Sheet.
        else if (a.kind === "invalid") fields.push(a.text, "");
        else fields.push("", "");
      }
      return fields.map(csvField).join(",");
    });
  return lines.length ? `${lines.join("\r\n")}\r\n` : "";
}
