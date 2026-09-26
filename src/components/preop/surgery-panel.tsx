"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { Combobox, FieldLabel, InfoTip, Legend, MiniNumber, Panel } from "@/components/preop/ui";
import { ARISCAT_LEGEND } from "@/components/preop/legends";
import { POSITIONS } from "@/lib/preop/plan-catalog";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { OPERATION_CATEGORIES } from "@/lib/carnet/referentiel";
import { RISK_GRADES, URGENCIES, urgencyOf, type RiskGrade, type Surgery } from "@/lib/preop/dossier";
import { searchItems, type BleedingRisk, type SurgeryItem } from "@/lib/preop/catalog";
import { BLEEDING_RISKS, SURGERY_CATALOG_SOURCE, SURGERY_GRADES } from "@/lib/preop/surgeries";

const INCISIONS = [
  { code: "peripheral" as const, label: "Périphérique" },
  { code: "upper_abdominal" as const, label: "Abdominale haute" },
  { code: "intrathoracic" as const, label: "Intrathoracique" },
];

const SIDES = ["Droit", "Gauche", "Bilatéral", "Médian"];

/** KCE Report 280 (2016), table 2: examples by grade. */
const GRADE_LEGEND = (
  <Legend
    rows={[
      { code: "Min.", text: "exérèse cutanée, drainage d'abcès du sein, canal carpien, septum nasal, circoncision, hydrocèle, cataracte" },
      { code: "Int.", text: "hernie inguinale, varices, amygdalectomie, arthroscopie du genou, conisation, tympanoplastie, glande sous-mandibulaire" },
      { code: "Maj.", text: "césarienne, cholécystectomie cœlioscopique, hystérectomie abdominale, mammectomie, RTUP, discectomie, thyroïdectomie, prothèse articulaire, colectomie, curage cervical, néphrectomie, neurochirurgie" },
    ]}
    source="KCE Report 280 (2016), tableau 2 : le grade règle les examens de routine."
  />
);

/** ESC 2022: 30-day risk of cardiovascular death, myocardial infarction or stroke. */
const CARDIAC_RISK_LEGEND = (
  <Legend
    rows={[
      { code: "< 1 %", text: "faible : chirurgie superficielle, sein, dentaire, thyroïde, œil, reconstructrice, gynécologie, orthopédie ou urologie mineures (ménisectomie, RTUP)" },
      { code: "1–5 %", text: "intermédiaire : intrapéritonéale (cholécystectomie, hernie hiatale, splénectomie), carotide asymptomatique ou stent carotidien symptomatique, anévrisme aortique endovasculaire, angioplastie périphérique, tête et cou, neurochirurgie ou orthopédie majeure (hanche, rachis), urologie ou gynécologie majeure, greffe rénale, thoracique non majeure" },
      { code: "> 5 %", text: "élevé : aorte et vasculaire majeur, endartériectomie carotidienne symptomatique, revascularisation ouverte ou amputation pour ischémie aiguë, pancréas, foie, voies biliaires, œsophage, perforation intestinale, surrénalectomie, cystectomie totale, pneumonectomie, greffe" },
    ]}
    source="ESC 2022 (Halvorsen et al., PMID 36017553), tableau du risque chirurgical : décès cardiovasculaire, infarctus ou AVC à 30 jours."
  />
);

/** Positions in the order of the procedure (several possible), one tap each. */
function PositionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value
    .split(/\s*(?:→|;|\+)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const set = (list: string[]) => onChange(list.join(" → "));
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1">
        <FieldLabel>Position(s)</FieldLabel>
        <InfoTip label="Positions">
          <Legend rows={POSITIONS.map((p) => ({ code: "•", text: <><span className="font-medium text-foreground">{p.label}</span> : {p.hint}</> }))} source="Points d'attention principaux (Manuel 2020, chap. 19) — à compléter lors de la revue des interventions." />
        </InfoTip>
      </span>
      {parts.length > 0 && (
        <p className="text-xs text-foreground">
          {parts.map((x, i) => (
            <span key={i}>
              {i > 0 && " → "}
              <button type="button" onClick={() => set(parts.filter((_, j) => j !== i))} className="rounded bg-primary-tint px-1.5 py-0.5 text-primary-strong hover:line-through" title="Retirer">
                {x}
              </button>
            </span>
          ))}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.filter((p) => !parts.includes(p.label)).map((p) => (
          <button key={p.label} type="button" title={p.hint} onClick={() => set([...parts, p.label])} className="min-h-8 rounded-[var(--radius-md)] border border-border px-2.5 text-xs text-foreground hover:bg-surface-muted">
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Fills the intervention from a catalogue entry (Paramètres › Interventions). */
export function surgeryFromItem(s: Surgery, c: SurgeryItem): Surgery {
  return {
    ...s,
    name: c.name,
    category: c.category,
    kce: c.grade,
    cardiacRisk: c.cardiacRisk,
    bleedingRisk: c.bleedingRisk,
    rcriHighRisk: c.rcriHighRisk,
    incision: c.incision,
    position: c.position ?? s.position,
    durationHours: c.durationHours ?? s.durationHours,
    catalogId: c.id,
    setting: c.setting ?? s.setting,
    tourniquet: c.tourniquet ?? s.tourniquet,
    closedSpace: c.closedSpace ?? false,
  };
}

/**
 * The intervention and its risk: pick it from the catalogue to fill grade,
 * risks, Lee item, ARISCAT incision, position and duration — every value
 * stays editable. Text fields are uncontrolled: give the panel a `key`
 * that changes when the intervention is replaced from outside.
 */
export function SurgeryPanel({ s, onChange, extra, title = "Intervention" }: { s: Surgery; onChange: (s: Surgery) => void; extra?: React.ReactNode; title?: string }) {
  const { catalogs } = useCatalogs();
  const set = (patch: Partial<Surgery>) => onChange({ ...s, ...patch });
  const [formKey, setFormKey] = useState(0);
  const bleeding = BLEEDING_RISKS.find((b) => b.code === s.bleedingRisk);

  return (
    <Panel title={title}>
      {s.name ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{s.name}</p>
            <p className="text-xs text-foreground-subtle">
              {[s.category, s.kce && SURGERY_GRADES.find((g) => g.code === s.kce)?.label.toLowerCase(), s.position].filter(Boolean).join(" · ") || "Précisez les caractéristiques ci-dessous"}
            </p>
          </div>
          <button type="button" onClick={() => onChange({ ...s, name: "" })} className="shrink-0 text-xs font-medium text-primary hover:underline">
            Changer
          </button>
        </div>
      ) : (
        <Combobox
          placeholder="Intervention (PTG, vésicule, RTUP…)"
          search={(q) => searchItems(catalogs.surgeries, q, (x) => [x.name, ...(x.aka ?? [])]).map((x) => ({ key: x.id, label: x.name, hint: `${x.category} · ${SURGERY_GRADES.find((g) => g.code === x.grade)?.label.toLowerCase()}` }))}
          onPick={(o) => {
            const item = catalogs.surgeries.find((x) => x.id === o.key);
            if (item) onChange(surgeryFromItem(s, item));
            setFormKey((k) => k + 1);
          }}
          onFree={(q) => set({ name: q })}
          freeLabel={(q) => `« ${q} » (hors catalogue)`}
        />
      )}

      <div key={formKey} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-foreground-subtle">Chirurgien</span>
          <Input className="mt-0.5 h-9" defaultValue={s.surgeon} onChange={(e) => set({ surgeon: e.target.value })} />
        </label>
        <MiniNumber label="Durée prévue" unit="h" value={s.durationHours} onChange={(v) => set({ durationHours: v })} />
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-foreground-subtle">Catégorie (carnet)</span>
          <Select className="mt-0.5 h-9" value={s.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">—</option>
            {OPERATION_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.short ?? c.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="col-span-2 block min-w-0 sm:col-span-4">
          <span className="block text-[11px] font-medium text-foreground-subtle">Indication / histoire de la maladie</span>
          <textarea
            rows={2}
            className="mt-0.5 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
            defaultValue={s.indication ?? ""}
            onChange={(e) => set({ indication: e.target.value })}
            placeholder="ex. masse rénale droite de 3 cm découverte fortuitement, sans métastase"
          />
        </label>
      </div>

      <div className="space-y-1">
        <FieldLabel>Côté</FieldLabel>
        <ChipGroup size="sm" options={SIDES.map((x) => ({ code: x, label: x }))} value={SIDES.includes(s.side) ? s.side : null} onChange={(v) => set({ side: v ?? "" })} allowClear />
        {s.side && !SIDES.includes(s.side) && <p className="text-[11px] text-foreground-subtle">Noté : {s.side}</p>}
      </div>
      <PositionPicker value={s.position} onChange={(position) => set({ position })} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <span className="flex items-center gap-1">
            <FieldLabel>Grade (KCE)</FieldLabel>
            <InfoTip label="Complexité de l'intervention (KCE 280)">{GRADE_LEGEND}</InfoTip>
          </span>
          <ChipGroup size="sm" options={SURGERY_GRADES} value={s.kce ?? null} onChange={(v) => set({ kce: v ?? undefined })} allowClear />
        </div>
        <div className="space-y-1">
          <span className="flex items-center gap-1">
            <FieldLabel>Risque cardiaque (ESC)</FieldLabel>
            <InfoTip label="Risque cardiaque de la chirurgie (ESC 2022)">{CARDIAC_RISK_LEGEND}</InfoTip>
          </span>
          <ChipGroup size="sm" options={RISK_GRADES} value={s.cardiacRisk ?? null} onChange={(v) => set({ cardiacRisk: (v ?? undefined) as RiskGrade | undefined })} allowClear />
        </div>
        <div className="space-y-1">
          <span className="flex items-center gap-1">
            <FieldLabel>Risque hémorragique</FieldLabel>
            <InfoTip label="Risque hémorragique de l'intervention">
              <Legend rows={BLEEDING_RISKS.map((b) => ({ code: b.label, text: b.definition }))} />
            </InfoTip>
          </span>
          <ChipGroup size="sm" options={BLEEDING_RISKS.map((b) => ({ code: b.code, label: b.label, title: b.definition }))} value={s.bleedingRisk ?? null} onChange={(v) => set({ bleedingRisk: (v ?? undefined) as BleedingRisk | undefined })} allowClear />
        </div>
      </div>
      {bleeding && (
        <p className="rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2 text-xs text-foreground-muted">
          <span className="font-medium text-foreground">Risque hémorragique {bleeding.label.toLowerCase()}</span> : {bleeding.definition}
        </p>
      )}
      <div className="space-y-1">
        <span className="flex items-center gap-1">
          <FieldLabel>Incision (ARISCAT)</FieldLabel>
          <InfoTip label="ARISCAT (complications pulmonaires)">{ARISCAT_LEGEND}</InfoTip>
        </span>
        <ChipGroup size="sm" options={INCISIONS} value={s.incision ?? null} onChange={(v) => set({ incision: v ?? undefined })} allowClear />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip pressed={!!s.rcriHighRisk} onChange={(v) => set({ rcriHighRisk: v })} className="min-h-9 text-xs">
          Intrapéritonéale, intrathoracique ou vasculaire sus-inguinale
        </ToggleChip>
        <ToggleChip pressed={!!s.closedSpace} onChange={(v) => set({ closedSpace: v })} className="min-h-9 text-xs">
          Espace clos (intracrânien, canal médullaire, chambre postérieure de l&apos;œil)
        </ToggleChip>
      </div>
      <div className="space-y-1">
        <FieldLabel>Délai</FieldLabel>
        <ChipGroup
          size="sm"
          options={URGENCIES.map((u) => ({ code: u.code, label: u.label, title: u.detail }))}
          value={urgencyOf(s)}
          onChange={(v) => v && set({ urgency: v, emergency: v === "urgent" })}
        />
        <p className="text-[11px] text-foreground-subtle">{URGENCIES.find((u) => u.code === urgencyOf(s))!.detail} Change la conduite pour les antiplaquettaires après un stent.</p>
      </div>
      {extra}
      <p className="text-[11px] text-foreground-subtle">{SURGERY_CATALOG_SOURCE} Catalogue modifiable dans Paramètres.</p>
    </Panel>
  );
}
