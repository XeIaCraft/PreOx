"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CircleHelp, FolderPlus, MessageSquareQuote, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, MultiChipGroup } from "@/components/carnet/ui";
import { FieldLabel, NumberField, Panel, RiskPill, ScoreCard, SourceBadge, TextArea, YesNoChip, formatDateTime, localToIso, toLocalInput } from "@/components/preop/ui";
import { SurgeryPanel } from "@/components/preop/surgery-panel";
import { ConditionsEditor, SubstancesEditor } from "@/components/preop/history-editor";
import { ConclusionPanel, ExamsPanel } from "@/components/preop/exams-panel";
import { ASA_REFERENCE } from "@/lib/preop/asa";
import { consultationSummary, type ConsultationScores } from "@/lib/preop/consultation-scores";
import type { ExamResult } from "@/lib/preop/exams";
import {
  APFEL_ITEMS,
  APFEL_REFERENCE,
  ARISCAT_REFERENCE,
  ASA_CLASSES,
  CHA2DS2VASC_REFERENCE,
  CLINICAL_FRAILTY_SCALE,
  DASI_ITEMS,
  DASI_REFERENCE,
  EL_GANZOURI_REFERENCE,
  HAS_BLED_ITEMS,
  HAS_BLED_REFERENCE,
  HEMSTOP_ITEMS,
  HEMSTOP_REFERENCE,
  MALLAMPATI_CLASSES,
  MASK_VENTILATION_ITEMS,
  MASK_VENTILATION_REFERENCE,
  NYHA_CLASSES,
  RCRI_ITEMS,
  RCRI_REFERENCE,
  STOP_BANG_ITEMS,
  STOP_BANG_REFERENCE,
  type Sex,
} from "@/lib/preop/scores";
import { consultationScores } from "@/lib/preop/consultation-scores";
import { conditionsSummary, substanceSummary } from "@/lib/preop/history";
import { RISK_GRADES } from "@/lib/preop/dossier";
import { SURGERY_GRADES } from "@/lib/preop/surgeries";
import { emptyConsultation, type ConsultationState } from "@/lib/preop/dossier";
import { evaluate, indicationLabel, type EvaluationResult } from "@/lib/preop/rules/engine";
import { describeRule, formatHours } from "@/lib/preop/rules/describe";
import { questionForMissingStop, type QuestionInput } from "@/lib/preop/rules/question";
import { INDICATIONS, TECHNIQUES, type Indication, type PatientTreatment, type Rule, type Technique } from "@/lib/preop/rules/types";
import { searchMedications } from "@/lib/preop/medications";
import { cn } from "@/lib/utils";

type YesNo<K extends string> = Partial<Record<K, boolean>>;

const ROMAN = ["I", "II", "III", "IV"];
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** The rule library applied to a consultation (treatments, gesture, date, hospital). */
export function evaluateConsultation(rules: Rule[], c: ConsultationState): EvaluationResult {
  return evaluate(rules, {
    ...c.patient,
    treatments: c.treatments,
    techniques: c.techniques,
    plannedAt: localToIso(c.plannedAt),
    hospital: c.hospital || undefined,
    surgery: { bleedingRisk: c.surgery.bleedingRisk, cardiacRisk: c.surgery.cardiacRisk, grade: c.surgery.kce },
    conditions: c.conditions,
  });
}

function ItemsGrid<K extends string>({
  items,
  answers,
  derivedKeys,
  onChange,
}: {
  items: Record<K, string | { label: string }>;
  answers: YesNo<K>;
  derivedKeys?: Set<K>;
  onChange: (next: YesNo<K>) => void;
}) {
  const keys = Object.keys(items) as K[];
  const unanswered = keys.filter((k) => answers[k] === undefined);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => {
          const item = items[k];
          return (
            <YesNoChip
              key={k}
              label={typeof item === "string" ? item : item.label}
              value={answers[k]}
              derived={derivedKeys?.has(k)}
              onChange={(v) => onChange({ ...answers, [k]: v })}
            />
          );
        })}
      </div>
      {unanswered.length > 0 && (
        <button type="button" onClick={() => onChange({ ...answers, ...Object.fromEntries(unanswered.map((k) => [k, false])) })} className="text-xs font-medium text-primary hover:underline">
          Le reste : non
        </button>
      )}
    </div>
  );
}

function TreatmentsEditor({ treatments, onChange }: { treatments: PatientTreatment[]; onChange: (t: PatientTreatment[]) => void }) {
  const [query, setQuery] = useState("");
  const results = searchMedications(query);
  const update = (id: string, patch: Partial<PatientTreatment>) => onChange(treatments.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-2">
      {treatments.map((t) => (
        <div key={t.id} className="space-y-2 rounded-[var(--radius-md)] border border-border bg-surface-muted/40 p-2.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{t.name}</span>
            <span className="font-mono text-[11px] text-foreground-subtle">{t.atc}</span>
            <button type="button" onClick={() => onChange(treatments.filter((x) => x.id !== t.id))} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label={`Retirer ${t.name}`}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            <NumberField label="Dose quotidienne" unit="mg/j" value={t.dailyDoseMg} onChange={(v) => update(t.id, { dailyDoseMg: v })} />
            <label className="block space-y-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">Indication</span>
              <Select value={t.indication ?? ""} onChange={(e) => update(t.id, { indication: (e.target.value || undefined) as Indication | undefined })}>
                <option value="">Non précisée</option>
                {INDICATIONS.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.label}
                  </option>
                ))}
              </Select>
            </label>
            {t.indication && ["coronary_stent", "secondary_prevention_stroke", "secondary_prevention_coronary", "vte"].includes(t.indication) && (
              <label className="block space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">Date de l&apos;événement</span>
                <Input type="date" value={t.eventDate ?? ""} onChange={(e) => update(t.id, { eventDate: e.target.value || undefined })} />
              </label>
            )}
            <label className="block space-y-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">Dernière prise</span>
              <Input
                type="datetime-local"
                value={t.lastDoseAt ? toLocalInput(t.lastDoseAt) : ""}
                onChange={(e) => update(t.id, { lastDoseAt: localToIso(e.target.value) })}
              />
            </label>
          </div>
        </div>
      ))}
      <div className="relative">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ajouter un traitement (nom ou marque : Xarelto, Asaflow…)" autoComplete="off" />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
            {results.map((m) => (
              <button
                key={m.atc}
                type="button"
                onClick={() => {
                  onChange([...treatments, { id: crypto.randomUUID(), atc: m.atc, name: m.name }]);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="truncate">
                  {m.name}
                  {m.brands?.length ? <span className="text-foreground-subtle"> · {m.brands.join(", ")}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-foreground-subtle">{m.atc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-foreground-subtle">Catalogue de départ limité aux classes utiles en anesthésie ; il sera remplacé par l&apos;import du CBIP.</p>
    </div>
  );
}

/** At a glance, always in view on a large screen: who, what, the risks, the tests. */
function Synthesis({ s, asa, results, exams }: { s: ConsultationState; asa: number | null; results: ConsultationScores["results"]; exams: ExamResult }) {
  const summary = consultationSummary(s);
  const surg = s.surgery;
  const pills: [string, { label: string; level: ConsultationScores["results"]["rcri"]["level"] }][] = [
    ["Lee", results.rcri],
    ["STOP-BANG", results.stopBang],
    ["ARISCAT", results.ariscat],
    ["Apfel", results.apfel],
    ["Masque", results.mask],
    ["Laryngoscopie", results.airway],
  ];
  const conditions = conditionsSummary(s.conditions);
  const substances = substanceSummary(s.substances);
  const toRequest = exams.recommendations.filter((r) => (s.exams[r.code]?.status ?? "todo") === "todo");
  return (
    <Panel title="Synthèse">
      <dl className="space-y-1.5 text-sm">
        {surg.name && (
          <div>
            <dt className="text-xs text-foreground-subtle">Intervention</dt>
            <dd className="text-foreground">
              {surg.name}
              {surg.emergency ? " (urgence)" : ""}
              <span className="block text-xs text-foreground-muted">
                {[
                  surg.kce && `grade ${SURGERY_GRADES.find((g) => g.code === surg.kce)?.label.toLowerCase()}`,
                  surg.cardiacRisk && `risque cardiaque ${RISK_GRADES.find((g) => g.code === surg.cardiacRisk)?.label.toLowerCase()}`,
                  surg.bleedingRisk && `risque hémorragique ${RISK_GRADES.find((g) => g.code === surg.bleedingRisk)?.label.toLowerCase()}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </dd>
          </div>
        )}
        {(summary.status || asa) && (
          <div>
            <dt className="text-xs text-foreground-subtle">Statut</dt>
            <dd className="text-foreground">{summary.status}</dd>
          </div>
        )}
        {conditions && (
          <div>
            <dt className="text-xs text-foreground-subtle">Antécédents</dt>
            <dd className="text-foreground">{conditions}</dd>
          </div>
        )}
        {substances && (
          <div>
            <dt className="text-xs text-foreground-subtle">Assuétudes</dt>
            <dd className="text-foreground">{substances}</dd>
          </div>
        )}
        {summary.airway && (
          <div>
            <dt className="text-xs text-foreground-subtle">Voies aériennes</dt>
            <dd className="text-foreground">{summary.airway}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-1.5">
        {pills.map(([name, r]) =>
          r.label ? (
            <RiskPill key={name} level={r.level}>
              {name} : {r.label}
            </RiskPill>
          ) : null
        )}
      </div>
      {toRequest.length > 0 && (
        <p className="text-xs text-foreground-muted">
          <span className="font-medium text-foreground">Examens à demander :</span> {toRequest.map((r) => r.label.split(" (")[0]).join(", ")}
        </p>
      )}
    </Panel>
  );
}

/**
 * The consultation form, controlled: the unsaved consultation (below) and
 * a patient dossier both use it. Scores compute as you tap, the rule
 * library is applied to the treatments and the planned gesture, missing
 * information and situations without a rule are listed — with a question
 * ready to paste into an AI search tool.
 *
 * Text and number fields are uncontrolled (typing "1," isn't rewritten):
 * change `formKey` to reload them from `value`.
 */
export function ConsultationForm({
  value: s,
  onChange,
  rules,
  onAskQuestion,
  formKey = 0,
  patientActions,
}: {
  value: ConsultationState;
  onChange: (next: ConsultationState) => void;
  rules: Rule[];
  onAskQuestion: (q: QuestionInput) => void;
  formKey?: number | string;
  patientActions?: React.ReactNode;
}) {
  const resetKey = formKey;
  const set = (patch: Partial<ConsultationState>) => onChange({ ...s, ...patch });
  const p = s.patient;

  const { derived, merged, results, asaSuggestion, asa, exams } = useMemo(() => consultationScores(s), [s]);
  const sb = merged.stopBang;
  const lee = merged.rcri;
  const ap = merged.apfel;
  const hb = merged.hasBled;
  const mv = merged.mask;

  const evaluation = useMemo(() => evaluateConsultation(rules, s), [rules, s]);

  const patientFields = (
    <section key={`patient-${resetKey}`} className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif-display text-lg font-medium text-foreground">Patient</h2>
        {patientActions && <div className="flex flex-wrap items-center gap-1.5">{patientActions}</div>}
      </div>
      <ChipGroup
        size="sm"
        options={[
          { code: "M" as Sex, label: "Homme" },
          { code: "F" as Sex, label: "Femme" },
        ]}
        value={p.sex ?? null}
        onChange={(v) => set({ patient: { ...p, sex: v ?? undefined } })}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField label="Âge" unit="ans" value={p.age} onChange={(v) => set({ patient: { ...p, age: v } })} />
        <NumberField label="Poids" unit="kg" value={p.weightKg} onChange={(v) => set({ patient: { ...p, weightKg: v } })} />
        <NumberField label="Taille" unit="cm" value={p.heightCm} onChange={(v) => set({ patient: { ...p, heightCm: v } })} />
        <NumberField label="Créatinine" unit="mg/dL" value={p.creatinineMgDl} onChange={(v) => set({ patient: { ...p, creatinineMgDl: v } })} />
        <NumberField label="Hémoglobine" unit="g/dL" value={p.hb} onChange={(v) => set({ patient: { ...p, hb: v } })} />
        <NumberField label="Plaquettes" unit="G/L" value={p.platelets} onChange={(v) => set({ patient: { ...p, platelets: v } })} />
        <NumberField label="INR" value={p.inr} onChange={(v) => set({ patient: { ...p, inr: v } })} />
        <NumberField label="SpO₂" unit="%" value={p.spo2} onChange={(v) => set({ patient: { ...p, spo2: v } })} />
        <NumberField label="PA systolique" unit="mmHg" value={p.sbp} onChange={(v) => set({ patient: { ...p, sbp: v } })} />
        <NumberField label="PA diastolique" unit="mmHg" value={p.dbp} onChange={(v) => set({ patient: { ...p, dbp: v } })} />
        <NumberField label="Fréquence cardiaque" unit="/min" value={p.hr} onChange={(v) => set({ patient: { ...p, hr: v } })} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2 text-xs sm:grid-cols-3">
        {[
          ["IMC", derived.bmi, "kg/m²", 1],
          ["Poids idéal", derived.ibw, "kg", 0],
          ["Poids maigre", derived.lbw, "kg", 0],
          ["Poids ajusté", derived.abw, "kg", 0],
          ["Clairance (Cockcroft)", derived.crcl, "mL/min", 0],
          ["DFGe (CKD-EPI 2021)", derived.egfr, "mL/min/1,73 m²", 0],
        ].map(([label, value, unit, d]) => (
          <div key={label as string} className="flex justify-between gap-2">
            <dt className="text-foreground-subtle">{label as string}</dt>
            <dd className="font-mono tabular-nums text-foreground">{value === undefined ? "—" : `${round(value as number, d as number)} ${unit}`}</dd>
          </div>
        ))}
      </dl>
      <TextArea label="Allergies" value={p.allergies} onChange={(v) => set({ patient: { ...p, allergies: v } })} placeholder="ex. aucune connue, latex, pénicilline (urticaire)" />
    </section>
  );

  const surgeryFields = (
    <SurgeryPanel
      key={`surgery-${resetKey}`}
      s={s.surgery}
      onChange={(surgery) => set({ surgery })}
      extra={
        <>
          <div className="space-y-1.5">
            <FieldLabel>Technique envisagée</FieldLabel>
            <MultiChipGroup options={TECHNIQUES.map((t) => ({ code: t.code, label: t.label }))} value={s.techniques} onChange={(v) => set({ techniques: v as Technique[] })} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <FieldLabel>Date et heure prévues</FieldLabel>
              <Input type="datetime-local" value={s.plannedAt} onChange={(e) => set({ plannedAt: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <FieldLabel>Hôpital (protocoles locaux)</FieldLabel>
              <Input value={s.hospital} onChange={(e) => set({ hospital: e.target.value })} placeholder="ex. CHU Tivoli" />
            </label>
          </div>
        </>
      }
    />
  );

  const treatmentFields = (
    <Panel key={`treatments-${resetKey}`} title="Traitements">
      <TreatmentsEditor treatments={s.treatments} onChange={(treatments) => set({ treatments })} />
    </Panel>
  );

  const findingsPanel = (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif-display text-lg font-medium text-foreground">Ce que disent vos règles</h2>
        <span className="text-xs text-foreground-subtle">{rules.filter((r) => r.status === "active").length} règle(s) active(s)</span>
      </div>

      {evaluation.missing.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint px-3 py-2 text-sm text-foreground">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleHelp className="h-4 w-4 text-accent" /> À compléter pour décider
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-foreground-muted">
            {evaluation.missing.map((m) => (
              <li key={m.key}>{m.label}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.findings.filter((f) => f.status === "applies").length === 0 && evaluation.gaps.length === 0 && evaluation.missing.length === 0 && (
        <p className="text-sm text-foreground-subtle">Ajoutez les traitements et la technique prévue : les règles de votre bibliothèque s&apos;appliqueront ici.</p>
      )}

      <ul className="space-y-2">
        {evaluation.findings
          .filter((f) => f.status === "applies")
          .map((f) => (
            <li key={f.rule.id} className="rounded-[var(--radius-md)] border border-border px-3 py-2">
              <div className="flex items-start gap-2">
                <SourceBadge level={f.rule.source.level} />
                <div className="min-w-0 flex-1 space-y-1">
                  {f.outcomes.map((o, i) => (
                    <p key={i} className={cn("text-sm", o.kind === "stop_before" && o.conflict ? "text-danger" : "text-foreground")}>
                      {o.kind === "stop_before" && (
                        <>
                          <strong>{o.treatment.name}</strong> : dernière prise au moins {formatHours(o.hours)} avant le geste
                          {o.lastDoseBy && <> — au plus tard le {formatDateTime(o.lastDoseBy)}</>}
                          {o.conflict && (
                            <span className="mt-0.5 flex items-center gap-1 font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" /> Dernière prise trop récente : geste possible à partir du {formatDateTime(o.conflict.earliestAt)}
                            </span>
                          )}
                        </>
                      )}
                      {o.kind === "resume_after" && (
                        <>
                          Reprise {o.treatment ? <strong>{o.treatment.name}</strong> : null} au plus tôt {formatHours(o.hours)} après le geste
                          {o.resumeFrom && <> — à partir du {formatDateTime(o.resumeFrom)}</>}
                        </>
                      )}
                      {o.kind === "requirement" && <span className={o.blocking ? "font-medium text-danger" : undefined}>{o.text}</span>}
                      {o.kind === "exam" && <>Examen : {o.exam}</>}
                      {o.kind === "info" && <>{o.text}</>}
                    </p>
                  ))}
                  <p className="text-[11px] text-foreground-subtle">
                    {[f.rule.source.organisation, f.rule.source.year, f.rule.source.grade && `grade ${f.rule.source.grade}`].filter(Boolean).join(" · ")}
                    {f.toRecheck && <span className="ml-1.5 rounded bg-accent-tint px-1 text-accent">à revérifier</span>}
                  </p>
                  {f.overridden.length > 0 && (
                    <p className="text-[11px] text-foreground-muted">
                      Autre avis :{" "}
                      {f.overridden.map((o) => `${o.source.organisation} ${o.source.year ?? ""} — ${describeRule(o).replace(/^Si .* → /, "")}`).join(" ; ")}
                    </p>
                  )}
                  {(f.rule.explanations.length > 0 || f.rule.source.quote) && (
                    <details className="text-xs text-foreground-muted">
                      <summary className="cursor-pointer font-medium text-primary">Pourquoi ?</summary>
                      {f.rule.source.quote && (
                        <p className="mt-1 flex gap-1.5 italic">
                          <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f.rule.source.quote}
                        </p>
                      )}
                      {f.rule.explanations.map((e, i) => (
                        <p key={i} className="mt-1">
                          {e}
                        </p>
                      ))}
                    </details>
                  )}
                </div>
              </div>
            </li>
          ))}
      </ul>

      {evaluation.gaps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Sans règle dans votre bibliothèque</p>
          {evaluation.gaps.map((g) => (
            <div key={`${g.treatment.id}-${g.technique}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-dashed border-border-strong px-3 py-2">
              <span className="text-sm text-foreground">{g.label}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onAskQuestion(
                    questionForMissingStop({
                      drug: g.treatment.name.toLowerCase(),
                      dailyDoseMg: g.treatment.dailyDoseMg,
                      technique: g.technique,
                      crcl: derived.crcl,
                      indication: g.treatment.indication ? indicationLabel(g.treatment.indication) : undefined,
                    })
                  )
                }
              >
                <Plus className="h-3.5 w-3.5" /> Préparer la question
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const scores = (
    <div key={`scores-${resetKey}`} className="space-y-2">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Scores</h2>
      <ScoreCard
        title="ASA"
        summary={asa ? `${ASA_CLASSES[asa - 1].label}${s.surgery.emergency ? "E" : ""}${s.asa ? "" : " · suggéré"}` : ""}
        level={asa && asa >= 3 ? "intermediate" : "info"}
        reference={ASA_REFERENCE}
        defaultOpen
      >
        <ChipGroup size="sm" options={ASA_CLASSES.slice(0, 5).map((c) => ({ code: c.code, label: c.label, title: c.detail }))} value={s.asa ?? null} onChange={(v) => set({ asa: v ?? undefined })} allowClear />
        {asaSuggestion.asa && (
          <div className="rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2 text-xs text-foreground-muted">
            <p className="font-medium text-foreground">
              Suggestion : {ASA_CLASSES[asaSuggestion.asa - 1].label}
              {s.asa && s.asa !== asaSuggestion.asa ? ` (vous avez choisi ${ASA_CLASSES[s.asa - 1].label})` : ""}
            </p>
            <ul className="mt-0.5 list-disc pl-4">
              {asaSuggestion.reasons.map((r, i) => (
                <li key={i}>
                  {r.label} → {ASA_CLASSES[r.asa - 1].label}
                </li>
              ))}
            </ul>
          </div>
        )}
        {asa && <p className="text-xs text-foreground-muted">{ASA_CLASSES[asa - 1].detail}</p>}
      </ScoreCard>

      <ScoreCard
        title="NYHA · fragilité (Clinical Frailty Scale)"
        summary={[s.nyha ? `NYHA ${ROMAN[s.nyha - 1]}` : "", s.frailty ? `CFS ${s.frailty}` : ""].filter(Boolean).join(" · ")}
        level={(s.nyha ?? 0) >= 3 || (s.frailty ?? 0) >= 5 ? "intermediate" : "info"}
        reference="Clinical Frailty Scale : Rockwood et al., CMAJ 2005"
      >
        <div className="space-y-1.5">
          <FieldLabel>Dyspnée (NYHA)</FieldLabel>
          <ChipGroup size="sm" options={NYHA_CLASSES.map((c) => ({ code: c.code as number, label: ROMAN[c.code - 1], title: c.detail }))} value={s.nyha ?? null} onChange={(v) => set({ nyha: v ?? undefined })} allowClear />
          {s.nyha && <p className="text-xs text-foreground-muted">{NYHA_CLASSES[s.nyha - 1].detail}</p>}
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Fragilité (CFS 1–9)</FieldLabel>
          <ChipGroup size="sm" options={CLINICAL_FRAILTY_SCALE.map((c) => ({ code: c.code as number, label: String(c.code), title: c.detail }))} value={s.frailty ?? null} onChange={(v) => set({ frailty: v ?? undefined })} allowClear />
          {s.frailty && <p className="text-xs text-foreground-muted">{CLINICAL_FRAILTY_SCALE[s.frailty - 1].detail}</p>}
        </div>
      </ScoreCard>

      <ScoreCard
        title="Voies aériennes · Mallampati, El-Ganzouri"
        summary={[s.mallampati ? `Mallampati ${MALLAMPATI_CLASSES[s.mallampati - 1].label}` : "", results.airway.label].filter(Boolean).join(" · ")}
        level={results.airway.level === "high" || (s.mallampati ?? 0) >= 3 ? "high" : "info"}
        missing={results.airway.missing}
        reference={EL_GANZOURI_REFERENCE.label}
      >
        <div className="space-y-1.5">
          <p className="text-xs text-foreground-subtle">Mallampati</p>
          <ChipGroup
            size="sm"
            options={MALLAMPATI_CLASSES.map((c) => ({ code: c.code, label: c.label, title: c.detail }))}
            value={s.mallampati ?? null}
            onChange={(v) => set({ mallampati: (v ?? undefined) as 1 | 2 | 3 | 4 | undefined })}
            allowClear
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <NumberField label="Distance thyro-mentonnière" unit="cm" value={s.airway.thyromentalCm} onChange={(v) => set({ airway: { ...s.airway, thyromentalCm: v } })} />
          <NumberField label="Mobilité cervicale" unit="°" value={s.airway.neckMovementDeg} onChange={(v) => set({ airway: { ...s.airway, neckMovementDeg: v } })} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <YesNoChip label="Ouverture de bouche < 4 cm" value={s.airway.mouthOpeningUnder4cm} onChange={(v) => set({ airway: { ...s.airway, mouthOpeningUnder4cm: v } })} />
          <YesNoChip label="Propulsion mandibulaire possible" value={s.airway.canProtrudeMandible} onChange={(v) => set({ airway: { ...s.airway, canProtrudeMandible: v } })} />
        </div>
        <ChipGroup
          size="sm"
          options={[
            { code: "none" as const, label: "Pas d'antécédent d'intubation difficile" },
            { code: "questionable" as const, label: "Antécédent douteux" },
            { code: "definite" as const, label: "Intubation difficile connue" },
          ]}
          value={s.airway.difficultIntubationHistory ?? (s.conditions.difficult_airway?.present === true ? "definite" : s.conditions.difficult_airway?.present === false ? "none" : null)}
          onChange={(v) => set({ airway: { ...s.airway, difficultIntubationHistory: v ?? undefined } })}
          allowClear
        />
        <p className="text-xs text-foreground-subtle">Le Cormack-Lehane se note à la laryngoscopie, dans l&apos;onglet Bloc du dossier.</p>
      </ScoreCard>

      <ScoreCard title="Ventilation au masque · Langeron" summary={results.mask.label} level={results.mask.level} missing={results.mask.missing} reference={MASK_VENTILATION_REFERENCE.label}>
        <ItemsGrid
          items={MASK_VENTILATION_ITEMS}
          answers={mv.merged}
          derivedKeys={mv.derivedKeys}
          onChange={(v) => {
            // Snoring is shared with STOP-BANG: answering it here answers it there too.
            set({ maskVentilation: v, stopBang: v.snoring !== undefined && v.snoring !== mv.merged.snoring ? { ...s.stopBang, snoring: v.snoring } : s.stopBang });
          }}
        />
        <p className="text-xs text-foreground-subtle">Deux critères ou plus : ventilation au masque difficile prévisible.</p>
      </ScoreCard>

      <ScoreCard title="STOP-BANG · apnée du sommeil" summary={results.stopBang.label || (results.stopBang.value ? `${results.stopBang.value} / 8` : "")} level={results.stopBang.level} missing={results.stopBang.missing} reference={STOP_BANG_REFERENCE.label}>
        <ItemsGrid items={STOP_BANG_ITEMS} answers={sb.merged} derivedKeys={sb.derivedKeys} onChange={(v) => set({ stopBang: v })} />
      </ScoreCard>

      <ScoreCard title="Lee (RCRI) · risque cardiaque" summary={results.rcri.label || (results.rcri.value ? `${results.rcri.value} point(s)` : "")} level={results.rcri.level} missing={results.rcri.missing} reference={RCRI_REFERENCE.label}>
        <ItemsGrid items={RCRI_ITEMS} answers={lee.merged} derivedKeys={lee.derivedKeys} onChange={(v) => set({ rcri: v })} />
      </ScoreCard>

      <ScoreCard title="Capacité fonctionnelle · DASI" summary={results.dasi.label} level={results.dasi.level} missing={results.dasi.missing} reference={DASI_REFERENCE.label}>
        <ItemsGrid items={DASI_ITEMS} answers={s.dasi} onChange={(v) => set({ dasi: v })} />
        <p className="text-xs text-foreground-subtle">
          Score {results.dasi.value} · {results.dasi.mets} METs
        </p>
      </ScoreCard>

      <ScoreCard title="ARISCAT · complications pulmonaires" summary={results.ariscat.label} level={results.ariscat.level} missing={results.ariscat.missing} reference={ARISCAT_REFERENCE.label}>
        <div className="flex flex-wrap gap-1.5">
          <YesNoChip label="Infection respiratoire le mois précédent" value={s.ariscat.respiratoryInfectionLastMonth} onChange={(v) => set({ ariscat: { ...s.ariscat, respiratoryInfectionLastMonth: v } })} />
          <YesNoChip label="Hb ≤ 10 g/dL" value={s.ariscat.anemia ?? (p.hb !== undefined ? p.hb <= 10 : undefined)} derived={s.ariscat.anemia === undefined && p.hb !== undefined} onChange={(v) => set({ ariscat: { ...s.ariscat, anemia: v } })} />
          <YesNoChip label="Urgence" value={s.ariscat.emergency ?? s.surgery.emergency} derived={s.ariscat.emergency === undefined && s.surgery.emergency !== undefined} onChange={(v) => set({ ariscat: { ...s.ariscat, emergency: v } })} />
        </div>
        <ChipGroup
          size="sm"
          options={[
            { code: "peripheral" as const, label: "Incision périphérique" },
            { code: "upper_abdominal" as const, label: "Abdominale haute" },
            { code: "intrathoracic" as const, label: "Intrathoracique" },
          ]}
          value={s.ariscat.incision ?? s.surgery.incision ?? null}
          onChange={(v) => set({ ariscat: { ...s.ariscat, incision: v ?? undefined } })}
          allowClear
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField key={`dur-${s.surgery.durationHours}`} label="Durée prévue" unit="h" value={s.ariscat.durationHours ?? s.surgery.durationHours} onChange={(v) => set({ ariscat: { ...s.ariscat, durationHours: v } })} />
        </div>
        <p className="text-xs text-foreground-subtle">Âge et SpO₂ repris des données du patient. Score : {results.ariscat.value}</p>
      </ScoreCard>

      <ScoreCard title="Apfel · NVPO" summary={results.apfel.label || (results.apfel.value ? `${results.apfel.value} / 4` : "")} level={results.apfel.level} missing={results.apfel.missing} reference={APFEL_REFERENCE.label}>
        <ItemsGrid items={APFEL_ITEMS} answers={ap.merged} derivedKeys={ap.derivedKeys} onChange={(v) => set({ apfel: v })} />
      </ScoreCard>

      <ScoreCard title="Questionnaire hémorragique · HEMSTOP" summary={results.hemstop.label} level={results.hemstop.level} missing={results.hemstop.missing} reference={HEMSTOP_REFERENCE.label}>
        <ItemsGrid items={HEMSTOP_ITEMS} answers={s.hemstop} onChange={(v) => set({ hemstop: v })} />
        <p className="text-xs text-foreground-subtle">{results.hemstop.detail}</p>
      </ScoreCard>

      <ScoreCard title="CHA₂DS₂-VASc · risque thromboembolique (FA)" summary={results.cha.label} level={results.cha.level} missing={results.cha.missing} reference={CHA2DS2VASC_REFERENCE.label}>
        <ItemsGrid
          items={{ heartFailure: "Insuffisance cardiaque", hypertension: "HTA", diabetes: "Diabète", strokeTiaThromboembolism: "AVC, AIT ou embolie", vascularDisease: "Maladie vasculaire" }}
          answers={merged.cha.merged}
          derivedKeys={merged.cha.derivedKeys}
          onChange={(v) => set({ cha: v })}
        />
        <p className="text-xs text-foreground-subtle">Âge et sexe repris des données du patient.</p>
      </ScoreCard>

      <ScoreCard title="HAS-BLED · risque hémorragique sous anticoagulant" summary={results.hasBled.label} level={results.hasBled.level} missing={results.hasBled.missing} reference={HAS_BLED_REFERENCE.label}>
        <ItemsGrid items={HAS_BLED_ITEMS} answers={hb.merged} derivedKeys={hb.derivedKeys} onChange={(v) => set({ hasBled: v })} />
      </ScoreCard>
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
      <div className="space-y-4">
        {patientFields}
        {surgeryFields}
        <ConditionsEditor
          key={`conditions-${resetKey}`}
          conditions={s.conditions}
          onChange={(conditions) => set({ conditions })}
          sex={p.sex}
          patient={p}
          onPatient={(patient) => set({ patient })}
        />
        <SubstancesEditor key={`substances-${resetKey}`} value={s.substances} onChange={(substances) => set({ substances })} />
        {treatmentFields}
        <div className="lg:hidden">{findingsPanel}</div>
        {scores}
        <ExamsPanel key={`exams-${resetKey}`} result={exams} exams={s.exams} onChange={(e) => set({ exams: e })} />
        <ConclusionPanel key={`conclusion-${resetKey}`} value={s.conclusion} onChange={(conclusion) => set({ conclusion })} notes={s.notes} onNotes={(notes) => set({ notes })} />
      </div>
      <div className="hidden space-y-3 lg:sticky lg:top-4 lg:block">
        <Synthesis s={s} asa={asa} results={results} exams={exams} />
        {findingsPanel}
      </div>
    </div>
  );
}

/**
 * The consultation when nothing is kept: the patient may never come
 * through your theatre. « Garder » turns it into a dossier (initials only,
 * encrypted on this device).
 */
export function ConsultationView({
  rules,
  onAskQuestion,
  onKeep,
}: {
  rules: Rule[];
  onAskQuestion: (q: QuestionInput) => void;
  onKeep: (initials: string, consultation: ConsultationState) => Promise<void>;
}) {
  const [s, setS] = useState<ConsultationState>(emptyConsultation);
  const [formKey, setFormKey] = useState(0);
  const [keeping, setKeeping] = useState(false);
  const [initials, setInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const validInitials = /^[a-zA-ZÀ-ÿ]{2}$/.test(initials.trim());

  function reset() {
    setS(emptyConsultation());
    setFormKey((k) => k + 1);
    setKeeping(false);
    setInitials("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] bg-surface-muted px-3 py-2">
        <p className="min-w-0 flex-1 text-xs text-foreground-muted">
          Rien n&apos;est enregistré tant que vous ne gardez pas la consultation. Si vous la gardez : initiales seulement, chiffrée sur cet appareil.
        </p>
        {keeping ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!validInitials) return;
              setBusy(true);
              try {
                await onKeep(initials.trim(), s);
                reset();
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              autoFocus
              value={initials}
              onChange={(e) => setInitials(e.target.value.slice(0, 2))}
              placeholder="Initiales (NP)"
              aria-label="Initiales : première lettre du nom puis du prénom"
              className="h-8 w-32 uppercase"
            />
            <Button size="sm" type="submit" disabled={!validInitials || busy}>
              Garder
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setKeeping(false)} aria-label="Annuler">
              <X className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setKeeping(true)}>
            <FolderPlus className="h-3.5 w-3.5" /> Garder dans un dossier
          </Button>
        )}
      </div>
      <ConsultationForm
        value={s}
        onChange={setS}
        rules={rules}
        onAskQuestion={onAskQuestion}
        formKey={formKey}
        patientActions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Nouvelle consultation
          </Button>
        }
      />
    </div>
  );
}
