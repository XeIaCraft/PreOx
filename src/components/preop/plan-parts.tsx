"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { Combobox, FieldLabel, InfoTip, NumberField, Panel, TextArea } from "@/components/preop/ui";
import { MATERIAL_GROUPS, RISK_LIBRARY, TARGET_GROUPS, suggestedRisks, type CatalogGroup } from "@/lib/preop/plan-catalog";
import {
  DEFAULT_PCEA,
  DEFAULT_PERINEURAL,
  POSTOP_ANALGESIA,
  POSTOP_DESTINATIONS,
  POSTOP_SOURCE,
  POSTOP_THROMBO,
  POSTOP_WATCH,
  emptyPostopPlan,
  postopLines,
  type PostopInfusion,
  type PostopPatient,
  type PostopPlan,
} from "@/lib/preop/postop";
import type { ProtocolRisk } from "@/lib/preop/protocols";
import { cn } from "@/lib/utils";

/**
 * Lines picked from a catalogue by category (one tap each), plus your own.
 * Stored as text lines, so a protocol stays readable anywhere.
 */
export function CatalogChecklist({ groups, value, onChange, placeholder }: { groups: CatalogGroup[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const known = new Set(groups.flatMap((g) => g.items.map((i) => i.label)));
  const own = value.filter((v) => !known.has(v));
  const toggle = (label: string) => onChange(value.includes(label) ? value.filter((v) => v !== label) : [...value, label]);
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.id} className="space-y-1">
          <FieldLabel>{g.label}</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((i) => (
              <ToggleChip key={i.label} pressed={value.includes(i.label)} onChange={() => toggle(i.label)} className="min-h-8 px-2.5 text-xs">
                <span title={i.hint}>{i.label}</span>
              </ToggleChip>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-1">
        <FieldLabel>Autres</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {own.map((v) => (
            <ToggleChip key={v} pressed onChange={() => toggle(v)} className="min-h-8 px-2.5 text-xs">
              {v} ×
            </ToggleChip>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (t && !value.includes(t)) onChange([...value, t]);
            setDraft("");
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} className="h-9" />
          <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()} aria-label="Ajouter">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

/** One risk: title, then why, prevention and what to do — collapsed to its title once written. */
function RiskCard({ r, onChange, onRemove, startOpen }: { r: ProtocolRisk; onChange: (r: ProtocolRisk) => void; onRemove: () => void; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <li className="rounded-[var(--radius-md)] border border-border">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{r.title || "Nouveau risque"}</span>
            {!open && r.conduct && <span className="block truncate text-[11px] text-foreground-subtle">{r.conduct}</span>}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-foreground-subtle transition-transform", open && "rotate-180")} />
        </button>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Retirer ${r.title}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          <Input defaultValue={r.title} onChange={(e) => onChange({ ...r, title: e.target.value })} placeholder="Risque" aria-label="Risque" />
          <TextArea label="Pourquoi (mécanisme, terrain)" value={r.why ?? ""} onChange={(why) => onChange({ ...r, why: why || undefined })} />
          <TextArea label="Prévention" value={r.prevention ?? ""} onChange={(prevention) => onChange({ ...r, prevention: prevention || undefined })} />
          <TextArea label="Conduite à tenir" value={r.conduct} onChange={(conduct) => onChange({ ...r, conduct })} />
          {r.source && <p className="text-[11px] text-foreground-subtle">Source : {r.source}</p>}
          {r.crisis && <p className="text-[11px] text-primary">Fiche de crise complète dans l&apos;onglet Bloc.</p>}
        </div>
      )}
    </li>
  );
}

/** Frequent risks with what to know, proposed from the plan and the patient, or picked from the library. */
export function RisksEditor({ risks, onChange, context }: { risks: ProtocolRisk[]; onChange: (r: ProtocolRisk[]) => void; context: string }) {
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const suggestions = suggestedRisks(context, risks);
  const add = (r: ProtocolRisk) => {
    onChange([...risks, r]);
    setJustAdded(null);
  };
  const fromLibrary = (id: string) => {
    const t = RISK_LIBRARY.find((x) => x.id === id);
    if (t) add({ title: t.title, why: t.why, prevention: t.prevention, conduct: t.conduct, source: t.source, crisis: t.crisis });
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-1">
          Risques et conduite à tenir
          <InfoTip label="Bibliothèque de risques">
            <p className="text-foreground-muted">
              Chaque risque dit pourquoi il survient, comment le prévenir et quoi faire, avec sa source ; la procédure complète (doses calculées) est dans l&apos;onglet Bloc. Les risques propres à une intervention seront ajoutés lors de la revue des interventions.
            </p>
          </InfoTip>
        </span>
      }
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setJustAdded(risks.length);
            onChange([...risks, { title: "", conduct: "" }]);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Libre
        </Button>
      }
    >
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <FieldLabel>Proposés pour ce plan</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((t) => (
              <button key={t.id} type="button" onClick={() => fromLibrary(t.id)} className="min-h-8 rounded-full border border-dashed border-accent/60 px-2.5 text-xs text-foreground hover:bg-accent-tint">
                + {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <Combobox
        placeholder="Ajouter un risque de la bibliothèque (hypothermie, inhalation…)"
        onEmpty={() => RISK_LIBRARY.filter((t) => !risks.some((r) => r.title === t.title)).map((t) => ({ key: t.id, label: t.title }))}
        search={(q) => {
          const f = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
          return RISK_LIBRARY.filter((t) => f(t.title).includes(f(q)) || t.words.some((w) => f(w).includes(f(q)))).map((t) => ({ key: t.id, label: t.title }));
        }}
        onPick={(o) => fromLibrary(o.key)}
        onFree={(q) => add({ title: q, conduct: "" })}
        freeLabel={(q) => `Ajouter « ${q} » (à compléter)`}
      />
      {risks.length === 0 && <p className="text-sm text-foreground-subtle">Aucun risque dans ce plan.</p>}
      <ul className="space-y-1.5">
        {risks.map((r, i) => (
          <RiskCard key={`${i}-${risks.length}-${r.title}`} r={r} startOpen={justAdded === i} onChange={(next) => onChange(risks.map((x, j) => (j === i ? next : x)))} onRemove={() => onChange(risks.filter((_, j) => j !== i))} />
        ))}
      </ul>
    </Panel>
  );
}

function InfusionFields({ value, onChange }: { value: PostopInfusion; onChange: (v: PostopInfusion) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="col-span-2 block space-y-1 sm:col-span-4">
        <FieldLabel>Solution</FieldLabel>
        <Input defaultValue={value.solution} onChange={(e) => onChange({ ...value, solution: e.target.value })} />
      </label>
      <NumberField label="Débit" unit="mL/h" value={value.rateMlH ?? undefined} onChange={(v) => onChange({ ...value, rateMlH: v ?? null })} />
      <NumberField label="Bolus" unit="mL" value={value.bolusMl ?? undefined} onChange={(v) => onChange({ ...value, bolusMl: v ?? null })} />
      <NumberField label="Période réfractaire" unit="min" value={value.lockoutMin ?? undefined} onChange={(v) => onChange({ ...value, lockoutMin: v === undefined ? null : Math.round(v) })} />
    </div>
  );
}

/**
 * The post-operative orders to tick: destination, analgesia (PCA, PCEA,
 * perineural catheter with their settings), thromboprophylaxis adapted to
 * the renal function, PONV rescue, what to watch — computed for the patient
 * when there is one, with its warnings. Free lines stay possible.
 */
export function PostopEditor({ plan, onChange, lines, onLines, patient }: { plan: PostopPlan | undefined; onChange: (p: PostopPlan) => void; lines: string[]; onLines: (l: string[]) => void; patient?: PostopPatient }) {
  const p = plan ?? emptyPostopPlan();
  const set = (patch: Partial<PostopPlan>) => onChange({ ...p, ...patch });
  const toggle = <T extends string>(list: T[], code: T) => (list.includes(code) ? list.filter((x) => x !== code) : [...list, code]);
  const computed = postopLines(p, patient);
  const group = (g: string) => POSTOP_ANALGESIA.filter((a) => a.group === g);
  return (
    <Panel
      title={
        <span className="flex items-center gap-1">
          Post-opératoire
          <InfoTip label="Sources">
            <p className="text-foreground-muted">{POSTOP_SOURCE}. Les doses se calculent avec le poids, l&apos;âge et la clairance du patient ; votre protocole de service prévaut.</p>
          </InfoTip>
        </span>
      }
    >
      <div className="space-y-1">
        <FieldLabel>Destination</FieldLabel>
        <ChipGroup size="sm" options={POSTOP_DESTINATIONS} value={p.destination ?? null} onChange={(v) => set({ destination: v ?? undefined })} allowClear />
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Analgésie</FieldLabel>
        {(["base", "opioid", "regional", "adjuvant"] as const).map((g) => (
          <div key={g} className="flex flex-wrap gap-1.5">
            {group(g).map((a) => (
              <ToggleChip key={a.code} pressed={p.analgesia.includes(a.code)} onChange={() => set({ analgesia: toggle(p.analgesia, a.code) })} className="min-h-8 px-2.5 text-xs">
                {a.label}
              </ToggleChip>
            ))}
          </div>
        ))}
      </div>
      {p.analgesia.includes("pcea") && (
        <div className="space-y-1 rounded-[var(--radius-md)] border border-border p-2.5">
          <FieldLabel>Réglages de la PCEA</FieldLabel>
          <InfusionFields value={p.pcea ?? DEFAULT_PCEA} onChange={(pcea) => set({ pcea })} />
        </div>
      )}
      {p.analgesia.includes("perineural") && (
        <div className="space-y-1 rounded-[var(--radius-md)] border border-border p-2.5">
          <FieldLabel>Réglages du cathéter périnerveux</FieldLabel>
          <InfusionFields value={p.perineural ?? DEFAULT_PERINEURAL} onChange={(perineural) => set({ perineural })} />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="space-y-1">
          <FieldLabel>Thromboprophylaxie</FieldLabel>
          <ChipGroup size="sm" options={POSTOP_THROMBO} value={p.thrombo ?? null} onChange={(v) => set({ thrombo: v ?? undefined })} allowClear />
        </div>
        {(p.thrombo === "lmwh" || p.thrombo === "lmwh_mechanical") && <NumberField label="Durée" unit="jours" value={p.thromboDays ?? undefined} onChange={(v) => set({ thromboDays: v === undefined ? null : Math.round(v) })} />}
      </div>
      <ToggleChip pressed={!!p.ponvRescue} onChange={(ponvRescue) => set({ ponvRescue })} className="min-h-8 px-2.5 text-xs">
        Traitement des NVPO prescrit
      </ToggleChip>
      <div className="space-y-1">
        <FieldLabel>Surveillance</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {POSTOP_WATCH.map((x) => (
            <ToggleChip key={x.code} pressed={p.watch.includes(x.code)} onChange={() => set({ watch: toggle(p.watch, x.code) })} className="min-h-8 px-2.5 text-xs">
              {x.label}
            </ToggleChip>
          ))}
        </div>
      </div>
      {computed.length > 0 && (
        <div className="space-y-1 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2">
          <p className="text-xs font-medium text-foreground">{patient ? "Prescriptions pour ce patient" : "Prescriptions (adulte type ; calculées pour chaque patient)"}</p>
          <ul className="space-y-1 text-sm text-foreground">
            {computed.map((l, i) => (
              <li key={i}>
                {l.text}
                {l.warning && <span className="block text-xs text-accent">{l.warning}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <TextArea label="Autres consignes (une par ligne)" rows={Math.max(2, lines.length + 1)} value={lines.join("\n")} onChange={(v) => onLines(v.split("\n").map((l) => l.trim()).filter(Boolean))} placeholder={"Reprise alimentaire : …\nLever : …"} />
    </Panel>
  );
}

export { MATERIAL_GROUPS, TARGET_GROUPS };
