"use client";

import { CircleHelp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { FieldLabel, Panel, TextArea } from "@/components/preop/ui";
import type { ConsultationConclusion, ConsultationDecision, ExamState, ExamStatus } from "@/lib/preop/dossier";
import type { ExamResult } from "@/lib/preop/exams";
import { cn } from "@/lib/utils";

const STATUSES: { code: ExamStatus; label: string }[] = [
  { code: "todo", label: "À demander" },
  { code: "requested", label: "Demandé" },
  { code: "available", label: "Disponible" },
  { code: "not_needed", label: "Non retenu" },
];

/**
 * Suggested tests, each with why and from which source, and where it
 * stands (to request, requested, available with its result, not kept).
 */
export function ExamsPanel({ result, exams, onChange }: { result: ExamResult; exams: Partial<Record<string, ExamState>>; onChange: (e: Partial<Record<string, ExamState>>) => void }) {
  const set = (code: string, patch: Partial<ExamState>) => onChange({ ...exams, [code]: { status: "todo", ...exams[code], ...patch } });
  return (
    <Panel title="Examens complémentaires">
      {result.missing.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-foreground-muted">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> Pour compléter la proposition : {result.missing.join(", ").toLowerCase()}.
        </p>
      )}
      {result.recommendations.length === 0 ? (
        <p className="text-sm text-foreground-subtle">{result.missing.length ? "—" : "Aucun examen systématique proposé pour ce patient et cette intervention."}</p>
      ) : (
        <ul className="space-y-2">
          {result.recommendations.map((r) => {
            const state = exams[r.code];
            return (
              <li key={r.code} className={cn("space-y-1.5 rounded-[var(--radius-md)] border px-3 py-2", state?.status === "not_needed" ? "border-border opacity-60" : "border-border")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{r.label}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", r.strength === "recommended" ? "bg-primary-tint text-primary-strong" : "bg-surface-muted text-foreground-muted")}>
                    {r.strength === "recommended" ? "Recommandé" : "À envisager"}
                  </span>
                </div>
                <ul className="space-y-0.5 text-xs text-foreground-muted">
                  {r.reasons.map((x, i) => (
                    <li key={i}>
                      <span className="mr-1 rounded bg-surface-muted px-1 font-mono text-[10px] text-foreground-subtle" title={x.source.label}>
                        {x.source.short}
                      </span>
                      {x.text}
                    </li>
                  ))}
                </ul>
                <ChipGroup size="sm" options={STATUSES} value={state?.status ?? null} onChange={(v) => set(r.code, { status: v ?? "todo" })} />
                {(state?.status === "available" || state?.status === "requested") && (
                  <Input defaultValue={state.note} onChange={(e) => set(r.code, { note: e.target.value })} placeholder={state.status === "available" ? "Résultat, date" : "Où, quand"} className="h-9" />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-foreground-subtle">
        Référentiel intégré (NICE NG45 2016, ESC 2022) à relire dans la source ; une règle de votre bibliothèque de niveau belge prévaut. Vos règles « examen » s&apos;affichent dans la synthèse.
      </p>
    </Panel>
  );
}

const DECISIONS: { code: Exclude<ConsultationDecision, "">; label: string }[] = [
  { code: "fit", label: "Apte" },
  { code: "optimise", label: "À optimiser avant" },
  { code: "postpone", label: "Reporter" },
];

export function ConclusionPanel({ value: c, onChange, notes, onNotes }: { value: ConsultationConclusion; onChange: (c: ConsultationConclusion) => void; notes: string; onNotes: (v: string) => void }) {
  const set = (patch: Partial<ConsultationConclusion>) => onChange({ ...c, ...patch });
  return (
    <Panel title="Conclusion">
      <div className="space-y-1.5">
        <FieldLabel>Décision</FieldLabel>
        <ChipGroup size="sm" options={DECISIONS} value={c.decision || null} onChange={(v) => set({ decision: v ?? "" })} allowClear />
      </div>
      <TextArea label="Anesthésie proposée" value={c.proposal} onChange={(proposal) => set({ proposal })} placeholder="ex. rachianesthésie + sédation légère, bloc du canal des adducteurs ; AG en alternative" />
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip pressed={!!c.fastingGiven} onChange={(v) => set({ fastingGiven: v })} className="min-h-9 text-xs">
          Consignes de jeûne données
        </ToggleChip>
        <ToggleChip pressed={!!c.informationGiven} onChange={(v) => set({ informationGiven: v })} className="min-h-9 text-xs">
          Information bénéfices / risques
        </ToggleChip>
        <ToggleChip pressed={!!c.consent} onChange={(v) => set({ consent: v })} className="min-h-9 text-xs">
          Accord du patient
        </ToggleChip>
      </div>
      <TextArea label="Notes de consultation" value={notes} onChange={onNotes} rows={3} placeholder="Examen clinique, éléments à transmettre…" />
    </Panel>
  );
}
