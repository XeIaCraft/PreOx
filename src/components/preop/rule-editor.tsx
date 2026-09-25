"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, MultiChipGroup, Textarea } from "@/components/carnet/ui";
import { NumberField } from "@/components/preop/ui";
import { ATC_GROUPS, MEDICATIONS, atcLabel } from "@/lib/preop/medications";
import { describeRule } from "@/lib/preop/rules/describe";
import { INDICATIONS, PATIENT_VALUES, RULE_TARGETS, RULE_TYPES, SOURCE_LEVELS, SURGERY_ATTRIBUTES, TECHNIQUES, type RuleTarget, type SurgeryAttribute } from "@/lib/preop/rules/types";
import { ruleTarget } from "@/lib/preop/rules/target";
import { SYSTEM_LABELS, SYSTEM_ORDER } from "@/lib/preop/catalog";
import { useCatalogs } from "@/components/preop/use-catalogs";
import type { Comparator, Condition, Indication, PatientValue, Rule, RuleAction, RuleType, SourceLevel, Technique } from "@/lib/preop/rules/types";

export type RuleDraft = Omit<Rule, "created_at" | "updated_at">;

const COMPARATORS: { code: Comparator; label: string }[] = [
  { code: ">=", label: "≥" },
  { code: ">", label: ">" },
  { code: "<=", label: "≤" },
  { code: "<", label: "<" },
];

function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className ?? ""}`}>
      <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">{label}</span>
      {children}
    </label>
  );
}

function OpSelect({ value, onChange }: { value: Comparator; onChange: (v: Comparator) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Comparator)} className="w-16 shrink-0 px-2" aria-label="Comparaison">
      {COMPARATORS.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </Select>
  );
}

function defaultAction(type: RuleType, current: RuleAction): RuleAction {
  const text = "text" in current ? current.text : "";
  const keep = current.target ? { target: current.target } : {};
  switch (type) {
    case "stop_before":
      return { type, hours: "hours" in current ? current.hours : 24, ...keep };
    case "resume_after":
      return { type, hours: "hours" in current ? current.hours : 24, ...keep };
    case "requirement":
      return { type, text, blocking: true, ...keep };
    case "exam":
      return { type, exam: "", ...keep };
    case "info":
      return { type, text, ...keep };
  }
}

function ConditionEditor({ c, onChange, onRemove }: { c: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const { catalogs } = useCatalogs();
  const conditionItems = catalogs.conditions;
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-surface-muted/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {c.kind === "drug" ? "Traitement du patient" : c.kind === "technique" ? "Geste prévu" : c.kind === "surgery" ? "Chirurgie" : c.kind === "history" ? "Antécédent" : c.kind === "allergy" ? "Allergie" : "Valeur du patient"}
        </span>
        <button type="button" onClick={onRemove} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label="Retirer la condition">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {c.kind === "drug" && (
        <>
          <Labeled label="Médicament ou classe (ATC)">
            <Select value={c.atc} onChange={(e) => onChange({ ...c, atc: e.target.value })}>
              {![...ATC_GROUPS.map((g) => g.prefix), ...MEDICATIONS.map((m) => m.atc)].includes(c.atc) && <option value={c.atc}>{c.atc}</option>}
              <optgroup label="Classes (toute la classe)">
                {ATC_GROUPS.map((g) => (
                  <option key={g.prefix} value={g.prefix}>
                    {g.label} ({g.prefix})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Substances">
                {MEDICATIONS.map((m) => (
                  <option key={m.atc} value={m.atc}>
                    {m.name} ({m.atc})
                  </option>
                ))}
              </optgroup>
            </Select>
          </Labeled>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!c.dailyDose} onChange={(e) => onChange({ ...c, dailyDose: e.target.checked ? { op: ">=", mg: 20 } : undefined })} />
              Selon la dose quotidienne
            </label>
            {c.dailyDose && (
              <span className="flex items-center gap-1.5">
                <OpSelect value={c.dailyDose.op} onChange={(op) => onChange({ ...c, dailyDose: { ...c.dailyDose!, op } })} />
                <span className="w-24">
                  <NumberField label="" unit="mg/j" value={c.dailyDose.mg} onChange={(v) => v !== undefined && onChange({ ...c, dailyDose: { ...c.dailyDose!, mg: v } })} />
                </span>
              </span>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-foreground-subtle">Seulement pour ces indications (aucune = toutes)</p>
            <MultiChipGroup
              options={INDICATIONS.map((i) => ({ code: i.code, label: i.label }))}
              value={c.indications ?? []}
              onChange={(v) => onChange({ ...c, indications: v.length ? (v as Indication[]) : undefined })}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!c.monthsSinceEvent} onChange={(e) => onChange({ ...c, monthsSinceEvent: e.target.checked ? { op: "<", months: 6 } : undefined })} />
              Selon le délai depuis l&apos;événement (stent, AVC…)
            </label>
            {c.monthsSinceEvent && (
              <span className="flex items-center gap-1.5">
                <OpSelect value={c.monthsSinceEvent.op} onChange={(op) => onChange({ ...c, monthsSinceEvent: { ...c.monthsSinceEvent!, op } })} />
                <span className="w-24">
                  <NumberField label="" unit="mois" value={c.monthsSinceEvent.months} onChange={(v) => v !== undefined && onChange({ ...c, monthsSinceEvent: { ...c.monthsSinceEvent!, months: v } })} />
                </span>
              </span>
            )}
          </div>
        </>
      )}

      {c.kind === "technique" && (
        <MultiChipGroup options={TECHNIQUES.map((t) => ({ code: t.code, label: t.label }))} value={c.in} onChange={(v) => onChange({ ...c, in: v as Technique[] })} />
      )}

      {c.kind === "surgery" && (
        <div className="space-y-2">
          <Select value={c.attribute} onChange={(e) => onChange({ ...c, attribute: e.target.value as SurgeryAttribute, in: [] })}>
            {SURGERY_ATTRIBUTES.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </Select>
          <MultiChipGroup options={SURGERY_ATTRIBUTES.find((a) => a.code === c.attribute)!.values} value={c.in} onChange={(v) => onChange({ ...c, in: v })} />
        </div>
      )}

      {c.kind === "history" && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={c.present ? "yes" : "no"} onChange={(e) => onChange({ ...c, present: e.target.value === "yes" })} className="w-auto">
            <option value="yes">présent</option>
            <option value="no">absent</option>
          </Select>
          <Select
            value={c.condition}
            onChange={(e) => onChange({ ...c, condition: e.target.value, label: conditionItems.find((d) => d.id === e.target.value)?.label })}
            className="w-auto min-w-0 flex-1"
          >
            {SYSTEM_ORDER.map((sys) => (
              <optgroup key={sys} label={SYSTEM_LABELS[sys]}>
                {conditionItems
                  .filter((d) => d.system === sys)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>
      )}

      {c.kind === "allergy" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={c.present ? "yes" : "no"} onChange={(e) => onChange({ ...c, present: e.target.value === "yes", penFast: e.target.value === "yes" ? c.penFast : undefined })} className="w-auto">
              <option value="yes">signalée</option>
              <option value="no">absente</option>
            </Select>
            <Select
              value={c.allergen}
              onChange={(e) => onChange({ ...c, allergen: e.target.value, label: catalogs.allergens.find((x) => x.id === e.target.value)?.label, penFast: undefined })}
              className="w-auto min-w-0 flex-1"
            >
              {!catalogs.allergens.some((x) => x.id === c.allergen) && <option value={c.allergen}>{c.label ?? c.allergen}</option>}
              {catalogs.allergens.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </Select>
          </div>
          {c.present && catalogs.allergens.find((x) => x.id === c.allergen)?.assessment === "pen-fast" && (
            <Select value={c.penFast ?? ""} onChange={(e) => onChange({ ...c, penFast: (e.target.value || undefined) as "low" | "high" | undefined })}>
              <option value="">Quel que soit le score PEN-FAST</option>
              <option value="low">Seulement si PEN-FAST &lt; 3 (allergie vraie peu probable)</option>
              <option value="high">Seulement si PEN-FAST ≥ 3 (allergie vraie possible)</option>
            </Select>
          )}
        </div>
      )}

      {c.kind === "value" && (
        <div className="flex flex-wrap items-end gap-2">
          <Select value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value as PatientValue })} className="w-auto min-w-0 flex-1">
            {PATIENT_VALUES.map((v) => (
              <option key={v.code} value={v.code}>
                {v.label}
              </option>
            ))}
          </Select>
          <OpSelect value={c.op} onChange={(op) => onChange({ ...c, op })} />
          <span className="w-28">
            <NumberField label="" unit={PATIENT_VALUES.find((v) => v.code === c.value)?.unit} value={c.threshold} onChange={(v) => v !== undefined && onChange({ ...c, threshold: v })} />
          </span>
        </div>
      )}
    </div>
  );
}

/** The structured form of a rule — what the app will actually apply, read back in plain words at the bottom. */
export function RuleEditor({ value, onChange }: { value: RuleDraft; onChange: (r: RuleDraft) => void }) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...value, ...patch });
  const setSource = (patch: Partial<RuleDraft["source"]>) => set({ source: { ...value.source, ...patch } });
  const a = value.action;
  // The delay field is uncontrolled while typing; the quick buttons remount it with their value.
  const [hoursKey, setHoursKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Labeled label="Titre court">
          <Input value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="ex. Rivaroxaban 20 mg et ponction neuraxiale" />
        </Labeled>
        <Labeled label="Énoncé">
          <Textarea rows={2} value={value.statement} onChange={(e) => set({ statement: e.target.value })} />
        </Labeled>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Quand (toutes les conditions)</p>
        {value.conditions.map((c, i) => (
          <ConditionEditor
            key={i}
            c={c}
            onChange={(next) => set({ conditions: value.conditions.map((x, j) => (j === i ? next : x)) })}
            onRemove={() => set({ conditions: value.conditions.filter((_, j) => j !== i) })}
          />
        ))}
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ conditions: [...value.conditions, { kind: "drug", atc: "B01AF" }] })}>
            <Plus className="h-3.5 w-3.5" /> Traitement
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ conditions: [...value.conditions, { kind: "technique", in: ["neuraxial"] }] })}>
            <Plus className="h-3.5 w-3.5" /> Geste
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ conditions: [...value.conditions, { kind: "surgery", attribute: "bleedingRisk", in: ["high"] }] })}>
            <Plus className="h-3.5 w-3.5" /> Chirurgie
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ conditions: [...value.conditions, { kind: "history", condition: "coronary", present: true }] })}>
            <Plus className="h-3.5 w-3.5" /> Antécédent
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ conditions: [...value.conditions, { kind: "allergy", allergen: "betalactams", label: "Pénicillines / bêtalactamines", present: true }] })}>
            <Plus className="h-3.5 w-3.5" /> Allergie
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ conditions: [...value.conditions, { kind: "value", value: "crcl", op: ">=", threshold: 30 }] })}>
            <Plus className="h-3.5 w-3.5" /> Valeur du patient
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Alors</p>
        <Select value={a.type} onChange={(e) => set({ action: defaultAction(e.target.value as RuleType, a) })}>
          {RULE_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </Select>
        {(a.type === "stop_before" || a.type === "resume_after") && (
          <div className="flex flex-wrap items-end gap-2">
            <span className="w-32">
              <NumberField key={hoursKey} label="Délai" unit="h" value={a.hours} onChange={(v) => v !== undefined && set({ action: { ...a, hours: v } })} />
            </span>
            <div className="flex gap-1">
              {[24, 48, 72, 96, 120].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    set({ action: { ...a, hours: h } });
                    setHoursKey((k) => k + 1);
                  }}
                  className="min-h-9 rounded-[var(--radius-md)] border border-border px-2 text-xs hover:bg-surface-muted"
                >
                  {h / 24} j
                </button>
              ))}
            </div>
          </div>
        )}
        {a.type === "requirement" && (
          <>
            <Textarea rows={2} value={a.text} onChange={(e) => set({ action: { ...a, text: e.target.value } })} placeholder="ex. Dosage anti-Xa spécifique dans les normes du laboratoire" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={a.blocking} onChange={(e) => set({ action: { ...a, blocking: e.target.checked } })} /> Condition obligatoire (sinon : à vérifier)
            </label>
          </>
        )}
        {a.type === "exam" && (
          <div className="space-y-2">
            <Input value={a.exam} onChange={(e) => set({ action: { ...a, exam: e.target.value } })} placeholder="ex. INR" />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={a.withinDays !== undefined} onChange={(e) => set({ action: { ...a, withinDays: e.target.checked ? 1 : undefined } })} />
                À faire au plus tôt … jours avant le geste
              </label>
              {a.withinDays !== undefined && (
                <span className="w-28">
                  <NumberField label="" unit="jours" value={a.withinDays} onChange={(v) => v !== undefined && set({ action: { ...a, withinDays: Math.max(0, Math.round(v)) } })} />
                </span>
              )}
            </div>
          </div>
        )}
        {a.type === "info" && <Textarea rows={2} value={a.text} onChange={(e) => set({ action: { ...a, text: e.target.value } })} />}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Ce que la règle protège</p>
        <ChipGroup
          size="sm"
          options={RULE_TARGETS.map((t) => ({ code: t.code, label: t.label, title: t.detail }))}
          value={ruleTarget(value)}
          onChange={(v) => v && set({ action: { ...a, target: v as RuleTarget } })}
        />
        <p className="text-xs text-foreground-muted">
          {RULE_TARGETS.find((t) => t.code === ruleTarget(value))!.detail}
          {!a.target && " (Déduit des conditions ; cliquez pour le fixer.)"}
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] border border-primary/30 bg-primary-tint px-3 py-2 text-sm text-primary-strong">
        <p className="text-xs font-semibold uppercase tracking-wide">Ce que l&apos;app appliquera</p>
        <p className="mt-1">{describeRule(value)}</p>
        {value.conditions
          .filter((c): c is Extract<Condition, { kind: "drug" }> => c.kind === "drug")
          .some((c) => c.atc.length < 7) && <p className="mt-1 text-xs">S&apos;applique à toute la classe : {value.conditions.filter((c) => c.kind === "drug").map((c) => atcLabel((c as { atc: string }).atc)).join(", ")}.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Source</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          <Labeled label="Organisme">
            <Input value={value.source.organisation} onChange={(e) => setSource({ organisation: e.target.value })} />
          </Labeled>
          <Labeled label="Niveau">
            <Select value={value.source.level} onChange={(e) => setSource({ level: e.target.value as SourceLevel })}>
              {SOURCE_LEVELS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.short} · {l.label.split(" (")[0]}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="Titre" className="sm:col-span-2">
            <Input value={value.source.title} onChange={(e) => setSource({ title: e.target.value })} />
          </Labeled>
          <NumberField label="Année" value={value.source.year ?? undefined} onChange={(v) => setSource({ year: v ?? null })} />
          <Labeled label="Grade">
            <Input value={value.source.grade} onChange={(e) => setSource({ grade: e.target.value })} placeholder="ex. 1C" />
          </Labeled>
          <Labeled label="DOI">
            <Input value={value.source.doi} onChange={(e) => setSource({ doi: e.target.value.trim() })} />
          </Labeled>
          <Labeled label="PMID">
            <Input value={value.source.pmid} inputMode="numeric" onChange={(e) => setSource({ pmid: e.target.value.replace(/\D/g, "") })} />
          </Labeled>
          {value.source.level === "local" && (
            <Labeled label="Hôpital" className="sm:col-span-2">
              <Input value={value.source.hospital ?? ""} onChange={(e) => setSource({ hospital: e.target.value })} />
            </Labeled>
          )}
          <Labeled label="Citation exacte" className="sm:col-span-2">
            <Textarea rows={3} value={value.source.quote} onChange={(e) => setSource({ quote: e.target.value })} />
          </Labeled>
        </div>
      </div>

      <Labeled label="Pourquoi ? (une explication par ligne)">
        <Textarea
          rows={3}
          value={value.explanations.join("\n")}
          onChange={(e) => set({ explanations: e.target.value.split("\n") })}
        />
      </Labeled>

      <Labeled label="À revérifier après le">
        <Input type="date" value={value.review_at ?? ""} onChange={(e) => set({ review_at: e.target.value || null })} className="w-auto" />
      </Labeled>
    </div>
  );
}
