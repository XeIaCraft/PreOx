"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, MultiChipGroup } from "@/components/carnet/ui";
import { Disclosure, FieldLabel, InfoTip, NumberField, Panel, TextArea } from "@/components/preop/ui";
import { CatalogChecklist, MATERIAL_GROUPS, PostopEditor, RisksEditor, TARGET_GROUPS } from "@/components/preop/plan-parts";
import type { PostopPatient } from "@/lib/preop/postop";
import { DRUG_ROUTES, defaultRoute, drugClassOf, drugSuggestions, routeShort } from "@/lib/carnet/pharmaco";
import {
  DRUG_PHASES,
  WEIGHT_BASES,
  computeDose,
  doseBasis,
  formatDose,
  type BodyData,
  type DoseUnit,
  type DrugPhase,
  type ProtocolContent,
  type ProtocolDrug,
  type WeightBasis,
} from "@/lib/preop/protocols";
import { TECHNIQUES, type Technique } from "@/lib/preop/rules/types";
import { DRUG_REFERENCE_SOURCE, drugReferenceFor, formatReferenceDose, localAnaestheticLoad } from "@/lib/preop/drug-reference";
import { cn } from "@/lib/utils";

const UNITS: DoseUnit[] = ["mg", "µg", "g", "mL", "UI"];

/** Phase guessed from the drug's class in the carnet catalogue. */
function guessPhase(name: string): DrugPhase {
  const klass = drugClassOf(name);
  switch (klass) {
    case "hypnotique":
    case "curare":
      return "induction";
    case "halogene":
      return "maintenance";
    case "morphinique":
    case "antalgique":
      return "analgesia";
    case "anesthesique_local":
    case "adjuvant_alr":
      return "alr";
    case "antibiotique":
      return "antibio";
    case "antiemetique":
      return "ponv";
    case "vasopresseur":
    case "antihypertenseur":
      return "haemodynamic";
    default:
      return "other";
  }
}

export function newPlanDrug(name: string, route?: string): ProtocolDrug {
  return {
    id: crypto.randomUUID(),
    name,
    route: route ?? defaultRoute(name),
    phase: guessPhase(name),
    doseMode: "per_kg",
    amount: null,
    unit: "mg",
    weightBasis: "total",
    maxAmount: null,
    redoseEveryMin: null,
    note: "",
  };
}

function DrugRow({ drug, body, onChange, onRemove, startOpen }: { drug: ProtocolDrug; body?: BodyData; onChange: (d: ProtocolDrug) => void; onRemove: () => void; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  // The dose fields are uncontrolled: « Utiliser » remounts them with the reference value.
  const [formKey, setFormKey] = useState(0);
  const reference = drugReferenceFor(drug.name);
  const dose = computeDose(drug, body ?? {});
  const set = (patch: Partial<ProtocolDrug>) => onChange({ ...drug, ...patch });
  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {drug.name} <span className="font-normal text-foreground-subtle">· {routeShort(drug.route)}</span>
          </span>
          <span className="block truncate text-xs text-foreground-subtle">
            {drug.amount === null ? "dose à définir" : doseBasis(drug, dose)}
            {drug.redoseEveryMin ? ` · toutes les ${drug.redoseEveryMin} min` : ""}
          </span>
        </span>
        {body && dose && <span className="shrink-0 rounded bg-primary-tint px-1.5 py-0.5 font-mono text-sm font-semibold tabular-nums text-primary-strong">{formatDose(dose)}</span>}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-foreground-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border px-3 py-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <FieldLabel>Voie</FieldLabel>
              <Select value={drug.route} onChange={(e) => set({ route: e.target.value })}>
                {DRUG_ROUTES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.short} — {r.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1">
              <FieldLabel>Moment</FieldLabel>
              <Select value={drug.phase} onChange={(e) => set({ phase: e.target.value as DrugPhase })}>
                {DRUG_PHASES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <ChipGroup
            size="sm"
            options={[
              { code: "per_kg" as const, label: "Par kilo" },
              { code: "fixed" as const, label: "Dose fixe" },
            ]}
            value={drug.doseMode}
            onChange={(v) => v && set({ doseMode: v })}
          />
          {reference && (
            <div className="rounded-[var(--radius-md)] bg-surface-muted/60 px-2.5 py-2 text-xs text-foreground-muted">
              <p className="font-medium text-foreground">
                Posologies de référence <span className="font-normal text-foreground-subtle">— {DRUG_REFERENCE_SOURCE}, {reference.chapter}</span>
              </p>
              <ul className="mt-1 space-y-1">
                {reference.doses.map((d, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <span className="min-w-0 flex-1">
                      {d.label} : <span className="font-mono tabular-nums text-foreground">{formatReferenceDose(d)}</span>
                      {d.basis ? ` (poids ${WEIGHT_BASES.find((w) => w.code === d.basis)?.short})` : ""}
                      {d.note ? <span className="block text-[11px] text-foreground-subtle">{d.note}</span> : null}
                    </span>
                    {d.mode !== "rate" && (
                      <button
                        type="button"
                        className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-surface"
                        title="Reprendre la borne basse comme dose du plan (modifiable)"
                        onClick={() => {
                          set({ doseMode: d.mode === "per_kg" ? "per_kg" : "fixed", amount: d.min, unit: d.unit as DoseUnit, weightBasis: d.basis ?? drug.weightBasis, note: drug.note || `${d.label} (${formatReferenceDose(d)}, ${DRUG_REFERENCE_SOURCE})` });
                          setFormKey((k) => k + 1);
                        }}
                      >
                        Utiliser {String(d.min).replace(".", ",")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-foreground-subtle">Valeurs d&apos;un ouvrage de 2020 : votre protocole de service prévaut ; adaptez à l&apos;âge, à l&apos;état hémodynamique et au poids pertinent.</p>
            </div>
          )}
          <div key={formKey} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumberField label={drug.doseMode === "per_kg" ? `Dose / kg` : "Dose"} value={drug.amount ?? undefined} onChange={(v) => set({ amount: v ?? null })} />
            <label className="block space-y-1">
              <FieldLabel>Unité</FieldLabel>
              <Select value={drug.unit} onChange={(e) => set({ unit: e.target.value as DoseUnit })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </label>
            {drug.doseMode === "per_kg" && (
              <>
                <label className="block space-y-1">
                  <FieldLabel>Poids</FieldLabel>
                  <Select value={drug.weightBasis} onChange={(e) => set({ weightBasis: e.target.value as WeightBasis })}>
                    {WEIGHT_BASES.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <NumberField label="Plafond" unit={drug.unit} value={drug.maxAmount ?? undefined} onChange={(v) => set({ maxAmount: v ?? null })} />
              </>
            )}
            <NumberField label="Réinjection toutes les" unit="min" value={drug.redoseEveryMin ?? undefined} onChange={(v) => set({ redoseEveryMin: v === undefined ? null : Math.round(v) })} />
          </div>
          <label key={`note-${formKey}`} className="block space-y-1">
            <FieldLabel>Remarque</FieldLabel>
            <Input defaultValue={drug.note} onChange={(e) => set({ note: e.target.value })} placeholder="ex. titrer, diluer à 10 mg/mL, selon la PAM" />
          </label>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" /> Retirer
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function DrugAdder({ exclude, onAdd }: { exclude: string[]; onAdd: (d: ProtocolDrug) => void }) {
  const [query, setQuery] = useState("");
  const suggestions = query.trim() ? drugSuggestions(query, [], { exclude, limit: 6 }) : [];
  const add = (name: string, route?: string) => {
    if (!name.trim()) return;
    onAdd(newPlanDrug(name.trim(), route));
    setQuery("");
  };
  return (
    <div className="relative">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add(suggestions[0]?.name ?? query, suggestions[0]?.route);
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ajouter un produit (propofol, céfazoline…)" autoComplete="off" />
        <Button type="submit" variant="secondary" disabled={!query.trim()} aria-label="Ajouter">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
          {suggestions.map((s) => (
            <button key={s.name} type="button" onClick={() => add(s.name, s.route)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted">
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 text-xs text-foreground-subtle">{routeShort(s.route)}</span>
            </button>
          ))}
          {!suggestions.some((s) => s.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button type="button" onClick={() => add(query)} className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-surface-muted">
              Ajouter « {query.trim()} »
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * An anaesthesia plan: techniques, drugs (doses computed for the patient
 * when `body` is given), targets, monitoring/equipment, frequent risks with
 * what to do, post-op. Used for a protocol and for a dossier's plan.
 */
export function PlanEditor({
  value: c,
  onChange,
  body,
  formKey = 0,
  patient,
  riskContext,
}: {
  value: ProtocolContent;
  onChange: (c: ProtocolContent) => void;
  body?: BodyData;
  formKey?: number | string;
  /** The patient, for the post-operative doses (weight, age, clearance). */
  patient?: PostopPatient;
  /** Words of the patient and the surgery, to propose the risks that fit. */
  riskContext?: string;
}) {
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const set = (patch: Partial<ProtocolContent>) => onChange({ ...c, ...patch });
  const byPhase = DRUG_PHASES.map((p) => ({ ...p, drugs: c.drugs.filter((d) => d.phase === p.code) })).filter((p) => p.drugs.length > 0);
  const laLoad = localAnaestheticLoad(c.drugs, body?.weightKg, (d) => computeDose(d as ProtocolDrug, body ?? {}));
  const hasLa = laLoad.parts.length + laLoad.unknown.length > 0;

  return (
    <div key={formKey} className="space-y-4">
      <Panel title="Technique et produits">
        <MultiChipGroup options={TECHNIQUES.map((t) => ({ code: t.code, label: t.label }))} value={c.techniques} onChange={(v) => set({ techniques: v as Technique[] })} />
        {hasLa && (
          <div className={cn("rounded-[var(--radius-md)] border px-2.5 py-2 text-xs", laLoad.total > 1 ? "border-danger/50 bg-danger-tint/40 text-danger" : laLoad.total > 0.75 ? "border-accent/50 bg-accent-tint/40 text-foreground" : "border-border text-foreground-muted")}>
            <p className="font-medium">
              Anesthésiques locaux : {laLoad.parts.length ? `${Math.round(laLoad.total * 100)} % de la dose toxique cumulée` : "dose toxique non calculable"}
            </p>
            {laLoad.parts.length > 0 && <p>{laLoad.parts.map((x) => `${x.name} ${String(x.mg).replace(".", ",")} mg / ${x.maxMg} mg max (${Math.round(x.share * 100)} %)`).join(" + ")}</p>}
            {laLoad.unknown.length > 0 && <p>À compléter (dose ou poids) : {laLoad.unknown.join(", ")}.</p>}
            <p className="text-[11px] text-foreground-subtle">Doses toxiques additives, calculées sans adrénaline sauf si le nom l&apos;indique — {DRUG_REFERENCE_SOURCE}, tableau 12.1.</p>
          </div>
        )}
        {byPhase.map((p) => (
          <div key={p.code} className="space-y-1.5">
            <FieldLabel>{p.label}</FieldLabel>
            <ul className="space-y-1.5">
              {p.drugs.map((d) => (
                <DrugRow
                  key={`${formKey}-${d.id}`}
                  drug={d}
                  body={body}
                  startOpen={justAdded === d.id}
                  onChange={(next) => set({ drugs: c.drugs.map((x) => (x.id === d.id ? next : x)) })}
                  onRemove={() => set({ drugs: c.drugs.filter((x) => x.id !== d.id) })}
                />
              ))}
            </ul>
          </div>
        ))}
        <DrugAdder
          exclude={c.drugs.map((d) => d.name)}
          onAdd={(d) => {
            setJustAdded(d.id);
            set({ drugs: [...c.drugs, d] });
          }}
        />
        {body && !body.weightKg && c.drugs.some((d) => d.doseMode === "per_kg") && <p className="text-xs text-accent">Renseignez le poids (et la taille, le sexe pour le poids idéal/maigre) dans la consultation pour calculer les doses.</p>}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-1">
            Cibles et monitorage
            <InfoTip label="Cibles et monitorage">
              <p className="text-foreground-muted">Touchez ce qui s&apos;applique ; vos propres lignes vont dans « Autres ». Ces choix s&apos;affichent au bloc, en haut de l&apos;écran, et dans la transmission.</p>
            </InfoTip>
          </span>
        }
      >
        <Disclosure summary={<>Cibles {c.targets.length ? <span className="font-normal text-foreground-subtle">— {c.targets.join(" · ")}</span> : null}</>} initialOpen={c.targets.length === 0} className="rounded-[var(--radius-md)] border border-border" summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
          <div className="px-3 pb-3">
            <CatalogChecklist groups={TARGET_GROUPS} value={c.targets} onChange={(targets) => set({ targets })} placeholder="Autre cible (ex. PAS < 140 mmHg)" />
          </div>
        </Disclosure>
        <Disclosure summary={<>Monitorage et matériel {c.material.length ? <span className="font-normal text-foreground-subtle">— {c.material.join(" · ")}</span> : null}</>} initialOpen={c.material.length === 0} className="rounded-[var(--radius-md)] border border-border" summaryClassName="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
          <div className="px-3 pb-3">
            <CatalogChecklist groups={MATERIAL_GROUPS} value={c.material} onChange={(material) => set({ material })} placeholder="Autre (ex. matelas coquille)" />
          </div>
        </Disclosure>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField label="Alerte garrot" unit="min" value={c.tourniquetAlertMin ?? undefined} onChange={(v) => set({ tourniquetAlertMin: v === undefined ? null : Math.round(v) })} />
        </div>
      </Panel>

      <RisksEditor risks={c.risks} onChange={(risks) => set({ risks })} context={[riskContext ?? "", c.techniques.join(" "), c.drugs.map((d) => d.name).join(" ")].join(" ")} />

      <PostopEditor plan={c.postopPlan} onChange={(postopPlan) => set({ postopPlan })} lines={c.postop} onLines={(postop) => set({ postop })} patient={patient} />
      <Panel title="Notes">
        <TextArea label="Notes du plan" value={c.notes} onChange={(notes) => set({ notes })} />
      </Panel>
    </div>
  );
}
