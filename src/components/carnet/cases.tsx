"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, PenLine, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { CaseForm } from "@/components/carnet/case-form";
import { EmptyState, SectionTitle } from "@/components/carnet/ui";
import { deleteRow, patchRow } from "@/lib/carnet/mutations";
import { REGIONAL_TYPES, TECHNICAL_ACTS, caseCode, operationCategoryLabel, supervisorName, techniqueLabels } from "@/lib/carnet/referentiel";
import { detailsSummary, isEmptyDetails } from "@/components/carnet/case-details";
import { caseNumbers, formatDateFr, localDateIso, stageLabel } from "@/lib/carnet/logic";
import type { CarnetCase, CarnetStage } from "@/lib/carnet/types";

function useCaseNumbers() {
  const { data } = useCarnet();
  return useMemo(() => caseNumbers(data.cases, data.stages), [data.cases, data.stages]);
}

export function CaseList({ cases, onOpen, showDate = true }: { cases: CarnetCase[]; onOpen: (c: CarnetCase) => void; showDate?: boolean }) {
  const { data } = useCarnet();
  const numbers = useCaseNumbers();
  const supervisors = useMemo(() => new Map(data.supervisors.map((s) => [s.id, s])), [data.supervisors]);
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      {cases.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onOpen(c)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-muted">
            <span className="w-10 shrink-0 text-right font-mono text-xs text-foreground-subtle">{numbers.get(c.id)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {c.operation}
                {c.patient_initials && <span className="font-normal text-foreground-subtle"> · {c.patient_initials}</span>}
              </span>
              <span className="block truncate text-xs text-foreground-subtle">
                {showDate && `${formatDateFr(c.case_date)} · `}
                <span className="font-mono">{caseCode(c)}</span>
                {c.tutor_id ? ` · ${supervisorName(supervisors.get(c.tutor_id))}` : " · sans tuteur"}
              </span>
            </span>
            {c.signature_id ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Signé" />
            ) : (
              <Clock className="h-4 w-4 shrink-0 text-accent" aria-label="En attente de signature" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Open a case: editable while unsigned; once signed it's read-only — changing it means taking it out of its signature first (it then goes back to "à signer"). */
export function CaseEditModal({ kase, onClose }: { kase: CarnetCase; onClose: () => void }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const stage = data.stages.find((s) => s.id === kase.stage_id);
  const signature = kase.signature_id ? data.signatures.find((s) => s.id === kase.signature_id) : null;
  const tutor = data.supervisors.find((s) => s.id === kase.tutor_id);

  function remove() {
    if (!confirm("Supprimer ce cas du relevé ?")) return;
    commit([deleteRow("cases", kase.id)]);
    toast("Cas supprimé.", { variant: "success" });
    onClose();
  }

  if (kase.signature_id) {
    return (
      <Modal title="Cas signé" onClose={onClose} size="md">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-foreground-subtle">Date</dt>
          <dd>{formatDateFr(kase.case_date)}</dd>
          <dt className="text-foreground-subtle">Opération</dt>
          <dd>{kase.operation}</dd>
          <dt className="text-foreground-subtle">Catégorie</dt>
          <dd>
            <span className="font-mono">{caseCode(kase)}</span> — {operationCategoryLabel(kase.operation_category)}
            {[...techniqueLabels(REGIONAL_TYPES, kase.regional_types, kase.other_labels, false), ...techniqueLabels(TECHNICAL_ACTS, kase.technical_acts, kase.other_labels, false)].map((l) => `, ${l}`).join("")}
          </dd>
          {!isEmptyDetails(kase.details) && (
            <>
              <dt className="text-foreground-subtle">Détails</dt>
              <dd>{detailsSummary(kase.details)}</dd>
            </>
          )}
          <dt className="text-foreground-subtle">Tuteur</dt>
          <dd>{supervisorName(tutor) || "—"}</dd>
          <dt className="text-foreground-subtle">Signature</dt>
          <dd>{signature ? `${signature.supervisor_name}, le ${new Date(signature.signed_at).toLocaleString("fr-BE")}` : "—"}</dd>
        </dl>
        {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL, nothing for next/image to optimize */}
        {signature && <img src={signature.image} alt={`Signature de ${signature.supervisor_name}`} className="mt-3 h-20 rounded border border-border bg-white object-contain p-1" />}
        <p className="mt-4 text-xs text-foreground-subtle">
          Un cas signé ne peut plus être modifié tel quel : retirez-le de la signature pour le corriger, il repassera « à signer » et devra être
          re-signé.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (!confirm("Retirer ce cas de sa signature ? Il devra être re-signé.")) return;
              commit([patchRow("cases", kase.id, { signature_id: null })]);
              toast("Cas repassé à signer — vous pouvez le modifier.", { variant: "success" });
            }}
          >
            <PenLine className="h-4 w-4" /> Retirer de la signature
          </Button>
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </Modal>
    );
  }

  if (!stage) return null;
  return (
    <Modal title="Modifier le cas" description={stageLabel(stage)} onClose={onClose} size="lg">
      <CaseForm
        stage={stage}
        initial={kase}
        onCancel={onClose}
        onSaved={() => {
          toast("Cas mis à jour.", { variant: "success" });
          onClose();
        }}
      />
      <div className="mt-4 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={remove} className="text-danger">
          <Trash2 className="h-4 w-4" /> Supprimer ce cas
        </Button>
      </div>
    </Modal>
  );
}

/** Home screen: the entry form for the active stage, and the list of the day right under it to check at a glance. */
export function EntryView({ stage }: { stage: CarnetStage }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const [listDate, setListDate] = useState(localDateIso);
  const [editing, setEditing] = useState<CarnetCase | null>(null);
  const dayCases = data.cases
    .filter((c) => c.stage_id === stage.id && c.case_date === listDate)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="space-y-4">
        <SectionTitle>Nouveau cas</SectionTitle>
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
          <CaseForm
            key={stage.id}
            stage={stage}
            defaultDate={listDate}
            onSaved={(saved) => {
              setListDate(saved.case_date);
              toast(`Cas enregistré — ${saved.operation}.`, {
                variant: "success",
                actionLabel: "Annuler",
                onAction: () => commit([deleteRow("cases", saved.id)]),
              });
            }}
          />
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif-display text-lg font-medium text-foreground">
            {listDate === localDateIso() ? "Aujourd'hui" : formatDateFr(listDate)}
            <span className="ml-2 text-sm font-normal text-foreground-subtle">{dayCases.length} cas</span>
          </h2>
          <Input type="date" value={listDate} onChange={(e) => e.target.value && setListDate(e.target.value)} className="h-9 w-auto" aria-label="Jour affiché" />
        </div>
        {dayCases.length === 0 ? <EmptyState title="Aucun cas ce jour-là." /> : <CaseList cases={dayCases} onOpen={setEditing} showDate={false} />}
      </section>
      {editing && <CaseEditModal kase={data.cases.find((c) => c.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** The full "Relevé des prestations", filterable — to find, correct or check any case. */
export function CasesView({ stage }: { stage: CarnetStage | null }) {
  const { data } = useCarnet();
  const [stageFilter, setStageFilter] = useState<string>(stage?.id ?? "all");
  const [status, setStatus] = useState<"all" | "pending" | "signed">("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CarnetCase | null>(null);

  const q = query.trim().toLowerCase();
  const cases = data.cases
    .filter((c) => stageFilter === "all" || c.stage_id === stageFilter)
    .filter((c) => status === "all" || (status === "pending" ? !c.signature_id : !!c.signature_id))
    .filter((c) => !q || `${c.operation} ${c.patient_initials} ${caseCode(c)}`.toLowerCase().includes(q))
    .sort((a, b) => b.case_date.localeCompare(a.case_date) || b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-4">
      <SectionTitle>Relevé des prestations</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Opération, initiales, code…" className="pl-9" />
        </div>
        <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label="Stage">
          <option value="all">Tous les stages</option>
          {data.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {stageLabel(s)}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Statut">
          <option value="all">Tous</option>
          <option value="pending">À signer</option>
          <option value="signed">Signés</option>
        </Select>
      </div>
      <p className="text-xs text-foreground-subtle">{cases.length} cas</p>
      {cases.length === 0 ? <EmptyState title="Aucun cas ne correspond." /> : <CaseList cases={cases} onOpen={setEditing} />}
      {editing && <CaseEditModal kase={data.cases.find((c) => c.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
