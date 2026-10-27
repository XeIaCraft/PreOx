"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FilePlus2, Timer, FileText, FolderInput, Pencil, Printer, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Combobox, Disclosure, FieldLabel, MiniNumber, Panel } from "@/components/preop/ui";
import { usePreopSession } from "@/components/preop/session";
import { PlanEditor } from "@/components/preop/plan-editor";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { SecureStore } from "@/lib/preop/secure-store";
import { parseConsultation, splitConsultations } from "@/lib/preop/case-sheet/parse";
import { buildCaseSheet, type CaseChoices, type CaseQuestion, type CaseResult } from "@/lib/preop/case-sheet/build";
import { caseSheetCss, caseSheetDocument, caseSheetHtml, dayKinetics, kineticsHtml } from "@/lib/preop/case-sheet/html";
import type { LineKind } from "@/lib/preop/case-sheet/lines";
import { fold } from "@/lib/preop/catalog";
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
  /** Lines taken off the sheet (html.ts HiddenLines keys). */
  hidden?: string[];
}

interface DaySheet {
  title: string;
  entries: DayEntry[];
  /** Onsets and context-sensitive half-times on the sheet (screen and print). */
  kinetics?: boolean;
  /** Drugs taken off the « Pharmaco » list (« pk:… »). */
  hiddenKinetics?: string[];
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
  const choose = (id: string, choices: CaseChoices) => {
    const current = sheet.entries.find((e) => e.id === id)!.choices;
    // Another intervention or technique: the adapted plan was for the previous one.
    if (current.plan && ("surgeryId" in choices || "mode" in choices || "protocolId" in choices)) {
      if (!confirm("Le protocole adapté pour ce patient sera remplacé par celui de ce choix. Continuer ?")) return;
      choices = { ...choices, plan: undefined, tiva: undefined };
    }
    setEntry(id, { choices: { ...current, ...choices } });
  };

  /** A line of the preview touched: off the printed sheet, or back on it. */
  function toggleLine(e: DayEntry, target: HTMLElement) {
    const key = target.closest("[data-k]")?.getAttribute("data-k");
    if (!key) return;
    const hidden = new Set(e.hidden ?? []);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    setEntry(e.id, { hidden: [...hidden] });
  }

  function toggleKinetics(target: HTMLElement) {
    const key = target.closest("[data-k]")?.getAttribute("data-k");
    if (!key) return;
    const hidden = new Set(sheet!.hiddenKinetics ?? []);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    update({ ...sheet!, hiddenKinetics: [...hidden] });
  }

  function addEntries(raws: string[]) {
    update({ ...sheet!, entries: [...sheet!.entries, ...raws.map((raw) => ({ id: crypto.randomUUID(), raw, choices: {} }))] });
  }

  function read() {
    const pieces = splitConsultations(paste);
    if (!pieces.length) return;
    addEntries(pieces);
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
    const sheets = sheet!.entries.map((e) => ({ sheet: results.get(e.id)!.sheet, hidden: new Set(e.hidden ?? []) }));
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) {
      toast("La fenêtre d'impression a été bloquée par le navigateur.", { variant: "error" });
      return;
    }
    w.document.write(caseSheetDocument(sheets, sheet!.title, { kinetics: sheet!.kinetics, hiddenKinetics: new Set(sheet!.hiddenKinetics ?? []) }));
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
              <Button
                size="sm"
                variant={sheet.kinetics ? "outline" : "ghost"}
                aria-pressed={!!sheet.kinetics}
                title="Délai d'action (onset) et demi-vie contextuelle des produits d'anesthésie, à titre indicatif"
                onClick={() => update({ ...sheet, kinetics: !sheet.kinetics })}
              >
                <Timer className="h-3.5 w-3.5" /> Pharmaco {sheet.kinetics ? "affichée" : "masquée"}
              </Button>
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
        <QuickPatient
          catalogs={catalogs}
          onAdd={(raw) => {
            addEntries([raw]);
            toast("Patient ajouté à la feuille.", { variant: "success" });
          }}
        />
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
                    <Question
                      key={q.line ? `line:${q.line}` : q.id}
                      q={q}
                      onAnswer={(c) => choose(e.id, c)}
                      onLine={(line, kind) => choose(e.id, { lines: { ...(e.choices.lines ?? {}), [line]: kind } })}
                    />
                  ))}
                  {r.questions.filter((q) => q.line).length > 1 && (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary-strong underline-offset-2 hover:underline"
                      onClick={() => choose(e.id, { lines: { ...(e.choices.lines ?? {}), ...Object.fromEntries(r.questions.filter((q) => q.line).map((q) => [q.line!, "ignore" as LineKind])) } })}
                    >
                      Ignorer toutes les lignes non classées
                    </button>
                  )}
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
              </div>

              <div className="space-y-1">
                <FieldLabel>Protocole</FieldLabel>
                <Combobox
                  ariaLabel="Choisir un autre protocole"
                  placeholder={r.protocol ? `${r.protocol.name} — chercher un autre protocole…` : "Aucun pour cette intervention — chercher un protocole…"}
                  onEmpty={() => protocols.slice(0, 8).map((x) => ({ key: x.id, label: x.name, hint: x.surgery }))}
                  search={(q) => searchProtocols(protocols, q).map((x) => ({ key: x.id, label: x.name, hint: x.surgery }))}
                  onPick={(o) => choose(e.id, { protocolId: o.key })}
                />
                {e.choices.protocolId && (
                  <button type="button" className="text-xs font-medium text-primary-strong underline-offset-2 hover:underline" onClick={() => choose(e.id, { protocolId: null })}>
                    Revenir au protocole de l&apos;intervention
                  </button>
                )}
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

              {/* Plan B: what to start from if the patient refuses or the technique fails. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground-subtle">Plan B (refus / échec) :</span>
                {r.fallbackModes.map((m) => (
                  <Chip key={m} on={r.fallback === m} onClick={() => choose(e.id, { fallback: m })}>
                    {MODE_LABEL[m]}
                  </Chip>
                ))}
                <Chip on={!r.fallback} onClick={() => choose(e.id, { fallback: null })}>
                  Aucun
                </Chip>
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

              <Disclosure
                summary={
                  <span className="flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> {e.choices.plan ? "Protocole adapté pour ce patient" : "Adapter le protocole pour ce patient"}
                  </span>
                }
                className="rounded-[var(--radius-md)] border border-border"
                summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground"
              >
                <div className="space-y-2 px-3 pb-3">
                  {e.choices.plan ? (
                    <>
                      <p className="text-xs text-foreground-muted">Touchez un produit pour changer sa dose, sa voie ou son moment ; la feuille se met à jour. Le protocole de la bibliothèque, lui, ne change pas.</p>
                      <PlanEditor
                        compact
                        formKey={e.id}
                        value={e.choices.plan}
                        onChange={(plan) => choose(e.id, { plan })}
                        body={{ sex: r.consultation.patient.sex, weightKg: r.consultation.patient.weightKg, heightCm: r.consultation.patient.heightCm }}
                        patient={{ age: r.consultation.patient.age, weightKg: r.consultation.patient.weightKg }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => confirm("Revenir au protocole de la bibliothèque (vos modifications pour ce patient sont perdues) ?") && choose(e.id, { plan: undefined })}>
                        <RotateCcw className="h-3.5 w-3.5" /> Revenir au protocole
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-foreground-muted">
                        Partez du plan ci-contre ({r.protocol ? `protocole « ${r.protocol.name} »` : "aucun protocole"}) et ajustez-le pour ce patient : produits, doses (calculées à son poids), technique, gaz, post-op.
                      </p>
                      <Button size="sm" variant="secondary" onClick={() => choose(e.id, { plan: structuredClone(r.plan) })}>
                        <Pencil className="h-3.5 w-3.5" /> Adapter pour ce patient
                      </Button>
                    </>
                  )}
                </div>
              </Disclosure>

              <Complement onAdd={(text) => setEntry(e.id, { raw: `${e.raw}\n---\n${text}` })} />

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
            <div className="min-w-0 space-y-1.5 self-start">
              {/* Touch a line to take it off the printed sheet; touch it again to bring it back. */}
              <div
                role="presentation"
                className="case-preview overflow-x-auto rounded-[var(--radius-md)] border border-border bg-white p-3 text-[#15191c] shadow-sm"
                onClick={(ev) => toggleLine(e, ev.target as HTMLElement)}
                onKeyDown={(ev) => {
                  if (ev.key !== "Enter" && ev.key !== " ") return;
                  ev.preventDefault();
                  toggleLine(e, ev.target as HTMLElement);
                }}
                dangerouslySetInnerHTML={{ __html: caseSheetHtml(r.sheet, i + 1, { hidden: new Set(e.hidden ?? []), editable: true }) }}
              />
              <p className="flex flex-wrap items-center gap-2 text-xs text-foreground-subtle">
                Touchez une ligne ou un produit pour le retirer de la feuille imprimée.
                {(e.hidden?.length ?? 0) > 0 && (
                  <button type="button" onClick={() => setEntry(e.id, { hidden: [] })} className="font-medium text-primary-strong underline-offset-2 hover:underline">
                    Tout remettre ({e.hidden!.length})
                  </button>
                )}
              </p>
            </div>
          </section>
        );
      })}

      {sheet.kinetics && sheet.entries.length > 0 && (
        <div className="space-y-1.5">
          <div
            role="presentation"
            className="case-preview overflow-x-auto rounded-[var(--radius-md)] border border-border bg-white p-3 text-[#15191c] shadow-sm"
            onClick={(ev) => toggleKinetics(ev.target as HTMLElement)}
            onKeyDown={(ev) => {
              if (ev.key !== "Enter" && ev.key !== " ") return;
              ev.preventDefault();
              toggleKinetics(ev.target as HTMLElement);
            }}
            dangerouslySetInnerHTML={{ __html: kineticsHtml(dayKinetics(sheet.entries.map((e) => results.get(e.id)!.sheet)), { hidden: new Set(sheet.hiddenKinetics ?? []), editable: true }) }}
          />
          <p className="text-xs text-foreground-subtle">Imprimée une seule fois, en fin de feuille ; touchez un produit pour le retirer.</p>
        </div>
      )}
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

/** Protocols whose name, intervention or hospital holds every word typed. */
function searchProtocols(protocols: Protocol[], q: string): Protocol[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return protocols.filter((x) => words.every((w) => fold(`${x.name} ${x.surgery} ${x.hospital}`).includes(w))).slice(0, 12);
}

function Question({ q, onAnswer, onLine }: { q: CaseQuestion; onAnswer: (c: CaseChoices) => void; onLine: (line: string, kind: LineKind) => void }) {
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
                if (q.id === "line") onLine(q.line!, o.value as LineKind);
                else if (q.id === "surgery") onAnswer({ surgeryId: o.value || null });
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

const inputClass =
  "h-9 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
const areaClass =
  "block w-full min-w-0 resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

/**
 * A patient with no consultation as such — only the questionnaire filled in
 * on paper: the few values by hand, the rest dictated or pasted from
 * another consultation (emergencies, surgery, a letter). Written as a
 * consultation the reader (parse.ts) knows.
 */
function QuickPatient({ catalogs, onAdd }: { catalogs: ReturnType<typeof useCatalogs>["catalogs"]; onAdd: (raw: string) => void }) {
  const [f, setF] = useState<{ initials: string; sex?: "F" | "M"; age?: number; weight?: number; height?: number; surgery: string; mode?: SheetMode; text: string }>({ initials: "", surgery: "", text: "" });
  const [formKey, setFormKey] = useState(0);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const ready = f.initials.trim() && (f.surgery.trim() || f.text.trim());

  function add() {
    const body = [f.age !== undefined ? `Age ${f.age} ans` : "", f.weight !== undefined ? `Poids ${f.weight} kg` : "", f.height !== undefined ? `Taille ${f.height} cm` : ""].filter(Boolean).join(" ");
    const raw = [
      `Initiales : ${f.initials.trim()}`,
      f.sex ? `Sexe : ${f.sex}` : "",
      f.surgery.trim() ? `Intervention : ${f.surgery.trim()}` : "",
      f.mode ? `Type d'anesthésie : ${MODE_LABEL[f.mode]}` : "",
      body,
      "---",
      f.text.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    onAdd(raw);
    setF({ initials: "", surgery: "", text: "" });
    setFormKey((k) => k + 1);
  }

  return (
    <Disclosure
      summary={
        <span className="flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" /> Patient sans consultation (questionnaire papier)
        </span>
      }
      className="rounded-[var(--radius-md)] border border-border"
      summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground"
    >
      <div key={formKey} className="space-y-2.5 px-3 pb-3">
        <p className="text-xs text-foreground-muted">
          Recopiez les quelques valeurs, puis dictez ou collez le reste : antécédents, traitements, allergies — ou une autre consultation (urgences, chirurgie, lettre). Préop y retrouve ce qu&apos;il faut.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="block min-w-0">
            <span className="block text-[11px] font-medium text-foreground-subtle">Initiales</span>
            <input value={f.initials} onChange={(e) => set({ initials: e.target.value.toUpperCase().slice(0, 4) })} placeholder="AB" className={cn(inputClass, "mt-0.5")} />
          </label>
          <MiniNumber label="Âge" value={f.age} onChange={(age) => set({ age })} unit="ans" />
          <MiniNumber label="Poids" value={f.weight} onChange={(weight) => set({ weight })} unit="kg" />
          <MiniNumber label="Taille" value={f.height} onChange={(height) => set({ height })} unit="cm" />
          <div className="min-w-0">
            <span className="block text-[11px] font-medium text-foreground-subtle">Sexe</span>
            <div className="mt-0.5 flex gap-1">
              {(["F", "M"] as const).map((s) => (
                <Chip key={s} on={f.sex === s} onClick={() => set({ sex: s })}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <FieldLabel>Intervention</FieldLabel>
          <Combobox
            ariaLabel="Intervention"
            placeholder={f.surgery || "Chercher dans le catalogue ou taper le libellé du chirurgien…"}
            search={(q) => searchSurgeries(catalogs.surgeries, q, { age: f.age, sex: f.sex }).map((x) => ({ key: x.id, label: x.name }))}
            onPick={(o) => set({ surgery: o.label })}
            onFree={(q) => set({ surgery: q })}
            freeLabel={(q) => `Garder « ${q} »`}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(MODE_LABEL) as SheetMode[]).map((m) => (
            <Chip key={m} on={f.mode === m} onClick={() => set({ mode: f.mode === m ? undefined : m })}>
              {MODE_LABEL[m]}
            </Chip>
          ))}
        </div>
        <label className="block space-y-1">
          <FieldLabel>Antécédents, traitements, allergies</FieldLabel>
          <textarea rows={4} value={f.text} onChange={(e) => set({ text: e.target.value })} placeholder="« Diabète type 2, HTA ; metformine 1 g 2x/j, lisinopril 10 mg ; allergie latex » — ou une consultation collée." className={areaClass} />
        </label>
        <Button size="sm" onClick={add} disabled={!ready}>
          <UserPlus className="h-3.5 w-3.5" /> Ajouter à la feuille
        </Button>
      </div>
    </Disclosure>
  );
}

/** Another consultation of the same patient (emergencies, surgery, cardiology…), read with the first. */
function Complement({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <Disclosure
      summary={
        <span className="flex items-center gap-1.5">
          <FilePlus2 className="h-3.5 w-3.5" /> Compléter avec une autre consultation
        </span>
      }
      className="rounded-[var(--radius-md)] border border-border"
      summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground"
    >
      <div className="space-y-2 px-3 pb-3">
        <p className="text-xs text-foreground-muted">Urgences, chirurgie, lettre de sortie… : ses antécédents, traitements et allergies s&apos;ajoutent à ceux du patient.</p>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Collez la consultation ici…" className={areaClass} />
        <Button
          size="sm"
          variant="secondary"
          disabled={!text.trim()}
          onClick={() => {
            onAdd(text.trim());
            setText("");
          }}
        >
          <FilePlus2 className="h-3.5 w-3.5" /> Lire et ajouter
        </Button>
      </div>
    </Disclosure>
  );
}
