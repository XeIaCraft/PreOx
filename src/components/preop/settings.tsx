"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
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
} from "@/lib/preop/catalog";
import { QUALIFIER_LABELS, type Qualifier } from "@/lib/preop/history";
import { OPERATION_CATEGORIES } from "@/lib/carnet/referentiel";
import { BLEEDING_RISKS, SURGERY_GRADES } from "@/lib/preop/surgeries";
import { RISK_GRADES } from "@/lib/preop/dossier";
import { cn } from "@/lib/utils";

type AnyItem = Catalogs[CatalogKind][number];

const KINDS: { kind: CatalogKind; label: string; help: string }[] = [
  { kind: "conditions", label: "Antécédents", help: "Ce que chaque antécédent implique : classe ASA (et avec « mal contrôlé », « < 3 mois », « sévère »), point d'attention et matériel, et s'il doit être géré par une règle." },
  { kind: "allergens", label: "Allergies", help: "Les mots reconnus dans les allergies du patient, le point d'attention qui en découle, et les produits du plan qui déclenchent une alerte." },
  { kind: "surgeries", label: "Interventions", help: "Ce que choisir une intervention remplit tout seul : catégorie, grade, risques cardiaque et hémorragique, item de Lee, incision, position, durée." },
  { kind: "medications", label: "Traitements", help: "Les traitements reconnus (code ATC), l'antécédent qu'ils impliquent, leur point d'attention, et s'ils attendent une règle périopératoire." },
  { kind: "drugClasses", label: "Classes", help: "Ce qu'implique toute une classe (préfixe ATC) : ISRS, opioïdes, corticoïdes… Une règle est attendue pour chaque traitement sauf si sa classe dit le contraire." },
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
  return (item as ConditionItem | AllergenItem | DrugClassItem).label;
}

function hintOf(kind: CatalogKind, item: AnyItem): string {
  switch (kind) {
    case "conditions": {
      const c = item as ConditionItem;
      return [SYSTEM_LABELS[c.system], c.asa ? `ASA ${c.asa}` : "", c.attention || c.attentionIf ? "point d'attention" : "", c.needsRule ? "règle attendue" : ""].filter(Boolean).join(" · ");
    }
    case "allergens":
      return (item as AllergenItem).keywords.slice(0, 4).join(", ");
    case "surgeries": {
      const s = item as SurgeryItem;
      return [s.category, SURGERY_GRADES.find((g) => g.code === s.grade)?.label.toLowerCase(), s.position].filter(Boolean).join(" · ");
    }
    case "medications":
      return [(item as MedicationItem).atc, (item as MedicationItem).brands?.slice(0, 2).join(", ")].filter(Boolean).join(" · ");
    case "drugClasses":
      return (item as DrugClassItem).atc;
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
      <AttentionEditor value={item.attention} onChange={(attention) => set({ attention })} />
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip pressed={!!item.needsRule} onChange={(needsRule) => set({ needsRule })} className="min-h-9 text-xs">
          Sa prise en charge doit venir d&apos;une règle
        </ToggleChip>
        <ToggleChip pressed={!!item.female} onChange={(female) => set({ female })} className="min-h-9 text-xs">
          Femmes seulement
        </ToggleChip>
      </div>
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
    </div>
  );
}

function SurgeryForm({ item, onChange }: { item: SurgeryItem; onChange: (i: SurgeryItem) => void }) {
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

function NeedsRule({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <div className="space-y-1">
      <FieldLabel>Règle périopératoire attendue</FieldLabel>
      <ChipGroup
        size="sm"
        options={[
          { code: "default" as const, label: "Par défaut" },
          { code: "yes" as const, label: "Oui" },
          { code: "no" as const, label: "Non" },
        ]}
        value={value === undefined ? "default" : value ? "yes" : "no"}
        onChange={(v) => onChange(v === "yes" ? true : v === "no" ? false : undefined)}
      />
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
        <Line label="Code ATC">
          <Input className="h-9 uppercase" value={item.atc} onChange={(e) => set({ atc: e.target.value.toUpperCase().trim() })} placeholder="ex. B01AF01" />
        </Line>
        <Line label="Marques (virgules)" className="sm:col-span-2">
          <Input className="h-9" defaultValue={(item.brands ?? []).join(", ")} onChange={(e) => set({ brands: list(e.target.value) })} />
        </Line>
        <Line label="Antécédent impliqué">
          <ImpliesSelect value={item.implies} onChange={(implies) => set({ implies })} />
        </Line>
        <NeedsRule value={item.needsRule} onChange={(needsRule) => set({ needsRule })} />
      </div>
      <AttentionEditor value={item.attention} onChange={(attention) => set({ attention })} />
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
    </div>
  );
}

function ItemForm({ kind, item, onChange }: { kind: CatalogKind; item: AnyItem; onChange: (i: AnyItem) => void }) {
  switch (kind) {
    case "conditions":
      return <ConditionForm item={item as ConditionItem} onChange={onChange} />;
    case "allergens":
      return <AllergenForm item={item as AllergenItem} onChange={onChange} />;
    case "surgeries":
      return <SurgeryForm item={item as SurgeryItem} onChange={onChange} />;
    case "medications":
      return <MedicationForm item={item as MedicationItem} onChange={onChange} />;
    case "drugClasses":
      return <DrugClassForm item={item as DrugClassItem} onChange={onChange} />;
  }
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function SettingsView() {
  const { catalogs, overrides, save } = useCatalogs();
  const { toast } = useToast();
  const [kind, setKind] = useState<CatalogKind>("conditions");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: AnyItem; isNew: boolean } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const defaults = DEFAULT_CATALOGS[kind] as AnyItem[];
  const defaultIds = useMemo(() => new Set(defaults.map((d) => d.id)), [defaults]);
  const o = (overrides[kind] ?? emptyOverrides()) as CatalogOverrides<AnyItem>;
  const items = catalogs[kind] as AnyItem[];
  const words = (x: AnyItem) => {
    const extra = kind === "conditions" ? ((x as ConditionItem).keywords ?? []) : kind === "allergens" ? (x as AllergenItem).keywords : kind === "surgeries" ? ((x as SurgeryItem).aka ?? []) : kind === "medications" ? [(x as MedicationItem).atc, ...((x as MedicationItem).brands ?? [])] : [(x as DrugClassItem).atc];
    return [labelOf(kind, x), ...extra];
  };
  const shown = query.trim() ? searchItems(items, query, words, 200) : items;
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
          <ItemForm kind={kind} item={it} onChange={(item) => setEditing({ ...editing, item })} />
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
      </div>
      <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface">
        {shown.map((it) => {
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
              </button>
            </li>
          );
        })}
      </ul>
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
