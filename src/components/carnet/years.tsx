"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { ChipGroup, SectionTitle } from "@/components/carnet/ui";
import { putRow } from "@/lib/carnet/mutations";
import { ABSENCE_CATEGORIES, ACTIVITY_COUNTERS } from "@/lib/carnet/referentiel";
import { activityReport, REPORT_YEARS } from "@/lib/carnet/logic";
import type { CarnetYear } from "@/lib/carnet/types";

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

function parseNumber(text: string): number | undefined {
  const n = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(n) ? undefined : n;
}

/**
 * A running count: the total can be typed directly, or — end of the day,
 * "10 more consultations" — increased without doing the sum: quick
 * buttons (+1, +5…) or any amount. Shows what was just added, with undo.
 */
function CounterField({ value, onCommit, steps }: { value: number | undefined; onCommit: (v: number | undefined) => void; steps: number[] }) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [last, setLast] = useState<{ from: number | undefined; to: number } | null>(null);
  const current = value ?? 0;

  function add(delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const to = Math.max(0, Math.round((current + delta) * 100) / 100);
    setLast({ from: value, to });
    onCommit(to);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {/* key: the typed text follows increments made with the buttons */}
        <Input
          key={value ?? "empty"}
          type="text"
          inputMode="decimal"
          defaultValue={value === undefined ? "" : formatNumber(value)}
          onBlur={(e) => {
            const n = parseNumber(e.target.value);
            if (e.target.value.trim() === "") onCommit(undefined);
            else if (n !== undefined && n !== value) onCommit(Math.max(0, n));
          }}
          aria-label="Total"
          className="h-10 w-20 text-right tabular-nums"
        />
        <Button type="button" variant={adding ? "secondary" : "ghost"} size="sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding} className="h-10">
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
      </div>
      {adding && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {steps.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => add(step)}
              className="min-h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-xs font-semibold tabular-nums text-foreground hover:bg-surface-muted"
            >
              +{formatNumber(step)}
            </button>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseNumber(amount);
              if (n !== undefined) add(n);
              setAmount("");
            }}
          >
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="autre" aria-label="Quantité à ajouter" className="h-9 w-16 text-right text-xs" />
            <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={parseNumber(amount) === undefined}>
              OK
            </Button>
          </form>
        </div>
      )}
      {last && last.to === value && (
        <p className="text-xs text-foreground-subtle">
          {formatNumber(last.from ?? 0)} → <span className="font-medium text-foreground">{formatNumber(last.to)}</span>{" "}
          <button
            type="button"
            className="ml-1 font-medium text-primary hover:underline"
            onClick={() => {
              onCommit(last.from);
              setLast(null);
            }}
          >
            Annuler
          </button>
        </p>
      )}
    </div>
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
              <li key={c.code} className="flex items-start justify-between gap-3">
                <span className="text-sm text-foreground">
                  <span className="mr-1.5 font-mono text-foreground-subtle">{c.code}</span>
                  {c.label}
                  {c.code === "E" && loggedDays > 0 && <span className="block text-xs text-foreground-subtle">{loggedDays} jour(s) avec des cas ou gardes logués cette année</span>}
                </span>
                <CounterField value={existing?.absences[c.code]} steps={[0.5, 1, 5]} onCommit={(v) => update({ absences: { [c.code]: v } })} />
              </li>
            ))}
          </ul>
        </section>

        <section key={`act-${year}`} className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <h3 className="font-medium text-foreground">Autres domaines d&apos;activité</h3>
          <p className="text-xs text-foreground-subtle">Non déductibles du relevé des cas — à compléter pour le rapport d&apos;activité.</p>
          <ul className="space-y-2">
            {ACTIVITY_COUNTERS.map((c) => (
              <li key={c.code} className="flex items-start justify-between gap-3">
                <span className="text-sm text-foreground">
                  {c.domain}
                  <span className="block text-xs text-foreground-subtle">{c.label}</span>
                </span>
                <CounterField value={existing?.activity_counts[c.code]} steps={[1, 5, 10]} onCommit={(v) => update({ activity_counts: { [c.code]: v } })} />
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
