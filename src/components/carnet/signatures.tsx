"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, PenTool, Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { SignaturePad } from "@/components/carnet/signature-pad";
import { CaseEditModal } from "@/components/carnet/cases";
import { ChipGroup, EmptyState, SectionTitle } from "@/components/carnet/ui";
import { deleteRow, newId, patchRow, putRow } from "@/lib/carnet/mutations";
import { personFor, SIGNER_LABEL, signingSettingsFrom, type SignerRole, type SigningSettings } from "@/lib/carnet/signing";
import { caseCode, supervisorName } from "@/lib/carnet/referentiel";
import { caseNumbers, formatDateFr, pendingSignatureGroups, type PendingDay, type PendingGroup } from "@/lib/carnet/logic";
import type { CarnetCase, CarnetSignature, CarnetSupervisor } from "@/lib/carnet/types";

/** The recap a supervisor reads before signing — never a blind signature. */
function Recap({ days, numbers }: { days: PendingDay[]; numbers: Map<string, number> }) {
  return (
    <div className="max-h-64 overflow-auto rounded-[var(--radius-md)] border border-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-surface-muted text-foreground-subtle">
          <tr>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 font-medium">N°</th>
            <th className="px-2 py-1.5 font-medium">Prestation</th>
            <th className="px-2 py-1.5 font-medium">Cat./Degré</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {days.flatMap((day) => [
            ...day.cases.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap px-2 py-1.5">{formatDateFr(c.case_date)}</td>
                <td className="px-2 py-1.5 font-mono">{numbers.get(c.id)}</td>
                <td className="px-2 py-1.5">
                  {c.operation}
                  {c.patient_initials && <span className="text-foreground-subtle"> ({c.patient_initials})</span>}
                </td>
                <td className="px-2 py-1.5 font-mono">{caseCode(c)}</td>
              </tr>
            )),
            ...day.duties.map((d) => (
              <tr key={d.id}>
                <td className="whitespace-nowrap px-2 py-1.5">{formatDateFr(d.duty_date)}</td>
                <td className="px-2 py-1.5">—</td>
                <td className="px-2 py-1.5">
                  Garde {d.duty_type === "on_site" ? "sur place" : "à domicile"} — {d.institution}
                </td>
                <td className="px-2 py-1.5">—</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function SignModal({ supervisor, days, signer, onClose }: { supervisor: CarnetSupervisor; days: PendingDay[]; signer: SignerRole; onClose: () => void }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const numbers = useMemo(() => caseNumbers(data.cases, data.stages), [data.cases, data.stages]);
  const [image, setImage] = useState<string | null>(null);
  const caseCount = days.reduce((n, d) => n + d.cases.length, 0);
  const dutyCount = days.reduce((n, d) => n + d.duties.length, 0);

  function sign() {
    if (!image) return;
    const signature: CarnetSignature = {
      id: crypto.randomUUID(),
      supervisor_id: supervisor.id,
      supervisor_name: supervisorName(supervisor),
      image,
      signed_at: new Date().toISOString(),
    };
    commit([
      putRow("signatures", signature),
      ...days.flatMap((d) => d.cases.map((c) => patchRow("cases", c.id, { signature_id: signature.id }))),
      ...days.flatMap((d) => d.duties.map((duty) => patchRow("duties", duty.id, { signature_id: signature.id }))),
    ]);
    toast(`Signé par ${signature.supervisor_name}.`, { variant: "success" });
    onClose();
  }

  const parts = [caseCount > 0 && `${caseCount} cas`, dutyCount > 0 && `${dutyCount} garde${dutyCount > 1 ? "s" : ""}`].filter(Boolean).join(" et ");
  return (
    <Modal title={`Signature — ${supervisorName(supervisor)}`} description={`${parts} à valider`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <Recap days={days} numbers={numbers} />
        <p className="text-sm text-foreground">
          {signer === "stage_master"
            ? `En signant, ${supervisorName(supervisor)}, maître de stage, atteste l'exactitude des prestations ci-dessus.`
            : `En signant, ${supervisorName(supervisor)} atteste avoir supervisé les prestations ci-dessus${supervisor.role ? ` en qualité de ${supervisor.role.toLowerCase()}` : ""}.`}
        </p>
        <SignaturePad onChange={setImage} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={sign} disabled={!image} size="lg">
            <PenTool className="h-4 w-4" /> Valider la signature
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function GroupCard({ group, supervisor, signer, onSign, onOpenCase }: { group: PendingGroup; supervisor: CarnetSupervisor | null; signer: SignerRole; onSign: (days: PendingDay[]) => void; onOpenCase: (c: CarnetCase) => void }) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const selectedDays = group.days.filter((d) => !excluded.has(d.date));
  const selectedCount = selectedDays.reduce((n, d) => n + d.cases.length + d.duties.length, 0);

  if (!supervisor) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-accent/40 bg-accent-tint p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
          <AlertTriangle className="h-4 w-4" /> {group.total} prestation{group.total > 1 ? "s" : ""} {signer === "stage_master" ? "sans maître de stage" : "sans tuteur"}
        </p>
        <p className="mt-1 text-xs text-foreground-muted">
          {signer === "stage_master" ? "Indiquez le maître de stage du stage (onglet Stages) pour pouvoir les faire signer." : "Indiquez un tuteur pour pouvoir les faire signer."}
        </p>
        <ul className="mt-2 space-y-1">
          {group.days.flatMap((d) =>
            d.cases.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenCase(c)} className="text-left text-sm text-foreground underline-offset-4 hover:underline">
                  {formatDateFr(c.case_date)} — {c.operation}
                </button>
              </li>
            ))
          )}
        </ul>
        {group.days.some((d) => d.duties.length > 0) && (
          <p className="mt-2 text-xs text-foreground-muted">Des gardes {signer === "stage_master" ? "sans maître de stage" : "sans superviseur"} sont aussi en attente{signer === "stage_master" ? "" : " (onglet Gardes)"}.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{supervisorName(supervisor)}</p>
          <p className="text-xs text-foreground-subtle">
            {group.total} en attente · {group.days.length} jour{group.days.length > 1 ? "s" : ""}
            {supervisor.role && ` · ${supervisor.role}`}
          </p>
        </div>
        <Button onClick={() => onSign(selectedDays)} disabled={selectedCount === 0} size="lg">
          <PenTool className="h-4 w-4" /> Faire signer ({selectedCount})
        </Button>
      </div>
      <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-3 flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} /> Choisir les jours à inclure
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5">
          {group.days.map((day) => (
            <li key={day.date}>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={!excluded.has(day.date)}
                  onChange={(e) =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(day.date);
                      else next.add(day.date);
                      return next;
                    })
                  }
                />
                {formatDateFr(day.date)}
                <span className="text-xs text-foreground-subtle">
                  {[day.cases.length > 0 && `${day.cases.length} cas`, day.duties.length > 0 && `${day.duties.length} garde${day.duties.length > 1 ? "s" : ""}`]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Who signs the record (supervisor of the day, or the stage's maître de
 * stage who signs everything at once), whose name the carnet shows, and the
 * record printed alone with empty signature boxes, to be signed by hand.
 */
function SigningSettingsCard({ settings }: { settings: SigningSettings }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const years = [...new Set(data.stages.map((s) => s.training_year))].sort((a, b) => a - b);
  const [year, setYear] = useState<number | "all">(years.at(-1) ?? "all");
  const [busy, setBusy] = useState(false);
  const row = data.settings.find((s) => s.key === "signing");

  function save(next: Partial<SigningSettings>) {
    commit([putRow("settings", { id: row?.id ?? newId(), key: "signing", value: { ...settings, ...next } as unknown as Record<string, unknown> })]);
  }

  async function print() {
    setBusy(true);
    try {
      const { downloadCaseRecord } = await import("@/lib/carnet/pdf");
      await downloadCaseRecord(data, year, { blankSignatures: true, nameShown: settings.nameShown });
    } catch (err) {
      console.error(err);
      toast("La génération du PDF a échoué.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const roles = (["stage_master", "day"] as const).map((code) => ({ code, label: SIGNER_LABEL[code] }));
  return (
    <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Qui signe le relevé des cas et les gardes ?</p>
        <ChipGroup size="sm" options={roles} value={settings.signer} onChange={(v) => v && save({ signer: v })} />
        <p className="text-xs text-foreground-subtle">
          {settings.signer === "stage_master"
            ? "Les prestations sont regroupées par maître de stage (celui du stage, onglet Stages) : il signe tout d'un coup, à la fin du stage par exemple."
            : "Les prestations sont regroupées par superviseur du jour (tuteur du cas, superviseur de la garde)."}
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Nom dans la colonne « tuteur » du relevé (PDF)</p>
        <ChipGroup size="sm" options={roles} value={settings.nameShown} onChange={(v) => v && save({ nameShown: v })} />
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Imprimer le relevé à signer à la main</p>
        <p className="text-xs text-foreground-subtle">Le relevé des prestations et les jours de garde du formulaire officiel, colonnes de signature laissées vides.</p>
        {years.length > 1 && (
          <ChipGroup
            size="sm"
            options={[...years.map((y) => ({ code: y as number | "all", label: `Année ${y}` })), { code: "all", label: "Toute la formation" }]}
            value={year}
            onChange={(v) => v !== null && setYear(v)}
          />
        )}
        <Button variant="secondary" onClick={print} disabled={busy || data.cases.length + data.duties.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Télécharger le relevé à imprimer
        </Button>
      </div>
    </section>
  );
}

/**
 * "En attente de signature": everything unsigned, grouped by supervisor then
 * day — at the end of the day, or later to catch up. Each group is signed
 * once, after the supervisor has read the recap; the same signature is
 * applied to every case/duty of the batch. Below, the signatures already
 * collected, each of which can be undone (its items go back to pending).
 */
export function SignaturesView() {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const signing = useMemo(() => signingSettingsFrom(data.settings), [data.settings]);
  const groups = useMemo(() => pendingSignatureGroups(data, personFor(signing.signer, new Map(data.stages.map((st) => [st.id, st])))), [data, signing.signer]);
  const supervisors = useMemo(() => new Map(data.supervisors.map((s) => [s.id, s])), [data.supervisors]);
  const [signingFor, setSigningFor] = useState<{ supervisor: CarnetSupervisor; days: PendingDay[] } | null>(null);
  const [openCase, setOpenCase] = useState<CarnetCase | null>(null);
  const history = [...data.signatures].sort((a, b) => b.signed_at.localeCompare(a.signed_at));
  const itemsBySignature = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.cases) if (c.signature_id) counts.set(c.signature_id, (counts.get(c.signature_id) ?? 0) + 1);
    for (const d of data.duties) if (d.signature_id) counts.set(d.signature_id, (counts.get(d.signature_id) ?? 0) + 1);
    return counts;
  }, [data.cases, data.duties]);

  return (
    <div className="space-y-8">
      <SigningSettingsCard settings={signing} />
      <section className="space-y-3">
        <SectionTitle>En attente de signature</SectionTitle>
        {groups.length === 0 ? (
          <EmptyState title="Tout est signé.">Les nouveaux cas et gardes apparaîtront ici, regroupés par superviseur.</EmptyState>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const supervisor = group.supervisorId ? (supervisors.get(group.supervisorId) ?? null) : null;
              return (
                <GroupCard
                  key={group.supervisorId ?? "none"}
                  group={group}
                  supervisor={supervisor}
                  onOpenCase={setOpenCase}
                  signer={signing.signer}
                  onSign={(days) => supervisor && setSigningFor({ supervisor, days })}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif-display text-lg font-medium text-foreground">Signatures recueillies</h2>
        {history.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Aucune pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            {history.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL */}
                <img src={s.image} alt="" className="h-10 w-24 shrink-0 rounded border border-border bg-white object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {s.supervisor_name}
                  </p>
                  <p className="text-xs text-foreground-subtle">
                    {new Date(s.signed_at).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })} · {itemsBySignature.get(s.id) ?? 0} prestation(s)
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!confirm(`Annuler la signature de ${s.supervisor_name} ? Les prestations concernées repasseront à signer.`)) return;
                    commit([deleteRow("signatures", s.id)]);
                    toast("Signature annulée.", { variant: "success" });
                  }}
                  title="Annuler cette signature"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {signingFor && <SignModal supervisor={signingFor.supervisor} days={signingFor.days} signer={signing.signer} onClose={() => setSigningFor(null)} />}
      {openCase && <CaseEditModal kase={data.cases.find((c) => c.id === openCase.id) ?? openCase} onClose={() => setOpenCase(null)} />}
    </div>
  );
}
