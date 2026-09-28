"use client";

import { DEFAULT_CHECKLIST, type ChecklistItem } from "@/lib/preop/checklist";
import { useState } from "react";
import { ArrowLeft, Check, Copy, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, ToggleChip } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, Panel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { MonitoringCard } from "@/components/preop/monitoring-card";
import { InfusionFields } from "@/components/preop/plan-parts";
import { MATERIAL_GROUPS, POSITIONS, RISK_LIBRARY, TARGET_GROUPS, type CatalogGroup, type RiskTemplate } from "@/lib/preop/plan-catalog";
import { MONITORING, MONITORING_GROUPS, type MonitoringItem, type MonitoringGroup } from "@/lib/preop/monitoring";
import { CRISIS_CATEGORIES, crises, type CrisisCategory, type DoseSpec } from "@/lib/preop/crises";
import { COMPLICATION_TYPES } from "@/lib/preop/dossier";
import { checklistOf, crisesOf, materialGroupsOf, monitoringOf, positionsOf, pumpsOf, restored, riskLibraryOf, targetGroupsOf, templateOf, withChange, withoutItem, type CrisisTemplate, type PlanLists } from "@/lib/preop/plan-lists";
import { cn } from "@/lib/utils";

type Tab = "targets" | "material" | "monitoring" | "risks" | "crises" | "complications" | "positions" | "checklist";

const TABS: { code: Tab; label: string; help: string }[] = [
  { code: "targets", label: "Cibles", help: "Les cibles à cocher dans un protocole ou une préparation : ajoutez les vôtres, changez les valeurs, retirez ce que vous n'utilisez pas." },
  { code: "material", label: "Monitorage et matériel", help: "Le monitorage et le matériel à cocher dans un plan." },
  { code: "monitoring", label: "Fiches de monitorage", help: "Valeurs normales, cibles, à quoi ça sert, comment ça marche, pièges : affichées en préparation et au bloc quand le plan retient ce monitorage." },
  { code: "risks", label: "Risques", help: "La bibliothèque des risques proposés dans un plan (pourquoi, prévention, conduite à tenir, source) : ajoutez les vôtres, adaptez-les, dupliquez-les. Un risque écrit dans un plan peut aussi y être gardé." },
  { code: "crises", label: "Urgences", help: "Les procédures d'urgence et complications générales du bloc : modifiez les étapes et les doses (par kilo, fixes ou débit : recalculées pour chaque patient), ajoutez les vôtres, retirez celles qui ne servent pas." },
  { code: "positions", label: "Positions et pompes", help: "Les positions proposées pour l'intervention (une par ligne : « Position | points d'attention ») et les réglages par défaut de la PCEA et du cathéter périnerveux en post-opératoire." },
  { code: "complications", label: "Complications", help: "La liste des complications que l'on note au bloc (et qui partent dans la transmission)." },
  { code: "checklist", label: "Check-list", help: "La check-list préanesthésique cochée au bloc : une vérification par ligne, chaque jour (ou après un déplacement de la machine) et avant chaque patient." },
];

const lines = (v: string) =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const slug = (t: string) => `u-${t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;

function useSaver() {
  const { lists, saveLists } = useCatalogs();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const commit = async (next: PlanLists, message: string) => {
    setBusy(true);
    try {
      await saveLists(next);
      toast(message, { variant: "success" });
    } catch (err) {
      toast(`${err instanceof Error ? err.message : "Synchronisation impossible"} — gardé sur cet appareil.`, { variant: "error" });
    } finally {
      setBusy(false);
    }
  };
  return { lists, commit, busy };
}

/** Groups of lines to tick (targets, monitoring and equipment): edit freely, then save. */
function GroupsEditor({ kind }: { kind: "targets" | "material" }) {
  const { lists, commit, busy } = useSaver();
  const current = kind === "targets" ? targetGroupsOf(lists) : materialGroupsOf(lists);
  const defaults = kind === "targets" ? TARGET_GROUPS : MATERIAL_GROUPS;
  const custom = kind === "targets" ? lists.targetGroups : lists.materialGroups;
  const [draft, setDraft] = useState<CatalogGroup[]>(() => structuredClone(current));
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  const setGroup = (i: number, g: CatalogGroup) => setDraft(draft.map((x, j) => (j === i ? g : x)));
  const save = (groups: CatalogGroup[] | undefined, message: string) => commit(kind === "targets" ? { ...lists, targetGroups: groups } : { ...lists, materialGroups: groups }, message);
  return (
    <div className="space-y-3">
      {draft.map((g, i) => (
        <div key={g.id} className="space-y-2 rounded-[var(--radius-md)] border border-border p-2.5">
          <div className="flex items-center gap-1.5">
            <Input className="h-9 font-medium" value={g.label} onChange={(e) => setGroup(i, { ...g, label: e.target.value })} aria-label="Nom du groupe" />
            <Button size="icon" variant="ghost" onClick={() => setDraft([...draft.slice(0, i + 1), { ...structuredClone(g), id: slug(g.label), label: `${g.label} (copie)` }, ...draft.slice(i + 1)])} aria-label={`Dupliquer le groupe ${g.label}`}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setDraft(draft.filter((_, j) => j !== i))} aria-label={`Retirer le groupe ${g.label}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <ul className="space-y-1">
            {g.items.map((it, k) => (
              <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Input className="h-8 text-sm" value={it.label} onChange={(e) => setGroup(i, { ...g, items: g.items.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} aria-label="Ligne" />
                <Input className="hidden h-8 text-xs sm:block" value={it.hint ?? ""} placeholder="Aide (au survol)" onChange={(e) => setGroup(i, { ...g, items: g.items.map((x, m) => (m === k ? { ...x, hint: e.target.value || undefined } : x)) })} aria-label="Aide" />
                <Button size="icon" variant="ghost" onClick={() => setGroup(i, { ...g, items: g.items.filter((_, m) => m !== k) })} aria-label={`Retirer ${it.label}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" onClick={() => setGroup(i, { ...g, items: [...g.items, { label: "" }] })}>
            <Plus className="h-3.5 w-3.5" /> Ligne
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setDraft([...draft, { id: slug("groupe"), label: "Nouveau groupe", items: [{ label: "" }] }])}>
          <Plus className="h-4 w-4" /> Groupe
        </Button>
        <Button
          disabled={!dirty || busy}
          onClick={() => {
            const clean = draft.map((g) => ({ ...g, label: g.label.trim() || "Sans nom", items: g.items.filter((x) => x.label.trim()).map((x) => ({ ...x, label: x.label.trim() })) })).filter((g) => g.items.length);
            setDraft(clean);
            void save(clean, "Listes enregistrées.");
          }}
        >
          <Check className="h-4 w-4" /> Enregistrer
        </Button>
        {custom && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (!confirm("Revenir aux listes de PreOx ? Vos changements seront perdus.")) return;
              setDraft(structuredClone(defaults));
              void save(undefined, "Listes de PreOx rétablies.");
            }}
          >
            <RotateCcw className="h-4 w-4" /> Listes de PreOx
          </Button>
        )}
      </div>
    </div>
  );
}

function blankMonitoring(): MonitoringItem {
  return { id: slug("monitorage"), label: "", group: "base", words: [], values: [{ label: "", normal: "" }], what: "", how: "" };
}

function MonitoringForm({ item, onChange }: { item: MonitoringItem; onChange: (m: MonitoringItem) => void }) {
  const set = (patch: Partial<MonitoringItem>) => onChange({ ...item, ...patch });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <FieldLabel>Nom</FieldLabel>
          <Input value={item.label} onChange={(e) => set({ label: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Groupe</FieldLabel>
          <Select value={item.group} onChange={(e) => set({ group: e.target.value as MonitoringGroup })}>
            {MONITORING_GROUPS.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="block space-y-1">
        <FieldLabel>Reconnu dans le plan par (mots, virgules)</FieldLabel>
        <Input defaultValue={item.words.join(", ")} onChange={(e) => set({ words: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="ex. swan, papo" />
      </label>
      <div className="space-y-1">
        <FieldLabel>Valeurs</FieldLabel>
        {item.values.map((v, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input className="h-8 text-sm" value={v.label} placeholder="Valeur" onChange={(e) => set({ values: item.values.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <Input className="h-8 text-sm" value={v.normal} placeholder="Normale" onChange={(e) => set({ values: item.values.map((x, j) => (j === i ? { ...x, normal: e.target.value } : x)) })} />
            <Input className="h-8 text-sm" value={v.target ?? ""} placeholder="Cible / seuil" onChange={(e) => set({ values: item.values.map((x, j) => (j === i ? { ...x, target: e.target.value || undefined } : x)) })} />
            <Button size="icon" variant="ghost" onClick={() => set({ values: item.values.filter((_, j) => j !== i) })} aria-label="Retirer la valeur">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => set({ values: [...item.values, { label: "", normal: "" }] })}>
          <Plus className="h-3.5 w-3.5" /> Valeur
        </Button>
      </div>
      {(
        [
          ["what", "À quoi ça sert"],
          ["how", "Comment ça marche"],
          ["pitfalls", "Pièges"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="block space-y-1">
          <FieldLabel>{label}</FieldLabel>
          <textarea className="min-h-16 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" value={item[k] ?? ""} onChange={(e) => set({ [k]: e.target.value || (k === "pitfalls" ? undefined : "") } as Partial<MonitoringItem>)} />
        </label>
      ))}
      <label className="block space-y-1">
        <FieldLabel>Formules (une par ligne)</FieldLabel>
        <textarea className="min-h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 font-mono text-xs" defaultValue={(item.formulas ?? []).join("\n")} onChange={(e) => set({ formulas: lines(e.target.value).length ? lines(e.target.value) : undefined })} />
      </label>
      <label className="block space-y-1">
        <FieldLabel>Source</FieldLabel>
        <Input value={item.source ?? ""} onChange={(e) => set({ source: e.target.value || undefined })} />
      </label>
    </div>
  );
}

function MonitoringEditor() {
  const { lists, commit, busy } = useSaver();
  const [editing, setEditing] = useState<{ item: MonitoringItem; isDefault: boolean } | null>(null);
  const all = monitoringOf(lists);
  const hidden = MONITORING.filter((m) => lists.monitoring?.hidden.includes(m.id));
  if (editing)
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <MonitoringForm item={editing.item} onChange={(item) => setEditing({ ...editing, item })} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !editing.item.label.trim()}
            onClick={async () => {
              const item = { ...editing.item, values: editing.item.values.filter((v) => v.label.trim()) };
              await commit({ ...lists, monitoring: withChange(lists.monitoring, item, editing.isDefault) }, "Fiche enregistrée.");
              setEditing(null);
            }}
          >
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
          {editing.isDefault && lists.monitoring?.edited[editing.item.id] && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                await commit({ ...lists, monitoring: restored(lists.monitoring, editing.item.id) }, "Fiche de PreOx rétablie.");
                setEditing(null);
              }}
            >
              <RotateCcw className="h-4 w-4" /> Version de PreOx
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <div className="space-y-2">
      <Button onClick={() => setEditing({ item: blankMonitoring(), isDefault: false })}>
        <Plus className="h-4 w-4" /> Nouvelle fiche
      </Button>
      {MONITORING_GROUPS.map((g) => {
        const items = all.filter((m) => m.group === g.code);
        if (!items.length) return null;
        return (
          <div key={g.code} className="space-y-1">
            <p className="text-xs font-medium text-foreground-subtle">{g.label}</p>
            {items.map((m) => {
              const isDefault = MONITORING.some((x) => x.id === m.id);
              return (
                <div key={m.id} className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <MonitoringCard m={m} />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ item: structuredClone(m), isDefault })} aria-label={`Modifier ${m.label}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ item: { ...structuredClone(m), id: slug(m.label), label: `${m.label} (copie)` }, isDefault: false })} aria-label={`Dupliquer ${m.label}`}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={busy} onClick={() => void commit({ ...lists, monitoring: withoutItem(lists.monitoring, m.id, isDefault) }, "Fiche retirée.")} aria-label={`Retirer ${m.label}`}>
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        );
      })}
      {hidden.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-primary">Fiches retirées ({hidden.length})</summary>
          <ul className="mt-1 space-y-1">
            {hidden.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                {m.label}
                <Button size="sm" variant="ghost" onClick={() => void commit({ ...lists, monitoring: restored(lists.monitoring, m.id) }, "Fiche remise.")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Remettre
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const SPEC_KINDS: { code: DoseSpec["kind"] | "none"; label: string }[] = [
  { code: "none", label: "Pas de dose" },
  { code: "perKg", label: "Par kilo" },
  { code: "rate", label: "Débit /kg/min" },
  { code: "fixed", label: "Dose fixe" },
];

function StepEditor({ step, onChange, onRemove }: { step: CrisisTemplate["steps"][number]; onChange: (s: CrisisTemplate["steps"][number]) => void; onRemove: () => void }) {
  const kind = step.dose?.spec.kind ?? "none";
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const setSpec = (spec: DoseSpec) => onChange({ ...step, dose: { drug: step.dose?.drug ?? "", route: step.dose?.route, spec } });
  return (
    <li className="space-y-1.5 rounded-[var(--radius-md)] border border-border p-2">
      <div className="flex items-start gap-1.5">
        <textarea className="min-h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-2 py-1.5 text-sm" value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} />
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Retirer l'étape">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleChip pressed={!!step.urgent} onChange={(urgent) => onChange({ ...step, urgent: urgent || undefined })} className="min-h-8 text-xs">
          Immédiat
        </ToggleChip>
        <ChipGroup
          size="sm"
          options={SPEC_KINDS}
          value={kind}
          onChange={(v) => {
            if (!v || v === "none") onChange({ ...step, dose: undefined });
            else if (v === "fixed") setSpec({ kind: "fixed", dose: step.dose?.spec.kind === "fixed" ? step.dose.spec.dose : "" });
            else setSpec({ kind: v, min: 0, max: 0, unit: "mg" });
          }}
        />
      </div>
      {step.dose && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-6">
          <Input className="col-span-2 h-8 text-sm" value={step.dose.drug} placeholder="Produit" onChange={(e) => onChange({ ...step, dose: { ...step.dose!, drug: e.target.value } })} />
          <Input className="h-8 text-sm" value={step.dose.route ?? ""} placeholder="Voie" onChange={(e) => onChange({ ...step, dose: { ...step.dose!, route: e.target.value || undefined } })} />
          {step.dose.spec.kind === "fixed" ? (
            <Input className="col-span-2 h-8 text-sm sm:col-span-3" value={step.dose.spec.dose} placeholder="Dose (ex. 1 mg)" onChange={(e) => setSpec({ kind: "fixed", dose: e.target.value })} />
          ) : (
            <>
              <Input className="h-8 text-sm" inputMode="decimal" defaultValue={String(step.dose.spec.min)} placeholder="Min" onChange={(e) => setSpec({ ...(step.dose!.spec as Extract<DoseSpec, { kind: "perKg" | "rate" }>), min: num(e.target.value) })} />
              <Input className="h-8 text-sm" inputMode="decimal" defaultValue={String(step.dose.spec.max)} placeholder="Max" onChange={(e) => setSpec({ ...(step.dose!.spec as Extract<DoseSpec, { kind: "perKg" | "rate" }>), max: num(e.target.value) })} />
              <Input className="h-8 text-sm" value={step.dose.spec.unit} placeholder="Unité" onChange={(e) => setSpec({ ...(step.dose!.spec as Extract<DoseSpec, { kind: "perKg" | "rate" }>), unit: e.target.value })} />
              <p className="col-span-2 text-xs text-foreground-muted sm:col-span-6">
                Min et max en {step.dose.spec.unit || "unité"}/kg{step.dose.spec.kind === "rate" ? "/min" : ""} : la dose est calculée au poids du patient.
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function CrisisForm({ t, onChange }: { t: CrisisTemplate; onChange: (t: CrisisTemplate) => void }) {
  const set = (patch: Partial<CrisisTemplate>) => onChange({ ...t, ...patch });
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <FieldLabel>Titre</FieldLabel>
        <Input value={t.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <div className="space-y-1">
        <FieldLabel>Catégorie</FieldLabel>
        <ChipGroup size="sm" options={CRISIS_CATEGORIES} value={t.category} onChange={(v) => v && set({ category: v as CrisisCategory })} />
      </div>
      <label className="block space-y-1">
        <FieldLabel>Reconnaître (une ligne par signe)</FieldLabel>
        <textarea className="min-h-16 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" defaultValue={t.recognise.join("\n")} onChange={(e) => set({ recognise: lines(e.target.value) })} />
      </label>
      <div className="space-y-1">
        <FieldLabel>Étapes, dans l&apos;ordre (doses recalculées pour chaque patient)</FieldLabel>
        <ol className="space-y-1.5">
          {t.steps.map((s, i) => (
            <StepEditor key={i} step={s} onChange={(next) => set({ steps: t.steps.map((x, j) => (j === i ? next : x)) })} onRemove={() => set({ steps: t.steps.filter((_, j) => j !== i) })} />
          ))}
        </ol>
        <Button size="sm" variant="ghost" onClick={() => set({ steps: [...t.steps, { text: "" }] })}>
          <Plus className="h-3.5 w-3.5" /> Étape
        </Button>
      </div>
      <label className="block space-y-1">
        <FieldLabel>Ensuite (une ligne par point)</FieldLabel>
        <textarea className="min-h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" defaultValue={(t.after ?? []).join("\n")} onChange={(e) => set({ after: lines(e.target.value).length ? lines(e.target.value) : undefined })} />
      </label>
      <label className="block space-y-1">
        <FieldLabel>Mots de recherche (virgules)</FieldLabel>
        <Input defaultValue={t.words.join(", ")} onChange={(e) => set({ words: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
      </label>
      <label className="block space-y-1">
        <FieldLabel>Source</FieldLabel>
        <Input value={t.source} onChange={(e) => set({ source: e.target.value })} />
      </label>
    </div>
  );
}

function CrisesEditor() {
  const { lists, commit, busy } = useSaver();
  const [editing, setEditing] = useState<{ t: CrisisTemplate; isDefault: boolean } | null>(null);
  const defaults = crises({});
  const shown = crisesOf(lists, {});
  const hidden = defaults.filter((c) => lists.crises?.hidden.includes(c.id));
  if (editing)
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <CrisisForm t={editing.t} onChange={(t) => setEditing({ ...editing, t })} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !editing.t.title.trim()}
            onClick={async () => {
              const t = { ...editing.t, steps: editing.t.steps.filter((s) => s.text.trim()) };
              await commit({ ...lists, crises: withChange(lists.crises, t, editing.isDefault) }, "Procédure enregistrée.");
              setEditing(null);
            }}
          >
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
          {editing.isDefault && lists.crises?.edited[editing.t.id] && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                await commit({ ...lists, crises: restored(lists.crises, editing.t.id) }, "Procédure de PreOx rétablie.");
                setEditing(null);
              }}
            >
              <RotateCcw className="h-4 w-4" /> Version de PreOx
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <div className="space-y-2">
      <Button onClick={() => setEditing({ t: { id: slug("urgence"), title: "", category: "cardio", words: [], recognise: [], steps: [{ text: "" }], source: "Protocole du service" }, isDefault: false })}>
        <Plus className="h-4 w-4" /> Nouvelle procédure
      </Button>
      {CRISIS_CATEGORIES.map((cat) => {
        const items = shown.filter((c) => c.category === cat.code);
        if (!items.length) return null;
        return (
          <div key={cat.code} className="space-y-1">
            <p className="text-xs font-medium text-foreground-subtle">{cat.label}</p>
            <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
              {items.map((c) => {
                const isDefault = defaults.some((x) => x.id === c.id);
                const edited = !!lists.crises?.edited[c.id];
                return (
                  <li key={c.id} className="flex items-center gap-1 px-2.5 py-1.5 text-sm">
                    <span className="min-w-0 flex-1">
                      {c.title}
                      {(edited || !isDefault) && <span className="ml-1.5 rounded bg-accent-tint px-1 text-[10px] text-accent">{isDefault ? "modifiée" : "à vous"}</span>}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ t: isDefault && !edited ? templateOf(c) : structuredClone(lists.crises?.edited[c.id] ?? lists.crises!.added.find((a) => a.id === c.id)!), isDefault })} aria-label={`Modifier ${c.title}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const t = isDefault && !edited ? templateOf(c) : structuredClone(lists.crises?.edited[c.id] ?? lists.crises!.added.find((a) => a.id === c.id)!);
                        setEditing({ t: { ...t, id: slug(c.title), title: `${c.title} (copie)` }, isDefault: false });
                      }}
                      aria-label={`Dupliquer ${c.title}`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={busy} onClick={() => void commit({ ...lists, crises: withoutItem(lists.crises, c.id, isDefault) }, "Procédure retirée.")} aria-label={`Retirer ${c.title}`}>
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {hidden.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-primary">Procédures retirées ({hidden.length})</summary>
          <ul className="mt-1 space-y-1">
            {hidden.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                {c.title}
                <Button size="sm" variant="ghost" onClick={() => void commit({ ...lists, crises: restored(lists.crises, c.id) }, "Procédure remise.")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Remettre
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ComplicationsEditor() {
  const { lists, commit, busy } = useSaver();
  const [text, setText] = useState((lists.complications ?? [...COMPLICATION_TYPES]).join("\n"));
  return (
    <div className="space-y-2">
      <textarea className="min-h-64 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Complications, une par ligne" />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void commit({ ...lists, complications: lines(text).length ? [...new Set(lines(text))] : undefined }, "Complications enregistrées.")}>
          <Check className="h-4 w-4" /> Enregistrer
        </Button>
        {lists.complications && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setText(COMPLICATION_TYPES.join("\n"));
              void commit({ ...lists, complications: undefined }, "Liste de PreOx rétablie.");
            }}
          >
            <RotateCcw className="h-4 w-4" /> Liste de PreOx
          </Button>
        )}
      </div>
    </div>
  );
}

function ChecklistEditor() {
  const { lists, commit, busy } = useSaver();
  const current = checklistOf(lists);
  const [daily, setDaily] = useState(current.daily.map((i) => i.label).join("\n"));
  const [perCase, setPerCase] = useState(current.perCase.map((i) => i.label).join("\n"));
  // A line kept as it was keeps its id (and the ticks already given in open dossiers).
  const toItems = (text: string, before: ChecklistItem[]) => [...new Set(lines(text))].map((label) => ({ id: before.find((i) => i.label === label)?.id ?? slug(label), label }));
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <FieldLabel>Chaque jour (ou après un déplacement de la machine, un changement d&apos;évaporateur)</FieldLabel>
        <textarea className="min-h-48 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" value={daily} onChange={(e) => setDaily(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <FieldLabel>Avant chaque patient</FieldLabel>
        <textarea className="min-h-48 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" value={perCase} onChange={(e) => setPerCase(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void commit({ ...lists, checklist: { daily: toItems(daily, current.daily), perCase: toItems(perCase, current.perCase) } }, "Check-list enregistrée.")}>
          <Check className="h-4 w-4" /> Enregistrer
        </Button>
        {lists.checklist && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDaily(DEFAULT_CHECKLIST.daily.map((i) => i.label).join("\n"));
              setPerCase(DEFAULT_CHECKLIST.perCase.map((i) => i.label).join("\n"));
              void commit({ ...lists, checklist: undefined }, "Check-list de PreOx rétablie.");
            }}
          >
            <RotateCcw className="h-4 w-4" /> Liste de PreOx
          </Button>
        )}
      </div>
    </div>
  );
}

function PositionsPumpsEditor() {
  const { lists, commit, busy } = useSaver();
  const toText = (ps: { label: string; hint: string }[]) => ps.map((p) => (p.hint ? `${p.label} | ${p.hint}` : p.label)).join("\n");
  const [text, setText] = useState(toText(positionsOf(lists)));
  const [pumps, setPumps] = useState(pumpsOf(lists));
  const parsed = lines(text).map((l) => {
    const [label, ...hint] = l.split("|");
    return { label: label.trim(), hint: hint.join("|").trim() };
  });
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <FieldLabel>Positions (« Position | points d&apos;attention »)</FieldLabel>
        <textarea className="min-h-48 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Positions, une par ligne" />
      </div>
      <div className="space-y-1 rounded-[var(--radius-md)] border border-border p-2.5">
        <FieldLabel>PCEA par défaut</FieldLabel>
        <InfusionFields value={pumps.pcea} onChange={(pcea) => setPumps({ ...pumps, pcea })} />
      </div>
      <div className="space-y-1 rounded-[var(--radius-md)] border border-border p-2.5">
        <FieldLabel>Cathéter périnerveux par défaut</FieldLabel>
        <InfusionFields value={pumps.perineural} onChange={(perineural) => setPumps({ ...pumps, perineural })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void commit({ ...lists, positions: parsed.length ? parsed : undefined, pumps }, "Positions et pompes enregistrées.")}>
          <Check className="h-4 w-4" /> Enregistrer
        </Button>
        {(lists.positions || lists.pumps) && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setText(toText(POSITIONS));
              setPumps(pumpsOf({}));
              void commit({ ...lists, positions: undefined, pumps: undefined }, "Réglages de PreOx rétablis.");
            }}
          >
            <RotateCcw className="h-4 w-4" /> Réglages de PreOx
          </Button>
        )}
      </div>
    </div>
  );
}

function RiskForm({ t, onChange }: { t: RiskTemplate; onChange: (t: RiskTemplate) => void }) {
  const { lists } = useCatalogs();
  const set = (patch: Partial<RiskTemplate>) => onChange({ ...t, ...patch });
  const area = (label: string, value: string | undefined, apply: (v: string) => void) => (
    <label className="block space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <textarea className="min-h-16 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" value={value ?? ""} onChange={(e) => apply(e.target.value)} />
    </label>
  );
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <FieldLabel>Risque</FieldLabel>
        <Input value={t.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="block space-y-1">
        <FieldLabel>Proposé quand le plan ou le patient contient (mots, virgules)</FieldLabel>
        <Input defaultValue={t.words.join(", ")} onChange={(e) => set({ words: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="ex. rachi, cesarienne" />
      </label>
      {area("Pourquoi (mécanisme, terrain)", t.why, (v) => set({ why: v || undefined }))}
      {area("Prévention", t.prevention, (v) => set({ prevention: v || undefined }))}
      {area("Conduite à tenir", t.conduct, (v) => set({ conduct: v }))}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <FieldLabel>Source</FieldLabel>
          <Input value={t.source ?? ""} onChange={(e) => set({ source: e.target.value || undefined })} />
        </label>
        <label className="block space-y-1">
          <FieldLabel>Fiche de crise liée (bloc)</FieldLabel>
          <Select value={t.crisis ?? ""} onChange={(e) => set({ crisis: e.target.value || undefined })}>
            <option value="">Aucune</option>
            {crisesOf(lists).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  );
}

function RisksLibraryEditor() {
  const { lists, commit, busy } = useSaver();
  const [editing, setEditing] = useState<{ t: RiskTemplate; isDefault: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const fold = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const all = riskLibraryOf(lists);
  const shown = query.trim() ? all.filter((r) => fold(`${r.title} ${r.words.join(" ")}`).includes(fold(query.trim()))) : all;
  const hidden = RISK_LIBRARY.filter((r) => lists.risks?.hidden.includes(r.id));
  if (editing)
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <RiskForm t={editing.t} onChange={(t) => setEditing({ ...editing, t })} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !editing.t.title.trim()}
            onClick={async () => {
              await commit({ ...lists, risks: withChange(lists.risks, { ...editing.t, title: editing.t.title.trim() }, editing.isDefault) }, "Risque enregistré.");
              setEditing(null);
            }}
          >
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
          {editing.isDefault && lists.risks?.edited[editing.t.id] && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                await commit({ ...lists, risks: restored(lists.risks, editing.t.id) }, "Risque de PreOx rétabli.");
                setEditing(null);
              }}
            >
              <RotateCcw className="h-4 w-4" /> Version de PreOx
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-0 flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Chercher un risque (${all.length})`} />
        <Button onClick={() => setEditing({ t: { id: slug("risque"), title: "", words: [], conduct: "", source: "Protocole du service" }, isDefault: false })}>
          <Plus className="h-4 w-4" /> Nouveau risque
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
        {shown.map((r) => {
          const isDefault = RISK_LIBRARY.some((x) => x.id === r.id);
          const edited = !!lists.risks?.edited[r.id];
          return (
            <li key={r.id} className="flex items-center gap-1 px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {r.title}
                  {(edited || !isDefault) && <span className="ml-1.5 rounded bg-accent-tint px-1 text-[10px] text-accent">{isDefault ? "modifié" : "à vous"}</span>}
                </span>
                <span className="block truncate text-[11px] text-foreground-subtle">{r.conduct}</span>
              </span>
              <Button size="icon" variant="ghost" onClick={() => setEditing({ t: structuredClone(r), isDefault })} aria-label={`Modifier ${r.title}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditing({ t: { ...structuredClone(r), id: slug(r.title), title: `${r.title} (copie)` }, isDefault: false })} aria-label={`Dupliquer ${r.title}`}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" disabled={busy} onClick={() => void commit({ ...lists, risks: withoutItem(lists.risks, r.id, isDefault) }, "Risque retiré de la bibliothèque.")} aria-label={`Retirer ${r.title}`}>
                <EyeOff className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      {hidden.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-primary">Risques retirés ({hidden.length})</summary>
          <ul className="mt-1 space-y-1">
            {hidden.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                {r.title}
                <Button size="sm" variant="ghost" onClick={() => void commit({ ...lists, risks: restored(lists.risks, r.id) }, "Risque remis.")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Remettre
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Réglages › Plan et bloc. */
export function PlanListsSettings() {
  const [tab, setTab] = useState<Tab>("targets");
  const info = TABS.find((t) => t.code === tab)!;
  return (
    <Panel title="Plan et bloc">
      <nav className="flex gap-1 overflow-x-auto" aria-label="Listes du plan et du bloc">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            onClick={() => setTab(t.code)}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", tab === t.code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted")}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <p className="text-sm text-foreground-muted">{info.help} L&apos;ordre des sections du bloc se change au bloc (« Réorganiser »).</p>
      {tab === "targets" && <GroupsEditor key="targets" kind="targets" />}
      {tab === "material" && <GroupsEditor key="material" kind="material" />}
      {tab === "monitoring" && <MonitoringEditor />}
      {tab === "risks" && <RisksLibraryEditor />}
      {tab === "crises" && <CrisesEditor />}
      {tab === "complications" && <ComplicationsEditor />}
      {tab === "positions" && <PositionsPumpsEditor />}
      {tab === "checklist" && <ChecklistEditor />}
    </Panel>
  );
}
