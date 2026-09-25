"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookmarkPlus, CalendarCheck2, CalendarPlus, CalendarX2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { MultiChipGroup, ToggleChip } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { FieldLabel, Panel, formatDateTime } from "@/components/preop/ui";
import { PlanEditor } from "@/components/preop/plan-editor";
import { SurgeryPanel } from "@/components/preop/surgery-panel";
import { evaluateConsultation } from "@/components/preop/consultation";
import type { ProtocolInput } from "@/components/preop/use-protocols";
import { REGIONAL_TYPES, TECHNICAL_ACTS } from "@/lib/carnet/referentiel";
import { defaultParticipation, defaultTutorId, formatDateFr, stageForDate, stageLabel } from "@/lib/carnet/logic";
import { deleteRow, patchRow, putRow } from "@/lib/carnet/mutations";
import { plannedCaseFromDossier, suggestedRegionalTypes } from "@/lib/preop/carnet-link";
import { dossierDate, type Dossier } from "@/lib/preop/dossier";
import { formatHours } from "@/lib/preop/rules/describe";
import { matchProtocol, planHasAdditions, withAdditions, type Protocol, type ProtocolContent } from "@/lib/preop/protocols";
import { consultationScores } from "@/lib/preop/consultation-scores";
import { attentionPoints } from "@/lib/preop/attention";
import { patientInstructions } from "@/lib/preop/instructions";
import { pendingExams } from "@/lib/preop/exams";
import { AttentionPanel, InstructionsPanel } from "@/components/preop/attention-panel";
import { useCatalogs } from "@/components/preop/use-catalogs";
import type { Rule } from "@/lib/preop/rules/types";
import { cn } from "@/lib/utils";

/** What the rule library says for this patient — the reminders to act on before the day. */
function RuleReminders({ d, rules }: { d: Dossier; rules: Rule[] }) {
  const { catalogs } = useCatalogs();
  const evaluation = useMemo(() => evaluateConsultation(rules, { ...d.consultation, techniques: d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques }, catalogs), [rules, d.consultation, d.plan.techniques, catalogs]);
  const outcomes = evaluation.findings.filter((f) => f.status === "applies").flatMap((f) => f.outcomes.map((o) => ({ o, f })));
  if (outcomes.length === 0 && evaluation.gaps.length === 0 && evaluation.missing.length === 0) return null;
  return (
    <Panel title="Rappels de vos règles">
      <ul className="space-y-1.5 text-sm">
        {outcomes.map(({ o, f }, i) => (
          <li key={`${f.rule.id}-${i}`} className={cn(o.kind === "stop_before" && o.conflict ? "text-danger" : "text-foreground")}>
            {o.kind === "stop_before" && (
              <>
                <strong>{o.treatment.name}</strong> : dernière prise ≥ {formatHours(o.hours)} avant{o.lastDoseBy ? ` — au plus tard le ${formatDateTime(o.lastDoseBy)}` : ""}
                {o.conflict && <span className="block text-xs font-medium">Prise trop récente : geste possible à partir du {formatDateTime(o.conflict.earliestAt)}</span>}
              </>
            )}
            {o.kind === "resume_after" && (
              <>
                Reprise {o.treatment?.name ?? ""} ≥ {formatHours(o.hours)} après{o.resumeFrom ? ` — à partir du ${formatDateTime(o.resumeFrom)}` : ""}
              </>
            )}
            {o.kind === "requirement" && o.text}
            {o.kind === "exam" && <>Examen : {o.exam}</>}
            {o.kind === "info" && o.text}
          </li>
        ))}
        {evaluation.gaps.map((g) => (
          <li key={`${g.treatment.id}-${g.technique}`} className="flex items-center gap-1.5 text-accent">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {g.label} — pas de règle (voir l&apos;onglet Consultation pour préparer la question)
          </li>
        ))}
        {evaluation.missing.map((m) => (
          <li key={m.key} className="text-xs text-foreground-muted">
            À compléter : {m.label}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Planned case in the carnet: counted nowhere until « Fait » (here, in Bloc, or in the carnet). */
function CarnetPlanner({ d, onChange }: { d: Dossier; onChange: (d: Dossier) => void }) {
  const { data, plannedCases, commit, status } = useCarnet();
  const { toast } = useToast();
  const date = dossierDate(d);
  const stage = date ? stageForDate(data.stages, date) : null;
  const planned = d.carnetCaseId ? plannedCases.find((c) => c.id === d.carnetCaseId) : undefined;
  const confirmed = d.carnetCaseId ? data.cases.find((c) => c.id === d.carnetCaseId) : undefined;
  const techniques = d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques;
  const [ga, setGa] = useState(techniques.includes("general"));
  const [regional, setRegional] = useState<string[]>(() => suggestedRegionalTypes(d));
  const [acts, setActs] = useState<string[]>(() => (techniques.some((t) => t === "deep_block" || t === "superficial_block") ? ["echo_alr"] : []));

  if (!status.ready) return null;

  if (confirmed)
    return (
      <Panel title="Carnet de stage">
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CalendarCheck2 className="h-4 w-4" /> Au relevé du {formatDateFr(confirmed.case_date)}.
        </p>
      </Panel>
    );

  if (planned)
    return (
      <Panel title="Carnet de stage">
        <p className="text-sm text-foreground-muted">
          Planifié le {formatDateFr(planned.case_date)} — pas compté tant que vous ne confirmez pas. Confirmez depuis l&apos;onglet Bloc à la fin du cas, ou dans le carnet.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              commit([patchRow("cases", planned.id, plannedCaseFromDossier(d, { stageId: planned.stage_id, generalAnesthesia: planned.general_anesthesia, regionalTypes: planned.regional_types, technicalActs: planned.technical_acts, participation: planned.participation, tutorId: planned.tutor_id }, planned.case_date, planned.created_at))]);
              toast("Cas planifié mis à jour.", { variant: "success" });
            }}
          >
            Mettre à jour depuis le dossier
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!confirm("Retirer ce cas planifié du carnet ?")) return;
              commit([deleteRow("cases", planned.id)]);
              onChange({ ...d, carnetCaseId: null });
            }}
          >
            <CalendarX2 className="h-3.5 w-3.5" /> Retirer du carnet
          </Button>
        </div>
      </Panel>
    );

  return (
    <Panel title="Carnet de stage">
      {!date ? (
        <p className="text-sm text-foreground-muted">Fixez la date prévue (onglet Consultation) pour planifier le cas dans le carnet.</p>
      ) : !stage ? (
        <p className="text-sm text-foreground-muted">Aucun stage du carnet ne couvre le {formatDateFr(date)}.</p>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            Planifier au {formatDateFr(date)} ({stageLabel(stage)}). Il n&apos;est compté nulle part tant que vous ne confirmez pas « Fait ».
          </p>
          <ToggleChip pressed={ga} onChange={setGa}>
            Anesthésie générale
          </ToggleChip>
          <div className="space-y-1.5">
            <FieldLabel>ALR (carnet)</FieldLabel>
            <MultiChipGroup options={REGIONAL_TYPES.map((r) => ({ code: r.code, label: r.short ?? r.label }))} value={regional} onChange={setRegional} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Actes techniques</FieldLabel>
            <MultiChipGroup options={TECHNICAL_ACTS.map((r) => ({ code: r.code, label: r.short ?? r.label }))} value={acts} onChange={setActs} />
          </div>
          <Button
            size="sm"
            disabled={!ga && regional.length === 0 && acts.length === 0}
            onClick={() => {
              const row = plannedCaseFromDossier(
                d,
                { stageId: stage.id, generalAnesthesia: ga, regionalTypes: regional, technicalActs: acts, participation: defaultParticipation(data.cases, stage.id), tutorId: defaultTutorId(data.cases, stage.id, date) },
                date
              );
              commit([putRow("cases", row)]);
              onChange({ ...d, carnetCaseId: row.id });
              toast("Cas planifié dans le carnet (non compté jusqu'à « Fait »).", { variant: "success" });
            }}
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Planifier dans le carnet
          </Button>
        </>
      )}
    </Panel>
  );
}

export function PreparationView({
  d,
  onChange,
  rules,
  protocols,
  onSaveProtocol,
  carnetEnabled,
}: {
  d: Dossier;
  onChange: (d: Dossier) => void;
  rules: Rule[];
  protocols: Protocol[];
  onSaveProtocol: (p: ProtocolInput) => Promise<Protocol>;
  carnetEnabled: boolean;
}) {
  const { toast } = useToast();
  const [planKey, setPlanKey] = useState(0);
  const hospital = d.consultation.hospital.trim().toLowerCase();
  // Local protocols of the patient's hospital first, then the general ones.
  const choices = [...protocols].sort((a, b) => Number(!!b.hospital && b.hospital.toLowerCase() === hospital) - Number(!!a.hospital && a.hospital.toLowerCase() === hospital) || a.name.localeCompare(b.name, "fr"));
  const planEmpty = d.plan.drugs.length === 0 && d.plan.techniques.length === 0 && d.plan.risks.length === 0;

  const { catalogs } = useCatalogs();
  const scores = useMemo(() => consultationScores(d.consultation, { plan: d.plan, catalogs }), [d.consultation, d.plan, catalogs]);
  const points = useMemo(() => attentionPoints(d.consultation, scores, d.plan), [d.consultation, scores, d.plan]);
  const evaluation = useMemo(() => evaluateConsultation(rules, { ...d.consultation, techniques: d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques }, catalogs), [rules, d.consultation, d.plan.techniques, catalogs]);
  const instructions = useMemo(() => patientInstructions(d.consultation, evaluation), [d.consultation, evaluation]);
  const toRequest = pendingExams(d.consultation, scores.exams);
  const additions = points.filter((p) => p.material?.length || p.risk);

  /** A protocol's plan for this patient: techniques from the consultation if the protocol has none, plus the patient's own precautions. */
  function planFrom(p: Protocol): ProtocolContent {
    const content = structuredClone(p.content);
    if (content.techniques.length === 0) content.techniques = [...d.consultation.techniques];
    return withAdditions(content, additions);
  }

  function applyProtocol(p: Protocol, auto = false) {
    if (!auto && !planEmpty && !confirm(`Remplacer le plan actuel par le protocole « ${p.name} » ?`)) return;
    onChange({
      ...d,
      protocolId: p.id,
      protocolName: p.name,
      plan: planFrom(p),
      consultation: { ...d.consultation, surgery: { ...d.consultation.surgery, name: d.consultation.surgery.name || p.surgery, category: d.consultation.surgery.category || p.operation_category } },
    });
    setPlanKey((k) => k + 1);
  }

  // Opening an unprepared dossier: the protocol that fits the intervention is applied by itself (once).
  const autoApplied = useRef(new Set<string>());
  const match = planEmpty && !d.protocolId ? matchProtocol(protocols, d.consultation.surgery, d.consultation.hospital) : null;
  useEffect(() => {
    if (!match || autoApplied.current.has(d.id)) return;
    autoApplied.current.add(d.id);
    applyProtocol(match, true);
    toast(`Plan pré-rempli depuis « ${match.name} »${additions.length ? `, avec ${additions.length} précaution(s) propres au patient` : ""}.`, { variant: "success", durationMs: 5000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when a match appears for this dossier
  }, [match?.id, d.id]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
      <div className="space-y-4">
        <SurgeryPanel key={`surgery-${d.id}-${planKey}`} title="Intervention" s={d.consultation.surgery} onChange={(surgery) => onChange({ ...d, consultation: { ...d.consultation, surgery } })} />
        <Panel
          title="Protocole"
          actions={
            !planEmpty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const name = prompt("Nom du nouveau protocole", d.consultation.surgery.name ? `${d.consultation.surgery.name}` : "");
                  if (!name?.trim()) return;
                  try {
                    await onSaveProtocol({ id: crypto.randomUUID(), name: name.trim(), surgery: d.consultation.surgery.name, operation_category: d.consultation.surgery.category, hospital: d.consultation.hospital, content: d.plan, source: "" });
                    toast("Plan enregistré comme protocole (sans données patient).", { variant: "success" });
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Enregistrement impossible.", { variant: "error" });
                  }
                }}
              >
                <BookmarkPlus className="h-3.5 w-3.5" /> Garder comme protocole
              </Button>
            )
          }
        >
          {protocols.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Aucun protocole dans votre bibliothèque : composez le plan ci-dessous, puis gardez-le comme protocole ; la prochaine fois, il sera appliqué tout seul pour cette intervention.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value=""
                onChange={(e) => {
                  const p = protocols.find((x) => x.id === e.target.value);
                  if (p) applyProtocol(p);
                }}
                className="min-w-0 flex-1"
                aria-label="Partir d'un protocole"
              >
                <option value="">{d.protocolName ? `Plan tiré de « ${d.protocolName} » — changer…` : "Partir d'un protocole…"}</option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.hospital ? ` · ${p.hospital}` : ""}
                  </option>
                ))}
              </Select>
              {d.protocolName && (
                <span className="flex items-center gap-1 text-xs text-foreground-subtle">
                  <Copy className="h-3 w-3" /> copie modifiable
                </span>
              )}
            </div>
          )}
          {planEmpty && d.consultation.techniques.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onChange({ ...d, plan: withAdditions({ ...d.plan, techniques: [...d.consultation.techniques] }, additions) });
                setPlanKey((k) => k + 1);
              }}
            >
              Partir de la consultation (technique + précautions du patient)
            </Button>
          )}
        </Panel>
        <PlanEditor value={d.plan} onChange={(plan) => onChange({ ...d, plan })} body={d.consultation.patient} formKey={`${d.id}-${planKey}`} />
      </div>
      <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pb-2">
        <AttentionPanel
          title="Pour ce patient"
          points={points}
          added={(p) => planHasAdditions(d.plan, p)}
          onAdd={(p) => {
            onChange({ ...d, plan: withAdditions(d.plan, [p]) });
            setPlanKey((k) => k + 1);
          }}
        />
        <RuleReminders d={d} rules={rules} />
        {toRequest.length > 0 && (
          <Panel title="Examens encore à demander">
            <ul className="list-disc pl-4 text-sm text-foreground">
              {toRequest.map((r) => (
                <li key={r.code}>{r.label}</li>
              ))}
            </ul>
            <p className="text-xs text-foreground-subtle">Statut à mettre à jour dans l&apos;onglet Consultation.</p>
          </Panel>
        )}
        <InstructionsPanel instructions={instructions} />
        {carnetEnabled && <CarnetPlanner d={d} onChange={onChange} />}
      </div>
    </div>
  );
}
