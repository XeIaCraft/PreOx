// In theatre: timers derived from the logged events and doses (nothing to
// start or stop by hand), and the fluid balance. Pure functions of the
// dossier and "now" — unit tested.

import { FLUID_CATEGORIES, type Dossier, type EventType, type FluidCategory } from "./dossier";

export interface DurationTimer {
  key: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  /** Alert threshold reached (tourniquet). */
  alert: boolean;
  thresholdMin: number | null;
}

export interface RedoseTimer {
  planDrugId: string;
  name: string;
  lastAt: string | null;
  dueAt: string | null;
  /** Minutes until due (negative when overdue); null if never given. */
  remainingMin: number | null;
  intervalMin: number;
}

export interface LastDose {
  name: string;
  dose: string;
  at: string;
  minutesAgo: number;
}

const minutesBetween = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));

function firstOf(d: Dossier, type: EventType): string | null {
  return d.intraop.events.filter((e) => e.type === type).sort((a, b) => a.at.localeCompare(b.at))[0]?.at ?? null;
}

function lastOf(d: Dossier, type: EventType): string | null {
  return d.intraop.events.filter((e) => e.type === type).sort((a, b) => b.at.localeCompare(a.at))[0]?.at ?? null;
}

/** Total tourniquet time (all on/off pairs) and the current inflation, if any. */
export function tourniquet(d: Dossier, now: string): { totalMin: number; currentSince: string | null } {
  const events = d.intraop.events.filter((e) => e.type === "tourniquet_on" || e.type === "tourniquet_off").sort((a, b) => a.at.localeCompare(b.at));
  let total = 0;
  let onSince: string | null = null;
  for (const e of events) {
    if (e.type === "tourniquet_on" && !onSince) onSince = e.at;
    else if (e.type === "tourniquet_off" && onSince) {
      total += minutesBetween(onSince, e.at);
      onSince = null;
    }
  }
  if (onSince) total += minutesBetween(onSince, now);
  return { totalMin: total, currentSince: onSince };
}

export function durationTimers(d: Dossier, now: string): DurationTimer[] {
  const timers: DurationTimer[] = [];
  const anaesStart = firstOf(d, "anaesthesia_start") ?? firstOf(d, "room_in");
  const out = lastOf(d, "room_out");
  if (anaesStart) timers.push({ key: "anaesthesia", label: "Anesthésie", startedAt: anaesStart, endedAt: out, minutes: minutesBetween(anaesStart, out ?? now), alert: false, thresholdMin: null });
  const incision = firstOf(d, "incision");
  const end = lastOf(d, "surgery_end");
  if (incision) timers.push({ key: "surgery", label: "Chirurgie", startedAt: incision, endedAt: end, minutes: minutesBetween(incision, end ?? now), alert: false, thresholdMin: null });
  const t = tourniquet(d, now);
  const firstOn = firstOf(d, "tourniquet_on");
  if (firstOn) {
    const threshold = d.plan.tourniquetAlertMin && d.plan.tourniquetAlertMin > 0 ? d.plan.tourniquetAlertMin : null;
    timers.push({
      key: "tourniquet",
      label: t.currentSince ? "Garrot (gonflé)" : "Garrot (total)",
      startedAt: t.currentSince ?? firstOn,
      endedAt: t.currentSince ? null : lastOf(d, "tourniquet_off"),
      minutes: t.totalMin,
      alert: threshold !== null && t.totalMin >= threshold,
      thresholdMin: threshold,
    });
  }
  return timers;
}

export function redoseTimers(d: Dossier, now: string): RedoseTimer[] {
  return d.plan.drugs
    .filter((drug) => drug.redoseEveryMin && drug.redoseEveryMin > 0)
    .map((drug) => {
      const given = d.intraop.given.filter((g) => g.planDrugId === drug.id || g.name.toLowerCase() === drug.name.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at))[0];
      if (!given) return { planDrugId: drug.id, name: drug.name, lastAt: null, dueAt: null, remainingMin: null, intervalMin: drug.redoseEveryMin! };
      const dueAt = new Date(new Date(given.at).getTime() + drug.redoseEveryMin! * 60_000).toISOString();
      return {
        planDrugId: drug.id,
        name: drug.name,
        lastAt: given.at,
        dueAt,
        remainingMin: Math.round((new Date(dueAt).getTime() - new Date(now).getTime()) / 60_000),
        intervalMin: drug.redoseEveryMin!,
      };
    });
}

/** Last dose of each drug given, most recent first. */
export function lastDoses(d: Dossier, now: string): LastDose[] {
  const byName = new Map<string, LastDose>();
  for (const g of [...d.intraop.given].sort((a, b) => a.at.localeCompare(b.at))) {
    byName.set(g.name.toLowerCase(), { name: g.name, dose: g.dose, at: g.at, minutesAgo: minutesBetween(g.at, now) });
  }
  return [...byName.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export interface FluidBalance {
  inMl: number;
  outMl: number;
  balanceMl: number;
  byCategory: Partial<Record<FluidCategory, number>>;
}

export function fluidBalance(d: Dossier): FluidBalance {
  const byCategory: Partial<Record<FluidCategory, number>> = {};
  let inMl = 0;
  let outMl = 0;
  for (const f of d.intraop.fluids) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + f.volumeMl;
    const dir = FLUID_CATEGORIES.find((c) => c.code === f.category)?.direction;
    if (dir === "in") inMl += f.volumeMl;
    else outMl += f.volumeMl;
  }
  return { inMl, outMl, balanceMl: inMl - outMl, byCategory };
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}
