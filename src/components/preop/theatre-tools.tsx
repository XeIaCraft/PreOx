"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Sun, Timer } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { FieldLabel, Panel } from "@/components/preop/ui";
import type { Dossier } from "@/lib/preop/dossier";
import { drugReferenceFor, formatReferenceDose } from "@/lib/preop/drug-reference";
import { fluidPlan } from "@/lib/preop/fluids";
import { formatMinutes } from "@/lib/preop/intraop";
import { hhmm } from "@/lib/preop/isbar";
import { cn } from "@/lib/utils";

const n1 = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/** Minutes since the last dose of each product given — one chip per product. */
export function SinceLastDoses({ d, now }: { d: Dossier; now: string }) {
  const last = useMemo(() => {
    const byName = new Map<string, { at: string; dose: string; count: number }>();
    for (const g of d.intraop.given) {
      const k = g.name;
      const cur = byName.get(k);
      if (!cur || g.at > cur.at) byName.set(k, { at: g.at, dose: g.dose, count: (cur?.count ?? 0) + 1 });
      else cur.count++;
    }
    return [...byName.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at));
  }, [d.intraop.given]);
  if (last.length === 0) return null;
  return (
    <section aria-label="Depuis la dernière dose" className="flex flex-wrap gap-1.5">
      {last.map(([name, v]) => {
        const min = Math.max(0, Math.round((new Date(now).getTime() - new Date(v.at).getTime()) / 60_000));
        return (
          <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs">
            <Timer className="h-3.5 w-3.5 text-foreground-subtle" />
            <span className="font-medium text-foreground">{name}</span>
            <span className="font-mono tabular-nums text-foreground-muted">
              {formatMinutes(min)}
              {v.count > 1 ? ` · ×${v.count}` : ""}
            </span>
            <span className="text-foreground-subtle">({hhmm(v.at)})</span>
          </span>
        );
      })}
    </section>
  );
}

type RateUnit = "µg/kg/min" | "µg/kg/h" | "mg/kg/h" | "µg/min" | "mg/h";
const RATE_UNITS: RateUnit[] = ["µg/kg/min", "µg/kg/h", "mg/kg/h", "µg/min", "mg/h"];
const PRESETS: { name: string; unit: RateUnit }[] = [
  { name: "Noradrénaline", unit: "µg/kg/min" },
  { name: "Adrénaline", unit: "µg/kg/min" },
  { name: "Phényléphrine", unit: "µg/kg/min" },
  { name: "Dobutamine", unit: "µg/kg/min" },
  { name: "Rémifentanil", unit: "µg/kg/min" },
  { name: "Propofol", unit: "mg/kg/h" },
  { name: "Kétamine", unit: "mg/kg/h" },
  { name: "Lidocaïne IV", unit: "mg/kg/h" },
  { name: "Dexmédétomidine", unit: "µg/kg/h" },
  { name: "Nicardipine", unit: "mg/h" },
  { name: "Autre", unit: "µg/kg/min" },
];

/** µg per hour for a dose in the given unit. */
export function microgramsPerHour(dose: number, unit: RateUnit, kg: number): number {
  switch (unit) {
    case "µg/kg/min":
      return dose * kg * 60;
    case "µg/kg/h":
      return dose * kg;
    case "mg/kg/h":
      return dose * 1000 * kg;
    case "µg/min":
      return dose * 60;
    case "mg/h":
      return dose * 1000;
  }
}

/** Syringe driver: dose ⇄ mL/h, from what is in the syringe. */
export function SyringeCalculator({ weightKg }: { weightKg?: number }) {
  const [preset, setPreset] = useState(PRESETS[0].name);
  const [unit, setUnit] = useState<RateUnit>(PRESETS[0].unit);
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<"mg" | "µg">("mg");
  const [volume, setVolume] = useState("50");
  const [dose, setDose] = useState("");
  const [mlh, setMlh] = useState("");
  const [kg, setKg] = useState(weightKg ? String(weightKg) : "");
  const num = (s: string) => Number(s.replace(",", "."));
  const conc = num(amount) > 0 && num(volume) > 0 ? (num(amount) * (amountUnit === "mg" ? 1000 : 1)) / num(volume) : null;
  const w = num(kg);
  const perKg = unit.includes("/kg");
  const ready = conc !== null && (!perKg || w > 0);
  const toRate = ready && num(dose) > 0 ? microgramsPerHour(num(dose), unit, w) / conc! : null;
  const toDose = ready && num(mlh) > 0 ? (num(mlh) * conc!) / microgramsPerHour(1, unit, w) : null;
  const ref = drugReferenceFor(preset);
  const refRates = ref?.doses.filter((x) => x.mode === "rate") ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 block space-y-1">
          <FieldLabel>Produit</FieldLabel>
          <Select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setUnit(PRESETS.find((x) => x.name === e.target.value)?.unit ?? "µg/kg/min");
            }}
          >
            {PRESETS.map((x) => (
              <option key={x.name}>{x.name}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1">
          <FieldLabel>Poids (kg)</FieldLabel>
          <Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Unité de dose</FieldLabel>
          <Select value={unit} onChange={(e) => setUnit(e.target.value as RateUnit)}>
            {RATE_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1">
          <FieldLabel>Dans la seringue</FieldLabel>
          <div className="flex gap-1">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex. 4" />
            <Select value={amountUnit} onChange={(e) => setAmountUnit(e.target.value as "mg" | "µg")} className="w-20">
              <option>mg</option>
              <option>µg</option>
            </Select>
          </div>
        </label>
        <label className="block space-y-1">
          <FieldLabel>Volume (mL)</FieldLabel>
          <Input inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Dose ({unit})</FieldLabel>
          <Input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="→ mL/h" />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Débit (mL/h)</FieldLabel>
          <Input inputMode="decimal" value={mlh} onChange={(e) => setMlh(e.target.value)} placeholder="→ dose" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2 text-sm">
        <Calculator className="h-4 w-4 text-primary" />
        {conc === null ? (
          <span className="text-foreground-subtle">Indiquez le contenu de la seringue.</span>
        ) : (
          <span className="text-foreground-muted">
            {n1(conc)} µg/mL
            {toRate !== null && (
              <>
                {" · "}
                <strong className="font-mono text-foreground">{n1(toRate)} mL/h</strong>
              </>
            )}
            {toDose !== null && (
              <>
                {" · "}
                <strong className="font-mono text-foreground">
                  {n1(toDose)} {unit}
                </strong>{" "}
                pour {mlh} mL/h
              </>
            )}
          </span>
        )}
      </div>
      {refRates.length > 0 && (
        <p className="text-xs text-foreground-subtle">
          Référence ({ref!.chapter}) : {refRates.map((r) => `${r.label} ${formatReferenceDose(r)}`).join(" ; ")}.
        </p>
      )}
    </div>
  );
}

/** Keeps the screen on in theatre (Screen Wake Lock API, when the browser has it). */
export function WakeLockToggle() {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on || !supported) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // Refused (battery saver, tab hidden): nothing to do.
      }
    };
    void request();
    const again = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", again);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, [on, supported]);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", on ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-muted")}
    >
      <Sun className="h-3.5 w-3.5" /> {on ? "Écran maintenu allumé" : "Garder l'écran allumé"}
    </button>
  );
}

/** The fluids planned for this patient: theatre background, after surgery, with their source. */
export function FluidPlanPanel({ d }: { d: Dossier }) {
  const plan = fluidPlan(d.consultation.patient);
  return (
    <Panel title="Liquides">
      {!plan ? (
        <p className="text-sm text-foreground-subtle">Poids (et âge) requis.</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <p>
            <span className="text-foreground-subtle">Au bloc : </span>
            <strong className="font-mono">{plan.intraopMlH[0] === plan.intraopMlH[1] ? plan.intraopMlH[0] : `${plan.intraopMlH[0]}–${plan.intraopMlH[1]}`} mL/h</strong>
            <span className="text-foreground-subtle"> (poids {plan.basis}, {plan.weightKg} kg)</span>
          </p>
          <p>
            <span className="text-foreground-subtle">Après, si pas de boissons : </span>
            <strong className="font-mono">
              {plan.postop24h[0] === plan.postop24h[1] ? plan.postop24h[0] : `${plan.postop24h[0]}–${plan.postop24h[1]}`} mL/24 h
            </strong>
            <span className="text-foreground-subtle">
              {" "}
              (≈ {plan.postopMlH[0] === plan.postopMlH[1] ? plan.postopMlH[0] : `${plan.postopMlH[0]}–${plan.postopMlH[1]}`} mL/h) · Na⁺ {plan.sodiumMmol} et K⁺ {plan.potassiumMmol} mmol/24 h
              {plan.glucoseG ? ` · glucose ${plan.glucoseG} g/24 h` : ""}
            </span>
          </p>
          <p className="text-xs text-foreground-muted">{plan.solution}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-foreground-muted">
            {plan.notes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="text-xs text-foreground-subtle">Source : {plan.source}.</p>
        </div>
      )}
    </Panel>
  );
}
