// The validated planning as the public page shows it: for each day, who is
// in each room (senior, resident), by the same rules as the Sheet export.

import { parseAssignment, rolesOf, type Role } from "./initials";
import type { ExportDay, ExportRoom } from "./csv";

export interface PublicEntry {
  room: string;
  senior?: string;
  pg?: string;
  /** What could not be settled (an unreadable cell, a role not known): as written. */
  note?: string;
}

export interface PublicDay {
  date: string;
  entries: PublicEntry[];
}

export function publicDays(days: ExportDay[], rooms: (ExportRoom & { name: string })[], resolve: (initials: string) => string, roleOf: (initials: string) => Role | null = () => null): PublicDay[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      entries: rooms.flatMap((room): PublicEntry[] => {
        const a = parseAssignment(d.cells[room.label] ?? "");
        if (a.kind === "empty") return [];
        if (a.kind === "invalid") return room.part === 2 ? [] : [{ room: room.name, note: a.text }];
        const r = rolesOf(a, room.solo, roleOf, room.part);
        if (!r.senior && !r.pg && !r.undecided) return [];
        return [{ room: room.name, senior: r.senior ? resolve(r.senior) : undefined, pg: r.pg ? resolve(r.pg) : undefined, note: r.undecided ? resolve(r.undecided) : undefined }];
      }),
    }));
}
