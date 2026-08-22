/** Monday-first ISO date (YYYY-MM-DD) helpers shared by the multi-week planning view. */

export function mondayIso(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T00:00:00`);
  const end = new Date(`${addDaysIso(weekStartIso, 6)}T00:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("fr-FR", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}
