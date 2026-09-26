"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Droplets, Pause, Play, Plus, Search, Siren, Timer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChipGroup } from "@/components/carnet/ui";
import { FieldLabel, InfoTip, Panel } from "@/components/preop/ui";
import { CRISIS_CATEGORIES, crises, searchCrises, type Crisis, type CrisisDose } from "@/lib/preop/crises";
import { allergySummary, type CustomTimer, type Dossier, type InsensibleLoss } from "@/lib/preop/dossier";
import { INSENSIBLE_LOSSES, NORMOVOLAEMIA_SOURCE, fluidPlan, normovolaemia, urineRate } from "@/lib/preop/fluids";
import { formatMinutes } from "@/lib/preop/intraop";
import { hhmm } from "@/lib/preop/isbar";
import { adjustedBodyWeight, idealBodyWeight } from "@/lib/preop/scores";
import { TECHNIQUES } from "@/lib/preop/rules/types";
import { cn } from "@/lib/utils";

const minutesBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

/**
 * What was decided before, in one card: who, allergies, technique, targets,
 * monitoring, and the expected risks — each opens its crisis procedure.
 */
export function PlanCard({ d, onOpenCrisis }: { d: Dossier; onOpenCrisis: (id: string) => void }) {
  const p = d.consultation.patient;
  const ibw = p.sex && p.heightCm ? idealBodyWeight(p.sex, p.heightCm) : undefined;
  const abw = p.sex && p.heightCm && p.weightKg ? adjustedBodyWeight(p.sex, p.weightKg, p.heightCm) : undefined;
  const allergies = allergySummary(p);
  const techniques = (d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques).map((t) => TECHNIQUES.find((x) => x.code === t)?.label.split(" (")[0] ?? t);
  const row = (label: string, items: string[], tone = "bg-primary-tint text-primary-strong") =>
    items.length > 0 && (
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2">
        <span className="pt-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{label}</span>
        <ul className="flex flex-wrap gap-1">
          {items.map((t) => (
            <li key={t} className={cn("rounded-full px-2 py-0.5 text-xs", tone)}>
              {t}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-3" aria-label="Plan du patient">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-semibold text-foreground">{d.initials}</span>
        <span className="text-sm text-foreground-muted">
          {[
            p.age !== undefined ? `${p.age} ans` : "",
            p.weightKg ? `${p.weightKg} kg` : "",
            ibw ? `idéal ${Math.round(ibw)}` : "",
            abw && p.weightKg && abw < p.weightKg - 1 ? `ajusté ${Math.round(abw)}` : "",
            d.consultation.asa ? `ASA ${d.consultation.asa}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {d.consultation.surgery.name && <span className="text-sm text-foreground">{d.consultation.surgery.name}</span>}
      </div>
      <p className={cn("text-sm", allergies && !/aucune/i.test(allergies) ? "font-medium text-danger" : "text-foreground-muted")}>Allergies : {allergies || "non renseignées"}</p>
      {row("Technique", techniques, "bg-surface-muted text-foreground")}
      {row("Cibles", d.plan.targets)}
      {row("Monitorage", d.plan.material, "bg-surface-muted text-foreground")}
      {d.plan.risks.length > 0 && (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2">
          <span className="pt-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Risques</span>
          <ul className="flex flex-wrap gap-1">
            {d.plan.risks.map((r) => (
              <li key={r.title}>
                {r.crisis ? (
                  <button
                    type="button"
                    onClick={() => onOpenCrisis(r.crisis!)}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent-tint px-2 py-0.5 text-xs text-foreground hover:bg-accent-tint/70"
                    title="Ouvrir la conduite à tenir"
                  >
                    <AlertTriangle className="h-3 w-3 text-accent" /> {r.title}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-xs text-foreground" title={r.conduct}>
                    <AlertTriangle className="h-3 w-3 text-accent" /> {r.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.plan.targets.length === 0 && d.plan.material.length === 0 && d.plan.risks.length === 0 && (
        <p className="text-xs text-foreground-subtle">Cibles, monitorage et risques se choisissent dans l&apos;onglet Préparation.</p>
      )}
    </section>
  );
}

function DoseChip({ dose, onGive }: { dose: CrisisDose; onGive?: (drug: string, dose: string, route?: string) => void }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <span className={cn("font-mono text-base font-semibold tabular-nums", dose.dose ? "text-primary-strong" : "text-foreground-subtle")}>{dose.dose ?? "poids ?"}</span>
      <span className="text-[11px] text-foreground-subtle">
        {dose.drug}
        {dose.route ? ` ${dose.route}` : ""} · {dose.how}
      </span>
      {onGive && dose.dose && (
        <button
          type="button"
          onClick={() => onGive(dose.drug, dose.dose!, dose.route)}
          className="rounded-[var(--radius-sm)] border border-primary/40 bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary-strong active:scale-[0.98]"
          aria-label={`Noter ${dose.drug} ${dose.dose} donné maintenant`}
        >
          Donné
        </button>
      )}
    </span>
  );
}

/** One crisis as a procedure to follow: recognise, then each step (tick it), doses computed and loggable. */
function CrisisCard({ c, onGive, onLog, onClose }: { c: Crisis; onGive?: (drug: string, dose: string, route?: string) => void; onLog?: (c: Crisis) => void; onClose: () => void }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border-2 border-danger/60 bg-surface p-2.5">
      <div className="flex items-start gap-2">
        <Siren className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <h3 className="min-w-0 flex-1 text-base font-semibold text-foreground">{c.title}</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-foreground-subtle hover:text-foreground" aria-label="Fermer la fiche">
          <X className="h-4 w-4" />
        </button>
      </div>
      <details className="text-xs text-foreground-muted">
        <summary className="cursor-pointer font-medium text-foreground">Reconnaître</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {c.recognise.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
      <ol className="space-y-1">
        {c.steps.map((s, i) => (
          <li key={i} className={cn("flex gap-2 rounded-[var(--radius-sm)] px-1.5 py-1", done.has(i) && "opacity-55")}>
            <button
              type="button"
              onClick={() =>
                setDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold",
                done.has(i) ? "border-success bg-success text-white" : "border-border-strong text-foreground-subtle",
              )}
              aria-label={done.has(i) ? "Étape faite" : "Marquer l'étape faite"}
            >
              {done.has(i) ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </button>
            <span className="min-w-0 flex-1 text-sm text-foreground">
              <span className={s.urgent ? "font-semibold" : undefined}>{s.text}</span>
              {s.dose && <DoseChip dose={s.dose} onGive={onGive} />}
            </span>
          </li>
        ))}
      </ol>
      {c.after && (
        <div className="rounded-[var(--radius-sm)] bg-surface-muted/60 px-2.5 py-1.5 text-xs text-foreground-muted">
          <p className="font-medium text-foreground">Ensuite</p>
          <ul className="list-disc pl-4">
            {c.after.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-foreground-subtle">Source : {c.source}. Le protocole du service prévaut.</p>
        {onLog && (
          <Button size="sm" variant="secondary" onClick={() => onLog(c)}>
            Noter dans les complications
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The general perioperative crises: find one by typing or by category,
 * then follow its procedure. Procedures specific to an intervention stay
 * with the intervention.
 */
export function CrisisPanel({
  d,
  openId,
  onOpen,
  onGive,
  onLog,
}: {
  d: Dossier;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onGive?: (drug: string, dose: string, route?: string) => void;
  onLog?: (c: Crisis) => void;
}) {
  const p = d.consultation.patient;
  const list = useMemo(() => crises({ weightKg: p.weightKg, age: p.age }), [p.weightKg, p.age]);
  const [q, setQ] = useState("");
  const shown = searchCrises(list, q);
  const open = openId ? list.find((c) => c.id === openId) : undefined;
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Siren className="h-4 w-4 text-danger" /> Urgences et complications générales
        </span>
      }
      actions={p.weightKg ? <span className="text-xs text-foreground-subtle">doses pour {p.weightKg} kg</span> : <span className="text-xs text-accent">poids requis pour les doses</span>}
    >
      {open ? (
        <CrisisCard key={open.id} c={open} onGive={onGive} onLog={onLog} onClose={() => onOpen(null)} />
      ) : (
        <>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher (bronchospasme, intralipide, FA…)" className="h-9 pl-8" aria-label="Chercher une urgence" />
          </label>
          <div className="space-y-2">
            {CRISIS_CATEGORIES.map((cat) => {
              const items = shown.filter((c) => c.category === cat.code);
              if (!items.length) return null;
              return (
                <div key={cat.code} className="space-y-1">
                  <FieldLabel>{cat.label}</FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onOpen(c.id)}
                        className="min-h-9 rounded-[var(--radius-md)] border border-danger/40 bg-danger-tint/40 px-2.5 text-xs font-medium text-foreground hover:bg-danger-tint active:scale-[0.98]"
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <p className="text-sm text-foreground-subtle">Aucune fiche pour « {q} ».</p>}
          </div>
        </>
      )}
    </Panel>
  );
}

const FASTING_CHIPS = [2, 4, 6, 8, 12];

/** The insensible losses that fit the intervention, until chosen. */
export function defaultInsensibleLoss(d: Dossier): InsensibleLoss {
  const s = d.consultation.surgery;
  if (s.kce === "major" && (s.bleedingRisk === "high" || s.incision === "upper_abdominal")) return "major";
  if (s.incision === "upper_abdominal" || s.rcriHighRisk) return "digestive";
  return "surface";
}

/**
 * Where the fluids stand: maintenance rate, urine output per kilo, and the
 * volume that normovolaemia would need so far (fasting deficit, basal needs,
 * insensible and blood losses) compared with what was given — above it is
 * a drift towards overload.
 */
export function FluidStatus({ d, minutes, onChange }: { d: Dossier; minutes: number | null; onChange: (patch: { fastingHours?: number; insensibleLoss?: InsensibleLoss }) => void }) {
  const p = d.consultation.patient;
  const plan = fluidPlan(p);
  const io = d.intraop;
  const by = (cat: string) => io.fluids.filter((f) => f.category === cat).reduce((n, f) => n + f.volumeMl, 0);
  const urine = by("urine");
  const loss = io.insensibleLoss ?? defaultInsensibleLoss(d);
  const given = by("crystalloid") + by("colloid") + by("blood") + by("other_in");
  const nv = normovolaemia({
    weightKg: p.weightKg,
    fastingHours: io.fastingHours,
    minutes: minutes ?? 0,
    loss,
    bloodLossMl: by("blood_loss"),
    givenMl: given,
    colloidMl: by("colloid"),
  });
  const rate = minutes !== null ? urineRate(urine, p.weightKg, minutes) : null;
  if (!plan || !nv) return <p className="text-xs text-foreground-subtle">Poids requis pour les débits et l&apos;objectif de normovolémie.</p>;
  const early = (minutes ?? 0) < 15;
  const tone = early
    ? "border-border bg-surface"
    : nv.status === "above"
      ? "border-accent/60 bg-accent-tint/50"
      : nv.status === "below"
        ? "border-primary/40 bg-primary-tint/40"
        : "border-success/40 bg-success-tint/40";
  return (
    <div className="space-y-2">
      <div className={cn("space-y-1 rounded-[var(--radius-md)] border px-3 py-2", tone)}>
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground">
          <Droplets className="h-4 w-4 text-primary" />
          {early
            ? `À combler : jeûne ${nv.deficitMl} mL (moitié la 1re heure) + ${nv.hourlyMl} mL/h · reçu ${nv.givenMl} mL`
            : `Normovolémie : ${nv.expectedMl[0]}–${nv.expectedMl[1]} mL à ce stade · reçu ${nv.givenMl} mL`}
          <InfoTip label="Calcul de la normovolémie">
            <ul className="space-y-0.5 text-foreground-muted">
              {nv.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-foreground-subtle">{NORMOVOLAEMIA_SOURCE}.</p>
          </InfoTip>
        </p>
        <p className="text-xs text-foreground-muted">
          {early
            ? "L'estimation se compare aux apports à partir de 15 min d'anesthésie (repère « Induction »)."
            : nv.status === "above"
              ? `Au-dessus de ${nv.givenMl - nv.expectedMl[1]} mL : tendance à la surcharge plutôt qu'à la normovolémie.`
              : nv.status === "below"
                ? `En dessous de ${nv.expectedMl[0] - nv.givenMl} mL : à confronter à la clinique (PA, FC, diurèse), pas à combler d'office.`
                : "Dans la fourchette."}{" "}
          {early ? "" : `Jeûne à combler : ${nv.deficitMl} mL (moitié la 1re heure, le reste en 2 h).`}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel>Jeûne (heures)</FieldLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            <ChipGroup
              size="sm"
              options={FASTING_CHIPS.map((h) => ({ code: h, label: `${h} h` }))}
              value={io.fastingHours !== undefined && FASTING_CHIPS.includes(io.fastingHours) ? io.fastingHours : null}
              onChange={(v) => onChange({ fastingHours: v ?? undefined })}
              allowClear
            />
            <input
              type="number"
              min={0}
              max={48}
              step={0.5}
              defaultValue={io.fastingHours !== undefined && !FASTING_CHIPS.includes(io.fastingHours) ? io.fastingHours : undefined}
              onChange={(e) =>
                onChange({
                  fastingHours: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className="h-9 w-16 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-sm"
              aria-label="Autre durée de jeûne en heures"
              placeholder="autre"
            />
          </div>
        </div>
        <div className="space-y-1">
          <FieldLabel>Pertes insensibles</FieldLabel>
          <ChipGroup
            size="sm"
            options={INSENSIBLE_LOSSES.map((l) => ({
              code: l.code,
              label: `${l.label.split(" (")[0].replace("Chirurgie ", "")} ${l.perKgH[0]}–${l.perKgH[1]}`,
              title: `${l.label} : ${l.perKgH[0]}–${l.perKgH[1]} mL/kg/h`,
            }))}
            value={loss}
            onChange={(v) => v && onChange({ insensibleLoss: v })}
          />
        </div>
      </div>
      <p className="text-xs text-foreground-muted">
        Entretien {nv.hourlyMl} mL/h (4-2-1) ; fond balancé {plan.intraopMlH[0]}–{plan.intraopMlH[1]} mL/h selon la stratégie restrictive. Diurèse :{" "}
        {rate === null ? "calculée après 30 min d'anesthésie" : `${String(rate).replace(".", ",")} mL/kg/h (${urine} mL)`}.
      </p>
    </div>
  );
}

/** Your own timers: stopwatch or countdown, started now, several at once. */
export function CustomTimers({ timers, now, onChange }: { timers: CustomTimer[]; now: string; onChange: (t: CustomTimer[]) => void }) {
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState("");
  return (
    <div className="space-y-1.5">
      {timers.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {timers.map((t) => {
            const end = t.stoppedAt ?? now;
            const elapsed = minutesBetween(t.startedAt, end);
            const left = t.minutes !== undefined ? t.minutes - elapsed : null;
            return (
              <li
                key={t.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  left !== null && left <= 0 && !t.stoppedAt ? "border-danger bg-danger-tint" : "border-border bg-surface",
                )}
              >
                <Timer className="h-3.5 w-3.5 text-foreground-subtle" />
                <span className="font-medium">{t.label}</span>
                <span className="font-mono tabular-nums">{left !== null ? (left <= 0 ? "écoulé" : `reste ${formatMinutes(left)}`) : formatMinutes(elapsed)}</span>
                <span className="text-foreground-subtle">({hhmm(t.startedAt)})</span>
                <button
                  type="button"
                  onClick={() => onChange(timers.map((x) => (x.id === t.id ? { ...x, stoppedAt: x.stoppedAt ? undefined : now } : x)))}
                  aria-label={t.stoppedAt ? "Relancer" : "Arrêter"}
                  className="rounded p-0.5 text-foreground-subtle hover:text-foreground"
                >
                  {t.stoppedAt ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => onChange(timers.filter((x) => x.id !== t.id))}
                  aria-label={`Supprimer ${t.label}`}
                  className="rounded p-0.5 text-foreground-subtle hover:text-danger"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Number(minutes.replace(",", "."));
          onChange([
            ...timers,
            {
              id: crypto.randomUUID(),
              label: label.trim() || "Minuteur",
              startedAt: now,
              ...(Number.isFinite(m) && m > 0 ? { minutes: m } : {}),
            },
          ]);
          setLabel("");
          setMinutes("");
        }}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Minuteur (ex. clampage, bolus)" className="h-9" />
        <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="min" inputMode="decimal" className="h-9" aria-label="Compte à rebours en minutes (vide : chronomètre)" />
        <Button type="submit" size="sm" variant="secondary" aria-label="Démarrer le minuteur">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

/** A folded block: the calculator and other tools stay out of the way until needed. */
export function Fold({ title, icon, children, defaultOpen = false }: { title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium text-foreground">
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-foreground-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </section>
  );
}

export { minutesBetween };
