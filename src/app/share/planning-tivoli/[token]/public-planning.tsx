"use client";

import { useState } from "react";
import { nameResolver, roleResolver } from "@/lib/planning-tivoli/csv";
import { publicDays } from "@/lib/planning-tivoli/public-view";
import { savePublicCell } from "./actions";

export interface PublicRoom {
  name: string;
  label: string;
  solo: "senior" | "either";
  part: 1 | 2 | null;
}
export interface PublicPerson {
  initials: string;
  name: string;
  role: "pg" | "senior" | null;
}

const dayLabel = (iso: string) => new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

type Status = "saving" | "saved" | string;

export function PublicPlanning({ token, today, initialDays, rooms, people }: { token: string; today: string; initialDays: { date: string; cells: Record<string, string> }[]; rooms: PublicRoom[]; people: PublicPerson[] }) {
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
    const r = await savePublicCell(token, date, label, value);
    if (r.ok) edit(date, label, r.value);
    setStatus((s) => ({ ...s, [key]: r.ok ? "saved" : r.error }));
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Planning Tivoli</h1>
        <p className="text-sm text-foreground-muted">Anesthésie au bloc. Une case se corrige en écrivant les initiales (« Ze-He » : PG puis sénior ; « Sad » : une seule personne), puis en quittant la case : c&apos;est enregistré pour tout le monde.</p>
      </header>
      {days.length === 0 && <p className="text-sm text-foreground-muted">Aucun planning validé pour le moment.</p>}
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
    </main>
  );
}
