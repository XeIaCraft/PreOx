"use client";

import { useState } from "react";
import { nameResolver, roleResolver } from "@/lib/planning-tivoli/csv";
import { publicDays } from "@/lib/planning-tivoli/public-view";
import type { PlanningData } from "@/lib/planning-tivoli/dal";
import { addDays } from "@/lib/planning-tivoli/match";
import { usePlanningApi } from "./api";

const dayLabel = (iso: string) => new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

type Status = "saving" | "saved" | string;

const DAYS_BEFORE = 7;
const DAYS_AFTER = 28;

/** The validated weeks day by day, room by room — corrected in place, for everyone. */
export function PlanningView({ data, today }: { data: PlanningData; today: string }) {
  const api = usePlanningApi();
  const from = addDays(today, -DAYS_BEFORE);
  const to = addDays(today, DAYS_AFTER);
  const byDate = new Map<string, Record<string, string>>();
  for (const w of data.weeks) if (w.status === "validated") for (const [date, cells] of Object.entries(w.cells ?? {})) if (date >= from && date <= to) byDate.set(date, { ...(byDate.get(date) ?? {}), ...cells });
  const initialDays = [...byDate].sort(([x], [y]) => x.localeCompare(y)).map(([date, cells]) => ({ date, cells }));
  const rooms = data.rooms.filter((r) => r.active && r.image_label).map((r) => ({ name: r.name, label: r.image_label, solo: r.solo, part: r.part }));
  const people = data.people.map((p) => ({ initials: p.initials, name: p.name, role: p.role ?? null }));
  const savedKey = initialDays.map((d) => `${d.date}:${JSON.stringify(d.cells)}`).join("|");
  return <PlanningDays key={savedKey} initialDays={initialDays} today={today} rooms={rooms} people={people} save={api.setCell} />;
}

function PlanningDays({ initialDays, today, rooms, people, save: saveCell }: { initialDays: { date: string; cells: Record<string, string> }[]; today: string; rooms: { name: string; label: string; solo: "senior" | "either"; part: 1 | 2 | null }[]; people: { initials: string; name: string; role: "pg" | "senior" | null }[]; save: (day: string, label: string, value: string) => Promise<{ ok: true; data: { value: string } } | { ok: false; error: string }> }) {
  const [days, setDays] = useState(initialDays);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const resolve = nameResolver(people);
  const roleOf = roleResolver(people);
  const labels = [...new Set(rooms.map((r) => r.label))];
  const resolved = publicDays(
    days,
    rooms.map((r) => ({ name: r.name, label: r.label, solo: r.solo, part: r.part })),
    resolve,
    roleOf
  );

  const edit = (date: string, label: string, value: string) => setDays((ds) => ds.map((d) => (d.date === date ? { ...d, cells: { ...d.cells, [label]: value } } : d)));

  async function save(date: string, label: string, value: string, before: string) {
    if (value.trim() === before.trim()) return;
    const key = `${date}|${label}`;
    setStatus((s) => ({ ...s, [key]: "saving" }));
    const r = await saveCell(date, label, value);
    if (r.ok) edit(date, label, r.data.value);
    setStatus((s) => ({ ...s, [key]: r.ok ? "saved" : r.error }));
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground-muted">Une case se corrige en écrivant les initiales (« Ze-He » : PG puis sénior ; « Sad » : une seule personne), puis en quittant la case : c&apos;est enregistré pour tout le monde.</p>
      {days.length === 0 && <p className="text-sm text-foreground-muted">Aucun planning validé pour le moment : importez et validez une semaine dans l&apos;onglet Semaines.</p>}
      {days.map((d) => {
        const entries = resolved.find((x) => x.date === d.date)?.entries ?? [];
        return (
          <section key={d.date} aria-labelledby={`d-${d.date}`} className={d.date === today ? "rounded-[var(--radius-md)] border border-primary/40 p-3" : "p-1"}>
            <h2 id={`d-${d.date}`} className="mb-2 text-sm font-semibold capitalize text-foreground">
              {dayLabel(d.date)}
              {d.date === today && <span className="ml-2 text-xs font-normal text-primary-strong">aujourd&apos;hui</span>}
            </h2>
            <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
              {labels.map((label) => {
                const names = rooms.filter((r) => r.label === label).map((r) => r.name);
                const shown = entries.filter((e) => names.includes(e.room));
                const key = `${d.date}|${label}`;
                const st = status[key];
                return (
                  <li key={label} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="w-32 shrink-0 font-medium text-foreground">{names.join(" / ")}</span>
                    <input
                      aria-label={`${names.join(" / ")}, ${dayLabel(d.date)}`}
                      value={d.cells[label] ?? ""}
                      maxLength={40}
                      onChange={(e) => edit(d.date, label, e.target.value)}
                      onFocus={(e) => (e.currentTarget.dataset.before = d.cells[label] ?? "")}
                      onBlur={(e) => void save(d.date, label, e.currentTarget.value, e.currentTarget.dataset.before ?? "")}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className="h-9 w-32 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-foreground"
                    />
                    <span className="min-w-0 flex-1 text-foreground-muted">
                      {shown.map((e) => [e.senior, e.pg, e.note].filter(Boolean).join(" · ")).join(" | ")}
                    </span>
                    <span className="w-24 text-right text-xs text-foreground-muted" aria-live="polite">
                      {st === "saving" ? "…" : st === "saved" ? "Enregistré" : st}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
