"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { EmptyState, Field, SectionTitle, Textarea } from "@/components/carnet/ui";
import { deleteRow, putRow } from "@/lib/carnet/mutations";
import { formatDateFr } from "@/lib/carnet/logic";
import type { CarnetCourse, CarnetPublication, CarnetRelatedActivity } from "@/lib/carnet/types";

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
}: {
  title: string;
  description?: string;
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
              <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{s.primary}</p>
                  <p className="truncate text-xs text-foreground-subtle">{s.secondary}</p>
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

function period(start: string | null, end: string | null): string {
  if (start && end && start !== end) return `du ${formatDateFr(start)} au ${formatDateFr(end)}`;
  return formatDateFr(start ?? end);
}

const now = () => new Date().toISOString();

/** Activités connexes, cours suivis, présentations de séminaires, publications — the carnet's simple repeatable tables. */
export function TrainingView() {
  const { data, commit } = useCarnet();
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
        empty={() => ({ id: crypto.randomUUID(), nature: "", institution: "", city: "", start_date: null, end_date: null, appraisal: "", responsible: "", created_at: now() })}
        summary={(r) => ({ primary: r.nature, secondary: [r.institution, r.city, period(r.start_date, r.end_date)].filter(Boolean).join(" · ") })}
        onSave={(r) => commit([putRow("related_activities", r)])}
        onDelete={(r) => commit([deleteRow("related_activities", r.id)])}
      />
      {(["course", "seminar"] as const).map((kind) => (
        <RecordEditor<CarnetCourse>
          key={kind}
          title={kind === "course" ? "Cours suivis" : "Présentations de séminaires"}
          records={kind === "course" ? courses : seminars}
          fields={courseFields(kind)}
          empty={() => ({ id: crypto.randomUUID(), kind, start_date: null, end_date: null, city: "", institution: "", subject: "", exam_result: "", teacher: "", created_at: now() })}
          summary={(r) => ({ primary: r.subject, secondary: [period(r.start_date, r.end_date), r.institution, r.city, r.teacher].filter(Boolean).join(" · ") })}
          onSave={(r) => commit([putRow("courses", r)])}
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
    </div>
  );
}
