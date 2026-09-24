"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookmarkPlus, CalendarCheck2, CalendarPlus, CalendarX2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, MultiChipGroup, ToggleChip } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { FieldLabel, NumberField, Panel, formatDateTime } from "@/components/preop/ui";
import { PlanEditor } from "@/components/preop/plan-editor";
import { evaluateConsultation } from "@/components/preop/consultation";
import type { ProtocolInput } from "@/components/preop/use-protocols";
import { OPERATION_CATEGORIES, REGIONAL_TYPES, TECHNICAL_ACTS } from "@/lib/carnet/referentiel";
import { defaultParticipation, defaultTutorId, formatDateFr, stageForDate, stageLabel } from "@/lib/carnet/logic";
import { deleteRow, patchRow, putRow } from "@/lib/carnet/mutations";
import { plannedCaseFromDossier, suggestedRegionalTypes } from "@/lib/preop/carnet-link";
import { KCE_SEVERITIES, RISK_GRADES, dossierDate, type Dossier, type RiskGrade, type Surgery } from "@/lib/preop/dossier";
import { formatHours } from "@/lib/preop/rules/describe";
import type { Protocol } from "@/lib/preop/protocols";
import type { Rule } from "@/lib/preop/rules/types";
import { cn } from "@/lib/utils";

function SurgeryPanel({ s, onChange }: { s: Surgery; onChange: (s: Surgery) => void }) {
  const set = (patch: Partial<Surgery>) => onChange({ ...s, ...patch });
  return (
    <Panel title="Intervention">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <FieldLabel>Intervention</FieldLabel>
          <Input defaultValue={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. PTG, cholécystectomie cœlioscopique" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <FieldLabel>Côté</FieldLabel>
            <Input defaultValue={s.side} onChange={(e) => set({ side: e.target.value })} placeholder="droit, gauche…" />
          </label>
          <label className="block space-y-1">
            <FieldLabel>Chirurgien</FieldLabel>
            <Input defaultValue={s.surgeon} onChange={(e) => set({ surgeon: e.target.value })} />
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
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Durée prévue" unit="h" value={s.durationHours} onChange={(v) => set({ durationHours: v })} />
          <label className="block space-y-1">
            <FieldLabel>Position</FieldLabel>
            <Input defaultValue={s.position} onChange={(e) => set({ position: e.target.value })} placeholder="DD, DL, ventral…" />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <FieldLabel>Sévérité (KCE)</FieldLabel>
          <ChipGroup size="sm" options={KCE_SEVERITIES} value={s.kce ?? null} onChange={(v) => set({ kce: v ?? undefined })} allowClear />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Risque hémorragique</FieldLabel>
          <ChipGroup size="sm" options={RISK_GRADES} value={s.bleedingRisk ?? null} onChange={(v) => set({ bleedingRisk: (v ?? undefined) as RiskGrade | undefined })} allowClear />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Risque cardiaque</FieldLabel>
          <ChipGroup size="sm" options={RISK_GRADES} value={s.cardiacRisk ?? null} onChange={(v) => set({ cardiacRisk: (v ?? undefined) as RiskGrade | undefined })} allowClear />
        </div>
      </div>
    </Panel>
  );
}

/** What the rule library says for this patient — the reminders to act on before the day. */
function RuleReminders({ d, rules }: { d: Dossier; rules: Rule[] }) {
  const evaluation = useMemo(() => evaluateConsultation(rules, { ...d.consultation, techniques: d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques }), [rules, d.consultation, d.plan.techniques]);
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

  function applyProtocol(p: Protocol) {
    if (!planEmpty && !confirm(`Remplacer le plan actuel par le protocole « ${p.name} » ?`)) return;
    onChange({
      ...d,
      protocolId: p.id,
      protocolName: p.name,
      plan: structuredClone(p.content),
      surgery: { ...d.surgery, name: d.surgery.name || p.surgery, category: d.surgery.category || p.operation_category },
    });
    setPlanKey((k) => k + 1);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
      <div className="space-y-4">
        <SurgeryPanel key={`surgery-${d.id}-${planKey}`} s={d.surgery} onChange={(surgery) => onChange({ ...d, surgery })} />
        <Panel
          title="Protocole"
          actions={
            !planEmpty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const name = prompt("Nom du nouveau protocole", d.surgery.name ? `${d.surgery.name}` : "");
                  if (!name?.trim()) return;
                  try {
                    await onSaveProtocol({ id: crypto.randomUUID(), name: name.trim(), surgery: d.surgery.name, operation_category: d.surgery.category, hospital: d.consultation.hospital, content: d.plan, source: "" });
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
            <p className="text-sm text-foreground-subtle">Aucun protocole dans votre bibliothèque : composez le plan ci-dessous, puis gardez-le comme protocole pour la prochaine fois.</p>
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
        </Panel>
        <PlanEditor value={d.plan} onChange={(plan) => onChange({ ...d, plan })} body={d.consultation.patient} formKey={`${d.id}-${planKey}`} />
      </div>
      <div className="space-y-4 lg:sticky lg:top-4">
        <RuleReminders d={d} rules={rules} />
        {carnetEnabled && <CarnetPlanner d={d} onChange={onChange} />}
        {d.status === "consultation" && (
          <Button className="w-full" onClick={() => onChange({ ...d, status: "prepared" })}>
            Marquer comme préparé
          </Button>
        )}
      </div>
    </div>
  );
}
