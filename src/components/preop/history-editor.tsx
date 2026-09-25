"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { Input } from "@/components/ui/input";
import { Combobox, FieldLabel, MiniNumber, Panel, RiskPill, Tag, TextArea, YesNoChip } from "@/components/preop/ui";
import { PEN_FAST_ITEMS, PEN_FAST_REFERENCE, penFast, type PenFastItem } from "@/lib/preop/scores";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { DRUGS, QUALIFIER_LABELS, type Conditions, type DrugCode, type Qualifier, type Substances, type TobaccoStatus } from "@/lib/preop/history";
import { SYSTEM_LABELS, SYSTEM_ORDER, searchItems, type ConditionItem, type SystemCode } from "@/lib/preop/catalog";
import type { AllergyEntry, ConsultationPatient } from "@/lib/preop/dossier";
import type { Sex } from "@/lib/preop/scores";
import { cn } from "@/lib/utils";

/**
 * Antecedents: one search field for all of them (typing « stent »,
 * « Xarelto »-like synonyms works), then one line per system with what is
 * noted — and « RAS » to say the system was reviewed and holds nothing
 * else (its unlisted antecedents then count as « no » for the scores).
 * Tapping a system opens its most useful items as one-tap chips.
 */
export function ConditionsEditor({
  conditions,
  onChange,
  sex,
  patient,
  onPatient,
  effective,
  deduced,
  reviewed,
  onReviewed,
}: {
  conditions: Conditions;
  onChange: (c: Conditions) => void;
  sex?: Sex;
  patient: ConsultationPatient;
  onPatient: (p: ConsultationPatient) => void;
  effective: Conditions;
  deduced: Map<string, string>;
  reviewed: string[];
  onReviewed: (r: string[]) => void;
}) {
  const { catalogs } = useCatalogs();
  const [open, setOpen] = useState<SystemCode | null>(null);
  const items = catalogs.conditions.filter((d) => !d.female || sex !== "M");
  const setEntry = (id: string, patch: Partial<Conditions[string]> | null) => {
    const next = { ...conditions };
    if (patch === null) delete next[id];
    else next[id] = { ...effective[id], present: true, ...patch } as Conditions[string];
    onChange(next);
  };
  const remove = (item: ConditionItem) => {
    // A deduced antecedent is answered "no" (so it isn't deduced again); an explicit one is simply removed.
    if (deduced.has(item.id)) onChange({ ...conditions, [item.id]: { present: false } });
    else setEntry(item.id, null);
  };
  const withItems = SYSTEM_ORDER.filter((sys) => items.some((i) => i.system === sys && effective[i.id]?.present));
  const others = SYSTEM_ORDER.filter((sys) => !withItems.includes(sys));
  const quickPicks = (sys: SystemCode) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items
        .filter((i) => i.system === sys && !effective[i.id]?.present)
        .map((i) => (
          <button key={i.id} type="button" onClick={() => setEntry(i.id, {})} className="min-h-8 rounded-[var(--radius-md)] border border-dashed border-border-strong px-2 text-xs text-foreground hover:bg-surface-muted">
            + {i.label}
          </button>
        ))}
    </div>
  );
  const allReviewed = SYSTEM_ORDER.every((s) => reviewed.includes(s) || items.some((i) => i.system === s && effective[i.id]?.present));

  return (
    <Panel
      title="Antécédents"
      actions={
        !allReviewed && (
          <button type="button" onClick={() => onReviewed([...SYSTEM_ORDER])} className="text-xs font-medium text-primary hover:underline">
            Rien d&apos;autre (tout RAS)
          </button>
        )
      }
    >
      <Combobox
        placeholder="Ajouter un antécédent (HTA, stent, SAOS, Parkinson…)"
        search={(q) => searchItems(items, q, (x) => [x.label, ...(x.keywords ?? [])]).map((x) => ({ key: x.id, label: x.label, hint: SYSTEM_LABELS[x.system] }))}
        onPick={(o) => setEntry(o.key, {})}
        onFree={(q) => onPatient({ ...patient, history: [patient.history, q].filter(Boolean).join(" ; ") })}
        freeLabel={(q) => `« ${q} » dans les autres antécédents (texte libre)`}
      />
      {withItems.length > 0 && (
        <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
          {withItems.map((sys) => {
            const present = items.filter((i) => i.system === sys && effective[i.id]?.present);
            return (
              <li key={sys} className="px-2.5 py-2">
                <button type="button" onClick={() => setOpen(open === sys ? null : sys)} className="text-xs font-medium uppercase tracking-wide text-foreground-subtle hover:text-primary">
                  {SYSTEM_LABELS[sys]}
                </button>
                <div className="mt-1 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {present.map((i) => (
                      <Tag key={i.id} tone={deduced.has(i.id) ? "auto" : "default"} onRemove={() => remove(i)}>
                        {i.label}
                        {(Object.keys(i.qualifiers ?? {}) as Qualifier[])
                          .filter((q) => effective[i.id]?.[q])
                          .map((q) => ` · ${i.qualifiers?.[q] ?? QUALIFIER_LABELS[q]}`)
                          .join("")}
                        {deduced.has(i.id) ? ` · auto (${deduced.get(i.id)})` : ""}
                      </Tag>
                    ))}
                  </div>
                  {present
                    .filter((i) => i.qualifiers && Object.keys(i.qualifiers).length)
                    .map((i) => (
                      <div key={i.id} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-foreground-subtle">{i.label} :</span>
                        {(Object.entries(i.qualifiers!) as [Qualifier, string][]).map(([q, label]) => (
                          <ToggleChip key={q} pressed={!!effective[i.id]?.[q]} onChange={(v) => setEntry(i.id, { [q]: v })} className="min-h-7 px-2 text-[11px]">
                            {label}
                          </ToggleChip>
                        ))}
                      </div>
                    ))}
                </div>
                {open === sys && quickPicks(sys)}
              </li>
            );
          })}
        </ul>
      )}
      {others.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-foreground-subtle">Autres systèmes — touchez pour ajouter ou marquer « RAS » :</p>
          <div className="flex flex-wrap gap-1.5">
            {others.map((sys) => {
              const isReviewed = reviewed.includes(sys);
              return (
                <button
                  key={sys}
                  type="button"
                  onClick={() => setOpen(open === sys ? null : sys)}
                  aria-expanded={open === sys}
                  className={cn(
                    "flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs",
                    isReviewed ? "border-success/40 bg-success-tint text-success" : "border-dashed border-border-strong text-foreground-muted",
                    open === sys && "ring-2 ring-primary/30"
                  )}
                >
                  {isReviewed && <Check className="h-3 w-3" />}
                  {SYSTEM_LABELS[sys]}
                </button>
              );
            })}
          </div>
          {open && others.includes(open) && (
            <div className="rounded-[var(--radius-md)] border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{SYSTEM_LABELS[open]}</span>
                <button
                  type="button"
                  onClick={() => {
                    onReviewed(reviewed.includes(open) ? reviewed.filter((r) => r !== open) : [...reviewed, open]);
                    setOpen(null);
                  }}
                  className={cn("flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium", reviewed.includes(open) ? "border-success/40 bg-success-tint text-success" : "border-border text-foreground-muted hover:bg-surface-muted")}
                >
                  <Check className="h-3 w-3" /> {reviewed.includes(open) ? "RAS (annuler)" : "RAS"}
                </button>
              </div>
              {quickPicks(open)}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <TextArea label="Autres antécédents, précisions" value={patient.history} onChange={(v) => onPatient({ ...patient, history: v })} placeholder="ex. FEVG 40 % (écho 03/2026), stent IVA 2019" />
        <TextArea label="Antécédents chirurgicaux et anesthésiques" value={patient.surgicalHistory} onChange={(v) => onPatient({ ...patient, surgicalHistory: v })} placeholder="ex. PTH G 2020 sous rachi, sans complication" />
      </div>
    </Panel>
  );
}

/** Allergies: recognised allergens (Paramètres › Allergies) or free entries, « aucune connue » in one tap. */
export function AllergiesEditor({ patient: p, onChange }: { patient: ConsultationPatient; onChange: (p: ConsultationPatient) => void }) {
  const { catalogs } = useCatalogs();
  const list = p.allergyList ?? [];
  const add = (e: AllergyEntry) => onChange({ ...p, allergyList: [...list, e], noKnownAllergy: false });
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Allergies</FieldLabel>
        {list.length === 0 && (
          <ToggleChip pressed={!!p.noKnownAllergy} onChange={(v) => onChange({ ...p, noKnownAllergy: v })} className="min-h-7 px-2 text-xs">
            Aucune connue
          </ToggleChip>
        )}
      </div>
      {!p.noKnownAllergy && (
        <Combobox
          placeholder="Latex, pénicilline, curares, chlorhexidine…"
          search={(q) => searchItems(catalogs.allergens, q, (x) => [x.label, ...x.keywords]).map((x) => ({ key: x.id, label: x.label }))}
          onPick={(o) => add({ allergenId: o.key, label: o.label })}
          onFree={(q) => add({ label: q })}
        />
      )}
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((a, i) => (
            <Tag key={`${a.label}-${i}`} tone="danger" onRemove={() => onChange({ ...p, allergyList: list.filter((_, j) => j !== i) })}>
              {a.label}
              {a.reaction ? ` (${a.reaction})` : ""}
              {!a.allergenId ? " · non reconnue" : ""}
            </Tag>
          ))}
        </div>
      )}
      {list.map((a, i) => {
        const allergen = a.allergenId ? catalogs.allergens.find((x) => x.id === a.allergenId) : undefined;
        if (allergen?.assessment !== "pen-fast") return null;
        const answers = a.penFast ?? {};
        const r = penFast(answers);
        const setAnswer = (k: PenFastItem, v: boolean) => onChange({ ...p, allergyList: list.map((x, j) => (j === i ? { ...x, penFast: { ...answers, [k]: v } } : x)) });
        return (
          <div key={`pf-${i}`} className="space-y-1.5 rounded-[var(--radius-md)] border border-border p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">PEN-FAST — {a.label}</span>
              {r.label ? (
                <RiskPill level={r.level}>
                  {r.value}/5 · {r.label}
                </RiskPill>
              ) : (
                <span className="text-[11px] text-foreground-subtle">l&apos;allergie déclarée est-elle probable ?</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PEN_FAST_ITEMS) as PenFastItem[]).map((k) => (
                <YesNoChip key={k} label={PEN_FAST_ITEMS[k]} value={answers[k]} onChange={(v) => setAnswer(k, v)} />
              ))}
            </div>
            <p className="text-[11px] text-foreground-subtle">
              Moins de 3 points : allergie vraie peu probable. {PEN_FAST_REFERENCE.label}.
            </p>
          </div>
        );
      })}
      {list.length > 0 && <Input className="h-9" defaultValue={p.allergies} onChange={(e) => onChange({ ...p, allergies: e.target.value })} placeholder="Réactions, précisions (ex. urticaire en 2019)" />}
    </div>
  );
}

const TOBACCO: { code: TobaccoStatus; label: string }[] = [
  { code: "never", label: "Non-fumeur" },
  { code: "current", label: "Fumeur" },
  { code: "former", label: "Ancien fumeur" },
];

export function SubstancesEditor({ value: s, onChange }: { value: Substances; onChange: (s: Substances) => void }) {
  const set = (patch: Partial<Substances>) => onChange({ ...s, ...patch });
  const drugs = s.drugs;
  return (
    <Panel title="Assuétudes">
      <div className="space-y-1">
        <FieldLabel>Tabac</FieldLabel>
        <ChipGroup size="sm" options={TOBACCO} value={s.tobacco ?? null} onChange={(v) => set({ tobacco: v ?? undefined })} allowClear />
        {(s.tobacco === "current" || s.tobacco === "former") && (
          <div className="grid grid-cols-3 gap-2">
            <MiniNumber label="Paquets-années" unit="PA" value={s.packYears} onChange={(v) => set({ packYears: v })} />
            {s.tobacco === "former" && (
              <label className="col-span-2 block min-w-0">
                <span className="block text-[11px] font-medium text-foreground-subtle">Arrêt</span>
                <Input type="month" className="mt-0.5 h-9" defaultValue={s.quitDate} onChange={(e) => set({ quitDate: e.target.value || undefined })} />
              </label>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 items-end gap-2">
        <MiniNumber label="Alcool" unit="U/sem" value={s.alcoholUnitsPerWeek} onChange={(v) => set({ alcoholUnitsPerWeek: v })} placeholder="0" />
        <ToggleChip pressed={!!s.alcoholDependence} onChange={(v) => set({ alcoholDependence: v })} className="col-span-2 min-h-9 text-xs">
          Dépendance / sevrage à risque
        </ToggleChip>
      </div>
      <div className="space-y-1">
        <FieldLabel>Drogues</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip pressed={drugs !== undefined && drugs.length === 0} onChange={(v) => set({ drugs: v ? [] : undefined })} className="min-h-8 px-2 text-xs">
            Aucune
          </ToggleChip>
          {DRUGS.map((d) => (
            <ToggleChip
              key={d.code}
              pressed={!!drugs?.includes(d.code)}
              onChange={(v) => set({ drugs: v ? [...(drugs ?? []), d.code] : (drugs ?? []).filter((x: DrugCode) => x !== d.code) })}
              className="min-h-8 px-2 text-xs"
            >
              {d.label.split(" (")[0]}
            </ToggleChip>
          ))}
        </div>
        {!!drugs?.length && <Input className="h-9" defaultValue={s.drugsDetail} onChange={(e) => set({ drugsDetail: e.target.value })} placeholder="Fréquence, dernière prise, voie…" />}
      </div>
    </Panel>
  );
}
