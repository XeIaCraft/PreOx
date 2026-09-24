"use client";

import { useState } from "react";
import { ArrowLeft, Copy, FilePlus2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, EmptyState } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, NumberField, Panel, TextArea } from "@/components/preop/ui";
import { PlanEditor } from "@/components/preop/plan-editor";
import type { ProtocolInput } from "@/components/preop/use-protocols";
import { OPERATION_CATEGORIES, operationCategoryLabel } from "@/lib/carnet/referentiel";
import { emptyProtocolContent, type BodyData, type Protocol } from "@/lib/preop/protocols";
import { TECHNIQUES } from "@/lib/preop/rules/types";
import type { Sex } from "@/lib/preop/scores";

function blankProtocol(): ProtocolInput {
  return { id: crypto.randomUUID(), name: "", surgery: "", operation_category: "", hospital: "", content: emptyProtocolContent(), source: "" };
}

function ProtocolEditor({ initial, onSave, onCancel }: { initial: ProtocolInput; onSave: (p: ProtocolInput) => Promise<void>; onCancel: () => void }) {
  const [p, setP] = useState<ProtocolInput>(initial);
  const [sample, setSample] = useState<BodyData>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ProtocolInput>) => setP((x) => ({ ...x, ...patch }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" /> Protocoles
        </Button>
        <Button
          disabled={saving || !p.name.trim()}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onSave(p);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Enregistrement impossible.");
            } finally {
              setSaving(false);
            }
          }}
        >
          Enregistrer le protocole
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Panel title="Protocole">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          <label className="block space-y-1">
            <FieldLabel>Nom</FieldLabel>
            <Input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. PTG sous rachianesthésie" />
          </label>
          <label className="block space-y-1">
            <FieldLabel>Intervention(s) visée(s)</FieldLabel>
            <Input value={p.surgery} onChange={(e) => set({ surgery: e.target.value })} placeholder="ex. prothèse totale de genou" />
          </label>
          <label className="block space-y-1">
            <FieldLabel>Catégorie (carnet)</FieldLabel>
            <Select value={p.operation_category} onChange={(e) => set({ operation_category: e.target.value })}>
              <option value="">—</option>
              {OPERATION_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.short ?? c.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <FieldLabel>Hôpital (vide : tous)</FieldLabel>
            <Input value={p.hospital} onChange={(e) => set({ hospital: e.target.value })} placeholder="protocole local d'un hôpital" />
          </label>
        </div>
        <TextArea label="Sources (recommandation, protocole du service, RCP…)" value={p.source} onChange={(source) => set({ source })} placeholder="ex. Protocole du service 2025 ; SFAR/ESAIC…" />
        <p className="text-xs text-foreground-subtle">Les doses viennent de vos sources : PreOx ne pré-remplit rien, il calcule pour le patient à partir de ce que vous écrivez ici.</p>
      </Panel>

      <Panel title="Essayer les doses sur un patient type">
        <ChipGroup
          size="sm"
          options={[
            { code: "M" as Sex, label: "Homme" },
            { code: "F" as Sex, label: "Femme" },
          ]}
          value={sample.sex ?? null}
          onChange={(v) => setSample((s) => ({ ...s, sex: v ?? undefined }))}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField label="Poids" unit="kg" value={sample.weightKg} onChange={(v) => setSample((s) => ({ ...s, weightKg: v }))} />
          <NumberField label="Taille" unit="cm" value={sample.heightCm} onChange={(v) => setSample((s) => ({ ...s, heightCm: v }))} />
        </div>
      </Panel>

      <PlanEditor value={p.content} onChange={(content) => set({ content })} body={sample.weightKg ? sample : undefined} />
    </div>
  );
}

export function ProtocolLibrary({
  protocols,
  onSave,
  onRemove,
}: {
  protocols: Protocol[];
  onSave: (p: ProtocolInput) => Promise<Protocol>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<ProtocolInput | null>(null);
  const [query, setQuery] = useState("");

  if (editing) {
    return (
      <ProtocolEditor
        key={editing.id}
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={async (p) => {
          await onSave(p);
          toast("Protocole enregistré.", { variant: "success" });
          setEditing(null);
        }}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const shown = protocols.filter((p) => !q || [p.name, p.surgery, p.hospital].some((x) => x.toLowerCase().includes(q)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un protocole" className="min-w-0 flex-1" />
        <Button onClick={() => setEditing(blankProtocol())}>
          <FilePlus2 className="h-4 w-4" /> Nouveau protocole
        </Button>
      </div>
      {protocols.length === 0 ? (
        <EmptyState title="Aucun protocole">
          Un protocole = votre plan type pour une intervention (technique, produits et doses par kilo, cibles, matériel, risques, post-op). Il se copie dans le dossier d&apos;un patient la veille, où les doses se calculent.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
          {shown.map((p) => (
            <li key={p.id} className="space-y-1.5 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-foreground-subtle">
                    {[p.surgery, p.operation_category && operationCategoryLabel(p.operation_category), p.hospital || "tous hôpitaux"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label={`Modifier ${p.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing({ ...p, id: crypto.randomUUID(), name: `${p.name} (copie)` })} aria-label={`Dupliquer ${p.name}`}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer ${p.name}`}
                    onClick={async () => {
                      if (!confirm(`Supprimer le protocole « ${p.name} » ? Les dossiers qui l'ont utilisé gardent leur copie.`)) return;
                      try {
                        await onRemove(p.id);
                      } catch (err) {
                        toast(err instanceof Error ? err.message : "Suppression impossible.", { variant: "error" });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-foreground-muted">
                {[p.content.techniques.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.split(" (")[0]).join(" + "), `${p.content.drugs.length} produit(s)`, p.content.risks.length ? `${p.content.risks.length} risque(s)` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
