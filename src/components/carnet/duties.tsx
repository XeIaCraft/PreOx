"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { SupervisorPicker } from "@/components/carnet/supervisor-picker";
import { ChipGroup, EmptyState, Field, SectionTitle } from "@/components/carnet/ui";
import { deleteRow, patchRow, putRow } from "@/lib/carnet/mutations";
import { DUTY_TYPES, supervisorName } from "@/lib/carnet/referentiel";
import { formatDateFr, localDateIso, shiftDateIso } from "@/lib/carnet/logic";
import type { CarnetDuty, CarnetStage, DutyType } from "@/lib/carnet/types";

const DUTY_TYPE_OPTIONS = DUTY_TYPES.map((t) => ({ code: t.code, label: t.label }));

/**
 * Duty form — same spirit as the case form: the institution and city come
 * from the stage, the head of department and supervisor are carried over
 * from the previous duty of the stage (usually unchanged), one tap to save.
 */
function DutyForm({ stage, initial, onDone }: { stage: CarnetStage; initial?: CarnetDuty; onDone?: (duty: CarnetDuty) => void }) {
  const { data, commit } = useCarnet();
  const previous = useMemo(
    () => data.duties.filter((d) => d.stage_id === stage.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    [data.duties, stage.id]
  );
  const [date, setDate] = useState(initial?.duty_date ?? localDateIso());
  const [type, setType] = useState<DutyType>(initial?.duty_type ?? previous?.duty_type ?? "on_site");
  const [institution, setInstitution] = useState(initial?.institution ?? stage.hospital);
  const [city, setCity] = useState(initial?.city ?? stage.city);
  const [head, setHead] = useState(initial?.head_of_department ?? previous?.head_of_department ?? "");
  const [supervisorId, setSupervisorId] = useState<string | null>(initial ? initial.supervisor_id : (previous?.supervisor_id ?? null));
  const today = localDateIso();

  function save() {
    const duty: CarnetDuty = {
      id: initial?.id ?? crypto.randomUUID(),
      stage_id: initial?.stage_id ?? stage.id,
      duty_date: date,
      duty_type: type,
      institution: institution.trim(),
      city: city.trim(),
      head_of_department: head.trim(),
      supervisor_id: supervisorId,
      signature_id: initial?.signature_id ?? null,
      notes: initial?.notes ?? "",
      created_at: initial?.created_at ?? new Date().toISOString(),
    };
    commit([putRow("duties", duty)]);
    onDone?.(duty);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Date">
        <div className="flex flex-wrap items-center gap-1.5">
          <ChipGroup
            size="sm"
            options={[
              { code: today, label: "Aujourd'hui" },
              { code: shiftDateIso(today, -1), label: "Hier" },
            ]}
            value={date === today || date === shiftDateIso(today, -1) ? date : null}
            onChange={(v) => v && setDate(v)}
          />
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-auto" aria-label="Date de la garde" />
        </div>
      </Field>
      <Field label="Type">
        <ChipGroup options={DUTY_TYPE_OPTIONS} value={type} onChange={(v) => v && setType(v)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Institution">
          <Input value={institution} onChange={(e) => setInstitution(e.target.value)} className="h-11" />
        </Field>
        <Field label="Ville">
          <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-11" />
        </Field>
      </div>
      <Field label="Chef de service / point de garde">
        <Input value={head} onChange={(e) => setHead(e.target.value)} className="h-11" />
      </Field>
      <Field label="Superviseur de la garde" hint="C'est lui qui signera la garde.">
        <SupervisorPicker value={supervisorId} onChange={setSupervisorId} hospital={stage.hospital} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="lg" className="min-w-40">
          <Check className="h-4 w-4" /> {initial ? "Enregistrer les modifications" : "Enregistrer la garde"}
        </Button>
      </div>
    </form>
  );
}

function DutyModal({ duty, onClose }: { duty: CarnetDuty; onClose: () => void }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const stage = data.stages.find((s) => s.id === duty.stage_id);
  if (!stage) return null;
  if (duty.signature_id) {
    const signature = data.signatures.find((s) => s.id === duty.signature_id);
    return (
      <Modal title="Garde signée" onClose={onClose} size="sm">
        <p className="text-sm text-foreground">
          {formatDateFr(duty.duty_date)} — {DUTY_TYPES.find((t) => t.code === duty.duty_type)?.label}, {duty.institution}
        </p>
        <p className="mt-1 text-sm text-foreground-muted">Signée par {signature?.supervisor_name ?? "—"}.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (!confirm("Retirer cette garde de sa signature ? Elle devra être re-signée.")) return;
              commit([patchRow("duties", duty.id, { signature_id: null })]);
              toast("Garde repassée à signer.", { variant: "success" });
            }}
          >
            Retirer de la signature
          </Button>
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Modifier la garde" onClose={onClose} size="md">
      <DutyForm
        stage={stage}
        initial={duty}
        onDone={() => {
          toast("Garde mise à jour.", { variant: "success" });
          onClose();
        }}
      />
      <div className="mt-4 border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={() => {
            if (!confirm("Supprimer cette garde ?")) return;
            commit([deleteRow("duties", duty.id)]);
            onClose();
          }}
        >
          <Trash2 className="h-4 w-4" /> Supprimer cette garde
        </Button>
      </div>
    </Modal>
  );
}

export function DutiesView({ stage }: { stage: CarnetStage }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CarnetDuty | null>(null);
  const [formKey, setFormKey] = useState(0);
  const supervisors = useMemo(() => new Map(data.supervisors.map((s) => [s.id, s])), [data.supervisors]);
  const duties = [...data.duties].sort((a, b) => b.duty_date.localeCompare(a.duty_date) || b.created_at.localeCompare(a.created_at));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="space-y-4">
        <SectionTitle>Nouvelle garde</SectionTitle>
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
          <DutyForm
            key={`${stage.id}:${formKey}`}
            stage={stage}
            onDone={(duty) => {
              setFormKey((k) => k + 1);
              toast("Garde enregistrée.", { variant: "success", actionLabel: "Annuler", onAction: () => commit([deleteRow("duties", duty.id)]) });
            }}
          />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-serif-display text-lg font-medium text-foreground">
          Journal de gardes <span className="ml-1 text-sm font-normal text-foreground-subtle">{duties.length}</span>
        </h2>
        {duties.length === 0 ? (
          <EmptyState title="Aucune garde enregistrée." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            {duties.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setEditing(d)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {formatDateFr(d.duty_date)} · {d.duty_type === "on_site" ? "Sur place" : "À domicile"}
                    </span>
                    <span className="block truncate text-xs text-foreground-subtle">
                      {[d.institution, d.city].filter(Boolean).join(", ")}
                      {d.supervisor_id ? ` · ${supervisorName(supervisors.get(d.supervisor_id))}` : " · sans superviseur"}
                    </span>
                  </span>
                  {d.signature_id ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="Signée" /> : <Clock className="h-4 w-4 text-accent" aria-label="À signer" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editing && <DutyModal duty={data.duties.find((d) => d.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
