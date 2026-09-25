"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleHelp, ClipboardCopy, ExternalLink, FolderPlus, MessageSquareQuote, Plus, Printer, Search, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, MultiChipGroup, ToggleChip } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { Combobox, FieldLabel, MiniNumber, Panel, RiskPill, ScoreCard, SourceBadge, TargetTag, DraftPill, YesNoChip, formatDateTime, localToIso, toLocalInput, Disclosure } from "@/components/preop/ui";
import { SurgeryPanel } from "@/components/preop/surgery-panel";
import { AllergiesEditor, ConditionsEditor, SubstancesEditor } from "@/components/preop/history-editor";
import { ExamsPanel } from "@/components/preop/exams-panel";
import { AttentionPanel, InstructionsPanel } from "@/components/preop/attention-panel";
import { TimelinePanel } from "@/components/preop/timeline-panel";
import { consultationTimeline, reminderSuggestions } from "@/lib/preop/timeline";
import { implausibleValues, valueFindings, type PatientValues } from "@/lib/preop/value-checks";
import { ECG_FINDINGS, ECG_RHYTHMS, EXAM_LABELS as CLINICAL_EXAM_LABELS, ecgSummary, examSummary, type ClinicalExam, type EcgFinding, type EcgFindings, type EcgRhythm } from "@/lib/preop/dossier";
import type { WatchedValue } from "@/lib/preop/catalog";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { QuickEntryPanel } from "@/components/preop/quick-entry-panel";
import { printSections } from "@/components/preop/print";
import { useUsage } from "@/components/preop/use-usage";
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
  MASK_VENTILATION_REFERENCE,
  NYHA_CLASSES,
  RCRI_ITEMS,
  RCRI_REFERENCE,
  STOP_BANG_ITEMS,
  STOP_BANG_REFERENCE,
  type RiskLevel,
  type Sex,
} from "@/lib/preop/scores";
import { ASA_REFERENCE } from "@/lib/preop/asa";
import { consultationScores, type ConsultationScores } from "@/lib/preop/consultation-scores";
import { effectiveConditions, lowerFirst } from "@/lib/preop/derive";
import { attentionPoints } from "@/lib/preop/attention";
import { patientInstructions, patientSheet } from "@/lib/preop/instructions";
import { stepMissing } from "@/lib/preop/completeness";
import { remainingCount, remainingQuestions } from "@/lib/preop/remaining-questions";
import { missingRules, type RuleGap } from "@/lib/preop/rule-gaps";
import { consultationRecap, recapText } from "@/lib/preop/recap";
import { pendingExams } from "@/lib/preop/exams";
import { emptyConsultation, upgradeConsultation, urgencyOf, type ConsultationState } from "@/lib/preop/dossier";
import { DEFAULT_CATALOGS } from "@/lib/preop/catalog-defaults";
import { cbipSearchUrl, searchMedications } from "@/lib/preop/medications";
import { matchProtocol, type Protocol, type ProtocolContent } from "@/lib/preop/protocols";
import { evaluate, indicationLabel, type EvaluationResult } from "@/lib/preop/rules/engine";
import { describeRule, formatHours } from "@/lib/preop/rules/describe";
import { beforeWhat, conflictText } from "@/lib/preop/rules/target";
import { combineQuestions, questionForMissingStop, type QuestionInput } from "@/lib/preop/rules/question";
import { INDICATIONS, TECHNIQUES, type Indication, type PatientTreatment, type Rule, type Technique } from "@/lib/preop/rules/types";
import { classesOf, fold, medicationOf, type Catalogs, type MedicationItem } from "@/lib/preop/catalog";
import { cbipChapterPath, cbipLink } from "@/lib/preop/cbip";
import { cn } from "@/lib/utils";

type YesNo<K extends string> = Partial<Record<K, boolean>>;
const ROMAN = ["I", "II", "III", "IV", "V"];
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** The rule library applied to a consultation (treatments, gesture, date, hospital, surgery, antecedents). */
export function evaluateConsultation(rules: Rule[], c: ConsultationState, catalogs: Catalogs = DEFAULT_CATALOGS): EvaluationResult {
  return evaluate(rules, {
    ...c.patient,
    treatments: c.treatments,
    techniques: c.techniques,
    plannedAt: localToIso(c.plannedAt),
    hospital: c.hospital || undefined,
    surgery: {
      bleedingRisk: c.surgery.bleedingRisk,
      cardiacRisk: c.surgery.cardiacRisk,
      grade: c.surgery.kce,
      urgency: urgencyOf(c.surgery),
      closedSpace: c.surgery.closedSpace === undefined ? undefined : c.surgery.closedSpace ? "yes" : "no",
    },
    // Deduced antecedents count too (insulin → insulin-treated diabetes…).
    conditions: effectiveConditions(c, catalogs).conditions,
  });
}

/** The resting ECG as read: rhythm, intervals, abnormalities (manual, chap. 51). */
function EcgEditor({ value: g, onChange }: { value: EcgFindings; onChange: (g: EcgFindings) => void }) {
  const set = (patch: Partial<EcgFindings>) => onChange({ ...g, ...patch });
  const filled = ecgSummary(g);
  return (
    <Disclosure
      className="rounded-[var(--radius-sm)] border border-border"
      initialOpen={!!filled}
      summaryClassName="cursor-pointer px-2.5 py-1.5 text-xs font-medium text-foreground"
      summary={<>ECG{filled ? <span className="font-normal text-foreground-subtle"> — {filled}</span> : null}</>}
    >
      <div className="space-y-2 px-2.5 pb-2.5">
        <ChipGroup size="sm" options={(Object.entries(ECG_RHYTHMS) as [EcgRhythm, string][]).map(([code, label]) => ({ code, label }))} value={g.rhythm ?? null} onChange={(v) => set({ rhythm: (v ?? undefined) as EcgRhythm | undefined })} allowClear />
        <div className="grid grid-cols-3 gap-2">
          <MiniNumber label="PR" unit="ms" placeholder="160" value={g.prMs} onChange={(prMs) => set({ prMs })} />
          <MiniNumber label="QRS" unit="ms" placeholder="90" value={g.qrsMs} onChange={(qrsMs) => set({ qrsMs })} />
          <MiniNumber label="QTc" unit="ms" placeholder="420" value={g.qtcMs} onChange={(qtcMs) => set({ qtcMs })} />
        </div>
        <MultiChipGroup options={(Object.entries(ECG_FINDINGS) as [EcgFinding, string][]).map(([code, label]) => ({ code, label }))} value={g.findings ?? []} onChange={(v) => set({ findings: v.length ? (v as EcgFinding[]) : undefined })} />
      </div>
    </Disclosure>
  );
}

/** Basic clinical examination: one tap per finding; normal answers count too (for the official sheet). */
function ExamEditor({ value: e, onChange }: { value: ClinicalExam; onChange: (e: ClinicalExam) => void }) {
  const set = (patch: Partial<ClinicalExam>) => onChange({ ...e, ...patch });
  const opts = <K extends keyof typeof CLINICAL_EXAM_LABELS>(k: K) => (Object.entries(CLINICAL_EXAM_LABELS[k]) as [string, string][]).map(([code, label]) => ({ code, label }));
  const filled = examSummary(e);
  return (
    <Disclosure
      className="rounded-[var(--radius-md)] border border-border"
      initialOpen={!!filled}
      summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground"
      summary={
        <>
          Examen clinique{filled ? <span className="font-normal text-foreground-subtle"> — {filled}</span> : null}
        </>
      }
    >
      <div className="space-y-2 px-3 pb-3">
        <div className="space-y-1">
          <FieldLabel>Auscultation cardiaque</FieldLabel>
          <ChipGroup size="sm" options={opts("heart")} value={e.heart ?? null} onChange={(v) => set({ heart: (v ?? undefined) as ClinicalExam["heart"] })} allowClear />
        </div>
        <div className="space-y-1">
          <FieldLabel>Auscultation pulmonaire</FieldLabel>
          <ChipGroup size="sm" options={opts("lungs")} value={e.lungs ?? null} onChange={(v) => set({ lungs: (v ?? undefined) as ClinicalExam["lungs"] })} allowClear />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip pressed={!!e.edema} onChange={(edema) => set({ edema: edema || undefined })} className="min-h-8 text-xs">
            Œdèmes des membres inférieurs
          </ToggleChip>
          <ToggleChip pressed={!!e.jvd} onChange={(jvd) => set({ jvd: jvd || undefined })} className="min-h-8 text-xs">
            Turgescence jugulaire
          </ToggleChip>
          <ToggleChip pressed={!!e.neuroDeficit} onChange={(neuroDeficit) => set({ neuroDeficit: neuroDeficit || undefined })} className="min-h-8 text-xs">
            Déficit neurologique préexistant
          </ToggleChip>
          <ToggleChip pressed={!!e.punctureSite} onChange={(punctureSite) => set({ punctureSite: punctureSite || undefined })} className="min-h-8 text-xs">
            Lésion / infection au site de ponction
          </ToggleChip>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <FieldLabel>Abord veineux</FieldLabel>
            <ChipGroup size="sm" options={opts("veins")} value={e.veins ?? null} onChange={(v) => set({ veins: (v ?? undefined) as ClinicalExam["veins"] })} allowClear />
          </div>
          <div className="space-y-1">
            <FieldLabel>Rachis (ponction)</FieldLabel>
            <ChipGroup size="sm" options={opts("spine")} value={e.spine ?? null} onChange={(v) => set({ spine: (v ?? undefined) as ClinicalExam["spine"] })} allowClear />
          </div>
        </div>
        <EcgEditor value={e.ecg ?? {}} onChange={(ecg) => set({ ecg: ecgSummary(ecg) ? ecg : undefined })} />
        <Input className="h-9" defaultValue={e.notes} onChange={(ev) => set({ notes: ev.target.value || undefined })} placeholder="Autre (abdomen, cicatrices, état cutané, dentition…)" aria-label="Autres éléments de l'examen" />
      </div>
    </Disclosure>
  );
}

/** Values of this block past a threshold (Paramètres › Valeurs à signaler), right under the fields. */
function ValueFlags({ patient, derived, kinds }: { patient: ConsultationState["patient"]; derived: PatientValues; kinds: WatchedValue[] }) {
  const { catalogs } = useCatalogs();
  const flags = valueFindings(patient, derived, catalogs.values).filter((f) => f.primary && kinds.includes(f.check.value));
  const wrong = implausibleValues(patient).filter((x) => (kinds as string[]).includes(x.value) || (kinds.includes("egfr") && x.value === "creatinine") || (kinds.includes("bmi") && (x.value === "weight" || x.value === "height")));
  if (!flags.length && !wrong.length) return null;
  const tone = { high: "border-danger/40 bg-danger-tint text-danger", medium: "border-accent/40 bg-accent-tint text-accent", info: "border-border bg-surface-muted text-foreground-muted" } as const;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Valeurs à signaler">
      {wrong.map((x) => (
        <li key={x.value} className="rounded-full border border-danger/40 bg-danger-tint px-2 py-0.5 text-[11px] text-danger">
          {x.label} : impossible, à vérifier
        </li>
      ))}
      {flags.map((f) => (
        <li key={f.check.id} title={f.check.attention?.text} className={cn("rounded-full border px-2 py-0.5 text-[11px]", tone[f.check.attention?.level ?? "info"])}>
          {f.measured} · {f.check.label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Step = "patient" | "surgery" | "history" | "treatments" | "airway" | "evaluation" | "exams" | "recap";

const STEPS: { step: Step; label: string }[] = [
  { step: "patient", label: "Patient" },
  { step: "surgery", label: "Intervention" },
  { step: "history", label: "Antécédents" },
  { step: "treatments", label: "Traitements" },
  { step: "airway", label: "Voies aériennes" },
  { step: "evaluation", label: "Évaluation" },
  { step: "exams", label: "Examens" },
  { step: "recap", label: "Récap" },
];

function StepBar({
  current,
  onSelect,
  badges,
  done,
  onQuick,
}: {
  current: Step;
  onSelect: (s: Step) => void;
  badges: Partial<Record<Step, { n: number; tone: "info" | "warn" }>>;
  done: Set<Step>;
  onQuick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-step="${current}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);
  return (
    <div ref={ref} className="sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0" role="tablist" aria-label="Étapes de la consultation">
      <button
        type="button"
        onClick={onQuick}
        className="flex shrink-0 items-center gap-1 rounded-full border border-accent/50 bg-accent-tint px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-tint/70"
        title="Saisie rapide ou dictée (Alt+S)"
      >
        <Zap className="h-3.5 w-3.5" /> Saisie rapide
      </button>
      {STEPS.map((s, i) => {
        const b = badges[s.step];
        return (
          <button
            key={s.step}
            data-step={s.step}
            type="button"
            role="tab"
            aria-selected={current === s.step}
            onClick={() => onSelect(s.step)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              current === s.step ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
            )}
          >
            {done.has(s.step) && current !== s.step ? <Check className="h-3.5 w-3.5 text-success" /> : <span className="tabular-nums opacity-60">{i + 1}</span>} {s.label}
            {b && b.n > 0 && (
              <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", current === s.step ? "bg-white/25" : b.tone === "warn" ? "bg-accent-tint text-accent" : "bg-surface-muted text-foreground-muted")}>{b.n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Treatments and rules
// ---------------------------------------------------------------------------

/** Under each search result: the brands that match what is typed first, then the CBIP chapter. */
function brandHint(m: { brands?: string[]; cbip?: { chapter: string } }, q: string): string {
  const f = fold(q);
  const brands = [...(m.brands ?? [])].sort((a, b) => Number(fold(b).includes(f)) - Number(fold(a).includes(f)));
  const chapter = m.cbip?.chapter ? cbipChapterPath(m.cbip.chapter).split(" › ").slice(-1)[0] : "";
  return [brands.slice(0, 3).join(", "), chapter].filter(Boolean).join(" · ");
}

/** What the catalogue knows about a treatment: its class, its interactions with anaesthesia, the CBIP monograph. */
function TreatmentFacts({ t }: { t: PatientTreatment }) {
  const { catalogs } = useCatalogs();
  const med = medicationOf(t, catalogs.medications);
  const classes = classesOf(t, catalogs);
  const interactions = [...(med?.interactions ?? []), ...classes.flatMap((k) => k.interactions ?? [])];
  return (
    <div className="col-span-2 space-y-1 text-[11px] text-foreground-muted">
      {classes.length > 0 && <p>Classe : {classes.map((k) => k.label).join(", ")}</p>}
      {interactions.length > 0 && (
        <ul className="space-y-0.5">
          {interactions.map((x, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">Avec {x.with} :</span> {x.effect}
            </li>
          ))}
        </ul>
      )}
      {med?.cbip?.chapter && <p>CBIP : {cbipChapterPath(med.cbip.chapter)}</p>}
      <a href={cbipLink(med) ?? cbipSearchUrl(t.name.split(" (")[0])} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
        <ExternalLink className="h-3 w-3" /> Fiche CBIP (spécialités, RCP, notice)
      </a>
    </div>
  );
}

function TreatmentsEditor({ treatments, onChange }: { treatments: PatientTreatment[]; onChange: (t: PatientTreatment[]) => void }) {
  const { catalogs } = useCatalogs();
  const [open, setOpen] = useState<string | null>(null);
  const usage = useUsage("medications");
  const frequent = usage.top
    .map((key) => catalogs.medications.find((m) => m.id === key || m.atc === key))
    .filter((m): m is NonNullable<typeof m> => !!m && !treatments.some((t) => (t.catalogId ?? t.atc) === m.id));
  const addMed = (key: string) => {
    const m = catalogs.medications.find((x) => x.id === key);
    if (!m) return;
    const id = crypto.randomUUID();
    onChange([...treatments, { id, atc: m.atc, name: m.name, catalogId: m.id, ...(m.components?.length ? { components: m.components } : {}) }]);
    usage.bump(m.id);
    setOpen(id);
  };
  const update = (id: string, patch: Partial<PatientTreatment>) => onChange(treatments.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-2">
      <Combobox
        placeholder="Ajouter un traitement (nom ou marque : Xarelto, Asaflow…)"
        search={(q) => searchMedications(q, 10, catalogs.medications).map((m) => ({ key: (m as MedicationItem).id, label: m.name, hint: brandHint(m, q) }))}
        onPick={(o) => addMed(o.key)}
        onFree={(q) => onChange([...treatments, { id: crypto.randomUUID(), atc: "", name: q }])}
        freeLabel={(q) => `« ${q} » (hors catalogue : ajoutez-le dans Paramètres pour ses implications)`}
      />
      {frequent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {frequent.slice(0, 8).map((m) => (
            <button key={m.id} type="button" onClick={() => addMed(m.id)} className="min-h-8 rounded-full border border-dashed border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-muted">
              + {m.name}
            </button>
          ))}
        </div>
      )}
      {treatments.length > 0 && (
        <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
          {treatments.map((t) => {
            const isOpen = open === t.id;
            const detail = [t.dailyDoseMg ? `${t.dailyDoseMg} mg/j` : "", t.indication ? INDICATIONS.find((i) => i.code === t.indication)?.label.toLowerCase() : "", t.lastDoseAt ? `dernière prise ${formatDateTime(t.lastDoseAt)}` : ""]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={t.id} className="px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setOpen(isOpen ? null : t.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-foreground">{t.name}</span>
                    <span className="block truncate text-[11px] text-foreground-subtle">{detail || "Dose, indication, dernière prise…"}</span>
                  </button>
                  <button type="button" onClick={() => onChange(treatments.filter((x) => x.id !== t.id))} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label={`Retirer ${t.name}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-2 grid grid-cols-2 gap-2 pb-1">
                    <MiniNumber label="Dose quotidienne" unit="mg/j" value={t.dailyDoseMg} onChange={(v) => update(t.id, { dailyDoseMg: v })} />
                    <label className="block min-w-0">
                      <span className="block text-[11px] font-medium text-foreground-subtle">Indication</span>
                      <Select className="mt-0.5 h-9" value={t.indication ?? ""} onChange={(e) => update(t.id, { indication: (e.target.value || undefined) as Indication | undefined })}>
                        <option value="">Non précisée</option>
                        {INDICATIONS.map((i) => (
                          <option key={i.code} value={i.code}>
                            {i.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    {t.indication && ["coronary_stent", "secondary_prevention_stroke", "secondary_prevention_coronary", "vte"].includes(t.indication) && (
                      <label className="block min-w-0">
                        <span className="block text-[11px] font-medium text-foreground-subtle">Date de l&apos;événement</span>
                        <Input type="date" className="mt-0.5 h-9" value={t.eventDate ?? ""} onChange={(e) => update(t.id, { eventDate: e.target.value || undefined })} />
                      </label>
                    )}
                    <label className="block min-w-0">
                      <span className="block text-[11px] font-medium text-foreground-subtle">Dernière prise</span>
                      <Input type="datetime-local" className="mt-0.5 h-9" value={t.lastDoseAt ? toLocalInput(t.lastDoseAt) : ""} onChange={(e) => update(t.id, { lastDoseAt: localToIso(e.target.value) })} />
                    </label>
                    <TreatmentFacts t={t} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** What the rules say, what they need to decide, and — above all — what has no rule yet. */
function RulesPanel({ evaluation, gaps, onAskQuestion, crcl, rulesCount }: { evaluation: EvaluationResult; gaps: RuleGap[]; onAskQuestion: (q: QuestionInput) => void; crcl?: number; rulesCount: number }) {
  const applying = evaluation.findings.filter((f) => f.status === "applies");
  const historyMissing = evaluation.missing.filter((m) => m.key.startsWith("history:"));
  const otherMissing = evaluation.missing.filter((m) => !m.key.startsWith("history:"));
  // A treatment with no rule at all is asked about once (the general question covers the technique).
  const techniqueGaps = evaluation.gaps.filter((g) => !gaps.some((x) => x.key === `t:${g.treatment.id}`));
  const all: { key: string; label: string; question: QuestionInput }[] = [
    ...gaps,
    ...techniqueGaps.map((g) => ({
      key: `g:${g.treatment.id}-${g.technique ?? g.target}`,
      label: g.label,
      question: {
        ...questionForMissingStop({ drug: g.treatment.name.toLowerCase(), dailyDoseMg: g.treatment.dailyDoseMg, technique: g.technique, crcl, indication: g.treatment.indication ? indicationLabel(g.treatment.indication) : undefined }),
        preset: [{ kind: "drug" as const, atc: g.treatment.atc }],
      },
    })),
  ];
  return (
    <Panel title="Vos règles pour ce patient" actions={<span className="text-xs text-foreground-subtle">{rulesCount} règle(s) active(s)</span>}>
      {all.length > 0 && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint/60 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Search className="h-4 w-4 text-accent" /> Je ne sais pas encore quoi faire pour :
            </p>
            {all.length > 1 && (
              <Button size="sm" variant="secondary" onClick={() => onAskQuestion(combineQuestions(all.map((g) => g.question)))}>
                Tout rechercher en une fois
              </Button>
            )}
          </div>
          <ul className="space-y-1.5">
            {all.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-surface px-2.5 py-1.5">
                <span className="min-w-0 flex-1 text-sm text-foreground">{g.label}</span>
                <Button size="sm" variant="ghost" onClick={() => onAskQuestion(g.question)}>
                  <Plus className="h-3.5 w-3.5" /> Rechercher
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-foreground-muted">« Rechercher » prépare la question à coller dans Consensus ou OpenEvidence ; la réponse vérifiée devient la règle, qui s&apos;appliquera ensuite toute seule.</p>
        </div>
      )}
      {evaluation.missing.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm text-foreground">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleHelp className="h-4 w-4 text-accent" /> À compléter pour décider
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-foreground-muted">
            {otherMissing.map((m) => (
              <li key={m.key}>{m.label}</li>
            ))}
            {historyMissing.length > 0 && (
              <li>
                Antécédents à préciser (oui / non, ou « RAS » pour tout un système) :{" "}
                {historyMissing.map((m) => lowerFirst(m.label.replace(/^Antécédent : /, ""))).join(", ")}
              </li>
            )}
          </ul>
        </div>
      )}
      {evaluation.drafts.length > 0 && (
        <p className="text-xs text-foreground-muted">
          <DraftPill /> {evaluation.drafts.length} règle(s) en brouillon s&apos;appliqueraient : affichées pour information, elles ne comptent ni dans l&apos;échéancier ni dans les consignes au patient tant que vous ne les avez pas
          vérifiées et activées (Réglages › Règles).
        </p>
      )}
      {applying.length === 0 && evaluation.drafts.length === 0 && all.length === 0 && evaluation.missing.length === 0 && <p className="text-sm text-foreground-subtle">Aucun traitement ni antécédent qui demande une règle.</p>}
      <ul className="space-y-2">
        {[...applying.map((f) => ({ f, draft: false })), ...evaluation.drafts.map((f) => ({ f, draft: true }))].map(({ f, draft }) => (
          <li key={f.rule.id} className={cn("rounded-[var(--radius-md)] border px-3 py-2", draft ? "border-dashed border-accent/60 bg-accent-tint/20" : "border-border")}>
            <div className="flex items-start gap-2">
              <SourceBadge level={f.rule.source.level} />
              <div className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap gap-1">
                  {draft && <DraftPill />}
                  <TargetTag rule={f.rule} />
                </span>
                {f.outcomes.map((o, i) => (
                  <p key={i} className={cn("text-sm", o.kind === "stop_before" && o.conflict ? "text-danger" : "text-foreground")}>
                    {o.kind === "stop_before" && (
                      <>
                        <strong>{o.treatment.name}</strong> : dernière prise au moins {formatHours(o.hours)} {beforeWhat(f.rule)}
                        {o.lastDoseBy && <> — au plus tard le {formatDateTime(o.lastDoseBy)}</>}
                        {o.conflict && (
                          <span className="mt-0.5 flex items-start gap-1 font-medium">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {conflictText(f.rule, formatDateTime(o.conflict.earliestAt))}
                          </span>
                        )}
                      </>
                    )}
                    {o.kind === "resume_after" && (
                      <>
                        Reprise {o.treatment ? <strong>{o.treatment.name}</strong> : null} au plus tôt {formatHours(o.hours)} après
                        {o.resumeFrom && <> — à partir du {formatDateTime(o.resumeFrom)}</>}
                      </>
                    )}
                    {o.kind === "requirement" && <span className={o.blocking ? "font-medium text-danger" : undefined}>{o.text}</span>}
                    {o.kind === "exam" && (
                      <>
                        Examen : {o.exam}
                        {o.notBefore && (o.withinDays ?? 0) <= 30 && <> — pas avant le {formatDateTime(o.notBefore)}</>}
                      </>
                    )}
                    {o.kind === "info" && <>{o.text}</>}
                  </p>
                ))}
                <p className="text-[11px] text-foreground-subtle">
                  {[f.rule.source.organisation, f.rule.source.year, f.rule.source.grade && `grade ${f.rule.source.grade}`].filter(Boolean).join(" · ")}
                  {f.toRecheck && <span className="ml-1.5 rounded bg-accent-tint px-1 text-accent">à revérifier</span>}
                </p>
                {f.overridden.length > 0 && (
                  <p className="text-[11px] text-foreground-muted">
                    Autre avis : {f.overridden.map((o) => `${o.source.organisation} ${o.source.year ?? ""} — ${describeRule(o).replace(/^Si .* → /, "")}`).join(" ; ")}
                  </p>
                )}
                {f.rule.source.quote && (
                  <details className="text-xs text-foreground-muted">
                    <summary className="cursor-pointer font-medium text-primary">Pourquoi ?</summary>
                    <p className="mt-1 flex gap-1.5 italic">
                      <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f.rule.source.quote}
                    </p>
                  </details>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function ItemsGrid<K extends string>({ items, answers, derivedKeys, onChange }: { items: Record<K, string | { label: string }>; answers: YesNo<K>; derivedKeys?: Set<K>; onChange: (next: YesNo<K>) => void }) {
  const keys = Object.keys(items) as K[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((k) => {
        const item = items[k];
        return <YesNoChip key={k} label={typeof item === "string" ? item : item.label} value={answers[k]} derived={derivedKeys?.has(k)} onChange={(v) => onChange({ ...answers, [k]: v })} />;
      })}
    </div>
  );
}

function ScoreTile({ name, value, label, level, missing }: { name: string; value: string; label: string; level: RiskLevel; missing: number }) {
  const tone = level === "high" ? "border-danger/40 bg-danger-tint/50" : level === "intermediate" ? "border-accent/40 bg-accent-tint/50" : "border-border bg-surface";
  return (
    <div className={cn("min-w-0 rounded-[var(--radius-md)] border px-2.5 py-2", tone)}>
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{name}</p>
      <p className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="truncate text-[11px] text-foreground-muted">{label || (missing ? `${missing} réponse(s) manquante(s)` : "—")}</p>
    </div>
  );
}

function EvaluationStep({ s, set, onChange, scores }: { s: ConsultationState; set: (p: Partial<ConsultationState>) => void; onChange: (c: ConsultationState) => void; scores: ConsultationScores }) {
  const { merged, results: r, asaSuggestion, asa } = scores;
  const groups = remainingQuestions(s, scores);
  const anticoag = scores.conditions.arrhythmia?.present || s.treatments.some((t) => /^B01A[AEF]/.test(t.atc));
  return (
    <div className="space-y-4">
      <Panel title="ASA" actions={asa ? <RiskPill level={asa >= 3 ? "intermediate" : "info"}>{`${ASA_CLASSES[asa - 1].label}${s.surgery.emergency ? "E" : ""}${s.asa ? "" : " · suggéré"}`}</RiskPill> : null}>
        <ChipGroup size="sm" options={ASA_CLASSES.slice(0, 5).map((c) => ({ code: c.code, label: c.label, title: c.detail }))} value={s.asa ?? null} onChange={(v) => set({ asa: v ?? undefined })} allowClear />
        {asaSuggestion.asa ? (
          <div className="rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2 text-xs text-foreground-muted">
            <p className="font-medium text-foreground">
              Suggestion : {ASA_CLASSES[asaSuggestion.asa - 1].label}
              {s.asa && s.asa !== asaSuggestion.asa ? ` (vous avez choisi ${ASA_CLASSES[s.asa - 1].label})` : ""}
            </p>
            <ul className="mt-0.5 list-disc pl-4">
              {asaSuggestion.reasons.map((x, i) => (
                <li key={i}>
                  {x.label} → {ASA_CLASSES[x.asa - 1].label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-foreground-subtle">Renseignez les antécédents : la classe se propose d&apos;elle-même.</p>
        )}
        <p className="text-[11px] text-foreground-subtle">Référence : {ASA_REFERENCE}</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <FieldLabel>Dyspnée (NYHA)</FieldLabel>
            <ChipGroup size="sm" options={NYHA_CLASSES.map((c) => ({ code: c.code as number, label: ROMAN[c.code - 1], title: c.detail }))} value={s.nyha ?? null} onChange={(v) => set({ nyha: v ?? undefined })} allowClear />
          </div>
          <div className="space-y-1">
            <FieldLabel>Fragilité (CFS 1–9)</FieldLabel>
            <ChipGroup size="sm" options={CLINICAL_FRAILTY_SCALE.map((c) => ({ code: c.code as number, label: String(c.code), title: c.detail }))} value={s.frailty ?? null} onChange={(v) => set({ frailty: v ?? undefined })} allowClear />
            {s.frailty && <p className="text-[11px] text-foreground-muted">{CLINICAL_FRAILTY_SCALE[s.frailty - 1].detail}</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Questions restantes" actions={<span className="text-xs text-foreground-subtle">{remainingCount(groups) || "aucune"}</span>}>
        {groups.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Tout ce que les scores demandent est déjà connu ou déduit.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {g.title} <span className="text-[11px] font-normal text-foreground-subtle">· {g.feeds}</span>
                  </p>
                  {g.questions.length > 1 && (
                    <button type="button" onClick={() => onChange(g.questions.reduce((acc, q) => q.apply(acc, false), s))} className="shrink-0 text-xs font-medium text-primary hover:underline">
                      Tout non
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.questions.map((q) => (
                    <span key={q.key} className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-border">
                      <span className="flex items-center px-2 text-xs text-foreground">{q.label}</span>
                      <button type="button" onClick={() => onChange(q.apply(s, true))} className="border-l border-border px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary-tint">
                        Oui
                      </button>
                      <button type="button" onClick={() => onChange(q.apply(s, false))} className="border-l border-border px-2 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted">
                        Non
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ScoreTile name="Lee (RCRI)" value={`${r.rcri.value}`} label={r.rcri.label} level={r.rcri.level} missing={r.rcri.missing} />
        <ScoreTile name="STOP-BANG" value={`${r.stopBang.value}/8`} label={r.stopBang.label} level={r.stopBang.level} missing={r.stopBang.missing} />
        <ScoreTile name="Apfel" value={`${r.apfel.value}/4`} label={r.apfel.label} level={r.apfel.level} missing={r.apfel.missing} />
        <ScoreTile name="ARISCAT" value={`${r.ariscat.value}`} label={r.ariscat.label} level={r.ariscat.level} missing={r.ariscat.missing} />
        <ScoreTile name="El-Ganzouri" value={`${r.airway.value}`} label={r.airway.label} level={r.airway.level} missing={r.airway.missing} />
        <ScoreTile name="Langeron" value={`${r.mask.value}/5`} label={r.mask.label} level={r.mask.level} missing={r.mask.missing} />
        <ScoreTile name="HEMSTOP" value={`${r.hemstop.value}/7`} label={r.hemstop.label} level={r.hemstop.level} missing={r.hemstop.missing} />
        {(s.surgery.cardiacRisk === "intermediate" || s.surgery.cardiacRisk === "high" || r.dasi.missing < 12) && <ScoreTile name="DASI" value={r.dasi.missing === 0 ? `${r.dasi.mets} METs` : `${r.dasi.value}`} label={r.dasi.label} level={r.dasi.level} missing={r.dasi.missing} />}
        {anticoag && <ScoreTile name="CHA₂DS₂-VASc" value={`${r.cha.value}`} label={r.cha.label} level={r.cha.level} missing={r.cha.missing} />}
        {anticoag && <ScoreTile name="HAS-BLED" value={`${r.hasBled.value}`} label={r.hasBled.label} level={r.hasBled.level} missing={r.hasBled.missing} />}
      </div>

      <details className="rounded-[var(--radius-lg)] border border-border bg-surface">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-foreground">Revoir ou corriger les réponses des scores</summary>
        <div className="space-y-2 border-t border-border p-2">
          <ScoreCard title="STOP-BANG" summary={r.stopBang.label} level={r.stopBang.level} missing={r.stopBang.missing} reference={STOP_BANG_REFERENCE.label}>
            <ItemsGrid items={STOP_BANG_ITEMS} answers={merged.stopBang.merged} derivedKeys={merged.stopBang.derivedKeys} onChange={(v) => set({ stopBang: v })} />
          </ScoreCard>
          <ScoreCard title="Lee (RCRI)" summary={r.rcri.label} level={r.rcri.level} missing={r.rcri.missing} reference={RCRI_REFERENCE.label}>
            <ItemsGrid items={RCRI_ITEMS} answers={merged.rcri.merged} derivedKeys={merged.rcri.derivedKeys} onChange={(v) => set({ rcri: v })} />
          </ScoreCard>
          <ScoreCard title="Apfel" summary={r.apfel.label} level={r.apfel.level} missing={r.apfel.missing} reference={APFEL_REFERENCE.label}>
            <ItemsGrid items={APFEL_ITEMS} answers={merged.apfel.merged} derivedKeys={merged.apfel.derivedKeys} onChange={(v) => set({ apfel: v })} />
          </ScoreCard>
          <ScoreCard title="ARISCAT" summary={r.ariscat.label} level={r.ariscat.level} missing={r.ariscat.missing} reference={ARISCAT_REFERENCE.label}>
            <p className="text-xs text-foreground-muted">Âge, SpO₂, Hb, incision, durée et urgence viennent du patient et de l&apos;intervention.</p>
            <div className="flex flex-wrap gap-1.5">
              <YesNoChip label="Infection respiratoire le mois précédent" value={s.ariscat.respiratoryInfectionLastMonth ?? scores.conditions.recent_uri?.present} onChange={(v) => set({ ariscat: { ...s.ariscat, respiratoryInfectionLastMonth: v } })} />
            </div>
          </ScoreCard>
          <ScoreCard title="DASI · capacité fonctionnelle" summary={r.dasi.label} level={r.dasi.level} missing={r.dasi.missing} reference={DASI_REFERENCE.label}>
            <ItemsGrid items={DASI_ITEMS} answers={s.dasi} onChange={(v) => set({ dasi: v })} />
          </ScoreCard>
          <ScoreCard title="HEMSTOP" summary={r.hemstop.label} level={r.hemstop.level} missing={r.hemstop.missing} reference={HEMSTOP_REFERENCE.label}>
            <ItemsGrid items={HEMSTOP_ITEMS} answers={s.hemstop} onChange={(v) => set({ hemstop: v })} />
          </ScoreCard>
          <ScoreCard title="CHA₂DS₂-VASc" summary={r.cha.label} level={r.cha.level} missing={r.cha.missing} reference={CHA2DS2VASC_REFERENCE.label}>
            <ItemsGrid
              items={{ heartFailure: "Insuffisance cardiaque", hypertension: "HTA", diabetes: "Diabète", strokeTiaThromboembolism: "AVC, AIT ou embolie", vascularDisease: "Maladie vasculaire" }}
              answers={merged.cha.merged}
              derivedKeys={merged.cha.derivedKeys}
              onChange={(v) => set({ cha: v })}
            />
          </ScoreCard>
          <ScoreCard title="HAS-BLED" summary={r.hasBled.label} level={r.hasBled.level} missing={r.hasBled.missing} reference={HAS_BLED_REFERENCE.label}>
            <ItemsGrid items={HAS_BLED_ITEMS} answers={merged.hasBled.merged} derivedKeys={merged.hasBled.derivedKeys} onChange={(v) => set({ hasBled: v })} />
          </ScoreCard>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Airway examination
// ---------------------------------------------------------------------------

function AirwayStep({ s, set, scores }: { s: ConsultationState; set: (p: Partial<ConsultationState>) => void; scores: ConsultationScores }) {
  const r = scores.results;
  const aw = s.airway;
  const setAw = (patch: Partial<ConsultationState["airway"]>) => set({ airway: { ...aw, ...patch } });
  return (
    <Panel title="Voies aériennes">
      <div className="space-y-1">
        <FieldLabel>Mallampati</FieldLabel>
        <ChipGroup
          size="sm"
          options={MALLAMPATI_CLASSES.map((c) => ({ code: c.code, label: c.label, title: c.detail }))}
          value={s.mallampati ?? null}
          onChange={(v) => set({ mallampati: (v ?? undefined) as 1 | 2 | 3 | 4 | undefined })}
          allowClear
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniNumber label="Thyro-mentonnière" unit="cm" value={aw.thyromentalCm} onChange={(v) => setAw({ thyromentalCm: v })} />
        <MiniNumber label="Mobilité cervicale" unit="°" value={aw.neckMovementDeg} onChange={(v) => setAw({ neckMovementDeg: v })} />
        <MiniNumber label="Tour de cou" unit="cm" value={s.patient.neckCm} onChange={(v) => set({ patient: { ...s.patient, neckCm: v } })} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <YesNoChip label="Ouverture de bouche < 4 cm" value={aw.mouthOpeningUnder4cm} onChange={(v) => setAw({ mouthOpeningUnder4cm: v })} />
        <YesNoChip label="Propulsion mandibulaire possible" value={aw.canProtrudeMandible} onChange={(v) => setAw({ canProtrudeMandible: v })} />
        <YesNoChip label="Barbe" value={s.maskVentilation.beard} onChange={(v) => set({ maskVentilation: { ...s.maskVentilation, beard: v } })} />
        <YesNoChip label="Édentation" value={s.maskVentilation.edentulous} onChange={(v) => set({ maskVentilation: { ...s.maskVentilation, edentulous: v } })} />
        <YesNoChip label="Ronflement" value={s.stopBang.snoring} onChange={(v) => set({ stopBang: { ...s.stopBang, snoring: v } })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ScoreTile name="Laryngoscopie" value={`${r.airway.value}`} label={r.airway.label} level={r.airway.level} missing={r.airway.missing} />
        <ScoreTile name="Masque" value={`${r.mask.value}/5`} label={r.mask.label} level={r.mask.level} missing={r.mask.missing} />
        <ScoreTile name="STOP-BANG" value={`${r.stopBang.value}/8`} label={r.stopBang.label} level={r.stopBang.level} missing={r.stopBang.missing} />
      </div>
      <p className="text-[11px] text-foreground-subtle">
        {EL_GANZOURI_REFERENCE.label} · {MASK_VENTILATION_REFERENCE.label}. Poids, IMC, âge, antécédent d&apos;intubation difficile viennent des autres étapes ; le Cormack se note au bloc.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Recap
// ---------------------------------------------------------------------------

function RecapStep({
  sections,
  onPrint,
  onPrintPatient,
  missing,
  onGo,
}: {
  sections: ReturnType<typeof consultationRecap>;
  onPrint: () => void;
  onPrintPatient: () => void;
  missing: [Step, string[]][];
  onGo: (s: Step) => void;
}) {
  const { toast } = useToast();
  return (
    <Panel
      title="Récapitulatif"
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(recapText(sections));
                toast("Récapitulatif copié.", { variant: "success" });
              } catch {
                toast("Copie impossible sur ce navigateur.", { variant: "error" });
              }
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> Copier
          </Button>
          <Button size="sm" variant="ghost" onClick={onPrint}>
            <Printer className="h-3.5 w-3.5" /> Imprimer
          </Button>
          <Button size="sm" variant="ghost" onClick={onPrintPatient}>
            <Printer className="h-3.5 w-3.5" /> Fiche patient
          </Button>
        </>
      }
    >
      {missing.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint/50 px-3 py-2 text-xs">
          <p className="font-medium text-foreground">Encore à compléter</p>
          <ul className="mt-1 space-y-0.5">
            {missing.map(([step, items]) => (
              <li key={step}>
                <button type="button" onClick={() => onGo(step)} className="text-left text-accent hover:underline">
                  {STEPS.find((x) => x.step === step)?.label} : {items.join(", ")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-foreground-subtle">Dans l&apos;ordre de la feuille de consultation, pour la recopier.</p>
      <div className="space-y-3" id="preop-recap">
        {sections.map((sec) => (
          <section key={sec.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-strong">{sec.title}</h3>
            <ul className="mt-0.5 space-y-0.5 text-sm text-foreground">
              {sec.lines.map((l, i) => (
                <li key={i} className="break-words">
                  {l}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/**
 * The consultation, step by step (one screen at a time, phone first):
 * every answer is used everywhere it counts — scores, ASA, tests, rules,
 * points of attention — and only what can't be deduced is asked.
 * Controlled: the unsaved consultation and a dossier both use it.
 * Text and number fields are uncontrolled: change `formKey` to reload them.
 */
export function ConsultationForm({
  value: s,
  onChange,
  rules,
  onAskQuestion,
  formKey = 0,
  patientActions,
  plan,
  protocols = [],
  initials,
}: {
  value: ConsultationState;
  onChange: (next: ConsultationState) => void;
  rules: Rule[];
  onAskQuestion: (q: QuestionInput) => void;
  formKey?: number | string;
  patientActions?: React.ReactNode;
  /** The dossier's anaesthesia plan, when there is one (post-op opioids for Apfel…). */
  plan?: ProtocolContent;
  protocols?: Protocol[];
  initials?: string;
}) {
  const { catalogs } = useCatalogs();
  const [step, setStep] = useState<Step>("patient");
  const set = (patch: Partial<ConsultationState>) => onChange({ ...s, ...patch });
  const p = s.patient;

  const scores = useMemo(() => consultationScores(s, { plan, catalogs }), [s, plan, catalogs]);
  const evaluation = useMemo(() => evaluateConsultation(rules, s, catalogs), [rules, s, catalogs]);
  const points = useMemo(() => attentionPoints(s, scores, plan), [s, scores, plan]);
  const instructions = useMemo(() => patientInstructions(s, evaluation), [s, evaluation]);
  const gaps = useMemo(() => missingRules(rules, s, scores.conditions, { catalogs, crcl: scores.derived.crcl }), [rules, s, scores, catalogs]);
  const groups = useMemo(() => remainingQuestions(s, scores), [s, scores]);
  const missing = useMemo(() => stepMissing(s, scores, groups), [s, scores, groups]);
  const done = new Set((Object.entries(missing) as [Step, string[]][]).filter(([k, v]) => v.length === 0 && k !== "recap").map(([k]) => k));
  const [quick, setQuick] = useState(false);
  // Uncontrolled fields reload after a change made elsewhere (quick entry).
  const [version, setVersion] = useState(0);
  const lastQuick = useRef(quick);
  useEffect(() => {
    if (lastQuick.current && !quick) setVersion((v) => v + 1);
    lastQuick.current = quick;
  }, [quick]);
  const recap = useMemo(() => consultationRecap(s, scores, { points, instructions, initials }), [s, scores, points, instructions, initials]);
  const toRequest = pendingExams(s, scores.exams);
  const timeline = useMemo(() => consultationTimeline(s, evaluation), [s, evaluation]);
  const protocol = matchProtocol(protocols, s.surgery, s.hospital, catalogs.surgeries);
  const surgeryItem = s.surgery.catalogId ? catalogs.surgeries.find((x) => x.id === s.surgery.catalogId) : undefined;
  const high = points.filter((x) => x.level === "high").length;
  const ruleGaps = gaps.length + evaluation.gaps.filter((g) => !gaps.some((x) => x.key === `t:${g.treatment.id}`)).length;

  // The technique comes from the protocol of this intervention, else from its usual technique
  // (Paramètres › Interventions) — once per intervention, then it's yours to change.
  const autoTechnique = useRef<string | null>(null);
  const techniqueSource = protocol?.content.techniques.length ? { key: `p:${protocol.id}`, techniques: protocol.content.techniques } : surgeryItem?.techniques?.length ? { key: `s:${surgeryItem.id}`, techniques: surgeryItem.techniques } : null;
  useEffect(() => {
    if (!techniqueSource || s.techniques.length > 0 || autoTechnique.current === techniqueSource.key) return;
    autoTechnique.current = techniqueSource.key;
    onChange({ ...s, techniques: [...techniqueSource.techniques] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the source of the technique changes
  }, [techniqueSource?.key]);

  const idx = STEPS.findIndex((x) => x.step === step);
  const go = (next: Step) => {
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // On a computer: Alt+← / Alt+→ between steps, Alt+S for the quick entry.
  const goRef = useRef(go);
  const stepRef = useRef(step);
  useEffect(() => {
    goRef.current = go;
    stepRef.current = step;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const i = STEPS.findIndex((x) => x.step === stepRef.current);
      if (e.key === "ArrowRight" && i < STEPS.length - 1) goRef.current(STEPS[i + 1].step);
      else if (e.key === "ArrowLeft" && i > 0) goRef.current(STEPS[i - 1].step);
      else if (e.key.toLowerCase() === "s") setQuick((q) => !q);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  const protocolSummary = protocol
    ? [
        protocol.content.techniques.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.split(" (")[0] ?? t).join(" + "),
        protocol.content.drugs
          .filter((d) => d.phase === "alr" || d.phase === "induction" || d.phase === "antibio")
          .map((d) => d.name)
          .slice(0, 5)
          .join(", "),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const content = (() => {
    switch (step) {
      case "patient":
        return (
          <Panel title="Patient" actions={patientActions}>
            <ChipGroup
              size="sm"
              options={[
                { code: "M" as Sex, label: "Homme" },
                { code: "F" as Sex, label: "Femme" },
              ]}
              value={p.sex ?? null}
              onChange={(v) => set({ patient: { ...p, sex: v ?? undefined } })}
            />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <MiniNumber label="Âge" unit="ans" value={p.age} onChange={(v) => set({ patient: { ...p, age: v } })} />
              <MiniNumber label="Poids" unit="kg" value={p.weightKg} onChange={(v) => set({ patient: { ...p, weightKg: v } })} />
              <MiniNumber label="Taille" unit="cm" value={p.heightCm} onChange={(v) => set({ patient: { ...p, heightCm: v !== undefined && v < 3 ? Math.round(v * 100) : v } })} />
              <MiniNumber label="PAS" unit="mmHg" value={p.sbp} onChange={(v) => set({ patient: { ...p, sbp: v } })} />
              <MiniNumber label="PAD" unit="mmHg" value={p.dbp} onChange={(v) => set({ patient: { ...p, dbp: v } })} />
              <MiniNumber label="FC" unit="/min" value={p.hr} onChange={(v) => set({ patient: { ...p, hr: v } })} />
              <MiniNumber label="SpO₂" unit="%" value={p.spo2} onChange={(v) => set({ patient: { ...p, spo2: v } })} />
            </div>
            <ValueFlags patient={p} derived={scores.derived} kinds={["sbp", "dbp", "hr", "spo2", "bmi", "age"]} />
            <details className="text-[11px] text-foreground-subtle">
              <summary className="cursor-pointer">
                {[
                  scores.derived.bmi !== undefined && `IMC ${round(scores.derived.bmi, 1)}`,
                  scores.derived.ibw !== undefined && `poids idéal ${round(scores.derived.ibw)} kg`,
                  scores.derived.lbw !== undefined && `maigre ${round(scores.derived.lbw)} kg`,
                  scores.derived.abw !== undefined && `ajusté ${round(scores.derived.abw)} kg`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "IMC et poids de référence se calculent avec sexe, poids et taille."}{" "}
                <span className="underline">comment ?</span>
              </summary>
              <ul className="mt-1 space-y-0.5 pl-3">
                <li>IMC = poids / taille² (kg/m²).</li>
                <li>Poids idéal (Devine) = 50 kg (homme) ou 45,5 kg (femme) + 0,91 × (taille en cm − 152,4) — c&apos;est aussi le « poids prédit » de la ventilation protectrice.</li>
                <li>Poids maigre (Janmahasatian 2005) = 9 270 × poids / (6 680 + 216 × IMC) chez l&apos;homme, / (8 780 + 244 × IMC) chez la femme — pour l&apos;induction (propofol, morphiniques) chez l&apos;obèse.</li>
                <li>Poids ajusté = poids idéal + 0,4 × (poids réel − poids idéal) — souvent pour les antibiotiques et certains curares.</li>
                <li>Le poids à utiliser dépend de chaque produit : voir vos protocoles.</li>
              </ul>
            </details>
            <details className="rounded-[var(--radius-md)] border border-border" open={p.hb !== undefined || p.creatinineMgDl !== undefined}>
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">Biologie</summary>
              <div className="grid grid-cols-3 gap-2 px-3 pb-3 sm:grid-cols-5">
                <MiniNumber label="Hb" unit="g/dL" value={p.hb} onChange={(v) => set({ patient: { ...p, hb: v !== undefined && v > 25 ? Math.round(v) / 10 : v } })} />
                <MiniNumber label="Plaquettes" unit="G/L" value={p.platelets} onChange={(v) => set({ patient: { ...p, platelets: v !== undefined && v > 2000 ? Math.round(v / 1000) : v } })} />
                <MiniNumber label="INR" value={p.inr} onChange={(v) => set({ patient: { ...p, inr: v } })} />
                <MiniNumber label="Créatinine" unit="mg/dL" value={p.creatinineMgDl} onChange={(v) => set({ patient: { ...p, creatinineMgDl: v !== undefined && v > 20 ? Math.round((v / 88.4) * 100) / 100 : v } })} />
                <MiniNumber label="HbA1c" unit="%" value={p.hba1c} onChange={(v) => set({ patient: { ...p, hba1c: v } })} />
                <MiniNumber label="K⁺" unit="mmol/L" value={p.potassium} onChange={(v) => set({ patient: { ...p, potassium: v } })} />
                <MiniNumber label="Na⁺" unit="mmol/L" value={p.sodium} onChange={(v) => set({ patient: { ...p, sodium: v } })} />
                <MiniNumber label="Glycémie" unit="mg/dL" value={p.glucose} onChange={(v) => set({ patient: { ...p, glucose: v !== undefined && v < 35 ? Math.round(v * 18) : v } })} />
                <MiniNumber label="Albumine" unit="g/L" value={p.albumin} onChange={(v) => set({ patient: { ...p, albumin: v !== undefined && v < 7 ? v * 10 : v } })} />
                <MiniNumber label="Ferritine" unit="µg/L" value={p.ferritin} onChange={(v) => set({ patient: { ...p, ferritin: v } })} />
                <MiniNumber label="NT-proBNP" unit="ng/L" value={p.ntprobnp} onChange={(v) => set({ patient: { ...p, ntprobnp: v } })} />
                <MiniNumber label="Troponine hs" unit="ng/L" value={p.troponin} onChange={(v) => set({ patient: { ...p, troponin: v } })} />
                <div className="col-span-3 sm:col-span-5">
                  <ValueFlags patient={p} derived={scores.derived} kinds={["hb", "platelets", "inr", "hba1c", "potassium", "sodium", "glucose", "albumin", "ferritin", "ntprobnp", "troponin", "egfr", "crcl"]} />
                </div>
                <p className="col-span-3 text-[11px] text-foreground-subtle sm:col-span-5">
                  Unités converties d&apos;office : créatinine en µmol/L, Hb en g/L, plaquettes en /µL, glycémie en mmol/L, albumine en g/dL, taille en m.
                  {p.creatinineMgDl !== undefined ? ` Créatinine retenue : ${String(p.creatinineMgDl).replace(".", ",")} mg/dL.` : ""}
                  {p.hb !== undefined ? ` Hb retenue : ${String(p.hb).replace(".", ",")} g/dL.` : ""}
                </p>
                {(scores.derived.crcl !== undefined || scores.derived.egfr !== undefined) && (
                  <p className="col-span-3 text-[11px] text-foreground-subtle sm:col-span-5">
                    {[scores.derived.crcl !== undefined && `Clairance (Cockcroft) ${round(scores.derived.crcl)} mL/min`, scores.derived.egfr !== undefined && `DFGe (CKD-EPI) ${round(scores.derived.egfr)}`].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </details>
            <ExamEditor value={p.exam ?? {}} onChange={(exam) => set({ patient: { ...p, exam } })} />
            <AllergiesEditor patient={p} onChange={(patient) => set({ patient })} />
          </Panel>
        );
      case "surgery":
        return (
          <SurgeryPanel
            title="Intervention prévue"
            s={s.surgery}
            onChange={(surgery) => set({ surgery })}
            extra={
              <>
                {protocol && (
                  <p className="rounded-[var(--radius-md)] bg-primary-tint/60 px-3 py-2 text-xs text-foreground">
                    <span className="font-medium">Protocole « {protocol.name} »</span>
                    {protocolSummary ? ` : ${protocolSummary}` : ""}
                  </p>
                )}
                <div className="space-y-1">
                  <FieldLabel>Technique envisagée</FieldLabel>
                  <MultiChipGroup options={TECHNIQUES.map((t) => ({ code: t.code, label: t.label.split(" (")[0] }))} value={s.techniques} onChange={(v) => set({ techniques: v as Technique[] })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <span className="block text-[11px] font-medium text-foreground-subtle">Date et heure</span>
                    <Input type="datetime-local" className="mt-0.5 h-9" value={s.plannedAt} onChange={(e) => set({ plannedAt: e.target.value })} />
                  </label>
                  <label className="block min-w-0">
                    <span className="block text-[11px] font-medium text-foreground-subtle">Hôpital</span>
                    <Input className="mt-0.5 h-9" value={s.hospital} onChange={(e) => set({ hospital: e.target.value })} placeholder="protocoles locaux" />
                  </label>
                </div>
              </>
            }
          />
        );
      case "history":
        return (
          <div className="space-y-4">
            <ConditionsEditor
              conditions={s.conditions}
              onChange={(conditions) => set({ conditions })}
              sex={p.sex}
              patient={p}
              onPatient={(patient) => set({ patient })}
              effective={scores.conditions}
              deduced={scores.deduced}
              reviewed={s.historyReviewed ?? []}
              onReviewed={(historyReviewed) => set({ historyReviewed })}
            />
            <SubstancesEditor value={s.substances} onChange={(substances) => set({ substances })} />
          </div>
        );
      case "treatments":
        return (
          <div className="space-y-4">
            <Panel
              title="Traitements"
              actions={
                s.treatments.length === 0 && (
                  <ToggleChip pressed={!!s.noTreatment} onChange={(noTreatment) => set({ noTreatment })} className="min-h-7 px-2 text-xs">
                    Aucun traitement
                  </ToggleChip>
                )
              }
            >
              {!s.noTreatment && <TreatmentsEditor treatments={s.treatments} onChange={(treatments) => set({ treatments, noTreatment: treatments.length ? false : s.noTreatment })} />}
            </Panel>
            <RulesPanel evaluation={evaluation} gaps={gaps} onAskQuestion={onAskQuestion} crcl={scores.derived.crcl} rulesCount={rules.filter((r) => r.status === "active").length} />
          </div>
        );
      case "airway":
        return <AirwayStep s={s} set={set} scores={scores} />;
      case "evaluation":
        return (
          <div className="space-y-4">
            <EvaluationStep s={s} set={set} onChange={onChange} scores={scores} />
            <div className="lg:hidden">
              <AttentionPanel points={points} />
            </div>
          </div>
        );
      case "exams":
        return <ExamsPanel result={scores.exams} exams={s.exams} onChange={(e) => set({ exams: e })} patient={p} />;
      case "recap":
        return (
          <div className="space-y-4">
            <RecapStep
              sections={recap}
              missing={(Object.entries(missing) as [Step, string[]][]).filter(([, v]) => v.length > 0)}
              onGo={go}
              onPrint={() => printSections(`Consultation d'anesthésie${initials ? ` — ${initials}` : ""}`, recap, "Récapitulatif PreOx — à reporter sur la feuille officielle.")}
              onPrintPatient={() => printSections("Préparation à votre anesthésie", patientSheet(s, instructions, scores.conditions), "Gardez cette fiche avec vous le jour de l'intervention.")}
            />
            <TimelinePanel
              items={timeline}
              plannedAt={s.plannedAt}
              reminders={s.reminders ?? []}
              onReminders={(reminders) => set({ reminders })}
              suggestions={reminderSuggestions(
                s,
                evaluation,
                scores.exams.recommendations.filter((r) => s.exams[r.code]?.status === "requested").map((r) => r.label),
                instructions.undecided
              )}
              prefix={initials}
            />
            <InstructionsPanel instructions={instructions} />
            {ruleGaps > 0 && (
              <p className="rounded-[var(--radius-md)] bg-accent-tint px-3 py-2 text-xs text-accent">
                {ruleGaps} situation(s) sans règle : voir l&apos;étape Traitements pour lancer la recherche.
              </p>
            )}
          </div>
        );
    }
  })();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
      <div className="min-w-0 space-y-3">
        <StepBar
          current={step}
          onSelect={go}
          done={done}
          onQuick={() => setQuick((q) => !q)}
          badges={{
            treatments: { n: ruleGaps, tone: "warn" },
            evaluation: { n: remainingCount(groups), tone: "info" },
            exams: { n: toRequest.length, tone: "info" },
          }}
        />
        {quick && <QuickEntryPanel value={s} onChange={onChange} onClose={() => setQuick(false)} />}
        <div key={`${formKey}-${step}-${version}`}>{content}</div>
        <div className="flex items-center justify-between gap-2 pb-16 lg:pb-0">
          <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => go(STEPS[idx - 1].step)}>
            <ChevronLeft className="h-4 w-4" /> {idx > 0 ? STEPS[idx - 1].label : ""}
          </Button>
          {idx < STEPS.length - 1 && (
            <Button size="sm" onClick={() => go(STEPS[idx + 1].step)}>
              {STEPS[idx + 1].label} <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/* Phone: what matters, always in view. */}
        <button
          type="button"
          onClick={() => go("recap")}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-2 rounded-full border border-border bg-surface/95 px-4 py-2 text-xs shadow-lg backdrop-blur lg:hidden"
        >
          <span className="font-semibold text-foreground">{scores.asa ? `ASA ${ROMAN[scores.asa - 1]}${s.asa ? "" : "*"}` : "ASA —"}</span>
          <span className={cn(high ? "text-danger" : "text-foreground-subtle")}>{high} alerte(s)</span>
          <span className={cn(ruleGaps ? "text-accent" : "text-foreground-subtle")}>{ruleGaps} sans règle</span>
          <span className="text-foreground-subtle">{remainingCount(groups)} question(s)</span>
        </button>
      </div>
      <aside className="hidden space-y-3 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pb-2">
        <Synthesis s={s} scores={scores} ruleGaps={ruleGaps} remaining={remainingCount(groups)} toRequest={toRequest.length} onGo={go} />
        <AttentionPanel points={points} />
      </aside>
    </div>
  );
}

function Synthesis({ s, scores, ruleGaps, remaining, toRequest, onGo }: { s: ConsultationState; scores: ConsultationScores; ruleGaps: number; remaining: number; toRequest: number; onGo: (s: Step) => void }) {
  const r = scores.results;
  const pills: [string, { label: string; level: RiskLevel }][] = [
    ["Lee", r.rcri],
    ["STOP-BANG", r.stopBang],
    ["ARISCAT", r.ariscat],
    ["Apfel", r.apfel],
    ["Masque", r.mask],
    ["Laryngoscopie", r.airway],
  ];
  return (
    <Panel title="Synthèse">
      <p className="text-sm text-foreground">
        <span className="font-semibold">{scores.asa ? `ASA ${ROMAN[scores.asa - 1]}${s.surgery.emergency ? "E" : ""}` : "ASA —"}</span>
        {scores.asa && !s.asa ? <span className="text-foreground-subtle"> (suggéré)</span> : null}
        {s.surgery.name ? ` · ${s.surgery.name}` : ""}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {pills.map(([name, x]) =>
          x.label ? (
            <RiskPill key={name} level={x.level}>
              {name} : {x.label}
            </RiskPill>
          ) : null
        )}
      </div>
      <ul className="space-y-1 text-xs">
        <li>
          <button type="button" onClick={() => onGo("treatments")} className={cn("hover:underline", ruleGaps ? "text-accent" : "text-foreground-subtle")}>
            {ruleGaps ? `${ruleGaps} situation(s) sans règle` : "Règles : rien ne manque"}
          </button>
        </li>
        <li>
          <button type="button" onClick={() => onGo("evaluation")} className="text-foreground-subtle hover:underline">
            {remaining ? `${remaining} question(s) restante(s)` : "Scores complets"}
          </button>
        </li>
        <li>
          <button type="button" onClick={() => onGo("exams")} className="text-foreground-subtle hover:underline">
            {toRequest ? `${toRequest} examen(s) à demander` : "Examens : rien à demander"}
          </button>
        </li>
      </ul>
    </Panel>
  );
}

/**
 * The consultation when nothing is kept: the patient may never come
 * through your theatre. « Garder » turns it into a dossier (initials only,
 * encrypted on this device).
 */
export function ConsultationView({
  rules,
  protocols,
  onAskQuestion,
  onKeep,
  draft,
}: {
  rules: Rule[];
  protocols?: Protocol[];
  onAskQuestion: (q: QuestionInput) => void;
  onKeep: (initials: string, consultation: ConsultationState) => Promise<void>;
  /** Encrypted draft on this device: the consultation survives a reload until kept or restarted. */
  draft?: { load: <T>() => Promise<T | null>; save: <T>(value: T) => Promise<void>; clear: () => Promise<void> };
}) {
  const [s, setS] = useState<ConsultationState>(emptyConsultation);
  const [formKey, setFormKey] = useState(0);
  const [keeping, setKeeping] = useState(false);
  const [initials, setInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const validInitials = /^[a-zA-ZÀ-ÿ]{2}$/.test(initials.trim());
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);

  // Back to the consultation in progress after a reload or an accidental close.
  useEffect(() => {
    if (!draft || loaded.current) return;
    loaded.current = true;
    void draft
      .load<ConsultationState>()
      .then((d) => {
        if (!d) return;
        setS(upgradeConsultation(d));
        setFormKey((k) => k + 1);
        setRestored(true);
      })
      .finally(() => setReady(true));
  }, [draft]);
  // Saved only once the previous draft is read (never overwritten by the empty form).
  useEffect(() => {
    if (!draft || !ready) return;
    const t = setTimeout(() => void draft.save(s), 500);
    return () => clearTimeout(t);
  }, [s, draft, ready]);

  function reset() {
    setS(emptyConsultation());
    setFormKey((k) => k + 1);
    setKeeping(false);
    setInitials("");
    setRestored(false);
    void draft?.clear();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] bg-surface-muted px-3 py-2">
        <p className="min-w-0 flex-1 text-xs text-foreground-muted">
          {restored ? "Consultation en cours reprise. " : ""}Brouillon chiffré sur cet appareil, jusqu&apos;à « Garder » (initiales seulement) ou « Nouvelle ».
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
            <Input autoFocus value={initials} onChange={(e) => setInitials(e.target.value.slice(0, 2))} placeholder="Initiales (NP)" aria-label="Initiales : première lettre du nom puis du prénom" className="h-8 w-32 uppercase" />
            <Button size="sm" type="submit" disabled={!validInitials || busy}>
              Garder
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setKeeping(false)} aria-label="Annuler">
              <X className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setKeeping(true)}>
              <FolderPlus className="h-3.5 w-3.5" /> Garder dans un dossier
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const empty = JSON.stringify(s) === JSON.stringify(emptyConsultation());
                if (empty || confirm("Commencer une nouvelle consultation ? Celle-ci sera effacée (gardez-la d'abord dans un dossier si besoin).")) reset();
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Nouvelle consultation
            </Button>
          </div>
        )}
      </div>
      <ConsultationForm
        value={s}
        onChange={setS}
        rules={rules}
        protocols={protocols}
        onAskQuestion={onAskQuestion}
        formKey={formKey}
      />
    </div>
  );
}
