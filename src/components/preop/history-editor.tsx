"use client";

import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { Input } from "@/components/ui/input";
import { FieldLabel, NumberField, Panel, TextArea, YesNoChip } from "@/components/preop/ui";
import { DRUGS, SYSTEMS, type ConditionCode, type Conditions, type DrugCode, type Qualifier, type Substances, type TobaccoStatus } from "@/lib/preop/history";
import type { ConsultationPatient } from "@/lib/preop/dossier";
import type { Sex } from "@/lib/preop/scores";

/**
 * Antecedents by system: tap → oui → non. A "yes" opens its qualifiers
 * (poorly controlled, < 3 months, severe) that change the ASA class and
 * the scores. « Le reste : non » answers the system's unasked items.
 */
export function ConditionsEditor({
  conditions,
  onChange,
  sex,
  patient,
  onPatient,
  effective,
  deduced,
}: {
  conditions: Conditions;
  /** Answers completed by what the consultation deduced (treatments, lab values, BP). */
  effective?: Conditions;
  deduced?: Map<ConditionCode, string>;
  onChange: (c: Conditions) => void;
  sex?: Sex;
  patient: ConsultationPatient;
  onPatient: (p: ConsultationPatient) => void;
}) {
  const shown = effective ?? conditions;
  const setPresent = (code: ConditionCode, present: boolean) => onChange({ ...conditions, [code]: { ...shown[code], present } });
  const setQualifier = (code: ConditionCode, q: Qualifier, v: boolean) => onChange({ ...conditions, [code]: { ...shown[code], present: true, [q]: v } });

  return (
    <Panel title="Antécédents">
      <div className="space-y-3">
        {SYSTEMS.map((system) => {
          const defs = system.conditions.filter((d) => !d.female || sex !== "M");
          const unanswered = defs.filter((d) => shown[d.code] === undefined);
          const withQualifiers = defs.filter((d) => shown[d.code]?.present && d.qualifiers?.length);
          const auto = defs.filter((d) => deduced?.has(d.code));
          return (
            <div key={system.code} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>{system.label}</FieldLabel>
                {unanswered.length > 0 && (
                  <button type="button" onClick={() => onChange({ ...conditions, ...Object.fromEntries(unanswered.map((d) => [d.code, { present: false }])) })} className="text-xs font-medium text-primary hover:underline">
                    {unanswered.length === defs.length ? "Aucun" : "Le reste : non"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {defs.map((d) => (
                  <YesNoChip key={d.code} label={d.label} value={shown[d.code]?.present} derived={deduced?.has(d.code)} onChange={(v) => setPresent(d.code, v)} />
                ))}
              </div>
              {auto.length > 0 && (
                <p className="text-[11px] text-foreground-subtle">
                  Déduit automatiquement : {auto.map((d) => `${d.label.toLowerCase()} (${deduced!.get(d.code)})`).join(" ; ")} — touchez pour corriger.
                </p>
              )}
              {withQualifiers.map((d) => (
                <div key={d.code} className="flex flex-wrap items-center gap-1.5 pl-2">
                  <span className="text-xs text-foreground-muted">{d.label} :</span>
                  {d.qualifiers!.map((q) => (
                    <ToggleChip key={q.key} pressed={!!shown[d.code]?.[q.key]} onChange={(v) => setQualifier(d.code, q.key, v)} className="min-h-8 px-2 text-xs">
                      {q.label}
                    </ToggleChip>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <TextArea label="Autres antécédents, précisions" value={patient.history} onChange={(v) => onPatient({ ...patient, history: v })} placeholder="ex. FEVG 40 % (écho 03/2026), stent IVA 2019" />
        <TextArea label="Antécédents chirurgicaux et anesthésiques" value={patient.surgicalHistory} onChange={(v) => onPatient({ ...patient, surgicalHistory: v })} placeholder="ex. PTH G 2020 sous rachi, sans complication" />
      </div>
    </Panel>
  );
}

const TOBACCO: { code: TobaccoStatus; label: string }[] = [
  { code: "never", label: "Jamais fumé" },
  { code: "current", label: "Fumeur actif" },
  { code: "former", label: "Ancien fumeur" },
];

export function SubstancesEditor({ value: s, onChange }: { value: Substances; onChange: (s: Substances) => void }) {
  const set = (patch: Partial<Substances>) => onChange({ ...s, ...patch });
  const drugs = s.drugs;
  return (
    <Panel title="Assuétudes">
      <div className="space-y-1.5">
        <FieldLabel>Tabac</FieldLabel>
        <ChipGroup size="sm" options={TOBACCO} value={s.tobacco ?? null} onChange={(v) => set({ tobacco: v ?? undefined })} allowClear />
        {(s.tobacco === "current" || s.tobacco === "former") && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumberField label="Paquets-années" unit="PA" value={s.packYears} onChange={(v) => set({ packYears: v })} />
            {s.tobacco === "former" && (
              <label className="block space-y-1">
                <FieldLabel>Arrêt</FieldLabel>
                <Input type="month" defaultValue={s.quitDate} onChange={(e) => set({ quitDate: e.target.value || undefined })} />
              </label>
            )}
          </div>
        )}
        {s.tobacco === "current" && <p className="text-xs text-foreground-muted">Occasion de proposer un sevrage (aide au sevrage, substitution nicotinique).</p>}
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Alcool</FieldLabel>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <NumberField label="Unités / semaine" unit="U" value={s.alcoholUnitsPerWeek} onChange={(v) => set({ alcoholUnitsPerWeek: v })} placeholder="0 si aucun" />
          </div>
          <ToggleChip pressed={!!s.alcoholDependence} onChange={(v) => set({ alcoholDependence: v })} className="min-h-10 text-xs">
            Dépendance / sevrage à risque
          </ToggleChip>
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Drogues</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip pressed={drugs !== undefined && drugs.length === 0} onChange={(v) => set({ drugs: v ? [] : undefined })} className="min-h-9 text-xs">
            Aucune
          </ToggleChip>
          {DRUGS.map((d) => (
            <ToggleChip
              key={d.code}
              pressed={!!drugs?.includes(d.code)}
              onChange={(v) => set({ drugs: v ? [...(drugs ?? []), d.code] : (drugs ?? []).filter((x: DrugCode) => x !== d.code) })}
              className="min-h-9 text-xs"
            >
              {d.label}
            </ToggleChip>
          ))}
        </div>
        {!!drugs?.length && (
          <Input defaultValue={s.drugsDetail} onChange={(e) => set({ drugsDetail: e.target.value })} placeholder="Fréquence, dernière prise, voie…" />
        )}
      </div>
    </Panel>
  );
}
