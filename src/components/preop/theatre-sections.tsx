"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ListOrdered, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, InfoTip } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { MonitoringCard } from "@/components/preop/monitoring-card";
import { monitoringOf } from "@/lib/preop/plan-lists";
import { MONITORING_GROUPS, bodySurface, haemodynamics, monitoringFor } from "@/lib/preop/monitoring";
import { VENTILATION_SOURCE, alarmSettings, ventilationSettings, type VentilationPatient } from "@/lib/preop/ventilation";
import { APPROACH_SPECIFICS } from "@/lib/preop/surgeries-variants";
import { has } from "@/lib/preop/history";
import type { Dossier } from "@/lib/preop/dossier";
import { cn } from "@/lib/utils";

export interface TheatreSection {
  id: string;
  title: string;
  node: React.ReactNode;
  badge?: string;
  tone?: "danger";
}

/** Default order of the theatre sections (the summary stays on top, always open). */
export const THEATRE_ORDER = ["checklist", "events", "drugs", "airway", "crises", "risks", "pharmaco", "isoboles", "ventilation", "monitoring", "fluids", "complications", "tci", "syringe", "handover", "finish"];

/** The sections in your order (new ones appended), each folded until opened; the order is yours to change. */
export function TheatreSections({ sections, open, onToggle }: { sections: TheatreSection[]; open: Set<string>; onToggle: (id: string) => void }) {
  const { lists, saveLists } = useCatalogs();
  const { toast } = useToast();
  const [arranging, setArranging] = useState(false);
  const saved = lists.theatreOrder ?? THEATRE_ORDER;
  const order = [...saved.filter((id) => sections.some((s) => s.id === id)), ...sections.map((s) => s.id).filter((id) => !saved.includes(id))];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const move = (id: string, delta: number) => {
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    saveLists({ ...lists, theatreOrder: next }).catch(() => toast("Ordre gardé sur cet appareil ; synchronisation impossible pour l'instant.", { variant: "error" }));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {arranging && lists.theatreOrder && (
          <Button size="sm" variant="ghost" onClick={() => saveLists({ ...lists, theatreOrder: undefined }).catch(() => undefined)}>
            <RotateCcw className="h-3.5 w-3.5" /> Ordre par défaut
          </Button>
        )}
        <Button size="sm" variant={arranging ? "primary" : "ghost"} onClick={() => setArranging((a) => !a)}>
          <ListOrdered className="h-3.5 w-3.5" /> {arranging ? "Terminé" : "Réorganiser"}
        </Button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2 lg:items-start">
        {order.map((id, i) => {
          const s = byId.get(id)!;
          const isOpen = open.has(id) && !arranging;
          return (
            <section key={id} id={`theatre-${id}`} className={cn("scroll-mt-4 rounded-[var(--radius-lg)] border bg-surface", s.tone === "danger" ? "border-danger/40" : "border-border", isOpen && "lg:col-span-2")}>
              <div className="flex items-center gap-1 px-3 py-2">
                <button type="button" onClick={() => !arranging && onToggle(id)} aria-expanded={isOpen} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left">
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", s.tone === "danger" ? "text-danger" : "text-foreground")}>{s.title}</span>
                  {s.badge && <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 font-mono text-xs tabular-nums text-foreground-muted">{s.badge}</span>}
                  {!arranging && <ChevronDown className={cn("h-4 w-4 shrink-0 text-foreground-subtle transition-transform", isOpen && "rotate-180")} />}
                </button>
                {arranging && (
                  <span className="flex shrink-0 gap-0.5">
                    <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Monter ${s.title}`}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={i === order.length - 1} onClick={() => move(id, 1)} aria-label={`Descendre ${s.title}`}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </div>
              {isOpen && <div className="border-t border-border px-3 py-3">{s.node}</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** The risks of the plan in full (why, prevention, what to do) and what the intervention changes for the anaesthesia. */
export function RisksDetail({ d, onOpenCrisis }: { d: Dossier; onOpenCrisis: (id: string) => void }) {
  const { catalogs } = useCatalogs();
  const item = d.consultation.surgery.catalogId ? catalogs.surgeries.find((s) => s.id === d.consultation.surgery.catalogId) : undefined;
  const specifics = [...(item?.specifics ?? []), ...(item?.approach ? (APPROACH_SPECIFICS[item.approach] ?? []) : [])];
  return (
    <div className="space-y-3">
      {specifics.length > 0 && (
        <div className="space-y-1">
          <FieldLabel>Ce que l&apos;intervention change pour l&apos;anesthésie</FieldLabel>
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
            {specifics.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {item?.notes && <p className="text-xs text-foreground-muted">{item.notes}</p>}
        </div>
      )}
      {d.plan.risks.length === 0 && specifics.length === 0 && <p className="text-sm text-foreground-subtle">Aucun risque dans le plan (onglet Préparation).</p>}
      <ul className="space-y-2">
        {d.plan.risks.map((r, i) => (
          <li key={`${i}-${r.title}`} className="space-y-1 rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint/30 px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-accent" /> {r.title}
            </p>
            {r.why && (
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Pourquoi : </span>
                {r.why}
              </p>
            )}
            {r.prevention && (
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Prévention : </span>
                {r.prevention}
              </p>
            )}
            {r.conduct && (
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Conduite à tenir : </span>
                {r.conduct}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {r.source && <p className="text-[11px] text-foreground-subtle">Source : {r.source}</p>}
              {r.crisis && (
                <Button size="sm" variant="secondary" onClick={() => onOpenCrisis(r.crisis!)}>
                  Fiche de crise
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function patientForVentilation(d: Dossier): VentilationPatient {
  const p = d.consultation.patient;
  const cond = d.consultation.conditions;
  return {
    age: p.age,
    sex: p.sex,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    sbp: p.sbp,
    dbp: p.dbp,
    hr: p.hr,
    copd: has(cond, "copd") === true,
    asthma: has(cond, "asthma") === true,
    raisedIcp: has(cond, "raised_icp") === true,
    coronary: ["coronary", "stable_angina", "coronary_stent", "cabg", "recent_mi"].some((id) => has(cond, id) === true),
    betaBlocked: d.consultation.treatments.some((t) => t.atc.startsWith("C07")),
  };
}

/** Ventilator starting settings and monitor alarms, computed for the patient. */
export function VentilationPanel({ d }: { d: Dossier }) {
  const { catalogs } = useCatalogs();
  const vp = patientForVentilation(d);
  const item = d.consultation.surgery.catalogId ? catalogs.surgeries.find((s) => s.id === d.consultation.surgery.catalogId) : undefined;
  const name = d.consultation.surgery.name.toLowerCase();
  const ctx = {
    laparoscopy: item?.approach === "laparoscopic" || item?.approach === "robotic" || /coelio|cœlio|laparoscop|robot/.test(name),
    oneLung: d.plan.material.some((m) => /double lumi|bloqueur bronchique/i.test(m)) || d.plan.targets.some((t) => /unipulmonaire/i.test(t)),
    fio2: d.plan.gases?.fio2,
  };
  const vent = ventilationSettings(vp, ctx);
  const alarms = alarmSettings(vp, ctx);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <FieldLabel>
          <span className="inline-flex items-center gap-1">
            Réglages de départ du ventilateur <InfoTip label="Sources">{VENTILATION_SOURCE}</InfoTip>
          </span>
        </FieldLabel>
        <dl className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
          {vent.map((l) => (
            <div key={l.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2 px-2.5 py-1.5 text-sm">
              <dt className="text-foreground-subtle">{l.label}</dt>
              <dd>
                <span className="font-medium text-foreground">{l.value}</span>
                {l.why && <span className="block text-[11px] text-foreground-subtle">{l.why}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-1">
        <FieldLabel>Alarmes du moniteur</FieldLabel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-subtle">
                <th className="py-1 pr-2 font-medium">Paramètre</th>
                <th className="py-1 pr-2 font-medium">Basse</th>
                <th className="py-1 font-medium">Haute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {alarms.map((a) => (
                <tr key={a.label} title={a.why}>
                  <td className="py-1 pr-2 text-foreground">
                    {a.label}
                    {a.why && <span className="block text-[11px] text-foreground-subtle">{a.why}</span>}
                  </td>
                  <td className="py-1 pr-2 font-mono tabular-nums text-primary-strong">{a.low ?? "—"}</td>
                  <td className="py-1 font-mono tabular-nums text-primary-strong">{a.high ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(!vp.sbp || !vp.heightCm) && <p className="text-xs text-accent">PA de base, taille et sexe de la consultation affinent les réglages (poids idéal, PAM).</p>}
      </div>
    </div>
  );
}

function Num({ label, value, onChange, unit }: { label: string; value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <label className="block min-w-0 space-y-0.5">
      <span className="block text-[11px] text-foreground-subtle">
        {label} <span className="text-foreground-subtle/80">({unit})</span>
      </span>
      <Input className="h-9" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Reference cards for the plan's targets and monitoring, every card on request, and the haemodynamic formulas. */
export function MonitoringPanel({ d }: { d: Dossier }) {
  const { lists } = useCatalogs();
  const all = monitoringOf(lists);
  const inPlan = monitoringFor([...d.plan.targets, ...d.plan.material], all);
  const [showAll, setShowAll] = useState(false);
  const p = d.consultation.patient;
  const bsa = p.weightKg && p.heightCm ? bodySurface(p.weightKg, p.heightCm) : undefined;
  const [v, setV] = useState({ map: "", cvp: "", mpap: "", pawp: "", co: "" });
  const num = (x: string) => (x.trim() ? Number(x.replace(",", ".")) : undefined);
  const h = haemodynamics({ map: num(v.map), cvp: num(v.cvp), mpap: num(v.mpap), pawp: num(v.pawp), co: num(v.co), bsa });
  const shown = showAll ? all : inPlan;
  return (
    <div className="space-y-3">
      {d.plan.targets.length > 0 && (
        <div className="space-y-1">
          <FieldLabel>Cibles du plan</FieldLabel>
          <ul className="flex flex-wrap gap-1">
            {d.plan.targets.map((t) => (
              <li key={t} className="rounded-full bg-primary-tint px-2 py-0.5 text-xs text-primary-strong">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>{showAll ? "Toutes les fiches" : `Fiches du monitorage retenu (${inPlan.length})`}</FieldLabel>
        <Button size="sm" variant="ghost" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Seulement celles du plan" : "Toutes les fiches"}
        </Button>
      </div>
      {shown.length === 0 && <p className="text-sm text-foreground-subtle">Aucun monitorage reconnu dans le plan : « Toutes les fiches » pour consulter.</p>}
      {showAll
        ? MONITORING_GROUPS.map((g) => {
            const items = shown.filter((m) => m.group === g.code);
            if (!items.length) return null;
            return (
              <div key={g.code} className="space-y-1">
                <p className="text-xs font-medium text-foreground-subtle">{g.label}</p>
                {items.map((m) => (
                  <MonitoringCard key={m.id} m={m} />
                ))}
              </div>
            );
          })
        : shown.map((m) => <MonitoringCard key={m.id} m={m} />)}
      <details className="rounded-[var(--radius-md)] border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Calcul : résistances et index cardiaque</summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Num label="PAM" unit="mmHg" value={v.map} onChange={(x) => setV({ ...v, map: x })} />
            <Num label="PVC" unit="mmHg" value={v.cvp} onChange={(x) => setV({ ...v, cvp: x })} />
            <Num label="PAP moyenne" unit="mmHg" value={v.mpap} onChange={(x) => setV({ ...v, mpap: x })} />
            <Num label="PAPO" unit="mmHg" value={v.pawp} onChange={(x) => setV({ ...v, pawp: x })} />
            <Num label="Débit" unit="L/min" value={v.co} onChange={(x) => setV({ ...v, co: x })} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm sm:grid-cols-4">
            <dt className="text-foreground-subtle">RVS</dt>
            <dd className="font-mono tabular-nums">{h.svr !== undefined ? `${h.svr} dyn·s·cm⁻⁵` : "—"}</dd>
            <dt className="text-foreground-subtle">RVP</dt>
            <dd className="font-mono tabular-nums">{h.pvr !== undefined ? `${h.pvr} dyn (${String(h.pvrWood).replace(".", ",")} UW)` : "—"}</dd>
            <dt className="text-foreground-subtle">Index cardiaque</dt>
            <dd className="font-mono tabular-nums">{h.ci !== undefined ? `${String(h.ci).replace(".", ",")} L/min/m²` : bsa ? "—" : "taille et poids requis"}</dd>
            <dt className="text-foreground-subtle">Surface corporelle</dt>
            <dd className="font-mono tabular-nums">{bsa ? `${String(bsa).replace(".", ",")} m²` : "—"}</dd>
          </dl>
          <p className="text-[11px] text-foreground-subtle">RVS = 80 × (PAM − PVC) / DC ; RVP = 80 × (PAPm − PAPO) / DC ; normales : RVS 800–1 200, RVP &lt; 160 dyn·s·cm⁻⁵ (2 UW), IC 2,5–4.</p>
        </div>
      </details>
    </div>
  );
}
