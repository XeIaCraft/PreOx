"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChipGroup } from "@/components/carnet/ui";
import { Disclosure, FieldLabel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { KINETICS, KINETICS_GROUPS, KINETICS_SOURCE, effectWindow, kineticsFor, type Kinetics } from "@/lib/preop/kinetics";
import { TCI_DRUGS, WAKE_CE, decrementTime, tciDrugOf, type TciDrug, type TciPatient } from "@/lib/preop/tci";
import { ISOBOLE_SOURCES, OPIOIDS, propofolForLaryngoscopy, remifentanilEquivalent, sevofluraneIsobole, type Opioid } from "@/lib/preop/isoboles";
import { AIRWAY_SOURCES, airwayPlan, type AirwayPlan } from "@/lib/preop/airway-plan";
import { consultationScores } from "@/lib/preop/consultation-scores";
import { CHECKLIST_SOURCE } from "@/lib/preop/checklist";
import { checklistOf } from "@/lib/preop/plan-lists";
import { hhmm } from "@/lib/preop/isbar";
import { durationTimers } from "@/lib/preop/intraop";
import type { Dossier, Intraop } from "@/lib/preop/dossier";
import { cn } from "@/lib/utils";

const n = (v: number, digits = 1) => v.toLocaleString("fr-BE", { maximumFractionDigits: digits });
const num = (s: string) => Number(s.replace(",", "."));

function KineticsLine({ k }: { k: Kinetics }) {
  return (
    <div className="space-y-1 text-xs text-foreground-muted">
      <p>
        <span className="text-foreground-subtle">Dose :</span> {k.dose}
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>
          <span className="text-foreground-subtle">Délai</span> {k.onset}
        </span>
        {k.peak && (
          <span>
            <span className="text-foreground-subtle">Pic</span> {k.peak}
          </span>
        )}
        <span>
          <span className="text-foreground-subtle">Durée</span> {k.duration}
        </span>
      </p>
      {k.halfLife && (
        <p>
          <span className="text-foreground-subtle">Demi-vie :</span> {k.halfLife}
        </p>
      )}
      {k.csht && (
        <p>
          <span className="text-foreground-subtle">Demi-vie contextuelle :</span> {k.csht}
        </p>
      )}
      <p className="text-foreground">{k.wake}</p>
      {k.elimination && <p className="text-foreground-subtle">{k.elimination}</p>}
    </div>
  );
}

/** Onset, duration and half-lives of the plan's drugs and of what was given, the effect window of each dose, and the estimated awakening. */
export function KineticsPanel({ d, now }: { d: Dossier; now: string }) {
  const [query, setQuery] = useState("");
  const given = [...d.intraop.given].sort((a, b) => b.at.localeCompare(a.at));
  const givenNames = new Set(given.map((g) => kineticsFor(g.name)?.name).filter(Boolean));
  const planned = [...new Map(d.plan.drugs.map((x) => [kineticsFor(x.name)?.name, kineticsFor(x.name)] as const).filter(([name, k]) => name && k && !givenNames.has(name))).values()] as Kinetics[];
  const q = query.trim().toLowerCase();
  const found = q ? KINETICS.filter((k) => k.name.toLowerCase().includes(q) || k.words.some((w) => w.includes(q))) : [];
  return (
    <div className="space-y-4">
      <WakeEstimate d={d} now={now} />
      {given.length > 0 && (
        <div className="space-y-2">
          <FieldLabel>Donné : effet attendu</FieldLabel>
          <ul className="space-y-1.5">
            {given.map((g) => {
              const k = kineticsFor(g.name);
              const w = k ? effectWindow(k, g.at) : null;
              return (
                <li key={g.id} className="rounded-[var(--radius-md)] border border-border px-3 py-2">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{g.name}</span> {g.dose} <span className="text-foreground-subtle">à {hhmm(g.at)}</span>
                  </p>
                  {k ? (
                    <p className="text-xs text-foreground-muted">
                      Délai {k.onset}
                      {w ? ` · effet jusqu'à ≈ ${w.from}–${w.to}` : ` · durée ${k.duration}`}
                    </p>
                  ) : (
                    <p className="text-xs text-foreground-subtle">Pas de fiche pour ce produit.</p>
                  )}
                  {k && (
                    <Disclosure summary="Détails" summaryClassName="cursor-pointer text-xs text-primary-strong">
                      <div className="pt-1">
                        <KineticsLine k={k} />
                      </div>
                    </Disclosure>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {planned.length > 0 && (
        <div className="space-y-2">
          <FieldLabel>Prévu dans le plan</FieldLabel>
          <ul className="space-y-1.5">
            {planned.map((k) => (
              <li key={k.name} className="rounded-[var(--radius-md)] border border-border px-3 py-2">
                <p className="text-sm font-medium text-foreground">{k.name}</p>
                <KineticsLine k={k} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        <FieldLabel>Chercher un produit</FieldLabel>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex. rocuronium, dexmédétomidine" />
        {found.map((k) => (
          <div key={k.name} className="rounded-[var(--radius-md)] border border-border px-3 py-2">
            <p className="text-sm font-medium text-foreground">{k.name}</p>
            <KineticsLine k={k} />
          </div>
        ))}
        {q && found.length === 0 && <p className="text-xs text-foreground-subtle">Aucun produit trouvé.</p>}
      </div>
      <Disclosure summary="Tableau complet par classe" summaryClassName="cursor-pointer text-sm font-medium text-primary-strong">
        <div className="space-y-3 pt-2">
          {KINETICS_GROUPS.map((g) => (
            <div key={g.code} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{g.label}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead className="text-foreground-subtle">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Produit</th>
                      <th className="py-1 pr-2 font-medium">Délai</th>
                      <th className="py-1 pr-2 font-medium">Durée</th>
                      <th className="py-1 font-medium">Demi-vie (contextuelle)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KINETICS.filter((k) => k.group === g.code).map((k) => (
                      <tr key={k.name} className="border-t border-border align-top text-foreground-muted">
                        <td className="py-1 pr-2 font-medium text-foreground">{k.name}</td>
                        <td className="py-1 pr-2">{k.onset}</td>
                        <td className="py-1 pr-2">{k.duration}</td>
                        <td className="py-1">{k.csht ?? k.halfLife ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Disclosure>
      <p className="text-xs text-foreground-subtle">{KINETICS_SOURCE}</p>
    </div>
  );
}

const DEFAULT_TARGET: Record<TciDrug, string> = { propofol: "3", remifentanil: "3", sufentanil: "0,25" };

/** Minutes for the effect site to fall to the awakening concentration after the anaesthesia so far, simulated on the patient's model. */
function WakeEstimate({ d, now }: { d: Dossier; now: string }) {
  const p: TciPatient = d.consultation.patient;
  const aivoc = d.plan.drugs.filter((x) => x.route === "aivoc").map((x) => tciDrugOf(x.name)).filter(Boolean) as TciDrug[];
  const [drugs, setDrugs] = useState<TciDrug[]>(aivoc.length ? [...new Set(aivoc)] : ["propofol", "remifentanil"]);
  const [targets, setTargets] = useState<Record<TciDrug, string>>(DEFAULT_TARGET);
  const anaesthesia = durationTimers(d, now).find((t) => t.key === "anaesthesia");
  const [duration, setDuration] = useState("");
  const minutes = duration ? num(duration) : anaesthesia ? Math.max(10, Math.round(anaesthesia.minutes)) : 120;
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] bg-surface-muted p-3">
      <p className="text-sm font-medium text-foreground">Réveil estimé après arrêt de l&apos;AIVOC</p>
      <div className="flex flex-wrap gap-1.5">
        {TCI_DRUGS.map((t) => (
          <button
            key={t.code}
            type="button"
            aria-pressed={drugs.includes(t.code)}
            onClick={() => setDrugs((ds) => (ds.includes(t.code) ? ds.filter((x) => x !== t.code) : [...ds, t.code]))}
            className={cn("min-h-9 rounded-[var(--radius-md)] border px-2.5 text-xs font-medium", drugs.includes(t.code) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label className="block max-w-48 space-y-1">
        <FieldLabel>Durée de perfusion (min)</FieldLabel>
        <Input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={String(minutes)} />
      </label>
      {!p.age || !p.sex || !p.weightKg || !p.heightCm ? (
        <p className="text-sm text-accent">Âge, sexe, poids et taille sont nécessaires (onglet Consultation).</p>
      ) : (
        <ul className="space-y-2">
          {drugs.map((drug) => {
            const info = TCI_DRUGS.find((t) => t.code === drug)!;
            const target = num(targets[drug]);
            const wake = WAKE_CE[drug];
            const late = Number.isFinite(target) ? decrementTime(drug, p, target, minutes, wake.range[1]) : null;
            const early = Number.isFinite(target) ? decrementTime(drug, p, target, minutes, wake.range[0]) : null;
            const half = Number.isFinite(target) ? decrementTime(drug, p, target, minutes, target / 2) : null;
            return (
              <li key={drug} className="space-y-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2">
                <div className="flex flex-wrap items-end gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{info.label}</p>
                  <label className="w-28 space-y-0.5">
                    <span className="text-[11px] text-foreground-subtle">Cible Ce ({info.unit})</span>
                    <Input inputMode="decimal" value={targets[drug]} onChange={(e) => setTargets((t) => ({ ...t, [drug]: e.target.value }))} />
                  </label>
                </div>
                {late ? (
                  <p className="text-sm text-foreground">
                    Réveil ≈ <span className="font-mono tabular-nums">{Math.round(late.minutes)}–{early ? Math.round(early.minutes) : "?"} min</span> après l&apos;arrêt
                    <span className="text-foreground-subtle"> (Ce {n(wake.range[1], 2)} → {n(wake.range[0], 2)} : {wake.what})</span>
                  </p>
                ) : (
                  <p className="text-xs text-foreground-subtle">La cible doit dépasser la concentration de réveil ({n(wake.range[1], 2)}).</p>
                )}
                {half && <p className="text-xs text-foreground-muted">Demi-vie contextuelle (Ce ÷ 2) : ≈ {Math.round(half.minutes)} min · modèle {half.model}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-foreground-subtle">
        Simulation sur le modèle du patient (pompe à cible constante pendant {minutes} min, puis arrêt). Associer propofol et morphinique abaisse la Ce de réveil du propofol ; un halogéné se réveille vers 0,3 CAM (voir isoboles). Ordre de grandeur, à titrer sur la clinique.
      </p>
    </div>
  );
}

/** Less hypnotic, more opioid for the same effect: sevoflurane MAC and propofol for laryngoscopy by opioid concentration. */
export function IsobolePanel({ age }: { age?: number }) {
  const [opioid, setOpioid] = useState<Opioid>("remifentanil");
  const info = OPIOIDS.find((o) => o.code === opioid)!;
  const [c, setC] = useState(3);
  const sevo = sevofluraneIsobole(age, opioid, c);
  const remi = remifentanilEquivalent(opioid, c);
  const [lo, hi] = propofolForLaryngoscopy(remi);
  const steps = useMemo(() => {
    const out: number[] = [];
    for (let v = info.range[0]; v <= info.range[1] + 1e-9; v += info.step) out.push(Math.round(v * 100) / 100);
    return out;
  }, [info]);
  return (
    <div className="space-y-3">
      <ChipGroup
        size="sm"
        options={OPIOIDS.map((o) => ({ code: o.code, label: o.label }))}
        value={opioid}
        onChange={(v) => {
          if (!v) return;
          setOpioid(v);
          setC(v === "remifentanil" ? 3 : v === "sufentanil" ? 0.2 : 2);
        }}
      />
      <label className="block space-y-1">
        <FieldLabel>
          Concentration : <span className="font-mono tabular-nums">{n(c, 2)} {info.unit}</span>
        </FieldLabel>
        <input type="range" min={0} max={steps.length - 1} step={1} value={Math.max(0, steps.findIndex((s) => s >= c - 1e-9))} onChange={(e) => setC(steps[Number(e.target.value)])} className="w-full accent-[var(--color-primary)]" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Sévoflurane</p>
          {sevo ? (
            <div className="space-y-0.5 text-sm text-foreground">
              <p>
                CAM (âge {age ?? "?"}) : <span className="font-mono tabular-nums">{n(sevo.mac, 2)} %</span>
              </p>
              <p>
                CAM avec ce morphinique : <span className="font-mono tabular-nums">{n(sevo.fetMac, 2)} %</span> <span className="text-foreground-subtle">(−{Math.round(sevo.reduction * 100)} %)</span>
              </p>
              <p>
                Pas de mouvement à l&apos;incision (95 %) : <span className="font-mono tabular-nums">≈ {n(sevo.fetMac95, 2)} %</span>
              </p>
              <p className="text-foreground-muted">
                Réveil vers FeSévo <span className="font-mono tabular-nums">≈ {n(sevo.fetAwake, 2)} %</span> : le morphinique abaisse peu la CAM-réveil (plafond ≈ −25 %).
              </p>
            </div>
          ) : (
            <p className="text-sm text-foreground-subtle">Âge nécessaire.</p>
          )}
        </div>
        <div className="rounded-[var(--radius-md)] border border-border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Propofol (AIVOC)</p>
          <p className="text-sm text-foreground">
            Ce pour la laryngoscopie : <span className="font-mono tabular-nums">≈ {n(lo)}–{n(hi)} µg/mL</span>
          </p>
          {opioid !== "remifentanil" && <p className="text-xs text-foreground-muted">Équivalent rémifentanil ≈ {n(remi)} ng/mL.</p>}
          <p className="text-xs text-foreground-muted">Hypnose : jamais sous ≈ 1,5–2,5 µg/mL quel que soit le morphinique (mémorisation) ; BIS 40–60.</p>
        </div>
      </div>
      <p className="text-sm text-foreground-muted">
        En pratique : pour la même profondeur, baisser l&apos;hypnotique et monter un morphinique <em>court</em> (rémifentanil) donne un réveil plus rapide et moins d&apos;hypotension ; avec un morphinique long (fentanyl, sufentanil), le gain se paie par une ventilation spontanée retardée.
      </p>
      <Disclosure summary="Sources" summaryClassName="cursor-pointer text-xs text-primary-strong">
        <ul className="list-disc space-y-0.5 pl-4 pt-1 text-xs text-foreground-subtle">
          {ISOBOLE_SOURCES.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

/** The airway plan from the consultation's predictors. */
export function airwayPlanOf(d: Dossier, scores: ReturnType<typeof consultationScores>): AirwayPlan {
  return airwayPlan({
    age: d.consultation.patient.age,
    bmi: scores.derived.bmi,
    laryngoscopy: scores.results.airway,
    mask: scores.results.mask,
    conditions: new Set(Object.entries(scores.conditions).filter(([, v]) => v?.present).map(([k]) => k)),
    surgeryName: d.consultation.surgery.name,
    emergency: d.consultation.surgery.emergency,
  });
}

const LEVEL_TONE: Record<AirwayPlan["level"], string> = { routine: "bg-surface-muted text-foreground", anticipated: "bg-accent-tint text-accent", awake: "bg-danger-tint text-danger" };

export function AirwayPlanView({ plan, compact }: { plan: AirwayPlan; compact?: boolean }) {
  const block = (title: string, items: string[]) =>
    items.length > 0 && (
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{title}</p>
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    );
  const details = (
    <div className="space-y-3">
      {block("Stratégie", plan.strategy)}
      {block("Oxygénation", plan.oxygenation)}
      {block("Plan A : intubation", plan.planA)}
      {block("Plan B : dispositif supraglottique", plan.planB)}
      {block("Plan C : masque facial", plan.planC)}
      {block("Plan D : accès au cou (CICO)", plan.planD)}
      {block("Extubation", plan.extubation)}
      {block("Matériel en salle", plan.material)}
      <p className="text-xs text-foreground-subtle">{AIRWAY_SOURCES}</p>
    </div>
  );
  return (
    <div className="space-y-3">
      <p className={cn("rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium", LEVEL_TONE[plan.level])}>{plan.summary}</p>
      {plan.why.length > 0 && <p className="text-sm text-foreground-muted">{plan.why.join(" · ")}</p>}
      {compact ? (
        <Disclosure summary="Plan A–D, oxygénation, extubation, matériel" summaryClassName="cursor-pointer text-sm font-medium text-primary-strong">
          <div className="pt-2">{details}</div>
        </Disclosure>
      ) : (
        details
      )}
    </div>
  );
}

export function AirwayPlanPanel({ d, compact }: { d: Dossier; compact?: boolean }) {
  const { catalogs } = useCatalogs();
  const scores = useMemo(() => consultationScores(d.consultation, { plan: d.plan, catalogs }), [d.consultation, d.plan, catalogs]);
  return <AirwayPlanView plan={airwayPlanOf(d, scores)} compact={compact} />;
}

/** Pre-anaesthesia checklist: once a day (or after moving the machine), then before each case; ticks kept with the time. */
export function ChecklistPanel({ d, onChange }: { d: Dossier; onChange: (io: Partial<Intraop>) => void }) {
  const { lists } = useCatalogs();
  const checklist = checklistOf(lists);
  const ticks = d.intraop.checklist ?? {};
  const toggle = (id: string) => {
    const next = { ...ticks };
    if (next[id]) delete next[id];
    else next[id] = new Date().toISOString();
    onChange({ checklist: next });
  };
  const [part, setPart] = useState<"perCase" | "daily">("perCase");
  const items = checklist[part];
  const done = items.filter((i) => ticks[i.id]).length;
  return (
    <div className="space-y-3">
      <ChipGroup
        size="sm"
        options={[
          { code: "perCase", label: `Avant chaque patient (${checklist.perCase.filter((i) => ticks[i.id]).length}/${checklist.perCase.length})` },
          { code: "daily", label: `Chaque jour (${checklist.daily.filter((i) => ticks[i.id]).length}/${checklist.daily.length})` },
        ]}
        value={part}
        onChange={(v) => v && setPart(v)}
      />
      {part === "daily" && <p className="text-xs text-foreground-muted">Au début de la journée, et aussi après un déplacement de la machine ou un changement d&apos;évaporateur.</p>}
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => toggle(i.id)} aria-pressed={!!ticks[i.id]} className="flex min-h-11 w-full items-start gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left hover:bg-surface-muted">
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", ticks[i.id] ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{ticks[i.id] && <Check className="h-3.5 w-3.5" />}</span>
              <span className={cn("min-w-0 flex-1 text-sm", ticks[i.id] ? "text-foreground-muted" : "text-foreground")}>{i.label}</span>
              {ticks[i.id] && <span className="shrink-0 font-mono text-xs tabular-nums text-foreground-subtle">{hhmm(ticks[i.id])}</span>}
            </button>
          </li>
        ))}
      </ul>
      {done === items.length && items.length > 0 && <p className="text-sm font-medium text-success">Tout est vérifié.</p>}
      <p className="text-xs text-foreground-subtle">{CHECKLIST_SOURCE} Liste modifiable dans Réglages › Plan et bloc › Check-list.</p>
    </div>
  );
}
