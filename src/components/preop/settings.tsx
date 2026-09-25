"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ClipboardCopy, ExternalLink, Plus, RotateCcw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, MultiChipGroup, ToggleChip } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, Panel, TextArea } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { DEFAULT_CATALOGS } from "@/lib/preop/catalog-defaults";
import {
  SYSTEM_LABELS,
  SYSTEM_ORDER,
  emptyOverrides,
  fold,
  searchItems,
  type AllergenItem,
  type AttentionSpec,
  type CatalogKind,
  type CatalogOverrides,
  type Catalogs,
  type ConditionItem,
  type DrugClassItem,
  type MedicationItem,
  type SurgeryItem,
  type SystemCode,
  type ValueCheckItem,
  type Verifiable,
  type ConditionDetail,
  type DetailOption,
  type Interaction,
  type CareSetting,
} from "@/lib/preop/catalog";
import { itemStatements, verificationPrompt, verificationState } from "@/lib/preop/verification";
import { WATCHED_VALUES } from "@/lib/preop/value-checks";
import { TECHNIQUES, type Technique } from "@/lib/preop/rules/types";
import { cbipSearchUrl } from "@/lib/preop/medications";
import { cbipChapterPath, cbipPageUrl } from "@/lib/preop/cbip";
import type { Protocol } from "@/lib/preop/protocols";
import { QUALIFIER_LABELS, type Qualifier } from "@/lib/preop/history";
import { OPERATION_CATEGORIES } from "@/lib/carnet/referentiel";
import { BLEEDING_RISKS, SURGERY_GRADES } from "@/lib/preop/surgeries";
import { RISK_GRADES } from "@/lib/preop/dossier";
import { cn } from "@/lib/utils";

type AnyItem = Catalogs[CatalogKind][number];

const KINDS: { kind: CatalogKind; label: string; help: string }[] = [
  { kind: "conditions", label: "Antécédents", help: "Ce que chaque antécédent implique : classe ASA, précisions à demander (stade, classe, date…) et ce que chacune change, point d'attention et matériel." },
  { kind: "allergens", label: "Allergies", help: "Les mots reconnus dans les allergies du patient, le point d'attention qui en découle, et les produits du plan qui déclenchent une alerte." },
  { kind: "surgeries", label: "Interventions", help: "Ce que choisir une intervention remplit tout seul : catégorie, grade, risques, incision, position, durée, technique habituelle, protocole, hospitalisation." },
  { kind: "medications", label: "Traitements", help: "Les traitements reconnus (code ATC), l'antécédent qu'ils impliquent, leur point d'attention, leurs interactions avec les produits d'anesthésie." },
  { kind: "drugClasses", label: "Classes", help: "Ce qu'implique toute une classe (préfixe ATC) : ISRS, opioïdes, corticoïdes… — valable pour chaque traitement de la classe." },
  { kind: "values", label: "Valeurs à signaler", help: "Les seuils des constantes et de la biologie (PA, FC, SpO₂, plaquettes, INR, HbA1c…) : ce qui est signalé, ce que ça veut dire, l'antécédent que ça suggère." },
];

const list = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const newId = (label: string) => `u-${fold(label).replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;

function labelOf(kind: CatalogKind, item: AnyItem): string {
  if (kind === "surgeries") return (item as SurgeryItem).name;
  if (kind === "medications") return (item as MedicationItem).name;
  return (item as ConditionItem | AllergenItem | DrugClassItem | ValueCheckItem).label;
}

function hintOf(kind: CatalogKind, item: AnyItem): string {
  switch (kind) {
    case "conditions": {
      const c = item as ConditionItem;
      return [SYSTEM_LABELS[c.system], c.asa ? `ASA ${c.asa}` : "", c.attention || c.attentionIf ? "point d'attention" : "", c.needsRule ? "règle attendue" : ""].filter(Boolean).join(" · ");
    }
    case "allergens":
      return [(item as AllergenItem).keywords.slice(0, 4).join(", "), (item as AllergenItem).needsRule ? "règle attendue" : ""].filter(Boolean).join(" · ");
    case "surgeries": {
      const s = item as SurgeryItem;
      return [s.category, SURGERY_GRADES.find((g) => g.code === s.grade)?.label.toLowerCase(), s.position].filter(Boolean).join(" · ");
    }
    case "medications":
      return [(item as MedicationItem).atc, (item as MedicationItem).brands?.slice(0, 2).join(", ")].filter(Boolean).join(" · ");
    case "drugClasses":
      return (item as DrugClassItem).atc;
    case "values": {
      const v = item as ValueCheckItem;
      return [WATCHED_VALUES.find((w) => w.code === v.value)?.label, v.attention ? { high: "majeur", medium: "à noter", info: "info" }[v.attention.level] : "", v.implies ? "suggère un antécédent" : ""].filter(Boolean).join(" · ");
    }
  }
}

function blank(kind: CatalogKind): AnyItem {
  switch (kind) {
    case "conditions":
      return { id: "", label: "", system: "other" } as ConditionItem;
    case "allergens":
      return { id: "", label: "", keywords: [], drugWords: [], attention: { level: "high", text: "" } } as AllergenItem;
    case "surgeries":
      return { id: "", name: "", category: "", grade: "intermediate", cardiacRisk: "low", bleedingRisk: "low", rcriHighRisk: false, incision: "peripheral" } as SurgeryItem;
    case "medications":
      return { id: "", atc: "", name: "" } as MedicationItem;
    case "drugClasses":
      return { id: "", atc: "", label: "" } as DrugClassItem;
    case "values":
      return { id: "", label: "", value: "hr", op: ">", threshold: 100, attention: { level: "medium", text: "" } } as ValueCheckItem;
  }
}

// ---------------------------------------------------------------------------
// Field editors
// ---------------------------------------------------------------------------

function Line({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0 space-y-1", className)}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

function AttentionEditor({ value, onChange, label = "Point d'attention" }: { value: AttentionSpec | undefined; onChange: (v: AttentionSpec | undefined) => void; label?: string }) {
  const v = value ?? { level: "medium" as const, text: "" };
  return (
    <div className="space-y-1.5 rounded-[var(--radius-md)] border border-border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        <ChipGroup
          size="sm"
          options={[
            { code: "high" as const, label: "Majeur" },
            { code: "medium" as const, label: "À noter" },
            { code: "info" as const, label: "Info" },
          ]}
          value={value ? value.level : null}
          onChange={(level) => onChange(level ? { ...v, level } : undefined)}
          allowClear
        />
      </div>
      {value && (
        <>
          <TextArea label="Texte" value={v.text} onChange={(text) => onChange({ ...v, text })} />
          <Line label="Matériel (séparé par des virgules)">
            <Input className="h-9" defaultValue={(v.material ?? []).join(", ")} onChange={(e) => onChange({ ...v, material: list(e.target.value).length ? list(e.target.value) : undefined })} />
          </Line>
        </>
      )}
    </div>
  );
}

function ConditionForm({ item, onChange }: { item: ConditionItem; onChange: (i: ConditionItem) => void }) {
  const set = (patch: Partial<ConditionItem>) => onChange({ ...item, ...patch });
  const qualifiers = (Object.keys(QUALIFIER_LABELS) as Qualifier[]).filter((q) => item.qualifiers?.[q] !== undefined);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <Line label="Nom">
          <Input className="h-9" value={item.label} onChange={(e) => set({ label: e.target.value })} />
        </Line>
        <Line label="Système">
          <Select className="h-9" value={item.system} onChange={(e) => set({ system: e.target.value as SystemCode })}>
            {SYSTEM_ORDER.map((s) => (
              <option key={s} value={s}>
                {SYSTEM_LABELS[s]}
              </option>
            ))}
          </Select>
        </Line>
      </div>
      <Line label="Autres mots pour le trouver (virgules)">
        <Input className="h-9" defaultValue={(item.keywords ?? []).join(", ")} onChange={(e) => set({ keywords: list(e.target.value) })} />
      </Line>
      <div className="space-y-1">
        <FieldLabel>Classe ASA suggérée</FieldLabel>
        <ChipGroup size="sm" options={[1, 2, 3, 4].map((n) => ({ code: n, label: `ASA ${n}` }))} value={item.asa ?? null} onChange={(v) => set({ asa: v ?? undefined })} allowClear />
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Précisions proposées quand il est présent</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(QUALIFIER_LABELS) as Qualifier[]).map((q) => (
            <ToggleChip
              key={q}
              pressed={item.qualifiers?.[q] !== undefined}
              onChange={(on) => {
                const next = { ...(item.qualifiers ?? {}) };
                if (on) next[q] = QUALIFIER_LABELS[q];
                else delete next[q];
                set({ qualifiers: Object.keys(next).length ? next : undefined });
              }}
              className="min-h-8 px-2 text-xs"
            >
              {QUALIFIER_LABELS[q]}
            </ToggleChip>
          ))}
        </div>
        {qualifiers.map((q) => (
          <div key={q} className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-[var(--radius-md)] bg-surface-muted/50 p-2 sm:grid-cols-2">
            <Line label="Libellé affiché">
              <Input className="h-9" value={item.qualifiers?.[q] ?? ""} onChange={(e) => set({ qualifiers: { ...item.qualifiers, [q]: e.target.value } })} />
            </Line>
            <div className="space-y-1">
              <FieldLabel>ASA dans ce cas</FieldLabel>
              <ChipGroup size="sm" options={[2, 3, 4, 5].map((n) => ({ code: n, label: `${n}` }))} value={item.asaIf?.[q] ?? null} onChange={(v) => set({ asaIf: { ...item.asaIf, [q]: v ?? undefined } })} allowClear />
            </div>
            <div className="sm:col-span-2">
              <AttentionEditor label={`Point d'attention si « ${item.qualifiers?.[q]} »`} value={item.attentionIf?.[q]} onChange={(v) => set({ attentionIf: { ...item.attentionIf, [q]: v } })} />
            </div>
          </div>
        ))}
      </div>
      <DetailsEditor value={item.details ?? []} onChange={(details) => set({ details: details.length ? details : undefined })} />
      <AttentionEditor value={item.attention} onChange={(attention) => set({ attention })} />
      <AlertIfNoRule value={item.needsRule} onChange={(needsRule) => set({ needsRule })} what="cet antécédent" />
      <ToggleChip pressed={!!item.female} onChange={(female) => set({ female })} className="min-h-9 text-xs">
        Femmes seulement
      </ToggleChip>
    </div>
  );
}

const DETAIL_KINDS: { code: ConditionDetail["kind"]; label: string }[] = [
  { code: "choice", label: "Choix (stade, classe…)" },
  { code: "number", label: "Nombre" },
  { code: "date", label: "Date" },
  { code: "text", label: "Texte libre" },
];

/** The details asked once the antecedent is present — stage, class, value, date — and what each answer implies. */
function DetailsEditor({ value, onChange }: { value: ConditionDetail[]; onChange: (v: ConditionDetail[]) => void }) {
  const setAt = (i: number, patch: Partial<ConditionDetail>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>Précisions structurées (stade, classe, valeur, date…)</FieldLabel>
        <Button size="sm" variant="secondary" onClick={() => onChange([...value, { id: `d${Date.now().toString(36)}`, label: "", kind: "choice", options: [] }])}>
          <Plus className="h-3.5 w-3.5" /> Précision
        </Button>
      </div>
      <p className="text-[11px] text-foreground-subtle">Demandées à la consultation quand l&apos;antécédent est coché. Pour un choix, chaque réponse peut fixer une classe ASA, compter comme « sévère » / « mal contrôlé » / « récent » (utilisé par les scores et les règles) et avoir son propre point d&apos;attention.</p>
      {value.map((d, i) => (
        <div key={d.id} className="space-y-2 rounded-[var(--radius-md)] bg-surface-muted/50 p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Line label="Libellé">
              <Input className="h-9" value={d.label} onChange={(e) => setAt(i, { label: e.target.value })} placeholder="ex. Stade KDIGO" />
            </Line>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-2 text-foreground-subtle hover:text-danger sm:order-last" aria-label="Retirer la précision">
              <Trash2 className="h-4 w-4" />
            </button>
            <Line label="Type">
              <Select className="h-9" value={d.kind} onChange={(e) => setAt(i, { kind: e.target.value as ConditionDetail["kind"] })}>
                {DETAIL_KINDS.map((k) => (
                  <option key={k.code} value={k.code}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Line>
            {d.kind === "number" && (
              <Line label="Unité">
                <Input className="h-9" value={d.unit ?? ""} onChange={(e) => setAt(i, { unit: e.target.value || undefined })} placeholder="ex. %" />
              </Line>
            )}
          </div>
          <Line label="Aide (comment le déterminer)">
            <Input className="h-9" value={d.hint ?? ""} onChange={(e) => setAt(i, { hint: e.target.value || undefined })} placeholder="ex. selon le DFGe : G3a 45–59, G3b 30–44…" />
          </Line>
          {d.kind === "choice" && <OptionsEditor value={d.options ?? []} onChange={(options) => setAt(i, { options })} />}
        </div>
      ))}
    </div>
  );
}

function OptionsEditor({ value, onChange }: { value: DetailOption[]; onChange: (v: DetailOption[]) => void }) {
  const setAt = (i: number, patch: Partial<DetailOption>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-1.5">
      {value.map((o, i) => (
        <div key={o.code} className="rounded-[var(--radius-sm)] border border-border bg-surface p-2">
          <div className="flex items-center gap-2">
            <Input className="h-8 min-w-0 flex-1" value={o.label} onChange={(e) => setAt(i, { label: e.target.value })} placeholder="Réponse (ex. G4 : 15–29)" aria-label="Réponse" />
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="shrink-0 text-[11px] text-primary hover:underline">
              {[o.asa ? `ASA ${o.asa}` : "", o.qualifier ? QUALIFIER_LABELS[o.qualifier] : "", o.attention ? "point" : ""].filter(Boolean).join(" · ") || "implications"}
            </button>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="shrink-0 rounded p-1 text-foreground-subtle hover:text-danger" aria-label="Retirer la réponse">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {open === i && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="space-y-1">
                  <FieldLabel>ASA</FieldLabel>
                  <ChipGroup size="sm" options={[1, 2, 3, 4, 5].map((n) => ({ code: n, label: `${n}` }))} value={o.asa ?? null} onChange={(v) => setAt(i, { asa: v ?? undefined })} allowClear />
                </span>
                <span className="space-y-1">
                  <FieldLabel>Compte comme</FieldLabel>
                  <ChipGroup size="sm" options={(Object.keys(QUALIFIER_LABELS) as Qualifier[]).map((q) => ({ code: q, label: QUALIFIER_LABELS[q] }))} value={o.qualifier ?? null} onChange={(v) => setAt(i, { qualifier: v ?? undefined })} allowClear />
                </span>
              </div>
              <AttentionEditor label="Point d'attention pour cette réponse" value={o.attention} onChange={(attention) => setAt(i, { attention })} />
            </div>
          )}
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...value, { code: `o${Date.now().toString(36)}`, label: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Réponse
      </Button>
    </div>
  );
}

function AllergenForm({ item, onChange }: { item: AllergenItem; onChange: (i: AllergenItem) => void }) {
  const set = (patch: Partial<AllergenItem>) => onChange({ ...item, ...patch });
  return (
    <div className="space-y-3">
      <Line label="Nom">
        <Input className="h-9" value={item.label} onChange={(e) => set({ label: e.target.value })} />
      </Line>
      <Line label="Mots reconnus dans les allergies (virgules)">
        <Input className="h-9" defaultValue={item.keywords.join(", ")} onChange={(e) => set({ keywords: list(e.target.value) })} />
      </Line>
      <Line label="Produits du plan qui déclenchent une alerte (virgules)">
        <Input className="h-9" defaultValue={item.drugWords.join(", ")} onChange={(e) => set({ drugWords: list(e.target.value) })} />
      </Line>
      <AttentionEditor value={item.attention} onChange={(v) => set({ attention: v ?? { level: "high", text: "" } })} />
      <div className="space-y-1">
        <ToggleChip pressed={item.assessment === "pen-fast"} onChange={(on) => set({ assessment: on ? "pen-fast" : undefined })} className="min-h-9 text-xs">
          Évaluer avec PEN-FAST
        </ToggleChip>
        <p className="text-[11px] text-foreground-subtle">
          PEN-FAST n&apos;est validé que pour l&apos;allergie déclarée à la pénicilline (Trubiano 2020). Pour toute allergie, la consultation demande aussi le type de réaction (immédiate / retardée), sa gravité selon Ring et Messmer (grades I–IV, utilisés pour
          l&apos;hypersensibilité périopératoire) et si un bilan allergologique a été fait.
        </p>
      </div>
      <AlertIfNoRule value={item.needsRule} onChange={(needsRule) => set({ needsRule })} what="cette allergie" />
    </div>
  );
}

const SETTINGS: { code: CareSetting; label: string }[] = [
  { code: "ambulatory", label: "Ambulatoire" },
  { code: "inpatient", label: "Hospitalisation" },
  { code: "icu", label: "Soins intensifs après" },
];

function SurgeryForm({ item, onChange, protocols }: { item: SurgeryItem; onChange: (i: SurgeryItem) => void; protocols: Protocol[] }) {
  const set = (patch: Partial<SurgeryItem>) => onChange({ ...item, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <Line label="Nom">
          <Input className="h-9" value={item.name} onChange={(e) => set({ name: e.target.value })} />
        </Line>
        <Line label="Autres noms (virgules)">
          <Input className="h-9" defaultValue={(item.aka ?? []).join(", ")} onChange={(e) => set({ aka: list(e.target.value) })} />
        </Line>
        <Line label="Catégorie (carnet)">
          <Select className="h-9" value={item.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">—</option>
            {OPERATION_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.short ?? c.label}
              </option>
            ))}
          </Select>
        </Line>
        <Line label="Durée habituelle (h)">
          <Input
            className="h-9"
            inputMode="decimal"
            defaultValue={item.durationHours === undefined ? "" : String(item.durationHours).replace(".", ",")}
            onChange={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              set({ durationHours: e.target.value.trim() && Number.isFinite(n) ? n : undefined });
            }}
          />
        </Line>
        <Line label="Position" className="sm:col-span-2">
          <Input className="h-9" defaultValue={item.position} onChange={(e) => set({ position: e.target.value || undefined })} />
        </Line>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <FieldLabel>Grade</FieldLabel>
          <ChipGroup size="sm" options={SURGERY_GRADES} value={item.grade} onChange={(v) => v && set({ grade: v })} />
        </div>
        <div className="space-y-1">
          <FieldLabel>Risque cardiaque (ESC)</FieldLabel>
          <ChipGroup size="sm" options={RISK_GRADES} value={item.cardiacRisk} onChange={(v) => v && set({ cardiacRisk: v })} />
        </div>
        <div className="space-y-1">
          <FieldLabel>Risque hémorragique</FieldLabel>
          <ChipGroup size="sm" options={BLEEDING_RISKS.map((b) => ({ code: b.code, label: b.label, title: b.definition }))} value={item.bleedingRisk} onChange={(v) => v && set({ bleedingRisk: v })} />
        </div>
      </div>
      <div className="space-y-1">
        <FieldLabel>Incision (ARISCAT)</FieldLabel>
        <ChipGroup
          size="sm"
          options={[
            { code: "peripheral" as const, label: "Périphérique" },
            { code: "upper_abdominal" as const, label: "Abdominale haute" },
            { code: "intrathoracic" as const, label: "Intrathoracique" },
          ]}
          value={item.incision}
          onChange={(v) => v && set({ incision: v })}
        />
      </div>
      <ToggleChip pressed={item.rcriHighRisk} onChange={(rcriHighRisk) => set({ rcriHighRisk })} className="min-h-9 text-xs">
        Chirurgie à haut risque de Lee (intrapéritonéale, intrathoracique, vasculaire sus-inguinale)
      </ToggleChip>
      <div className="space-y-1">
        <FieldLabel>Technique habituelle (pré-remplie à la consultation si aucun protocole)</FieldLabel>
        <MultiChipGroup options={TECHNIQUES.map((t) => ({ code: t.code, label: t.label.split(" (")[0] }))} value={item.techniques ?? []} onChange={(v) => set({ techniques: v.length ? (v as Technique[]) : undefined })} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <Line label="Protocole associé">
          <Select className="h-9" value={item.protocolId ?? ""} onChange={(e) => set({ protocolId: e.target.value || undefined })}>
            <option value="">Reconnu par le nom de l&apos;intervention</option>
            {protocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.hospital ? ` (${p.hospital})` : ""}
              </option>
            ))}
          </Select>
        </Line>
        <div className="space-y-1">
          <FieldLabel>Prise en charge</FieldLabel>
          <ChipGroup size="sm" options={SETTINGS} value={item.setting ?? null} onChange={(v) => set({ setting: v ?? undefined })} allowClear />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip pressed={!!item.tourniquet} onChange={(tourniquet) => set({ tourniquet: tourniquet || undefined })} className="min-h-9 text-xs">
          Garrot habituel
        </ToggleChip>
        <ToggleChip pressed={!!item.closedSpace} onChange={(closedSpace) => set({ closedSpace: closedSpace || undefined })} className="min-h-9 text-xs">
          Espace clos (intracrânien, canal médullaire, chambre postérieure de l&apos;œil)
        </ToggleChip>
      </div>
      <TextArea label="Notes (particularités, installation, risques propres)" value={item.notes ?? ""} onChange={(notes) => set({ notes: notes || undefined })} />
    </div>
  );
}

/** Interactions with what anaesthesia may use; a planned product that matches raises an alert. */
function InteractionsEditor({ value, onChange }: { value: Interaction[]; onChange: (v: Interaction[] | undefined) => void }) {
  const setAt = (i: number, patch: Partial<Interaction>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>Interactions avec les produits d&apos;anesthésie</FieldLabel>
        <Button size="sm" variant="secondary" onClick={() => onChange([...value, { with: "", words: [], effect: "", level: "medium" }])}>
          <Plus className="h-3.5 w-3.5" /> Interaction
        </Button>
      </div>
      <p className="text-[11px] text-foreground-subtle">Affichées à la consultation pour chaque patient qui prend ce traitement ; si un des produits est dans le plan d&apos;anesthésie, l&apos;alerte devient majeure.</p>
      {value.map((x, i) => (
        <div key={i} className="space-y-2 rounded-[var(--radius-md)] bg-surface-muted/50 p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <Line label="Avec (affiché)">
              <Input className="h-9" value={x.with} onChange={(e) => setAt(i, { with: e.target.value })} placeholder="ex. tramadol, péthidine" />
            </Line>
            <button type="button" onClick={() => onChange(value.length > 1 ? value.filter((_, j) => j !== i) : undefined)} className="rounded p-2 text-foreground-subtle hover:text-danger" aria-label="Retirer l'interaction">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <Line label="Noms de produits reconnus dans le plan (virgules)">
            <Input className="h-9" defaultValue={x.words.join(", ")} onChange={(e) => setAt(i, { words: list(e.target.value) })} placeholder="ex. tramadol, péthidine" />
          </Line>
          <TextArea label="Effet et conduite" value={x.effect} onChange={(effect) => setAt(i, { effect })} />
          <ChipGroup
            size="sm"
            options={[
              { code: "high" as const, label: "Majeure" },
              { code: "medium" as const, label: "À noter" },
              { code: "info" as const, label: "Info" },
            ]}
            value={x.level}
            onChange={(level) => level && setAt(i, { level })}
          />
        </div>
      ))}
    </div>
  );
}

function ValueForm({ item, onChange }: { item: ValueCheckItem; onChange: (i: ValueCheckItem) => void }) {
  const set = (patch: Partial<ValueCheckItem>) => onChange({ ...item, ...patch });
  const unit = WATCHED_VALUES.find((w) => w.code === item.value)?.unit;
  return (
    <div className="space-y-3">
      <Line label="Nom affiché">
        <Input className="h-9" value={item.label} onChange={(e) => set({ label: e.target.value })} placeholder="ex. FC > 100 /min" />
      </Line>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2">
        <Line label="Valeur">
          <Select className="h-9" value={item.value} onChange={(e) => set({ value: e.target.value as ValueCheckItem["value"] })}>
            {WATCHED_VALUES.map((w) => (
              <option key={w.code} value={w.code}>
                {w.label}
              </option>
            ))}
          </Select>
        </Line>
        <Line label="Si">
          <Select className="h-9" value={item.op} onChange={(e) => set({ op: e.target.value as ValueCheckItem["op"] })}>
            {(["<", "<=", ">", ">="] as const).map((op) => (
              <option key={op} value={op}>
                {{ "<": "<", "<=": "≤", ">": ">", ">=": "≥" }[op]}
              </option>
            ))}
          </Select>
        </Line>
        <Line label={`Seuil${unit ? ` (${unit})` : ""}`}>
          <Input
            className="h-9"
            inputMode="decimal"
            defaultValue={String(item.threshold).replace(".", ",")}
            onChange={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              if (e.target.value.trim() && Number.isFinite(n)) set({ threshold: n });
            }}
          />
        </Line>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel>Seulement pour</FieldLabel>
          <ChipGroup
            size="sm"
            options={[
              { code: "M" as const, label: "Homme" },
              { code: "F" as const, label: "Femme" },
            ]}
            value={item.sex ?? null}
            onChange={(v) => set({ sex: v ?? undefined })}
            allowClear
          />
        </div>
        <Line label="Groupe (un seul affiché par groupe : le plus grave)">
          <Input className="h-9" value={item.group ?? ""} onChange={(e) => set({ group: e.target.value || undefined })} placeholder="ex. spo2" />
        </Line>
        <Line label="Antécédent suggéré (à confirmer)">
          <ImpliesSelect value={item.implies} onChange={(implies) => set({ implies })} />
        </Line>
        <div className="space-y-1">
          <FieldLabel>Avec la précision</FieldLabel>
          <ChipGroup size="sm" options={(Object.keys(QUALIFIER_LABELS) as Qualifier[]).map((q) => ({ code: q, label: QUALIFIER_LABELS[q] }))} value={item.qualifier ?? null} onChange={(v) => set({ qualifier: v ?? undefined })} allowClear />
        </div>
      </div>
      <AttentionEditor label="Ce qui est signalé" value={item.attention} onChange={(attention) => set({ attention })} />
    </div>
  );
}

function ImpliesSelect({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const { catalogs } = useCatalogs();
  return (
    <Select className="h-9" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Aucun</option>
      {SYSTEM_ORDER.map((sys) => (
        <optgroup key={sys} label={SYSTEM_LABELS[sys]}>
          {catalogs.conditions
            .filter((c) => c.system === sys)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

const NEEDS_RULE_HELP =
  "PreOx ne décide jamais seul d'un délai ou d'une dose : ça vient de vos règles. Si vous cochez « m'alerter », dès qu'un patient est concerné et qu'aucune de vos règles n'en parle, la consultation l'affiche dans « Je ne sais pas encore quoi faire pour : » et prépare la question à chercher (Consensus, OpenEvidence).";

/** « Alert me when no rule covers it » for a treatment or a class (default: alert, unless the class says otherwise). */
function NeedsRule({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <div className="space-y-1 sm:col-span-2">
      <FieldLabel>M&apos;alerter s&apos;il n&apos;y a aucune règle pour ce traitement</FieldLabel>
      <ChipGroup
        size="sm"
        options={[
          { code: "default" as const, label: "Selon sa classe" },
          { code: "yes" as const, label: "Oui, m'alerter" },
          { code: "no" as const, label: "Non (ex. paracétamol)" },
        ]}
        value={value === undefined ? "default" : value ? "yes" : "no"}
        onChange={(v) => onChange(v === "yes" ? true : v === "no" ? false : undefined)}
      />
      <p className="text-[11px] text-foreground-subtle">{NEEDS_RULE_HELP}</p>
    </div>
  );
}

/** Same, as a switch, for an antecedent or an allergen (default: no alert). */
function AlertIfNoRule({ value, onChange, what }: { value: boolean | undefined; onChange: (v: boolean) => void; what: string }) {
  return (
    <div className="space-y-1">
      <ToggleChip pressed={!!value} onChange={onChange} className="min-h-9 text-xs">
        M&apos;alerter s&apos;il n&apos;y a aucune règle pour {what}
      </ToggleChip>
      <p className="text-[11px] text-foreground-subtle">{NEEDS_RULE_HELP}</p>
    </div>
  );
}

/** When the item was last checked against the literature, and the question to check it. */
function VerificationBox({ kind, item, onChange }: { kind: CatalogKind; item: AnyItem; onChange: (patch: Verifiable) => void }) {
  const { toast } = useToast();
  const state = verificationState(item);
  return (
    <div className={cn("space-y-2 rounded-[var(--radius-md)] border p-2.5", state === "ok" ? "border-border" : "border-accent/40 bg-accent-tint/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ShieldCheck className={cn("h-4 w-4", state === "ok" ? "text-success" : "text-accent")} />
          {state === "never" ? "Jamais vérifié dans la littérature" : `Vérifié le ${new Date(item.verifiedAt!).toLocaleDateString("fr-BE")}${state === "stale" ? " — à revérifier (plus de 2 ans)" : ""}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(verificationPrompt(kind, [item]));
                toast("Question copiée : collez-la dans Consensus ou OpenEvidence.", { variant: "success" });
              } catch {
                toast("Copie impossible sur ce navigateur.", { variant: "error" });
              }
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> Question de vérification
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange({ verifiedAt: new Date().toISOString().slice(0, 10) })}>
            <Check className="h-3.5 w-3.5" /> Vérifié aujourd&apos;hui
          </Button>
        </div>
      </div>
      <Line label="Source (recommandation, année)">
        <Input className="h-9" value={item.source ?? ""} onChange={(e) => onChange({ source: e.target.value || undefined })} placeholder="ex. ESAIC 2022, chirurgie non cardiaque" />
      </Line>
      <details className="text-[11px] text-foreground-subtle">
        <summary className="cursor-pointer">Ce qui sera vérifié</summary>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          {itemStatements(kind, item).map((st, i) => (
            <li key={i}>{st}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function MedicationForm({ item, onChange }: { item: MedicationItem; onChange: (i: MedicationItem) => void }) {
  const set = (patch: Partial<MedicationItem>) => onChange({ ...item, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <Line label="Nom (DCI)">
          <Input className="h-9" value={item.name} onChange={(e) => set({ name: e.target.value })} />
        </Line>
        <Line label={item.atc ? "Code ATC" : "Code ATC (absent de l'export CBIP : à ajouter pour que vos règles par classe s'appliquent)"}>
          <Input className="h-9 uppercase" value={item.atc} onChange={(e) => set({ atc: e.target.value.toUpperCase().trim() })} placeholder="ex. B01AF01" />
        </Line>
        <Line label="Marques (virgules)" className="sm:col-span-2">
          <Input className="h-9" defaultValue={(item.brands ?? []).join(", ")} onChange={(e) => set({ brands: list(e.target.value) })} />
        </Line>
        <Line label="Association : codes ATC de chaque substance (virgules)" className="sm:col-span-2">
          <Input
            className="h-9 uppercase"
            defaultValue={(item.components ?? []).join(", ")}
            onChange={(e) => {
              const components = list(e.target.value.toUpperCase());
              set({ components: components.length ? components : undefined });
            }}
            placeholder="ex. A10BH01, A10BA02"
          />
        </Line>
        <Line label="Antécédent impliqué">
          <ImpliesSelect value={item.implies} onChange={(implies) => set({ implies })} />
        </Line>
        <NeedsRule value={item.needsRule} onChange={(needsRule) => set({ needsRule })} />
      </div>
      {item.name && (
        <div className="space-y-1 text-xs">
          {item.cbip?.chapter && <p className="text-foreground-subtle">CBIP : {cbipChapterPath(item.cbip.chapter)}</p>}
          {item.cbip && Object.keys(item.cbip.pages).length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(item.cbip.pages)
                .slice(0, 12)
                .map(([brand, id]) => (
                  <a key={brand} href={cbipPageUrl(id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> {brand}
                  </a>
                ))}
            </div>
          ) : (
            <a href={cbipSearchUrl(item.name.split(" (")[0])} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Chercher {item.name} sur le CBIP
            </a>
          )}
        </div>
      )}
      <AttentionEditor value={item.attention} onChange={(attention) => set({ attention })} />
      <InteractionsEditor value={item.interactions ?? []} onChange={(interactions) => set({ interactions })} />
    </div>
  );
}

function DrugClassForm({ item, onChange }: { item: DrugClassItem; onChange: (i: DrugClassItem) => void }) {
  const set = (patch: Partial<DrugClassItem>) => onChange({ ...item, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <Line label="Nom de la classe">
          <Input className="h-9" value={item.label} onChange={(e) => set({ label: e.target.value })} />
        </Line>
        <Line label="Préfixe ATC">
          <Input className="h-9 uppercase" value={item.atc} onChange={(e) => set({ atc: e.target.value.toUpperCase().trim() })} placeholder="ex. N06AB" />
        </Line>
        <Line label="Antécédent impliqué">
          <ImpliesSelect value={item.implies} onChange={(implies) => set({ implies })} />
        </Line>
        <NeedsRule value={item.needsRule} onChange={(needsRule) => set({ needsRule })} />
      </div>
      <AttentionEditor value={item.attention} onChange={(attention) => set({ attention })} />
      <InteractionsEditor value={item.interactions ?? []} onChange={(interactions) => set({ interactions })} />
    </div>
  );
}

function ItemForm({ kind, item, onChange, protocols }: { kind: CatalogKind; item: AnyItem; onChange: (i: AnyItem) => void; protocols: Protocol[] }) {
  return (
    <div className="space-y-3">
      <ItemFields kind={kind} item={item} onChange={onChange} protocols={protocols} />
      <VerificationBox kind={kind} item={item} onChange={(patch) => onChange({ ...item, ...patch } as AnyItem)} />
    </div>
  );
}

function ItemFields({ kind, item, onChange, protocols }: { kind: CatalogKind; item: AnyItem; onChange: (i: AnyItem) => void; protocols: Protocol[] }) {
  switch (kind) {
    case "conditions":
      return <ConditionForm item={item as ConditionItem} onChange={onChange} />;
    case "allergens":
      return <AllergenForm item={item as AllergenItem} onChange={onChange} />;
    case "surgeries":
      return <SurgeryForm item={item as SurgeryItem} onChange={onChange} protocols={protocols} />;
    case "medications":
      return <MedicationForm item={item as MedicationItem} onChange={onChange} />;
    case "drugClasses":
      return <DrugClassForm item={item as DrugClassItem} onChange={onChange} />;
    case "values":
      return <ValueForm item={item as ValueCheckItem} onChange={onChange} />;
  }
}

function VerificationBadge({ item }: { item: Verifiable }) {
  const state = verificationState(item);
  if (state === "ok") return <span className="shrink-0 text-[10px] tabular-nums text-success" title="Dernière vérification dans la littérature">✓ {new Date(item.verifiedAt!).toLocaleDateString("fr-BE", { month: "2-digit", year: "2-digit" })}</span>;
  return <span className="shrink-0 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] text-accent">{state === "never" ? "non vérifié" : "à revérifier"}</span>;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** « DCI;ATC;marque1, marque2 » per line (CSV, « ; » or tab) → catalogue treatments. Header lines and bad codes are skipped. */
export function parseMedicationCsv(text: string): MedicationItem[] {
  const out: MedicationItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2) continue;
    const [name, atcRaw, brands] = cells;
    const atc = atcRaw.toUpperCase().replace(/\s/g, "");
    if (!name || !/^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$/.test(atc)) continue;
    out.push({ id: atc, atc, name, brands: brands ? list(brands) : undefined });
  }
  return out;
}

export function SettingsView({ protocols = [] }: { protocols?: Protocol[] }) {
  const { catalogs, overrides, save } = useCatalogs();
  const { toast } = useToast();
  const [kind, setKind] = useState<CatalogKind>("conditions");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: AnyItem; isNew: boolean } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toCheck, setToCheck] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState("");

  const defaults = DEFAULT_CATALOGS[kind] as AnyItem[];
  const defaultIds = useMemo(() => new Set(defaults.map((d) => d.id)), [defaults]);
  const o = (overrides[kind] ?? emptyOverrides()) as CatalogOverrides<AnyItem>;
  const items = catalogs[kind] as AnyItem[];
  const words = (x: AnyItem) => {
    const extra =
      kind === "conditions"
        ? ((x as ConditionItem).keywords ?? [])
        : kind === "allergens"
          ? (x as AllergenItem).keywords
          : kind === "surgeries"
            ? ((x as SurgeryItem).aka ?? [])
            : kind === "medications"
              ? [(x as MedicationItem).atc, ...((x as MedicationItem).brands ?? [])]
              : kind === "drugClasses"
                ? [(x as DrugClassItem).atc]
                : [(x as ValueCheckItem).value];
    return [labelOf(kind, x), ...extra];
  };
  const unchecked = items.filter((x) => verificationState(x) !== "ok");
  const base = toCheck ? unchecked : items;
  const shown = query.trim() ? searchItems(base, query, words, 400) : base;
  const hidden = defaults.filter((d) => o.hidden.includes(d.id));
  const info = KINDS.find((k) => k.kind === kind)!;

  async function commit(next: CatalogOverrides<AnyItem>, message: string) {
    setBusy(true);
    try {
      await save(kind, next as never);
      toast(message, { variant: "success" });
      setEditing(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    const it = editing.item;
    const isDefault = defaultIds.has(it.id);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
            <ArrowLeft className="h-4 w-4" /> {info.label}
          </Button>
          <div className="flex flex-wrap gap-1.5">
            {!editing.isNew && isDefault && o.edited[it.id] && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  const edited = { ...o.edited };
                  delete edited[it.id];
                  void commit({ ...o, edited }, "Valeur par défaut rétablie.");
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Valeur par défaut
              </Button>
            )}
            {!editing.isNew && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Retirer « ${labelOf(kind, it)} » de la liste ?`)) return;
                  void commit(isDefault ? { ...o, hidden: [...o.hidden, it.id] } : { ...o, added: o.added.filter((a) => a.id !== it.id) }, "Retiré de la liste.");
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Retirer
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy || !labelOf(kind, it).trim()}
              onClick={() => {
                const item = { ...it, id: it.id || newId(labelOf(kind, it)) } as AnyItem;
                if (editing.isNew) void commit({ ...o, added: [...o.added, item] }, "Ajouté.");
                else if (isDefault) void commit({ ...o, edited: { ...o.edited, [item.id]: item } }, "Enregistré.");
                else void commit({ ...o, added: o.added.map((a) => (a.id === item.id ? item : a)) }, "Enregistré.");
              }}
            >
              Enregistrer
            </Button>
          </div>
        </div>
        <Panel title={editing.isNew ? `Nouveau — ${info.label.toLowerCase()}` : labelOf(kind, it)}>
          <ItemForm kind={kind} item={it} onChange={(item) => setEditing({ ...editing, item })} protocols={protocols} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto" aria-label="Catalogues">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => {
              setKind(k.kind);
              setQuery("");
              setShowHidden(false);
              setImporting(false);
            }}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", kind === k.kind ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted")}
          >
            {k.label}
          </button>
        ))}
      </nav>
      <p className="text-sm text-foreground-muted">{info.help}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Chercher dans ${info.label.toLowerCase()} (${items.length})`} className="min-w-0 flex-1" />
        <Button onClick={() => setEditing({ item: blank(kind), isNew: true })}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
        {kind === "medications" && (
          <Button variant="secondary" onClick={() => setImporting((v) => !v)}>
            <Upload className="h-4 w-4" /> Importer
          </Button>
        )}
      </div>
      {importing && kind === "medications" && (
        <Panel title="Importer des traitements">
          <p className="text-xs text-foreground-muted">
            Une ligne par substance : <code>DCI;code ATC;marques séparées par des virgules</code> (export tableur en CSV, séparateur « ; » ou tabulation). Les codes ATC déjà présents sont ignorés ; tout reste modifiable ensuite.
          </p>
          <textarea
            rows={6}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"Rivaroxaban;B01AF01;Xarelto\nApixaban;B01AF02;Eliquis"}
            className="block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="text-xs text-foreground-muted file:mr-2 file:rounded-[var(--radius-sm)] file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-xs"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
            {(() => {
              const parsed = parseMedicationCsv(csv);
              const known = new Set(items.map((m) => (m as MedicationItem).atc));
              const fresh = parsed.filter((m, i) => !known.has(m.atc) && parsed.findIndex((x) => x.atc === m.atc) === i);
              return (
                <Button
                  size="sm"
                  disabled={busy || fresh.length === 0}
                  onClick={() => {
                    void commit({ ...o, added: [...o.added, ...fresh] }, `${fresh.length} traitement(s) importé(s).`).then(() => {
                      setCsv("");
                      setImporting(false);
                    });
                  }}
                >
                  Importer {fresh.length} nouveau(x){parsed.length > fresh.length ? ` (${parsed.length - fresh.length} déjà présent(s))` : ""}
                </Button>
              );
            })()}
          </div>
        </Panel>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleChip pressed={toCheck} onChange={setToCheck} className="min-h-8 text-xs">
          À vérifier dans la littérature ({unchecked.length})
        </ToggleChip>
        {shown.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(verificationPrompt(kind, shown.slice(0, 10)));
                toast(`Question copiée pour ${Math.min(10, shown.length)} élément(s) : collez-la dans Consensus ou OpenEvidence.`, { variant: "success" });
              } catch {
                toast("Copie impossible sur ce navigateur.", { variant: "error" });
              }
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> Vérifier les {Math.min(10, shown.length)} premiers affichés
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface">
        {shown.slice(0, 150).map((it) => {
          const added = !defaultIds.has(it.id);
          const edited = !!o.edited[it.id];
          return (
            <li key={it.id}>
              <button type="button" onClick={() => setEditing({ item: structuredClone(it), isNew: false })} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{labelOf(kind, it)}</span>
                  <span className="block truncate text-[11px] text-foreground-subtle">{hintOf(kind, it)}</span>
                </span>
                {(added || edited) && <span className="shrink-0 rounded bg-primary-tint px-1.5 py-0.5 text-[10px] font-medium text-primary-strong">{added ? "ajouté" : "modifié"}</span>}
                <VerificationBadge item={it} />
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length > 150 && <p className="text-xs text-foreground-subtle">150 premiers sur {shown.length} : cherchez un nom, une marque ou un code pour trouver les autres.</p>}
      {hidden.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowHidden((v) => !v)} className="text-xs font-medium text-primary hover:underline">
            {showHidden ? "Masquer" : "Voir"} les {hidden.length} élément(s) retiré(s)
          </button>
          {showHidden && (
            <ul className="space-y-1">
              {hidden.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-dashed border-border px-3 py-1.5 text-sm text-foreground-muted">
                  {labelOf(kind, it)}
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void commit({ ...o, hidden: o.hidden.filter((h) => h !== it.id) }, "Remis dans la liste.")}>
                    <RotateCcw className="h-3.5 w-3.5" /> Remettre
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[11px] text-foreground-subtle">Vos changements sont enregistrés sur votre compte (pas de donnée patient) ; les valeurs par défaut de PreOx continuent d&apos;être mises à jour.</p>
    </div>
  );
}
