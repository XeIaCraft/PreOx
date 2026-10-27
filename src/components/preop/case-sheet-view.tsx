"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, FolderInput, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Combobox, Disclosure, FieldLabel, MiniNumber, Panel } from "@/components/preop/ui";
import { usePreopSession } from "@/components/preop/session";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { SecureStore } from "@/lib/preop/secure-store";
import { parseConsultation, splitConsultations } from "@/lib/preop/case-sheet/parse";
import { buildCaseSheet, type CaseChoices, type CaseQuestion, type CaseResult } from "@/lib/preop/case-sheet/build";
import { caseSheetCss, caseSheetDocument, caseSheetHtml } from "@/lib/preop/case-sheet/html";
import { searchSurgeries } from "@/lib/preop/surgery-search";
import { emptyDossier, type Dossier } from "@/lib/preop/dossier";
import type { Protocol } from "@/lib/preop/protocols";
import type { Rule } from "@/lib/preop/rules/types";
import type { SheetMode } from "@/lib/preop/anaesthesia-sheet";
import { cn } from "@/lib/utils";

// « Feuille de jour » (admins): the next day's anaesthesia consultations,
// pasted as they come out of the hospital's software, become one A5 sheet
// of case preparations. Read, computed and kept on this device only
// (encrypted like the dossiers): nothing is sent anywhere.

interface DayEntry {
  id: string;
  raw: string;
  choices: CaseChoices;
  /** The Préop dossier it was kept as. */
  dossierId?: string;
}

interface DaySheet {
  title: string;
  entries: DayEntry[];
}

const RECORD = "day-sheet";
const SAVE_DELAY_MS = 400;
const MODE_LABEL: Record<SheetMode, string> = { general: "AG", neuraxial: "Rachi", regional: "ALR", sedation: "Sédation" };

function tomorrowTitle(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `Préparation du ${d.toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" })}`;
}

/** « 03/05/2026 » → « 2026-05-03T08:00 » (the dossier's planned time). */
function plannedAtOf(date: string | undefined): string {
  const m = date?.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T08:00` : "";
}

const SCOPE = ".case-preview";

export function CaseSheetView({ rules, protocols, onKeep }: { rules: Rule[]; protocols: Protocol[]; onKeep: (d: Dossier) => Promise<void> }) {
  const { userId } = usePreopSession();
  const { catalogs, service } = useCatalogs();
  const { toast } = useToast();
  const store = useMemo(() => new SecureStore(userId), [userId]);
  const [sheet, setSheet] = useState<DaySheet | null>(null);
  const [paste, setPaste] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The sheet kept on this device, sealed.
  useEffect(() => {
    let cancelled = false;
    store
      .loadRecord<DaySheet>(RECORD)
      .then((s) => {
        if (!cancelled) setSheet(s ?? { title: tomorrowTitle(), entries: [] });
      })
      .catch(() => {
        if (!cancelled) setSheet({ title: tomorrowTitle(), entries: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  function update(next: DaySheet) {
    setSheet(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      store.saveRecord(RECORD, next).catch(() => toast("Enregistrement sur l'appareil impossible.", { variant: "error" }));
    }, SAVE_DELAY_MS);
  }

  const ctx = useMemo(() => ({ catalogs, rules, protocols, service }), [catalogs, rules, protocols, service]);
  const results = useMemo(() => new Map((sheet?.entries ?? []).map((e) => [e.id, buildCaseSheet(parseConsultation(e.raw), ctx, e.choices)])), [sheet?.entries, ctx]);

  if (!sheet) return <p className="text-sm text-foreground-muted">Ouverture de la feuille…</p>;

  const setEntry = (id: string, patch: Partial<DayEntry>) => update({ ...sheet, entries: sheet.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const choose = (id: string, choices: CaseChoices) => setEntry(id, { choices: { ...sheet.entries.find((e) => e.id === id)!.choices, ...choices } });

  function read() {
    const pieces = splitConsultations(paste);
    if (!pieces.length) return;
    update({ ...sheet!, entries: [...sheet!.entries, ...pieces.map((raw) => ({ id: crypto.randomUUID(), raw, choices: {} }))] });
    setPaste("");
    toast(`${pieces.length} consultation(s) lue(s).`, { variant: "success" });
  }

  function move(id: string, by: -1 | 1) {
    const list = [...sheet!.entries];
    const i = list.findIndex((e) => e.id === id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    update({ ...sheet!, entries: list });
  }

  function print() {
    const sheets = sheet!.entries.map((e) => results.get(e.id)!.sheet);
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) {
      toast("La fenêtre d'impression a été bloquée par le navigateur.", { variant: "error" });
      return;
    }
    w.document.write(caseSheetDocument(sheets, sheet!.title));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 150);
  }

  async function keep(e: DayEntry, r: CaseResult) {
    const d = emptyDossier(r.sheet.initials === "?" ? "?" : r.sheet.initials, {
      ...r.consultation,
      plannedAt: plannedAtOf(parseConsultation(e.raw).plannedDate),
      notes: [r.consultation.notes, e.choices.notes].filter(Boolean).join("\n\n"),
    });
    const dossier: Dossier = { ...d, status: "prepared", plan: r.plan, protocolId: r.protocol?.id ?? null, protocolName: r.protocol?.name ?? "" };
    await onKeep(dossier);
    setEntry(e.id, { dossierId: dossier.id });
    toast(`Dossier ${dossier.initials} gardé sur cet appareil (onglet Dossiers).`, { variant: "success" });
  }

  return (
    <div className="space-y-4">
      <style>{caseSheetCss(SCOPE)}</style>
      <Panel
        title="Feuille de jour"
        actions={
          sheet.entries.length > 0 && (
            <>
              <Button size="sm" onClick={print}>
                <Printer className="h-3.5 w-3.5" /> Imprimer (A5)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Effacer toute la feuille de cet appareil ?")) update({ title: tomorrowTitle(), entries: [] });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Tout effacer
              </Button>
            </>
          )
        }
      >
        <p className="text-sm text-foreground-muted">
          Collez les consultations d&apos;anesthésie du lendemain, une ou plusieurs à la fois, telles qu&apos;elles sortent du logiciel de l&apos;hôpital. Elles sont lues et gardées sur cet appareil, chiffrées : rien n&apos;est envoyé. Si
          elles ne commencent pas par une date de naissance, séparez-les par une ligne « --- ».
        </p>
        <label className="block space-y-1">
          <FieldLabel>Titre de la feuille</FieldLabel>
          <input
            value={sheet.title}
            onChange={(e) => update({ ...sheet, title: e.target.value })}
            className="h-9 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Consultations à ajouter</FieldLabel>
          <textarea
            rows={6}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Collez ici une ou plusieurs consultations…"
            className="block w-full min-w-0 resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>
        <Button size="sm" onClick={read} disabled={!paste.trim()}>
          <FileText className="h-3.5 w-3.5" /> Lire et ajouter
        </Button>
      </Panel>

      {sheet.entries.map((e, i) => {
        const r = results.get(e.id)!;
        return (
          <section key={e.id} className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {i + 1}/ {r.sheet.initials} · {r.sheet.surgery}
                </h3>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" aria-label="Monter" disabled={i === 0} onClick={() => move(e.id, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Descendre" disabled={i === sheet.entries.length - 1} onClick={() => move(e.id, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Retirer de la feuille" onClick={() => update({ ...sheet, entries: sheet.entries.filter((x) => x.id !== e.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {r.questions.length > 0 && (
                <div className="space-y-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground">À préciser</p>
                  {r.questions.map((q) => (
                    <Question key={q.id} q={q} onAnswer={(c) => choose(e.id, c)} />
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <FieldLabel>Intervention</FieldLabel>
                <Combobox
                  ariaLabel="Changer d'intervention"
                  placeholder={r.item ? `${r.item.name} — chercher une autre…` : "Chercher l'intervention dans le catalogue…"}
                  onEmpty={() => r.candidates.map((x) => ({ key: x.id, label: x.name }))}
                  search={(q) => searchSurgeries(catalogs.surgeries, q, { age: r.consultation.patient.age, sex: r.consultation.patient.sex }).map((x) => ({ key: x.id, label: x.name }))}
                  onPick={(o) => choose(e.id, { surgeryId: o.key })}
                />
                <p className="text-xs text-foreground-subtle">{r.protocol ? `Protocole : ${r.protocol.name}` : "Aucun protocole de la bibliothèque pour cette intervention."}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {r.modes.map((m) => (
                  <Chip key={m} on={r.mode === m} onClick={() => choose(e.id, { mode: m })}>
                    {MODE_LABEL[m]}
                  </Chip>
                ))}
                {r.mode === "general" && (
                  <Chip on={r.tiva} onClick={() => choose(e.id, { tiva: !r.tiva })}>
                    TIVA (AIVOC)
                  </Chip>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniNumber key={`a-${e.id}`} label="Âge" value={r.consultation.patient.age} onChange={(v) => choose(e.id, { age: v })} unit="ans" />
                <MiniNumber key={`w-${e.id}`} label="Poids" value={r.consultation.patient.weightKg} onChange={(v) => choose(e.id, { weightKg: v })} unit="kg" />
                <MiniNumber key={`h-${e.id}`} label="Taille" value={r.consultation.patient.heightCm} onChange={(v) => choose(e.id, { heightCm: v })} unit="cm" />
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium text-foreground-subtle">Sexe</span>
                  <div className="mt-0.5 flex gap-1">
                    {(["F", "M"] as const).map((s) => (
                      <Chip key={s} on={r.consultation.patient.sex === s} onClick={() => choose(e.id, { sex: s })}>
                        {s}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>

              <label className="block space-y-1">
                <FieldLabel>Autres consultations (cardio, transfert USI…)</FieldLabel>
                <textarea
                  rows={3}
                  defaultValue={e.choices.notes ?? ""}
                  onChange={(ev) => choose(e.id, { notes: ev.target.value })}
                  placeholder="Collez ou résumez : elles s'impriment sous le patient."
                  className="block w-full min-w-0 resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" disabled={!!e.dossierId} onClick={() => void keep(e, r)}>
                  <FolderInput className="h-3.5 w-3.5" /> {e.dossierId ? "Gardé comme dossier" : "Garder comme dossier"}
                </Button>
              </div>
              <Disclosure summary="Texte collé" summaryClassName="text-xs text-foreground-subtle">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-surface-muted p-2 text-[11px] text-foreground-muted">{e.raw}</pre>
              </Disclosure>
            </div>

            {/* The sheet as printed: a sheet of paper, the same in both themes. */}
            <div className="case-preview min-w-0 self-start overflow-x-auto rounded-[var(--radius-md)] border border-border bg-white p-3 text-[#15191c] shadow-sm" dangerouslySetInnerHTML={{ __html: caseSheetHtml(r.sheet, i + 1) }} />
          </section>
        );
      })}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("min-h-8 rounded-full border px-3 text-xs font-medium", on ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-muted hover:bg-surface-muted")}
    >
      {children}
    </button>
  );
}

function Question({ q, onAnswer }: { q: CaseQuestion; onAnswer: (c: CaseChoices) => void }) {
  if (q.options) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-foreground">{q.text}</p>
        <div className="flex flex-wrap gap-1.5">
          {q.options.map((o) => (
            <Chip
              key={o.value || "none"}
              on={false}
              onClick={() => {
                if (q.id === "surgery") onAnswer({ surgeryId: o.value || null });
                else if (q.id === "mode") onAnswer({ mode: o.value as SheetMode });
                else if (q.id === "sex") onAnswer({ sex: o.value as "M" | "F" });
              }}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </div>
    );
  }
  // Values are typed in the fields below (they stay while typing).
  return <p className="text-sm text-foreground">{q.text} À saisir ci-dessous.</p>;
}
