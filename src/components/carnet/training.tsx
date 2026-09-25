"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Pencil, PenTool, Plus, Printer, Trash2, Undo2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { SignaturePad } from "@/components/carnet/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { EmptyState, Field, SectionTitle, Textarea } from "@/components/carnet/ui";
import { deleteRow, patchRow, putRow } from "@/lib/carnet/mutations";
import { formatDateFr } from "@/lib/carnet/logic";
import type { CarnetCourse, CarnetPublication, CarnetRelatedActivity, CarnetSignature } from "@/lib/carnet/types";

type FieldDef<T> = { key: keyof T & string; label: string; type?: "text" | "date" | "textarea"; required?: boolean; placeholder?: string; wide?: boolean };

/** Generic "repeatable form" editor for the carnet's simple tables (activités connexes, cours, séminaires, publications). */
function RecordEditor<T extends { id: string; created_at: string }>({
  title,
  description,
  records,
  fields,
  empty,
  summary,
  onSave,
  onDelete,
  rowExtra,
  headerExtra,
}: {
  title: string;
  description?: string;
  /** Under each row: signature state and actions. */
  rowExtra?: (r: T) => React.ReactNode;
  headerExtra?: React.ReactNode;
  records: T[];
  fields: FieldDef<T>[];
  empty: () => T;
  summary: (r: T) => { primary: string; secondary: string };
  onSave: (r: T) => void;
  onDelete: (r: T) => void;
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="space-y-3">
      <SectionTitle
        action={
          <div className="flex flex-wrap gap-1.5">
            {headerExtra}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setError(null);
                setEditing(empty());
              }}
            >
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
        }
      >
        {title}
      </SectionTitle>
      {description && <p className="text-xs text-foreground-subtle">{description}</p>}
      {records.length === 0 ? (
        <EmptyState title="Rien pour l'instant." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {records.map((r) => {
            const s = summary(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{s.primary}</p>
                  <p className="truncate text-xs text-foreground-subtle">{s.secondary}</p>
                  {rowExtra?.(r)}
                </div>
                <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => setEditing(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={() => confirm("Supprimer cette entrée ?") && onDelete(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <Modal title={title} onClose={() => setEditing(null)} size="md">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const missing = fields.find((f) => f.required && !String(editing[f.key] ?? "").trim());
              if (missing) return setError(`${missing.label} est requis.`);
              onSave(editing);
              setEditing(null);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => {
                const value = (editing[f.key] as string | null) ?? "";
                const update = (v: string) => setEditing({ ...editing, [f.key]: f.type === "date" ? v || null : v });
                return (
                  <Field key={f.key} label={f.label} className={f.wide || f.type === "textarea" ? "sm:col-span-2" : undefined}>
                    {f.type === "textarea" ? (
                      <Textarea rows={4} value={value} onChange={(e) => update(e.target.value)} placeholder={f.placeholder} />
                    ) : (
                      <Input type={f.type === "date" ? "date" : "text"} value={value} onChange={(e) => update(e.target.value)} placeholder={f.placeholder} className="h-11" />
                    )}
                  </Field>
                );
              })}
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

/** What the signer reads before signing — never a blind signature. */
function SignModal({ title, lines, defaultName, onSign, onClose }: { title: string; lines: [string, string][]; defaultName: string; onSign: (name: string, image: string) => void; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [image, setImage] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose} size="lg">
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[var(--radius-md)] border border-border p-3 text-sm">
          {lines
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-foreground-subtle">{k}</dt>
                <dd className="whitespace-pre-wrap break-words text-foreground">{v}</dd>
              </div>
            ))}
        </dl>
        <Field label="Nom du signataire">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </Field>
        <p className="text-sm text-foreground">En signant, {name || "le signataire"} atteste l&apos;exactitude de ce qui précède.</p>
        <SignaturePad onChange={setImage} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button size="lg" disabled={!image || !name.trim()} onClick={() => image && onSign(name.trim(), image)}>
            <PenTool className="h-4 w-4" /> Valider la signature
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function period(start: string | null, end: string | null): string {
  if (start && end && start !== end) return `du ${formatDateFr(start)} au ${formatDateFr(end)}`;
  return formatDateFr(start ?? end);
}

const now = () => new Date().toISOString();

/** Activités connexes, cours suivis, présentations de séminaires, publications — the carnet's simple repeatable tables. */
export function TrainingView() {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const [signing, setSigning] = useState<{ collection: "related_activities" | "courses"; id: string } | null>(null);
  const signatureOf = (id: string | null) => (id ? data.signatures.find((x) => x.id === id) : undefined);

  // Changing a signed entry withdraws its signature: what was signed is no longer what is written.
  const saveSigned = <C extends "related_activities" | "courses">(collection: C, r: C extends "courses" ? CarnetCourse : CarnetRelatedActivity) => {
    const before = (data[collection] as (CarnetCourse | CarnetRelatedActivity)[]).find((x) => x.id === r.id);
    const changed = before && JSON.stringify({ ...before, signature_id: null }) !== JSON.stringify({ ...r, signature_id: null });
    if (before?.signature_id && changed) {
      commit([putRow(collection, { ...r, signature_id: null } as never), deleteRow("signatures", before.signature_id)]);
      toast("Modifié : la signature a été retirée, à faire re-signer.", { variant: "info" });
    } else commit([putRow(collection, r as never)]);
  };

  const signState = (collection: "related_activities" | "courses", r: { id: string; signature_id: string | null }, signerLabel: string) => {
    const sig = signatureOf(r.signature_id);
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {sig ? (
          <>
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Signé par {sig.supervisor_name} le {formatDateFr(sig.signed_at.slice(0, 10))}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-foreground-subtle hover:text-danger"
              onClick={() => {
                if (!confirm("Retirer la signature ?")) return;
                commit([patchRow(collection, r.id, { signature_id: null }), deleteRow("signatures", sig.id)]);
              }}
            >
              <Undo2 className="h-3.5 w-3.5" /> Retirer
            </button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-accent">
              <Clock className="h-3.5 w-3.5" /> À faire signer ({signerLabel})
            </span>
            <button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => setSigning({ collection, id: r.id })}>
              <PenTool className="h-3.5 w-3.5" /> Faire signer
            </button>
          </>
        )}
      </div>
    );
  };

  const print = async (what: () => Promise<void>) => {
    try {
      await what();
    } catch {
      toast("Impression impossible : le modèle du carnet n'a pas pu être chargé (hors ligne ?).", { variant: "error" });
    }
  };

  const signingRecord = signing ? (data[signing.collection] as (CarnetCourse | CarnetRelatedActivity)[]).find((x) => x.id === signing.id) : undefined;
  const byDate = <T extends { start_date?: string | null; pub_date?: string | null; created_at: string }>(a: T, b: T) =>
    (b.start_date ?? b.pub_date ?? b.created_at).localeCompare(a.start_date ?? a.pub_date ?? a.created_at);

  const courses = data.courses.filter((c) => c.kind === "course").sort(byDate);
  const seminars = data.courses.filter((c) => c.kind === "seminar").sort(byDate);

  const courseFields = (kind: "course" | "seminar"): FieldDef<CarnetCourse>[] => [
    { key: "subject", label: "Sujet", required: true, wide: true },
    { key: "start_date", label: kind === "course" ? "Du" : "Date", type: "date" },
    ...(kind === "course" ? [{ key: "end_date" as const, label: "Au", type: "date" as const }] : []),
    { key: "city", label: "Ville" },
    { key: "institution", label: "Institution" },
    { key: "teacher", label: kind === "course" ? "Chargé d'enseignement" : "Professeur" },
    ...(kind === "course" ? [{ key: "exam_result" as const, label: "Examens / résultats" }] : []),
  ];

  return (
    <div className="space-y-10">
      <RecordEditor<CarnetRelatedActivity>
        title="Activités connexes"
        description="Services d'aide médicale urgente, travaux de laboratoire, clinique de la douleur, acupuncture…"
        records={[...data.related_activities].sort(byDate)}
        fields={[
          { key: "nature", label: "Nature", required: true, wide: true },
          { key: "institution", label: "Institution" },
          { key: "city", label: "Ville" },
          { key: "start_date", label: "Du", type: "date" },
          { key: "end_date", label: "Au", type: "date" },
          { key: "responsible", label: "Médecin responsable", wide: true },
          { key: "appraisal", label: "Appréciation", type: "textarea" },
        ]}
        empty={() => ({ id: crypto.randomUUID(), nature: "", institution: "", city: "", start_date: null, end_date: null, appraisal: "", responsible: "", signature_id: null, created_at: now() })}
        summary={(r) => ({ primary: r.nature, secondary: [r.institution, r.city, period(r.start_date, r.end_date)].filter(Boolean).join(" · ") })}
        rowExtra={(r) => (
          <div className="flex flex-wrap items-center gap-x-3">
            {signState("related_activities", r, r.responsible || "médecin responsable")}
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => print(async () => (await import("@/lib/carnet/pdf")).downloadActivity(data, r))}
            >
              <Printer className="h-3.5 w-3.5" /> Imprimer la page du carnet
            </button>
          </div>
        )}
        onSave={(r) => saveSigned("related_activities", r)}
        onDelete={(r) => commit([deleteRow("related_activities", r.id)])}
      />
      {(["course", "seminar"] as const).map((kind) => (
        <RecordEditor<CarnetCourse>
          key={kind}
          title={kind === "course" ? "Cours suivis" : "Présentations de séminaires"}
          records={kind === "course" ? courses : seminars}
          fields={courseFields(kind)}
          empty={() => ({ id: crypto.randomUUID(), kind, start_date: null, end_date: null, city: "", institution: "", subject: "", exam_result: "", teacher: "", signature_id: null, created_at: now() })}
          summary={(r) => ({ primary: r.subject, secondary: [period(r.start_date, r.end_date), r.institution, r.city, r.teacher].filter(Boolean).join(" · ") })}
          rowExtra={(r) => signState("courses", r, r.teacher || (kind === "course" ? "chargé d'enseignement" : "professeur"))}
          headerExtra={
            (kind === "course" ? courses : seminars).length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => print(async () => (await import("@/lib/carnet/pdf")).downloadCourses(data, kind))}>
                <Printer className="h-4 w-4" /> Imprimer
              </Button>
            )
          }
          onSave={(r) => saveSigned("courses", r)}
          onDelete={(r) => commit([deleteRow("courses", r.id)])}
        />
      ))}
      <RecordEditor<CarnetPublication>
        title="Publications ou communications"
        records={[...data.publications].sort(byDate)}
        fields={[
          { key: "title", label: "Titre / référence", required: true, wide: true },
          { key: "pub_date", label: "Date", type: "date" },
          { key: "details", label: "Revue, congrès, co-auteurs…", type: "textarea" },
        ]}
        empty={() => ({ id: crypto.randomUUID(), title: "", details: "", pub_date: null, created_at: now() })}
        summary={(r) => ({ primary: r.title, secondary: [formatDateFr(r.pub_date), r.details].filter(Boolean).join(" · ") })}
        onSave={(r) => commit([putRow("publications", r)])}
        onDelete={(r) => commit([deleteRow("publications", r.id)])}
      />
      {signing && signingRecord && (
        <SignModal
          title={signing.collection === "related_activities" ? "Signature — activité connexe" : (signingRecord as CarnetCourse).kind === "course" ? "Signature — cours suivi" : "Signature — présentation de séminaire"}
          defaultName={signing.collection === "related_activities" ? (signingRecord as CarnetRelatedActivity).responsible : (signingRecord as CarnetCourse).teacher}
          lines={
            signing.collection === "related_activities"
              ? (() => {
                  const a = signingRecord as CarnetRelatedActivity;
                  return [
                    ["Nature", a.nature],
                    ["Institution", [a.institution, a.city].filter(Boolean).join(", ")],
                    ["Période", period(a.start_date, a.end_date)],
                    ["Appréciation", a.appraisal],
                  ] as [string, string][];
                })()
              : (() => {
                  const c = signingRecord as CarnetCourse;
                  return [
                    ["Sujet", c.subject],
                    ["Date", period(c.start_date, c.end_date)],
                    ["Institution", [c.institution, c.city].filter(Boolean).join(", ")],
                    ["Examens / résultats", c.exam_result],
                  ] as [string, string][];
                })()
          }
          onClose={() => setSigning(null)}
          onSign={(name, image) => {
            const signature: CarnetSignature = { id: crypto.randomUUID(), supervisor_id: null, supervisor_name: name, image, signed_at: new Date().toISOString() };
            commit([putRow("signatures", signature), patchRow(signing.collection, signing.id, { signature_id: signature.id })]);
            toast(`Signé par ${name}.`, { variant: "success" });
            setSigning(null);
          }}
        />
      )}
    </div>
  );
}
