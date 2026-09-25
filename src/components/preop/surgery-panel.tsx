"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { Combobox, FieldLabel, MiniNumber, Panel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { OPERATION_CATEGORIES } from "@/lib/carnet/referentiel";
import { RISK_GRADES, type RiskGrade, type Surgery } from "@/lib/preop/dossier";
import { searchItems, type BleedingRisk, type SurgeryItem } from "@/lib/preop/catalog";
import { BLEEDING_RISKS, SURGERY_CATALOG_SOURCE, SURGERY_GRADES } from "@/lib/preop/surgeries";

const INCISIONS = [
  { code: "peripheral" as const, label: "Périphérique" },
  { code: "upper_abdominal" as const, label: "Abdominale haute" },
  { code: "intrathoracic" as const, label: "Intrathoracique" },
];

/** Fills the intervention from a catalogue entry (Paramètres › Interventions). */
export function surgeryFromItem(s: Surgery, c: SurgeryItem): Surgery {
  return {
    ...s,
    name: c.name,
    category: c.category,
    kce: c.grade,
    cardiacRisk: c.cardiacRisk,
    bleedingRisk: c.bleedingRisk,
    rcriHighRisk: c.rcriHighRisk,
    incision: c.incision,
    position: c.position ?? s.position,
    durationHours: c.durationHours ?? s.durationHours,
  };
}

/**
 * The intervention and its risk: pick it from the catalogue to fill grade,
 * risks, Lee item, ARISCAT incision, position and duration — every value
 * stays editable. Text fields are uncontrolled: give the panel a `key`
 * that changes when the intervention is replaced from outside.
 */
export function SurgeryPanel({ s, onChange, extra, title = "Intervention" }: { s: Surgery; onChange: (s: Surgery) => void; extra?: React.ReactNode; title?: string }) {
  const { catalogs } = useCatalogs();
  const set = (patch: Partial<Surgery>) => onChange({ ...s, ...patch });
  const [formKey, setFormKey] = useState(0);
  const [showDefs, setShowDefs] = useState(false);
  const bleeding = BLEEDING_RISKS.find((b) => b.code === s.bleedingRisk);

  return (
    <Panel title={title}>
      {s.name ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{s.name}</p>
            <p className="text-xs text-foreground-subtle">
              {[s.category, s.kce && SURGERY_GRADES.find((g) => g.code === s.kce)?.label.toLowerCase(), s.position].filter(Boolean).join(" · ") || "Précisez les caractéristiques ci-dessous"}
            </p>
          </div>
          <button type="button" onClick={() => onChange({ ...s, name: "" })} className="shrink-0 text-xs font-medium text-primary hover:underline">
            Changer
          </button>
        </div>
      ) : (
        <Combobox
          placeholder="Intervention (PTG, vésicule, RTUP…)"
          search={(q) => searchItems(catalogs.surgeries, q, (x) => [x.name, ...(x.aka ?? [])]).map((x) => ({ key: x.id, label: x.name, hint: `${x.category} · ${SURGERY_GRADES.find((g) => g.code === x.grade)?.label.toLowerCase()}` }))}
          onPick={(o) => {
            const item = catalogs.surgeries.find((x) => x.id === o.key);
            if (item) onChange(surgeryFromItem(s, item));
            setFormKey((k) => k + 1);
          }}
          onFree={(q) => set({ name: q })}
          freeLabel={(q) => `« ${q} » (hors catalogue)`}
        />
      )}

      <div key={formKey} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-foreground-subtle">Côté</span>
          <Input className="mt-0.5 h-9" defaultValue={s.side} onChange={(e) => set({ side: e.target.value })} placeholder="droit…" />
        </label>
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-foreground-subtle">Chirurgien</span>
          <Input className="mt-0.5 h-9" defaultValue={s.surgeon} onChange={(e) => set({ surgeon: e.target.value })} />
        </label>
        <MiniNumber label="Durée prévue" unit="h" value={s.durationHours} onChange={(v) => set({ durationHours: v })} />
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-foreground-subtle">Catégorie (carnet)</span>
          <Select className="mt-0.5 h-9" value={s.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">—</option>
            {OPERATION_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.short ?? c.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="col-span-2 block min-w-0 sm:col-span-4">
          <span className="block text-[11px] font-medium text-foreground-subtle">Position</span>
          <Input className="mt-0.5 h-9" defaultValue={s.position} onChange={(e) => set({ position: e.target.value })} placeholder="Décubitus dorsal, latéral, ventral, lithotomie…" />
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <FieldLabel>Grade (KCE / NICE)</FieldLabel>
          <ChipGroup size="sm" options={SURGERY_GRADES} value={s.kce ?? null} onChange={(v) => set({ kce: v ?? undefined })} allowClear />
        </div>
        <div className="space-y-1">
          <FieldLabel>Risque cardiaque (ESC)</FieldLabel>
          <ChipGroup size="sm" options={RISK_GRADES} value={s.cardiacRisk ?? null} onChange={(v) => set({ cardiacRisk: (v ?? undefined) as RiskGrade | undefined })} allowClear />
        </div>
        <div className="space-y-1">
          <span className="flex items-center gap-1">
            <FieldLabel>Risque hémorragique</FieldLabel>
            <button type="button" onClick={() => setShowDefs((v) => !v)} className="text-foreground-subtle hover:text-primary" aria-label="Définitions du risque hémorragique">
              <Info className="h-3.5 w-3.5" />
            </button>
          </span>
          <ChipGroup size="sm" options={BLEEDING_RISKS.map((b) => ({ code: b.code, label: b.label, title: b.definition }))} value={s.bleedingRisk ?? null} onChange={(v) => set({ bleedingRisk: (v ?? undefined) as BleedingRisk | undefined })} allowClear />
        </div>
      </div>
      {(showDefs || bleeding) && (
        <div className="rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2 text-xs text-foreground-muted">
          {showDefs ? (
            <ul className="space-y-1">
              {BLEEDING_RISKS.map((b) => (
                <li key={b.code}>
                  <span className="font-medium text-foreground">{b.label}</span> : {b.definition}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              <span className="font-medium text-foreground">Risque hémorragique {bleeding!.label.toLowerCase()}</span> : {bleeding!.definition}
            </p>
          )}
        </div>
      )}
      <div className="space-y-1">
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
      <p className="text-[11px] text-foreground-subtle">{SURGERY_CATALOG_SOURCE} Catalogue modifiable dans Paramètres.</p>
    </Panel>
  );
}
