"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Bold, Check, Eye, EyeOff, FileText, FolderInput, Pencil, Plus, Printer, RotateCcw, SlidersHorizontal, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Combobox, Disclosure, FieldLabel, MiniNumber, Panel } from "@/components/preop/ui";
import { usePreopSession } from "@/components/preop/session";
import { PlanEditor } from "@/components/preop/plan-editor";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { SecureStore } from "@/lib/preop/secure-store";
import { parseConsultation, splitConsultations } from "@/lib/preop/case-sheet/parse";
import { buildCaseSheet, type CaseChoices, type CaseQuestion, type CaseResult, type ItemSection } from "@/lib/preop/case-sheet/build";
import { caseSheetCss, caseSheetDocument, caseSheetHtml, dayKinetics, DEFAULT_SETTINGS, kineticsHtml, type SheetSettings } from "@/lib/preop/case-sheet/html";
import { addedSection, splitDictation, type LineKind } from "@/lib/preop/case-sheet/lines";
import type { SheetWorkup } from "@/lib/preop/case-sheet/workup";
import { fold, searchItems, type Catalogs } from "@/lib/preop/catalog";
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
  /** What the sheet shows and how much it says (kept when the sheet is cleared). */
  settings?: SheetSettings;
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

/** A line of the preview touched: its menu, under it. */
interface MenuAt {
  entryId: string;
  key: string;
  top: number;
  left: number;
}

const MENU_WIDTH = 288;
const MOVABLE: { code: LineKind & ItemSection; label: string }[] = [
  { code: "atcd", label: "ATCD" },
  { code: "ttt", label: "TTT" },
  { code: "allergy", label: "Allergie" },
  { code: "habit", label: "Habitus" },
  { code: "note", label: "Note" },
];

export function CaseSheetView({ rules, protocols, onKeep }: { rules: Rule[]; protocols: Protocol[]; onKeep: (d: Dossier) => Promise<void> }) {
  const { userId } = usePreopSession();
  const { catalogs, service } = useCatalogs();
  const { toast } = useToast();
  const store = useMemo(() => new SecureStore(userId), [userId]);
  const [sheet, setSheet] = useState<DaySheet | null>(null);
  const [paste, setPaste] = useState("");
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readRef = useRef<(text: string) => void>(() => {});

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

  // Ctrl+V anywhere on the page (outside a field): the consultations pasted become patients.
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable]")) return;
      const text = ev.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      ev.preventDefault();
      readRef.current(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  function update(next: DaySheet) {
    setSheet(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      store.saveRecord(RECORD, next).catch(() => toast("Enregistrement sur l'appareil impossible.", { variant: "error" }));
    }, SAVE_DELAY_MS);
  }

  const ctx = useMemo(() => ({ catalogs, rules, protocols, service }), [catalogs, rules, protocols, service]);
  const entries = sheet?.entries;
  const results = useMemo(() => new Map((entries ?? []).map((e) => [e.id, buildCaseSheet(parseConsultation(e.raw), ctx, e.choices)])), [entries, ctx]);

  const settings = { ...DEFAULT_SETTINGS, ...sheet?.settings };

  const setEntry = (id: string, patch: Partial<DayEntry>) => update({ ...sheet!, entries: sheet!.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const choose = (id: string, choices: CaseChoices) => {
    const current = sheet!.entries.find((e) => e.id === id)!.choices;
    // Another intervention or technique: the adapted plan was for the previous one.
    if (current.plan && ("surgeryId" in choices || "mode" in choices || "protocolId" in choices)) {
      if (!confirm("Le protocole adapté pour ce patient sera remplacé par celui de ce choix. Continuer ?")) return;
      choices = { ...choices, plan: undefined, tiva: undefined };
    }
    setEntry(id, { choices: { ...current, ...choices } });
  };

  /** The menu of the line touched in a patient's preview, under it. */
  function openMenu(e: DayEntry, ev: React.SyntheticEvent<HTMLElement>) {
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-k]");
    const box = ev.currentTarget.parentElement?.getBoundingClientRect();
    if (!el || !box) return;
    const at = el.getBoundingClientRect();
    const key = el.dataset.k!;
    if (menu?.entryId === e.id && menu.key === key) return setMenu(null);
    setMenu({ entryId: e.id, key, top: at.bottom - box.top + 4, left: Math.max(0, Math.min(at.left - box.left, box.width - MENU_WIDTH)) });
  }

  function toggleKinetics(target: HTMLElement) {
    const key = target.closest("[data-k]")?.getAttribute("data-k");
    if (!key) return;
    const hidden = new Set(sheet!.hiddenKinetics ?? []);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    update({ ...sheet!, hiddenKinetics: [...hidden] });
  }

  /** New patients on the sheet — a consultation already there (pasted twice) is not added again. */
  function addEntries(raws: string[]): number {
    const known = new Set(sheet!.entries.map((e) => e.raw.trim()));
    const fresh = raws.filter((raw) => !known.has(raw.trim()));
    if (fresh.length) update({ ...sheet!, entries: [...sheet!.entries, ...fresh.map((raw) => ({ id: crypto.randomUUID(), raw, choices: {} }))] });
    return fresh.length;
  }

  function read(text: string) {
    const pieces = splitConsultations(text);
    if (!pieces.length) return;
    const n = addEntries(pieces);
    setPaste("");
    if (n) toast(`${n} consultation(s) lue(s)${n < pieces.length ? ` — ${pieces.length - n} déjà sur la feuille` : ""}.`, { variant: "success" });
    else toast("Déjà sur la feuille.");
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
    const sheets = sheet!.entries.map((e) => ({ sheet: results.get(e.id)!.sheet, hidden: new Set(e.hidden ?? []), edits: e.choices.edits }));
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) {
      toast("La fenêtre d'impression a été bloquée par le navigateur.", { variant: "error" });
      return;
    }
    w.document.write(caseSheetDocument(sheets, sheet!.title, { settings, hiddenKinetics: new Set(sheet!.hiddenKinetics ?? []) }));
    // The page lays the cases out on its A5 pages, then opens the printer's dialog itself.
    w.document.close();
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

  /** A test of the work-up ticked done, or not needed. */
  const markWorkup = (e: DayEntry, code: string, mark: "done" | "skip") => choose(e.id, { workup: { ...(e.choices.workup ?? {}), [code]: mark } });

  /** What can be done with a line of the sheet: correct it, bold, move, take off. */
  function lineMenu(e: DayEntry, r: CaseResult, key: string): MenuProps {
    const c = e.choices;
    const item = r.sheet.items.find((i) => i.key === key);
    // A product of the plan: « Analgésie:Kétorolac 30 mg ».
    const product = !item && key.includes(":") && !/^(row|imp|bilan):/.test(key);
    const work = r.sheet.workup.find((w) => `bilan:${w.code}` === key);
    const original = product ? key.slice(key.indexOf(":") + 1) : item?.text;
    const editKey = product ? key : item?.addedId ? undefined : (item?.source ?? (item?.section === "alert" ? item.key : undefined));
    const off = (e.hidden ?? []).includes(key);
    const close = () => setMenu(null);
    const changed = !!editKey && (c.edits?.[editKey] !== undefined || (item?.source !== undefined && c.lines?.[item.source] !== undefined) || c.strong?.[key] !== undefined);
    const without = <T,>(rec: Record<string, T> | undefined, k?: string) => Object.fromEntries(Object.entries(rec ?? {}).filter(([x]) => x !== k));
    return {
      title: work ? `${work.label}${work.reason ? ` — ${work.reason}` : ""}` : product ? (c.edits?.[key] ?? original!) : (item?.text ?? (key === "tech" ? "Technique" : key === "planb" ? "Plan B" : key.startsWith("row:") ? `Ligne « ${key.slice(4)} »` : "Ce que ça implique")),
      text: product ? (c.edits?.[key] ?? original) : item && (item.addedId || editKey) ? item.text : undefined,
      onText: (t) => {
        const v = t.trim();
        if (!v) return;
        if (item?.addedId) choose(e.id, { added: (c.added ?? []).map((a) => (a.id === item.addedId ? { ...a, text: v } : a)) });
        else if (editKey) choose(e.id, { edits: v === original && product ? without(c.edits, editKey) : { ...(c.edits ?? {}), [editKey]: v } });
        close();
      },
      strong: item && item.section !== "alert" ? !!item.strong : undefined,
      onBold: () => item && choose(e.id, { strong: { ...(c.strong ?? {}), [key]: !item.strong } }),
      section: item && (item.addedId || item.source) && MOVABLE.some((m) => m.code === item.section) ? (item.section as LineKind) : undefined,
      onMove: (kind) => {
        if (!item) return;
        if (item.addedId) choose(e.id, { added: (c.added ?? []).map((a) => (a.id === item.addedId ? { ...a, section: kind as ItemSection } : a)) });
        else if (item.source) choose(e.id, { lines: { ...(c.lines ?? {}), [item.source]: kind } });
        close();
      },
      off,
      onToggle: () => {
        setEntry(e.id, { hidden: off ? (e.hidden ?? []).filter((k) => k !== key) : [...(e.hidden ?? []), key] });
        close();
      },
      onDone:
        work && work.status !== "ok"
          ? () => {
              markWorkup(e, work.code, "done");
              close();
            }
          : undefined,
      onSkip: work
        ? () => {
            markWorkup(e, work.code, "skip");
            close();
          }
        : undefined,
      onDelete: item?.addedId
        ? () => {
            choose(e.id, { added: (c.added ?? []).filter((a) => a.id !== item.addedId) });
            close();
          }
        : undefined,
      onReset: work?.code && c.workup?.[work.code]
        ? () => {
            choose(e.id, { workup: without(c.workup, work.code) });
            close();
          }
        : changed && editKey
          ? () => {
              choose(e.id, { edits: without(c.edits, editKey), lines: without(c.lines, item?.source), strong: without(c.strong, key) });
              close();
            }
          : undefined,
      onClose: close,
    };
  }

  useEffect(() => {
    readRef.current = read;
  });

  if (!sheet) return <p className="text-sm text-foreground-muted">Ouverture de la feuille…</p>;

  return (
    <div className="space-y-4">
      <style>{caseSheetCss(SCOPE, settings)}</style>
      <Panel
        title="Feuille de jour"
        actions={
          sheet.entries.length > 0 && (
            <>
              <Button size="sm" onClick={print}>
                <Printer className="h-3.5 w-3.5" /> Imprimer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Effacer toute la feuille de cet appareil ? (Les réglages sont gardés.)")) update({ title: tomorrowTitle(), entries: [], settings: sheet.settings });
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
          <input value={sheet.title} onChange={(e) => update({ ...sheet, title: e.target.value })} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Consultations à ajouter</FieldLabel>
          <textarea
            rows={4}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onPaste={(e) => {
              // Pasted in the empty field: read at once, nothing to click.
              const text = e.clipboardData.getData("text");
              if (paste.trim() || !text.trim()) return;
              e.preventDefault();
              read(text);
            }}
            placeholder="Collez ici une ou plusieurs consultations : elles sont lues aussitôt. (Ctrl+V ailleurs sur la page marche aussi.)"
            className={cn(areaClass, "font-mono text-xs")}
          />
        </label>
        <Button size="sm" onClick={() => read(paste)} disabled={!paste.trim()}>
          <FileText className="h-3.5 w-3.5" /> Lire et ajouter
        </Button>
        <QuickPatient
          catalogs={catalogs}
          onAdd={(raw) => {
            addEntries([raw]);
            toast("Patient ajouté à la feuille.", { variant: "success" });
          }}
        />
        <SettingsPanel value={settings} onChange={(s) => update({ ...sheet, settings: s })} />
      </Panel>

      {sheet.entries.map((e, i) => {
        const r = results.get(e.id)!;
        const open = menu?.entryId === e.id ? menu : null;
        return (
          <section key={e.id} className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
                  <Button size="icon" variant="ghost" aria-label="Retirer le patient de la feuille" onClick={() => confirm("Retirer ce patient de la feuille ?") && update({ ...sheet, entries: sheet.entries.filter((x) => x.id !== e.id) })}>
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

              <WorkupCheck
                workup={r.sheet.workup.filter((w) => w.status !== "ok" && (settings.workup === "all" || (settings.workup === "required" && w.strength === "recommended")))}
                skipped={Object.entries(e.choices.workup ?? {}).filter(([, m]) => m === "skip").map(([code]) => code)}
                onMark={(code, mark) => markWorkup(e, code, mark)}
                onRestore={() => choose(e.id, { workup: Object.fromEntries(Object.entries(e.choices.workup ?? {}).filter(([, m]) => m !== "skip")) })}
              />

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

              <Disclosure summary="Plus d'options" className="rounded-[var(--radius-md)] border border-border" summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
                <div className="space-y-3 px-3 pb-3">
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

                  <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-2.5">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Pencil className="h-3.5 w-3.5" /> {e.choices.plan ? "Protocole adapté pour ce patient" : "Adapter le protocole pour ce patient"}
                    </p>
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
                          Ajouter ou retirer des produits, changer la technique, les gaz, le post-op ({r.protocol ? `protocole « ${r.protocol.name} »` : "aucun protocole"}). Pour une simple dose, touchez-la sur la feuille.
                        </p>
                        <Button size="sm" variant="secondary" onClick={() => choose(e.id, { plan: structuredClone(r.plan) })}>
                          <Pencil className="h-3.5 w-3.5" /> Adapter pour ce patient
                        </Button>
                      </>
                    )}
                  </div>

                  <label className="block space-y-1">
                    <FieldLabel>Texte libre sous le patient (cardio, transfert USI…)</FieldLabel>
                    <textarea rows={3} defaultValue={e.choices.notes ?? ""} onChange={(ev) => choose(e.id, { notes: ev.target.value })} placeholder="Imprimé tel quel sous le patient." className={areaClass} />
                  </label>

                  <Button size="sm" variant="secondary" disabled={!!e.dossierId} onClick={() => void keep(e, r)}>
                    <FolderInput className="h-3.5 w-3.5" /> {e.dossierId ? "Gardé comme dossier" : "Garder comme dossier"}
                  </Button>
                  <Disclosure summary="Texte collé" summaryClassName="text-xs text-foreground-subtle">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-surface-muted p-2 text-[11px] text-foreground-muted">{e.raw}</pre>
                  </Disclosure>
                </div>
              </Disclosure>
            </div>

            {/* The sheet as printed: a sheet of paper, the same in both themes. Touch a line: its menu. */}
            <div className="relative min-w-0 space-y-2 self-start">
              <div
                role="presentation"
                className="case-preview overflow-x-auto rounded-[var(--radius-md)] border border-border bg-white p-3 text-[#15191c] shadow-sm"
                onClick={(ev) => openMenu(e, ev)}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape") return setMenu(null);
                  if (ev.key !== "Enter" && ev.key !== " ") return;
                  ev.preventDefault();
                  openMenu(e, ev);
                }}
                dangerouslySetInnerHTML={{ __html: caseSheetHtml(r.sheet, i + 1, { hidden: new Set(e.hidden ?? []), editable: true, settings, edits: e.choices.edits }) }}
              />
              {open && <LineMenu key={open.key} at={open} {...lineMenu(e, r, open.key)} />}
              <AddLine
                catalogs={catalogs}
                onAdd={(lines) => {
                  choose(e.id, { added: [...(e.choices.added ?? []), ...lines.map((l) => ({ id: crypto.randomUUID().slice(0, 8), ...l }))] });
                  toast(lines.map((l) => `${l.text} → ${SECTION_NAME[l.section]}`).join(" · "), { variant: "success" });
                }}
                onConsultation={(text) => {
                  setEntry(e.id, { raw: `${e.raw}\n---\n${text}` });
                  toast(`Ajouté au dossier de ${r.sheet.initials} : relu (antécédents, traitements, allergies, bilan).`, { variant: "success" });
                }}
              />
              <p className="flex flex-wrap items-center gap-2 text-xs text-foreground-subtle">
                Touchez une ligne pour la corriger, la mettre en gras, la déplacer ou la retirer.
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

      {settings.pharmaco !== "off" && sheet.entries.length > 0 && (
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
            dangerouslySetInnerHTML={{ __html: kineticsHtml(dayKinetics(sheet.entries.map((e) => results.get(e.id)!.sheet)), { hidden: new Set(sheet.hiddenKinetics ?? []), editable: true, settings }) }}
          />
          <p className="text-xs text-foreground-subtle">Imprimée une seule fois, en fin de feuille ; touchez un produit pour le retirer.</p>
        </div>
      )}
    </div>
  );
}

interface MenuProps {
  title: string;
  /** The text that can be corrected; undefined: written by the sheet itself. */
  text?: string;
  onText: (t: string) => void;
  strong?: boolean;
  onBold: () => void;
  /** Where the line is now, when it can be moved. */
  section?: LineKind;
  onMove: (k: LineKind) => void;
  off: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  onReset?: () => void;
  /** A test of the work-up: ticked done, or not needed. */
  onDone?: () => void;
  onSkip?: () => void;
  onClose: () => void;
}

function LineMenu({ at, title, text, onText, strong, onBold, section, onMove, off, onToggle, onDelete, onReset, onDone, onSkip, onClose }: MenuProps & { at: MenuAt }) {
  const [draft, setDraft] = useState(text ?? "");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest?.(".case-preview")) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const small = "inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 text-xs font-medium text-foreground hover:bg-surface-muted";
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Ligne : ${title}`}
      onKeyDown={(ev) => ev.key === "Escape" && onClose()}
      style={{ top: at.top, left: at.left, width: MENU_WIDTH }}
      className="absolute z-30 max-w-full space-y-2 rounded-[var(--radius-md)] border border-border bg-surface p-2.5 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold text-foreground line-clamp-2">{title}</p>
        <button type="button" aria-label="Fermer" onClick={onClose} className="-m-1 rounded p-1 text-foreground-subtle hover:bg-surface-muted">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {text !== undefined && (
        <form
          className="flex gap-1.5"
          onSubmit={(ev) => {
            ev.preventDefault();
            onText(draft);
          }}
        >
          <input autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} aria-label="Texte de la ligne" className={cn(inputClass, "h-8 text-xs")} />
          <Button size="sm" type="submit" disabled={!draft.trim() || draft.trim() === text}>
            OK
          </Button>
        </form>
      )}
      <div className="flex flex-wrap gap-1.5">
        {strong !== undefined && (
          <button type="button" aria-pressed={strong} onClick={onBold} className={cn(small, strong && "border-primary bg-primary-tint text-primary-strong")}>
            <Bold className="h-3.5 w-3.5" /> Gras
          </button>
        )}
        <button type="button" onClick={onToggle} className={small}>
          {off ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {off ? "Remettre" : "Retirer"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={small}>
            <Check className="h-3.5 w-3.5" /> Fait / disponible
          </button>
        )}
        {onSkip && (
          <button type="button" onClick={onSkip} className={small}>
            <X className="h-3.5 w-3.5" /> Pas nécessaire
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} className={cn(small, "text-danger")}>
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        )}
        {onReset && (
          <button type="button" onClick={onReset} className={small}>
            <RotateCcw className="h-3.5 w-3.5" /> Comme à l&apos;import
          </button>
        )}
      </div>
      {section && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-medium text-foreground-subtle">Déplacer :</span>
          {MOVABLE.filter((m) => m.code !== section).map((m) => (
            <button key={m.code} type="button" onClick={() => onMove(m.code)} className="min-h-7 rounded-full border border-border px-2 text-[11px] font-medium text-foreground-muted hover:bg-surface-muted">
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The tests the patient still needs (recommendations for the procedure, the
 * technique, the patient), each ticked done or set aside in one touch; the
 * results themselves are pasted in « Ajouter ».
 */
function WorkupCheck({ workup, skipped, onMark, onRestore }: { workup: SheetWorkup[]; skipped: string[]; onMark: (code: string, mark: "done" | "skip") => void; onRestore: () => void }) {
  if (!workup.length && !skipped.length) return null;
  return (
    <div className="space-y-1.5 rounded-[var(--radius-md)] border border-danger/30 bg-danger-tint/40 p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Bilan à compléter</p>
      {workup.length > 0 ? (
        <ul className="space-y-1">
          {workup.map((w) => (
            <li key={w.code} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 flex-1 text-sm text-foreground">
                <b>{w.label}</b>
                {w.strength === "consider" && " ?"} {w.status === "asked" ? <i className="text-foreground-muted">demandé</i> : <span className="text-xs text-foreground-muted">— {w.reason}</span>}
              </span>
              <span className="flex gap-1">
                <button type="button" onClick={() => onMark(w.code, "done")} className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-surface px-2 text-[11px] font-medium text-foreground hover:bg-surface-muted">
                  <Check className="h-3 w-3" /> Fait
                </button>
                <button type="button" onClick={() => onMark(w.code, "skip")} className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-surface px-2 text-[11px] font-medium text-foreground-muted hover:bg-surface-muted">
                  <X className="h-3 w-3" /> Pas nécessaire
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-foreground-muted">Tout est là.</p>
      )}
      <p className="text-xs text-foreground-muted">
        Collez la biologie, l&apos;ECG ou le groupe dans « Ajouter » (sous la feuille) : ils sont reconnus.
        {skipped.length > 0 && (
          <>
            {" "}
            <button type="button" className="font-medium text-primary-strong underline-offset-2 hover:underline" onClick={onRestore}>
              Remettre les {skipped.length} écarté(s)
            </button>
          </>
        )}
      </p>
    </div>
  );
}

const SECTION_NAME: Record<ItemSection | "bio", string> = { atcd: "ATCD", ttt: "TTT", allergy: "Allergie", habit: "Habitus", chir: "Chir.", alert: "Alerte", note: "Note", bio: "Bilan" };

/** A pasted text this long is another consultation of the patient, not a line. */
const isConsultation = (t: string) => t.split("\n").filter((l) => l.trim()).length >= 4 || t.length > 240;

/**
 * One field to add to the patient: what is typed goes where it belongs
 * (« eliquis » → TTT, « allergie latex » → allergies, « ! sang à prévoir »
 * → alert, the rest → notes), with the catalogue's suggestions; several
 * lines at once are each sorted; a whole consultation pasted (emergencies,
 * surgery, a letter) is read with the patient's.
 */
function AddLine({ catalogs, onAdd, onConsultation }: { catalogs: Catalogs; onAdd: (lines: { section: ItemSection; text: string }[]) => void; onConsultation: (text: string) => void }) {
  const search = (q: string) => {
    // A section said first (« ! », « note : »): the text as typed, no suggestion.
    if (/^\s*(!|[a-zé.]+\s*:)/i.test(q)) return [];
    return [
      ...searchItems(catalogs.conditions, q, (c) => [c.label, ...(c.keywords ?? [])], 3).map((c) => ({ key: `atcd:${c.id}`, label: c.label, hint: "ATCD" })),
      ...searchItems(catalogs.medications, q, (m) => [m.name, ...(m.brands ?? [])], 3).map((m) => ({ key: `ttt:${m.id}`, label: m.name, hint: "TTT" })),
      ...searchItems(catalogs.allergens, q, (a) => [a.label, ...a.keywords], 2).map((a) => ({ key: `allergy:${a.id}`, label: a.label, hint: "Allergie" })),
    ];
  };
  const free = (text: string) => {
    const all = splitDictation(text).map((l) => addedSection(l, catalogs));
    // Results (« Hb 12,8 plaq 210 », « ECG : RS », « groupe A+ ») are read with the consultation: the work-up.
    const bio = all.filter((l) => l.section === "bio");
    if (bio.length) onConsultation(bio.map((l) => l.text).join("\n"));
    const lines = all.filter((l): l is { section: ItemSection; text: string } => l.section !== "bio");
    if (lines.length) onAdd(lines);
  };
  return (
    <div className="flex items-start gap-1.5">
      <Plus className="mt-3 h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden />
      <div className="min-w-0 flex-1">
        <Combobox
          ariaLabel="Ajouter au patient"
          placeholder="Ajouter : ATCD, TTT, allergie, Hb, ECG, groupe, « ! alerte »… ou coller"
          search={search}
          onPick={(o) => onAdd([{ section: o.key.slice(0, o.key.indexOf(":")) as ItemSection, text: o.label }])}
          onFree={free}
          freeLabel={(q) => {
            const lines = splitDictation(q).map((l) => addedSection(l, catalogs));
            return lines.length === 1 ? `Ajouter « ${lines[0].text} » → ${SECTION_NAME[lines[0].section]}` : `Ajouter ${lines.length} lignes (classées)`;
          }}
          onPaste={(ev) => {
            const text = ev.clipboardData.getData("text");
            if (isConsultation(text)) {
              ev.preventDefault();
              onConsultation(text.trim());
            } else if (/[\n;]/.test(text.trim())) {
              ev.preventDefault();
              free(text);
            }
          }}
        />
      </div>
    </div>
  );
}

type Choice<T> = { value: T; label: string };

/** What the printed sheet shows and how much it says — once for all patients. */
function SettingsPanel({ value, onChange }: { value: SheetSettings; onChange: (s: SheetSettings) => void }) {
  const set = (patch: Partial<SheetSettings>) => onChange({ ...value, ...patch });
  const group = <K extends keyof SheetSettings>(label: string, key: K, choices: Choice<SheetSettings[K]>[]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-full text-xs font-medium text-foreground-subtle sm:w-40">{label}</span>
      {choices.map((c) => (
        <Chip key={String(c.value)} on={value[key] === c.value} onClick={() => set({ [key]: c.value } as Partial<SheetSettings>)}>
          {c.label}
        </Chip>
      ))}
    </div>
  );
  const sections: { key: "habits" | "surgical" | "postop" | "planB" | "notes"; label: string }[] = [
    { key: "habits", label: "Habitus" },
    { key: "surgical", label: "ATCD chirurgicaux" },
    { key: "postop", label: "Post-op" },
    { key: "planB", label: "Plan B" },
    { key: "notes", label: "Notes" },
  ];
  return (
    <Disclosure
      summary={
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Réglages de la feuille
        </span>
      }
      className="rounded-[var(--radius-md)] border border-border"
      summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground"
    >
      <div className="space-y-2.5 px-3 pb-3">
        <p className="text-xs text-foreground-muted">Pour tous les patients, à l&apos;écran comme à l&apos;impression ; gardés sur cet appareil.</p>
        {group("Pathologies en gras", "detail", [
          { value: "none", label: "Sans détail" },
          { value: "short", label: "À quoi faire attention (court)" },
          { value: "full", label: "Détaillé" },
        ])}
        {group("Traitements", "treatments", [
          { value: "all", label: "Tous, avec la conduite" },
          { value: "action", label: "Seulement à arrêter / adapter" },
        ])}
        {group("Alertes", "alerts", [
          { value: "main", label: "Principales" },
          { value: "all", label: "Toutes" },
          { value: "none", label: "Aucune" },
        ])}
        {group("Bilan", "workup", [
          { value: "required", label: "Recommandé" },
          { value: "all", label: "+ à envisager" },
          { value: "off", label: "Non" },
        ])}
        {group("Pharmaco (fin de feuille)", "pharmaco", [
          { value: "off", label: "Non" },
          { value: "short", label: "Onset, ½-vie contextuelle" },
          { value: "full", label: "+ durée, réveil" },
        ])}
        {group("Papier", "paper", [
          { value: "a4x2", label: "2 A5 sur une A4 (paysage)" },
          { value: "a5", label: "A5" },
        ])}
        {group("Taille du texte", "size", [
          { value: "compact", label: "Compacte" },
          { value: "normal", label: "Normale" },
          { value: "large", label: "Grande" },
        ])}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-full text-xs font-medium text-foreground-subtle sm:w-40">Rubriques imprimées</span>
          {sections.map((x) => (
            <Chip key={x.key} on={value[x.key]} onClick={() => set({ [x.key]: !value[x.key] })}>
              {x.label}
            </Chip>
          ))}
        </div>
        <button type="button" className="text-xs font-medium text-primary-strong underline-offset-2 hover:underline" onClick={() => onChange(DEFAULT_SETTINGS)}>
          Réglages par défaut
        </button>
      </div>
    </Disclosure>
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
        <span className="inline-flex items-center gap-1.5">
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
