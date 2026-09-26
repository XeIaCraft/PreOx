"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, Clock, Plus, Syringe, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { FieldLabel, Panel, TextArea } from "@/components/preop/ui";
import { patchRow } from "@/lib/carnet/mutations";
import { DRUG_ROUTES, defaultRoute, drugSuggestions, routeShort } from "@/lib/carnet/pharmaco";
import { CORMACK_GRADES } from "@/lib/preop/scores";
import { COMPLICATION_TYPES, EVENT_TYPES, FLUID_CATEGORIES, type Complication, type Dossier, type EventType, type FluidCategory, type Intraop } from "@/lib/preop/dossier";
import { durationTimers, fluidBalance, formatMinutes, redoseTimers } from "@/lib/preop/intraop";
import { hhmm } from "@/lib/preop/isbar";
import { DRUG_PHASES, computeDose, formatDose } from "@/lib/preop/protocols";
import { cn } from "@/lib/utils";
import { SinceLastDoses, SyringeCalculator, WakeLockToggle } from "@/components/preop/theatre-tools";
import { CrisisPanel, CustomTimers, FluidStatus, Fold, PlanCard, minutesBetween } from "@/components/preop/theatre-parts";

const nowIso = () => new Date().toISOString();

/** "HH:MM" edit of an ISO time, keeping its day. */
function withTime(iso: string, hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(iso);
  if (Number.isFinite(h) && Number.isFinite(m)) d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function useNow(everyMs = 15_000): string {
  const [now, setNow] = useState(nowIso);
  useEffect(() => {
    const t = setInterval(() => setNow(nowIso()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function TimeInput({ iso, onChange }: { iso: string; onChange: (iso: string) => void }) {
  return (
    <input
      type="time"
      value={hhmm(iso)}
      onChange={(e) => e.target.value && onChange(withTime(iso, e.target.value))}
      className="h-8 w-[5.5rem] shrink-0 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 font-mono text-sm tabular-nums text-foreground"
      aria-label="Heure"
    />
  );
}

const SEVERITIES = [
  { code: "mild" as const, label: "Légère" },
  { code: "moderate" as const, label: "Modérée" },
  { code: "severe" as const, label: "Sévère" },
];

const QUICK_VOLUMES = [50, 100, 250, 500, 1000];

export function TheatreView({ d, onChange, carnetEnabled }: { d: Dossier; onChange: (d: Dossier) => void; carnetEnabled: boolean }) {
  const now = useNow();
  const io = d.intraop;
  const setIo = (patch: Partial<Intraop>) => onChange({ ...d, intraop: { ...io, ...patch } });
  const [fluidCat, setFluidCat] = useState<FluidCategory>("crystalloid");
  const [extraQuery, setExtraQuery] = useState("");
  const [extraDose, setExtraDose] = useState("");
  const [compType, setCompType] = useState(COMPLICATION_TYPES[0]);
  const [compSeverity, setCompSeverity] = useState<Complication["severity"]>("mild");
  const [compManagement, setCompManagement] = useState("");
  const [crisis, setCrisis] = useState<string | null>(null);
  const openCrisis = (id: string | null) => {
    setCrisis(id);
    if (id) setTimeout(() => document.getElementById("crisis-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const logGiven = (name: string, dose: string, route?: string) => setIo({ given: [...io.given, { id: crypto.randomUUID(), name, phase: "other", route: route === "IM" ? "im" : route === "IV continu" ? "pse" : route === "IV" || route === "IV/IO" ? "bolus_iv" : defaultRoute(name), dose, at: nowIso() }] });

  const timers = durationTimers(d, now);
  const redoses = redoseTimers(d, now);
  const balance = fluidBalance(d);
  const events = [...io.events].sort((a, b) => a.at.localeCompare(b.at));
  const has = (t: EventType) => io.events.some((e) => e.type === t);
  const tourniquetOn = io.events.filter((e) => e.type === "tourniquet_on").length > io.events.filter((e) => e.type === "tourniquet_off").length;
  const logged = new Set(io.events.map((e) => e.type));
  const suggestions = extraQuery.trim() ? drugSuggestions(extraQuery, [], { limit: 5 }) : [];

  const addEvent = (type: EventType, note = "") => setIo({ events: [...io.events, { id: crypto.randomUUID(), type, at: nowIso(), note }] });
  const giveExtra = (name: string, route?: string) => {
    if (!name.trim()) return;
    setIo({ given: [...io.given, { id: crypto.randomUUID(), name: name.trim(), phase: "other", route: route ?? defaultRoute(name), dose: extraDose.trim(), at: nowIso() }] });
    setExtraQuery("");
    setExtraDose("");
  };

  const eventButtons = EVENT_TYPES.filter((e) => e.code !== "note" && !(e.code === "tourniquet_on" && tourniquetOn) && !(e.code === "tourniquet_off" && !tourniquetOn));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <PlanCard d={d} onOpenCrisis={openCrisis} />
        <div className="flex justify-end">
          <WakeLockToggle />
        </div>
        {/* Timers: derived from the events — nothing to start or stop by hand. */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {timers.length === 0 && <p className="col-span-full rounded-[var(--radius-md)] bg-surface-muted px-3 py-2 text-sm text-foreground-muted">Les chronos démarrent avec « Entrée en salle », « Induction », « Incision » et le garrot.</p>}
          {timers.map((t) => (
            <div key={t.key} className={cn("rounded-[var(--radius-lg)] border p-3", t.alert ? "border-danger bg-danger-tint" : "border-border bg-surface")}>
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{t.label}</p>
              <p className={cn("font-mono text-2xl font-semibold tabular-nums", t.alert ? "text-danger" : "text-foreground")}>{formatMinutes(t.minutes)}</p>
              <p className="text-xs text-foreground-subtle">
                depuis {hhmm(t.startedAt)}
                {t.endedAt ? ` · fin ${hhmm(t.endedAt)}` : ""}
                {t.thresholdMin ? ` · alerte ${t.thresholdMin} min` : ""}
              </p>
            </div>
          ))}
          {redoses.map((r) => (
            <div key={r.planDrugId} className={cn("rounded-[var(--radius-lg)] border p-3", r.remainingMin !== null && r.remainingMin <= 0 ? "border-danger bg-danger-tint" : r.remainingMin !== null && r.remainingMin <= 15 ? "border-accent bg-accent-tint" : "border-border bg-surface")}>
              <p className="truncate text-xs font-medium uppercase tracking-wide text-foreground-subtle">{r.name}</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">{r.remainingMin === null ? "—" : r.remainingMin <= 0 ? "À refaire" : formatMinutes(r.remainingMin)}</p>
              <p className="text-xs text-foreground-subtle">{r.dueAt ? `réinjection à ${hhmm(r.dueAt)}` : `toutes les ${r.intervalMin} min, pas encore donné`}</p>
            </div>
          ))}
        </section>
        <SinceLastDoses d={d} now={now} />

        <Panel title="Repères et minuteurs">
          <div className="flex flex-wrap gap-1.5">
            {eventButtons.map((e) => (
              <button
                key={e.code}
                type="button"
                onClick={() => addEvent(e.code)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.98]",
                  logged.has(e.code) && e.code !== "tourniquet_on" && e.code !== "tourniquet_off" ? "border-border bg-surface-muted text-foreground-subtle" : "border-primary/40 bg-primary-tint text-primary-strong hover:bg-primary-tint/70"
                )}
              >
                {e.short}
              </button>
            ))}
          </div>
          <CustomTimers timers={io.timers ?? []} now={now} onChange={(timers) => setIo({ timers })} />
          {has("intubation") && (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-2.5">
              <FieldLabel>Laryngoscopie (Cormack-Lehane)</FieldLabel>
              <ChipGroup size="sm" options={CORMACK_GRADES.map((c) => ({ code: c.code as string, label: c.code as string, title: c.detail }))} value={io.cormack ?? null} onChange={(v) => setIo({ cormack: v ?? undefined })} allowClear />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                <label className="block space-y-1">
                  <FieldLabel>Dispositif</FieldLabel>
                  <Input defaultValue={io.airwayDevice} onChange={(e) => setIo({ airwayDevice: e.target.value })} placeholder="ex. sonde 7,5 à 22 cm, LMA 4" />
                </label>
                <label className="block space-y-1">
                  <FieldLabel>Remarque</FieldLabel>
                  <Input defaultValue={io.airwayNote} onChange={(e) => setIo({ airwayNote: e.target.value })} placeholder="ex. vidéolaryngoscope, 1 essai" />
                </label>
              </div>
            </div>
          )}
          {events.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-primary">Heures et écarts ({events.length}) — la feuille d&apos;anesthésie reste la référence</summary>
              <ul className="mt-1.5 divide-y divide-border rounded-[var(--radius-md)] border border-border">
                {events.map((e, i) => (
                  <li key={e.id} className="flex items-center gap-2 px-2.5 py-1">
                    <TimeInput iso={e.at} onChange={(at) => setIo({ events: io.events.map((x) => (x.id === e.id ? { ...x, at } : x)) })} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {EVENT_TYPES.find((t) => t.code === e.type)?.label}
                      {e.note ? <span className="text-foreground-subtle"> — {e.note}</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground-subtle" title="Écart avec le repère précédent · depuis maintenant">
                      {i > 0 ? `+${formatMinutes(minutesBetween(events[i - 1].at, e.at))} · ` : ""}il y a {formatMinutes(minutesBetween(e.at, now))}
                    </span>
                    <button type="button" onClick={() => setIo({ events: io.events.filter((x) => x.id !== e.id) })} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label="Supprimer l'événement">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem("note") as HTMLInputElement;
              if (!input.value.trim()) return;
              addEvent("note", input.value.trim());
              input.value = "";
            }}
          >
            <Input name="note" placeholder="Petite note pour la transmission (heure actuelle)" className="h-9" />
            <Button type="submit" size="sm" variant="secondary" aria-label="Noter">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </Panel>

        <Panel title="Produits">
          {d.plan.drugs.length > 0 && (
            <ul className="space-y-1.5">
              {DRUG_PHASES.flatMap((p) => d.plan.drugs.filter((x) => x.phase === p.code)).map((drug) => {
                const dose = computeDose(drug, d.consultation.patient);
                const given = io.given.filter((g) => g.planDrugId === drug.id);
                return (
                  <li key={drug.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-2.5 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {drug.name} <span className="font-normal text-foreground-subtle">· {routeShort(drug.route)}</span>
                      </span>
                      <span className="block truncate text-xs text-foreground-subtle">{given.length ? `donné ${given.map((g) => hhmm(g.at)).join(", ")}` : DRUG_PHASES.find((p) => p.code === drug.phase)?.label}</span>
                    </span>
                    {dose && <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-primary-strong">{formatDose(dose)}</span>}
                    <Button
                      size="sm"
                      variant={given.length ? "secondary" : "primary"}
                      onClick={() => {
                        const at = nowIso();
                        const given = [...io.given, { id: crypto.randomUUID(), name: drug.name, phase: drug.phase, route: drug.route, dose: dose ? formatDose(dose) : "", at, planDrugId: drug.id }];
                        // The first induction drug starts the anaesthesia clock, if nobody tapped « Induction ».
                        const startsAnaesthesia = drug.phase === "induction" && !io.events.some((e) => e.type === "anaesthesia_start");
                        setIo(startsAnaesthesia ? { given, events: [...io.events, { id: crypto.randomUUID(), type: "anaesthesia_start", at, note: "" }] } : { given });
                      }}
                    >
                      <Syringe className="h-3.5 w-3.5" /> {given.length ? "Encore" : "Donné"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="relative space-y-1.5">
            <form
              className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                giveExtra(suggestions[0]?.name ?? extraQuery, suggestions[0]?.route);
              }}
            >
              <Input value={extraQuery} onChange={(e) => setExtraQuery(e.target.value)} placeholder="Autre produit" autoComplete="off" />
              <Input value={extraDose} onChange={(e) => setExtraDose(e.target.value)} placeholder="Dose" />
              <Button type="submit" variant="secondary" disabled={!extraQuery.trim()} aria-label="Noter le produit">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            {suggestions.length > 0 && (
              <div className="absolute z-20 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
                {suggestions.map((s) => (
                  <button key={s.name} type="button" onClick={() => giveExtra(s.name, s.route)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted">
                    <span>{s.name}</span>
                    <span className="text-xs text-foreground-subtle">{routeShort(s.route)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {io.given.length > 0 && (
            <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
              {[...io.given]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((g) => (
                  <li key={g.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <TimeInput iso={g.at} onChange={(at) => setIo({ given: io.given.map((x) => (x.id === g.id ? { ...x, at } : x)) })} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {g.name} <span className="text-foreground-subtle">{g.dose}</span>
                    </span>
                    <Select value={g.route} onChange={(e) => setIo({ given: io.given.map((x) => (x.id === g.id ? { ...x, route: e.target.value } : x)) })} className="h-8 w-20 px-1.5 text-xs" aria-label="Voie">
                      {DRUG_ROUTES.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.short}
                        </option>
                      ))}
                    </Select>
                    <button type="button" onClick={() => setIo({ given: io.given.filter((x) => x.id !== g.id) })} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label={`Supprimer ${g.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <div id="crisis-panel" className="scroll-mt-4">
          <CrisisPanel
            d={d}
            openId={crisis}
            onOpen={openCrisis}
            onGive={logGiven}
            onLog={(c) => setIo({ complications: [...io.complications, { id: crypto.randomUUID(), type: c.title, severity: "severe", management: "", at: nowIso() }] })}
          />
        </div>
        <Panel
          title="Entrées / sorties"
          actions={
            <span className={cn("rounded-full px-2 py-0.5 font-mono text-sm font-semibold tabular-nums", balance.balanceMl >= 0 ? "bg-primary-tint text-primary-strong" : "bg-accent-tint text-accent")}>
              {balance.balanceMl >= 0 ? "+" : ""}
              {balance.balanceMl} mL
            </span>
          }
        >
          <FluidStatus d={d} minutes={timers.find((t) => t.key === "anaesthesia")?.minutes ?? null} onChange={(patch) => setIo(patch)} />
          <div className="space-y-1.5">
            <FieldLabel>Entrées</FieldLabel>
            <ChipGroup size="sm" options={FLUID_CATEGORIES.filter((c) => c.direction === "in")} value={FLUID_CATEGORIES.find((c) => c.code === fluidCat)?.direction === "in" ? fluidCat : null} onChange={(v) => v && setFluidCat(v)} />
            <FieldLabel>Sorties</FieldLabel>
            <ChipGroup size="sm" options={FLUID_CATEGORIES.filter((c) => c.direction === "out")} value={FLUID_CATEGORIES.find((c) => c.code === fluidCat)?.direction === "out" ? fluidCat : null} onChange={(v) => v && setFluidCat(v)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_VOLUMES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setIo({ fluids: [...io.fluids, { id: crypto.randomUUID(), category: fluidCat, volumeMl: v, at: nowIso(), note: "" }] })}
                className="min-h-11 min-w-16 rounded-[var(--radius-md)] border border-border bg-surface px-3 font-mono text-sm tabular-nums hover:bg-surface-muted active:scale-[0.98]"
              >
                +{v}
              </button>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2 text-xs">
            <dt className="text-foreground-subtle">Entrées</dt>
            <dd className="text-right font-mono tabular-nums">{balance.inMl} mL</dd>
            <dt className="text-foreground-subtle">Sorties</dt>
            <dd className="text-right font-mono tabular-nums">{balance.outMl} mL</dd>
            {FLUID_CATEGORIES.filter((c) => balance.byCategory[c.code]).map((c) => (
              <div key={c.code} className="col-span-2 flex justify-between text-foreground-muted">
                <span>{c.label}</span>
                <span className="font-mono tabular-nums">{balance.byCategory[c.code]} mL</span>
              </div>
            ))}
          </dl>
          {io.fluids.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-primary">Détail ({io.fluids.length})</summary>
              <ul className="mt-1.5 divide-y divide-border rounded-[var(--radius-md)] border border-border">
                {[...io.fluids]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((f) => (
                    <li key={f.id} className="flex items-center gap-2 px-2.5 py-1">
                      <span className="w-12 font-mono text-xs text-foreground-subtle">{hhmm(f.at)}</span>
                      <span className="min-w-0 flex-1 truncate">{FLUID_CATEGORIES.find((c) => c.code === f.category)?.label}</span>
                      <span className="font-mono tabular-nums">{f.volumeMl} mL</span>
                      <button type="button" onClick={() => setIo({ fluids: io.fluids.filter((x) => x.id !== f.id) })} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label="Supprimer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </Panel>


        <Panel title="Complications">
          {io.complications.length > 0 && (
            <ul className="space-y-1.5">
              {io.complications.map((c) => (
                <li key={c.id} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border px-2.5 py-1.5">
                  <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", c.severity === "severe" ? "text-danger" : "text-accent")} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{c.type}</span> <span className="text-foreground-subtle">({SEVERITIES.find((s) => s.code === c.severity)?.label.toLowerCase()}, {hhmm(c.at)})</span>
                    {c.management && <span className="block text-xs text-foreground-muted">{c.management}</span>}
                  </span>
                  <button type="button" onClick={() => setIo({ complications: io.complications.filter((x) => x.id !== c.id) })} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            <Select value={compType} onChange={(e) => setCompType(e.target.value)} aria-label="Complication">
              {COMPLICATION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <ChipGroup size="sm" options={SEVERITIES} value={compSeverity} onChange={(v) => v && setCompSeverity(v)} />
            <Input value={compManagement} onChange={(e) => setCompManagement(e.target.value)} placeholder="Prise en charge (ex. phényléphrine 100 µg ×3, remplissage)" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setIo({ complications: [...io.complications, { id: crypto.randomUUID(), type: compType, severity: compSeverity, management: compManagement.trim(), at: nowIso() }] });
                setCompManagement("");
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Noter la complication
            </Button>
          </div>
        </Panel>

        <Fold title="Calculatrice de pousse-seringue" icon={<Calculator className="h-4 w-4 text-primary" />}>
          <SyringeCalculator weightKg={d.consultation.patient.weightKg} />
        </Fold>

        <Panel title="Avant de transmettre">
          <TextArea label="ALR : niveau / évaluation du bloc" value={io.alrAssessment} onChange={(v) => setIo({ alrAssessment: v })} placeholder="ex. niveau sensitif T10, bloc moteur Bromage 3" />
          <TextArea label="Dernières constantes" value={io.lastVitals} onChange={(v) => setIo({ lastVitals: v })} placeholder="ex. PA 125/70, FC 72, SpO₂ 97 % AA, T° 36,4" />
          <div className="space-y-1.5">
            <FieldLabel>Douleur (EVA / EN)</FieldLabel>
            <ChipGroup size="sm" options={Array.from({ length: 11 }, (_, i) => ({ code: i, label: String(i) }))} value={io.painScore ?? null} onChange={(v) => setIo({ painScore: v ?? undefined })} allowClear />
          </div>
        </Panel>

        <FinishCase d={d} onChange={onChange} carnetEnabled={carnetEnabled} />
      </div>
    </div>
  );
}

/** Confirms the planned carnet case — always an explicit tap, never automatic. */
function ConfirmCarnet({ d, onChange }: { d: Dossier; onChange: (d: Dossier) => void }) {
  const { plannedCases, commit } = useCarnet();
  const { toast } = useToast();
  const planned = d.carnetCaseId ? plannedCases.find((c) => c.id === d.carnetCaseId) : undefined;
  if (d.status === "done" && !planned) return null;
  return (
    <Button
      className="w-full"
      variant={d.status === "done" ? "secondary" : "primary"}
      onClick={() => {
        if (planned) commit([patchRow("cases", planned.id, { planned: false })]);
        if (d.status !== "done") onChange({ ...d, status: "done" });
        toast(planned ? "Cas fait — ajouté au relevé du carnet." : "Cas marqué fait.", { variant: "success" });
      }}
    >
      <CheckCircle2 className="h-4 w-4" /> {d.status === "done" ? "Ajouter au relevé du carnet" : `Cas fait${planned ? " · au carnet" : ""}`}
    </Button>
  );
}

function FinishCase({ d, onChange, carnetEnabled }: { d: Dossier; onChange: (d: Dossier) => void; carnetEnabled: boolean }) {
  return (
    <div className="space-y-2">
      {d.status === "done" && (
        <p className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-success-tint px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> Cas fait.
        </p>
      )}
      {carnetEnabled ? (
        <ConfirmCarnet d={d} onChange={onChange} />
      ) : (
        d.status !== "done" && (
          <Button className="w-full" onClick={() => onChange({ ...d, status: "done" })}>
            <CheckCircle2 className="h-4 w-4" /> Cas fait
          </Button>
        )
      )}
      <p className="flex items-center gap-1 text-xs text-foreground-subtle">
        <Clock className="h-3 w-3" /> Tout est enregistré au fur et à mesure, chiffré sur cet appareil.
      </p>
    </div>
  );
}
