"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { FieldLabel, NumberField, Panel } from "@/components/preop/ui";
import { OPERATION_CATEGORIES } from "@/lib/carnet/referentiel";
import { RISK_GRADES, type RiskGrade, type Surgery } from "@/lib/preop/dossier";
import { SURGERY_CATALOG_SOURCE, SURGERY_GRADES, searchSurgeries, type CatalogSurgery } from "@/lib/preop/surgeries";

const INCISIONS = [
  { code: "peripheral" as const, label: "Périphérique" },
  { code: "upper_abdominal" as const, label: "Abdominale haute" },
  { code: "intrathoracic" as const, label: "Intrathoracique" },
];

const BLEEDING = RISK_GRADES.filter((r) => r.code !== "intermediate");

/**
 * The intervention and its risk: pick a common procedure to pre-fill the
 * grade, the ESC cardiac risk, the bleeding risk, the Lee "high-risk
 * surgery" item and the ARISCAT incision — every value stays editable.
 */
export function SurgeryPanel({ s, onChange, extra, title = "Intervention prévue" }: { s: Surgery; onChange: (s: Surgery) => void; extra?: React.ReactNode; title?: string }) {
  const set = (patch: Partial<Surgery>) => onChange({ ...s, ...patch });
  const [query, setQuery] = useState(s.name);
  const [open, setOpen] = useState(false);
  const results = open ? searchSurgeries(query) : [];

  const pick = (c: CatalogSurgery) => {
    onChange({ ...s, name: c.name, category: c.category, kce: c.grade, cardiacRisk: c.cardiacRisk, bleedingRisk: c.bleedingRisk, rcriHighRisk: c.rcriHighRisk, incision: c.incision });
    setQuery(c.name);
    setOpen(false);
  };

  return (
    <Panel title={title}>
      <div className="relative">
        <label className="block space-y-1">
          <FieldLabel>Intervention</FieldLabel>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              set({ name: e.target.value });
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="ex. PTG, cholécystectomie, RTUP…"
            autoComplete="off"
          />
        </label>
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
            {results.map((c) => (
              <button key={c.name} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted">
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-foreground-subtle">
                  {c.category} · {SURGERY_GRADES.find((g) => g.code === c.grade)?.label.toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block space-y-1">
          <FieldLabel>Côté</FieldLabel>
          <Input defaultValue={s.side} onChange={(e) => set({ side: e.target.value })} placeholder="droit…" />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Chirurgien</FieldLabel>
          <Input defaultValue={s.surgeon} onChange={(e) => set({ surgeon: e.target.value })} />
        </label>
        <NumberField label="Durée prévue" unit="h" value={s.durationHours} onChange={(v) => set({ durationHours: v })} />
        <label className="block space-y-1">
          <FieldLabel>Position</FieldLabel>
          <Input defaultValue={s.position} onChange={(e) => set({ position: e.target.value })} placeholder="DD, DL…" />
        </label>
      </div>
      <label className="block space-y-1">
        <FieldLabel>Catégorie (carnet)</FieldLabel>
        <Select value={s.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">—</option>
          {OPERATION_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.short ?? c.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <FieldLabel>Grade (KCE / NICE)</FieldLabel>
          <ChipGroup size="sm" options={SURGERY_GRADES} value={s.kce ?? null} onChange={(v) => set({ kce: v ?? undefined })} allowClear />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Risque cardiaque (ESC)</FieldLabel>
          <ChipGroup size="sm" options={RISK_GRADES} value={s.cardiacRisk ?? null} onChange={(v) => set({ cardiacRisk: (v ?? undefined) as RiskGrade | undefined })} allowClear />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Risque hémorragique</FieldLabel>
          <ChipGroup size="sm" options={BLEEDING} value={s.bleedingRisk ?? null} onChange={(v) => set({ bleedingRisk: (v ?? undefined) as RiskGrade | undefined })} allowClear />
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Incision (ARISCAT)</FieldLabel>
        <ChipGroup size="sm" options={INCISIONS} value={s.incision ?? null} onChange={(v) => set({ incision: v ?? undefined })} allowClear />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip pressed={!!s.rcriHighRisk} onChange={(v) => set({ rcriHighRisk: v })} className="min-h-9 text-xs">
          Intrapéritonéale, intrathoracique ou vasculaire sus-inguinale
        </ToggleChip>
        <ToggleChip pressed={!!s.emergency} onChange={(v) => set({ emergency: v })} className="min-h-9 text-xs">
          Urgence
        </ToggleChip>
      </div>
      {extra}
      <p className="text-[11px] text-foreground-subtle">{SURGERY_CATALOG_SOURCE}</p>
    </Panel>
  );
}
