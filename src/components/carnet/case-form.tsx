"use client";

import { useMemo, useRef, useState } from "react";
import { Baby, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { SupervisorPicker } from "@/components/carnet/supervisor-picker";
import { ChipGroup, Field, ToggleChip } from "@/components/carnet/ui";
import { OPERATION_CATEGORIES, REGIONAL_TYPES, TECHNICAL_ACTS, PARTICIPATION_DEGREES, caseCode } from "@/lib/carnet/referentiel";
import { defaultParticipation, defaultTutorId, localDateIso, operationSuggestions, shiftDateIso } from "@/lib/carnet/logic";
import { putRow } from "@/lib/carnet/mutations";
import type { CarnetCase, CarnetStage } from "@/lib/carnet/types";

export interface CaseDraft {
  case_date: string;
  patient_initials: string;
  operation: string;
  operation_category: string | null;
  pediatric_under_4: boolean;
  general_anesthesia: boolean;
  regional: boolean;
  regional_type: string | null;
  technical: boolean;
  technical_act: string | null;
  participation: 1 | 2 | 3 | null;
  tutor_id: string | null;
  notes: string;
}

function draftFromCase(c: CarnetCase): CaseDraft {
  return {
    case_date: c.case_date,
    patient_initials: c.patient_initials,
    operation: c.operation,
    operation_category: c.operation_category,
    pediatric_under_4: c.pediatric_under_4,
    general_anesthesia: c.general_anesthesia,
    regional: c.regional_type !== null,
    regional_type: c.regional_type,
    technical: c.technical_act !== null,
    technical_act: c.technical_act,
    participation: c.participation,
    tutor_id: c.tutor_id,
    notes: c.notes,
  };
}

/** What's missing before the case can be saved — shown inline, never as a blocking dialog. */
export function draftProblems(d: CaseDraft): string[] {
  const problems: string[] = [];
  if (!d.operation.trim()) problems.push("l'opération");
  if (!d.operation_category) problems.push("la catégorie");
  if (!d.general_anesthesia && !d.regional && !d.technical) problems.push("la technique");
  if (d.regional && !d.regional_type) problems.push("le type d'ALR");
  if (d.technical && !d.technical_act) problems.push("le type d'acte");
  if (!d.participation) problems.push("le degré de participation");
  return problems;
}

const DEGREE_OPTIONS = PARTICIPATION_DEGREES.map((d) => ({ code: d.code, label: `${d.code} · ${d.short}`, title: d.label }));
const CATEGORY_OPTIONS = OPERATION_CATEGORIES.map((c) => ({ code: c.code, label: `${c.code} ${c.short ?? c.label}`, title: c.label }));
const REGIONAL_OPTIONS = REGIONAL_TYPES.map((t) => ({ code: t.code, label: t.short ?? t.label, title: t.label }));
const ACT_OPTIONS = TECHNICAL_ACTS.map((t) => ({ code: t.code, label: t.short ?? t.label, title: t.label }));

/**
 * The case entry form — the screen used most, so everything aims at one
 * thumb and a few seconds: date defaults to today, the hospital comes from
 * the stage, the operation autocompletes from the candidate's own history
 * (picking a suggestion also restores its category and technique), the
 * tutor is empty for the first case of the day then repeated, and after a
 * save the specialty/technique/degree/tutor stay put for the next patient
 * of the same list — only initials and operation are cleared.
 */
export function CaseForm({
  stage,
  initial,
  defaultDate,
  onSaved,
  onCancel,
}: {
  stage: CarnetStage;
  initial?: CarnetCase | null;
  defaultDate?: string;
  onSaved?: (saved: CarnetCase, isNew: boolean) => void;
  onCancel?: () => void;
}) {
  const { data, commit } = useCarnet();
  const stageCases = useMemo(() => data.cases.filter((c) => c.stage_id === stage.id), [data.cases, stage.id]);
  const [draft, setDraft] = useState<CaseDraft>(() => {
    if (initial) return draftFromCase(initial);
    const date = defaultDate ?? localDateIso();
    return {
      case_date: date,
      patient_initials: "",
      operation: "",
      operation_category: null,
      pediatric_under_4: false,
      general_anesthesia: true,
      regional: false,
      regional_type: null,
      technical: false,
      technical_act: null,
      participation: defaultParticipation(data.cases, stage.id),
      tutor_id: defaultTutorId(data.cases, stage.id, date),
      notes: "",
    };
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const initialsRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => operationSuggestions(data.cases, draft.operation), [data.cases, draft.operation]);
  const tutorUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const c of stageCases) if (c.tutor_id) usage.set(c.tutor_id, (usage.get(c.tutor_id) ?? 0) + 1);
    return usage;
  }, [stageCases]);

  const set = (patch: Partial<CaseDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const problems = draftProblems(draft);
  const isNew = !initial;
  const today = localDateIso();

  function changeDate(date: string) {
    // A new day starts with an empty tutor (§ pré-remplissage), unless this day already has cases.
    set(isNew ? { case_date: date, tutor_id: defaultTutorId(data.cases, stage.id, date) } : { case_date: date });
  }

  function save() {
    setTriedSave(true);
    if (problems.length > 0) return;
    const row: CarnetCase = {
      id: initial?.id ?? crypto.randomUUID(),
      stage_id: initial?.stage_id ?? stage.id,
      case_date: draft.case_date,
      patient_initials: draft.patient_initials.trim().toUpperCase(),
      operation: draft.operation.trim(),
      operation_category: draft.operation_category!,
      pediatric_under_4: draft.pediatric_under_4,
      general_anesthesia: draft.general_anesthesia,
      regional_type: draft.regional ? draft.regional_type : null,
      technical_act: draft.technical ? draft.technical_act : null,
      participation: draft.participation!,
      tutor_id: draft.tutor_id,
      signature_id: initial?.signature_id ?? null,
      notes: draft.notes.trim(),
      created_at: initial?.created_at ?? new Date().toISOString(),
    };
    commit([putRow("cases", row)]);
    onSaved?.(row, isNew);
    if (isNew) {
      setDraft((d) => ({ ...d, patient_initials: "", operation: "", pediatric_under_4: false, notes: "" }));
      setTriedSave(false);
      initialsRef.current?.focus();
    }
  }

  const preview = draft.operation_category && draft.participation && problems.length === 0
    ? caseCode({
        operation_category: draft.operation_category,
        pediatric_under_4: draft.pediatric_under_4,
        general_anesthesia: draft.general_anesthesia,
        regional_type: draft.regional ? draft.regional_type : null,
        technical_act: draft.technical ? draft.technical_act : null,
        participation: draft.participation,
      })
    : null;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[auto_1fr_auto]">
        <Field label="Date" className="col-span-2 sm:col-span-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <ChipGroup
              size="sm"
              options={[
                { code: today, label: "Aujourd'hui" },
                { code: shiftDateIso(today, -1), label: "Hier" },
              ]}
              value={draft.case_date === today || draft.case_date === shiftDateIso(today, -1) ? draft.case_date : null}
              onChange={(v) => v && changeDate(v)}
            />
            <Input type="date" value={draft.case_date} onChange={(e) => e.target.value && changeDate(e.target.value)} className="h-9 w-auto" aria-label="Date du cas" />
          </div>
        </Field>
        <Field label="Initiales patient">
          <Input
            ref={initialsRef}
            value={draft.patient_initials}
            onChange={(e) => set({ patient_initials: e.target.value.toUpperCase().slice(0, 12) })}
            placeholder="ex. JD"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 w-28 uppercase"
          />
        </Field>
        <Field label="Pédiatrie" className="hidden sm:block">
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <Switch checked={draft.pediatric_under_4} onCheckedChange={(v) => set({ pediatric_under_4: v })} aria-label="Enfant de moins de 4 ans" />
            &lt; 4 ans
          </label>
        </Field>
      </div>

      <Field label="Opération">
        <div className="relative">
          <Input
            value={draft.operation}
            onChange={(e) => {
              set({ operation: e.target.value });
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="ex. Prothèse totale de hanche"
            autoComplete="off"
            className="h-11"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.operation}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    set({
                      operation: s.operation,
                      operation_category: s.last.operation_category,
                      general_anesthesia: s.last.general_anesthesia,
                      regional: s.last.regional_type !== null,
                      regional_type: s.last.regional_type,
                      technical: s.last.technical_act !== null,
                      technical_act: s.last.technical_act,
                    });
                    setShowSuggestions(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-muted"
                >
                  <span className="truncate text-foreground">{s.operation}</span>
                  <span className="shrink-0 text-xs text-foreground-subtle">
                    {s.last.operation_category} · {s.count}×
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      <Field label="Catégorie chirurgicale">
        <ChipGroup options={CATEGORY_OPTIONS} value={draft.operation_category} onChange={(v) => set({ operation_category: v })} size="sm" />
      </Field>

      <label className="flex min-h-11 items-center gap-2 text-sm text-foreground sm:hidden">
        <Switch checked={draft.pediatric_under_4} onCheckedChange={(v) => set({ pediatric_under_4: v })} aria-label="Enfant de moins de 4 ans" />
        <Baby className="h-4 w-4 text-foreground-subtle" /> Enfant de moins de 4 ans
      </label>

      <Field label="Technique d'anesthésie" hint="Plusieurs choix possibles (ex. AG + bloc).">
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip pressed={draft.general_anesthesia} onChange={(v) => set({ general_anesthesia: v })}>
            AG / sédation
          </ToggleChip>
          <ToggleChip pressed={draft.regional} onChange={(v) => set({ regional: v, regional_type: v ? draft.regional_type : null })}>
            ALR
          </ToggleChip>
          <ToggleChip pressed={draft.technical} onChange={(v) => set({ technical: v, technical_act: v ? draft.technical_act : null })}>
            Acte technique
          </ToggleChip>
        </div>
        {draft.regional && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-border bg-surface-muted/50 p-2">
            <ChipGroup options={REGIONAL_OPTIONS} value={draft.regional_type} onChange={(v) => set({ regional_type: v })} size="sm" />
          </div>
        )}
        {draft.technical && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-border bg-surface-muted/50 p-2">
            <ChipGroup options={ACT_OPTIONS} value={draft.technical_act} onChange={(v) => set({ technical_act: v })} size="sm" />
          </div>
        )}
      </Field>

      <Field label="Degré de participation">
        <ChipGroup options={DEGREE_OPTIONS} value={draft.participation} onChange={(v) => set({ participation: v })} />
      </Field>

      <Field label="Tuteur" hint={!draft.tutor_id ? "Sans tuteur, le cas ne pourra pas être présenté à la signature." : undefined}>
        <SupervisorPicker value={draft.tutor_id} onChange={(id) => set({ tutor_id: id })} hospital={stage.hospital} usage={tutorUsage} />
      </Field>

      {!isNew && (
        <Field label="Remarque (non exportée)">
          <Input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className="h-11" />
        </Field>
      )}

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 bg-surface/95 px-1 py-3 backdrop-blur sm:static sm:bg-transparent sm:p-0">
        <p className="text-xs text-foreground-subtle">
          {triedSave && problems.length > 0 ? (
            <span className="text-danger">Il manque {problems.join(", ")}.</span>
          ) : preview ? (
            <>
              Carnet : <span className="font-mono font-medium text-foreground">{preview}</span> · {stage.hospital}
            </>
          ) : (
            stage.hospital
          )}
        </p>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
          )}
          <Button type="submit" size="lg" className="min-w-40">
            <Check className="h-4 w-4" /> {isNew ? "Enregistrer" : "Enregistrer les modifications"}
          </Button>
        </div>
      </div>
    </form>
  );
}
