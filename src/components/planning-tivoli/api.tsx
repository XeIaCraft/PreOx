"use client";

import { createContext, useContext, useMemo } from "react";
import { deleteOcrFix, deletePerson, deleteWeek, getWeekImage, importImage, refreshFromWeb, reopenWeek, saveRooms, savePerson, saveWeekCells, setCell, setWeekStart, validateWeek } from "@/app/apps/planning-tivoli/actions";

/**
 * The module's actions, bound to how it is opened: from the dashboard (signed
 * in) or from the public link, where every call carries the link's token.
 */
const make = (t?: string) => ({
  refreshFromWeb: () => refreshFromWeb(t),
  importImage: (base64: string, weekStart?: string) => importImage(base64, weekStart, t),
  getWeekImage: (id: string) => getWeekImage(id, t),
  setWeekStart: (id: string, date: string) => setWeekStart(id, date, t),
  saveWeekCells: (id: string, cells: Parameters<typeof saveWeekCells>[1]) => saveWeekCells(id, cells, t),
  validateWeek: (id: string, cells: Parameters<typeof validateWeek>[1], corrections: Parameters<typeof validateWeek>[2]) => validateWeek(id, cells, corrections, t),
  reopenWeek: (id: string) => reopenWeek(id, t),
  deleteWeek: (id: string) => deleteWeek(id, t),
  savePerson: (input: Parameters<typeof savePerson>[0]) => savePerson(input, t),
  deletePerson: (id: string) => deletePerson(id, t),
  deleteOcrFix: (read: string) => deleteOcrFix(read, t),
  saveRooms: (rooms: Parameters<typeof saveRooms>[0], removed: string[]) => saveRooms(rooms, removed, t),
  setCell: (day: string, label: string, value: string) => setCell(day, label, value, t),
});

export type PlanningApi = ReturnType<typeof make>;

const Ctx = createContext<PlanningApi>(make());

export function PlanningApiProvider({ token, children }: { token?: string; children: React.ReactNode }) {
  const api = useMemo(() => make(token), [token]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const usePlanningApi = () => useContext(Ctx);
