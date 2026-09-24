"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { ChipGroup, SectionTitle } from "@/components/carnet/ui";
import { putRow } from "@/lib/carnet/mutations";
import { ABSENCE_CATEGORIES, ACTIVITY_COUNTERS } from "@/lib/carnet/referentiel";
import { activityReport, REPORT_YEARS } from "@/lib/carnet/logic";
import type { CarnetYear } from "@/lib/carnet/types";

function NumberInput({ value, onCommit, step = 1 }: { value: number | undefined; onCommit: (v: number | undefined) => void; step?: number }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = text.trim() === "" ? undefined : Math.max(0, Number(text.replace(",", ".")));
        if (n === undefined || Number.isFinite(n)) onCommit(n);
      }}
      className="h-10 w-24 text-right tabular-nums"
    />
  );
}

/** Per training year: absences (A..F) and the rapport's "autres domaines d'activité", then the whole official activity report computed from the log. */
export function YearsView() {
  const { data, commit } = useCarnet();
  const maxYear = Math.max(1, ...data.stages.map((s) => s.training_year));
  const [year, setYear] = useState<number>(maxYear);
  const existing = data.years.find((y) => y.training_year === year);
  const report = useMemo(() => activityReport(data), [data]);

  // Days with at least one case or duty logged — a starting point for "E" (effective working days), never filled automatically.
  const loggedDays = useMemo(() => {
    const yearOfStage = new Map(data.stages.map((s) => [s.id, s.training_year]));
    const days = new Set<string>();
    data.cases.forEach((c) => yearOfStage.get(c.stage_id) === year && days.add(c.case_date));
    data.duties.forEach((d) => yearOfStage.get(d.stage_id) === year && days.add(d.duty_date));
    return days.size;
  }, [data.cases, data.duties, data.stages, year]);

  function update(patch: Partial<Pick<CarnetYear, "absences" | "activity_counts">>) {
    const base: CarnetYear = existing ?? { id: crypto.randomUUID(), training_year: year, absences: {}, activity_counts: {} };
    const clean = (r: Record<string, number | undefined>) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as Record<string, number>;
    commit([
      putRow("years", {
        ...base,
        absences: clean({ ...base.absences, ...(patch.absences ?? {}) }),
        activity_counts: clean({ ...base.activity_counts, ...(patch.activity_counts ?? {}) }),
      }),
    ]);
  }

  const yearOptions = Array.from({ length: Math.max(maxYear, 5) }, (_, i) => ({ code: i + 1, label: `Année ${i + 1}` }));

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionTitle>Par année de formation</SectionTitle>
        <ChipGroup options={yearOptions} value={year} onChange={(v) => v && setYear(v)} size="sm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section key={`abs-${year}`} className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <h3 className="font-medium text-foreground">Récapitulatif des absences</h3>
          <p className="text-xs text-foreground-subtle">En jours de travail : 1 par journée pleine, 0,5 par demi-jour.</p>
          <ul className="space-y-2">
            {ABSENCE_CATEGORIES.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  <span className="mr-1.5 font-mono text-foreground-subtle">{c.code}</span>
                  {c.label}
                  {c.code === "E" && loggedDays > 0 && <span className="block text-xs text-foreground-subtle">{loggedDays} jour(s) avec des cas ou gardes logués cette année</span>}
                </span>
                <NumberInput value={existing?.absences[c.code]} step={0.5} onCommit={(v) => update({ absences: { [c.code]: v } })} />
              </li>
            ))}
          </ul>
        </section>

        <section key={`act-${year}`} className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <h3 className="font-medium text-foreground">Autres domaines d&apos;activité</h3>
          <p className="text-xs text-foreground-subtle">Non déductibles du relevé des cas — à compléter pour le rapport d&apos;activité.</p>
          <ul className="space-y-2">
            {ACTIVITY_COUNTERS.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  {c.domain}
                  <span className="block text-xs text-foreground-subtle">{c.label}</span>
                </span>
                <NumberInput value={existing?.activity_counts[c.code]} onCommit={(v) => update({ activity_counts: { [c.code]: v } })} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-3">
        <h3 className="font-serif-display text-lg font-medium text-foreground">Rapport d&apos;activité</h3>
        <p className="text-xs text-foreground-subtle">Calculé automatiquement à partir de vos cas et gardes (tableaux I, II et gardes) et des compteurs ci-dessus (tableau III).</p>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-muted text-xs text-foreground-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-medium" />
                {Array.from({ length: REPORT_YEARS }, (_, i) => (
                  <th key={i} className="px-2 py-2 text-right font-medium">
                    Année {i + 1}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            {report.map((section) => (
              <tbody key={section.title} className="divide-y divide-border border-t border-border">
                <tr>
                  <th colSpan={REPORT_YEARS + 2} className="bg-surface-muted/50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    {section.title}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label} className={row.emphasis ? "font-semibold" : undefined}>
                    <td className="px-3 py-1.5 text-foreground">{row.label}</td>
                    {row.byYear.map((n, i) => (
                      <td key={i} className="px-2 py-1.5 text-right tabular-nums text-foreground-muted">
                        {n || ""}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
    </div>
  );
}
