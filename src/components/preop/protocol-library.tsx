"use client";

import { useState } from "react";
import { ArrowLeft, Copy, FilePlus2, Library, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ChipGroup, EmptyState } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, NumberField, Panel, TextArea } from "@/components/preop/ui";
import { PlanEditor } from "@/components/preop/plan-editor";
import type { ProtocolInput } from "@/components/preop/use-protocols";
import { OPERATION_CATEGORIES, operationCategoryLabel } from "@/lib/carnet/referentiel";
import { emptyProtocolContent, type BodyData, type Protocol } from "@/lib/preop/protocols";
import { REFERENCE_PROTOCOLS } from "@/lib/preop/reference-protocols";
import { protocolQuestion } from "@/lib/preop/rules/question";
import { AiQuestionPanel } from "@/components/preop/ai-assistant";
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
  const [proposal, setProposal] = useState<{ text: string; tool: string } | null>(null);
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
        <p className="text-xs text-foreground-subtle">Les doses viennent des sources notées ici (les vôtres, ou celles d&apos;un protocole de référence) : PreOx calcule pour le patient à partir de ce qui est écrit.</p>
      </Panel>
      {(p.surgery.trim() || p.name.trim()) && (
        <Panel title="Proposition documentée (assistant IA)">
          <AiQuestionPanel
            mode="protocol"
            {...protocolQuestion({ surgery: p.surgery.trim() || p.name.trim(), techniques: p.content.techniques })}
            onAnswer={(text, used) => setProposal({ text, tool: used })}
          />
          {proposal && (
            <div className="space-y-2">
              <p className="text-xs text-foreground-subtle">Proposition de {proposal.tool} : à lire et à recopier dans les champs après vérification des sources ; rien n&apos;est rempli automatiquement.</p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-surface-muted p-3 text-xs text-foreground">{proposal.text}</pre>
              <Button variant="secondary" size="sm" onClick={() => set({ source: [p.source, `Proposition ${proposal.tool} du ${new Date().toLocaleDateString("fr-BE")} (à vérifier)`].filter(Boolean).join(" ; ") })}>
                Noter la proposition dans les sources
              </Button>
            </div>
          )}
        </Panel>
      )}

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
  const [importing, setImporting] = useState(false);

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
  const missing = REFERENCE_PROTOCOLS.filter((r) => !protocols.some((p) => p.id === r.id));

  async function importReferences() {
    setImporting(true);
    let done = 0;
    try {
      for (const r of missing) {
        await onSave(r);
        done++;
      }
      toast(`${done} protocole(s) de référence ajouté(s) : adaptez-les au protocole de votre service.`, { variant: "success" });
    } catch (err) {
      toast(`${done} ajouté(s) ; ${err instanceof Error ? err.message : "échec"}`, { variant: "error" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint/50 p-3">
          <p className="text-sm font-medium text-foreground">Protocoles de référence : {missing.length} à ajouter</p>
          <p className="text-xs text-foreground-muted">
            Toutes les spécialités, adulte et enfant : chaque intervention du catalogue trouve le sien. Doses tirées des cours belges (EIUA : Dubois, Roelants, Hardy), du manuel et des recommandations
            (PROSPECT, ERAS, ESC), source notée sur chaque protocole : un point de départ à adapter au protocole de votre service.
          </p>
          <details className="text-xs text-foreground-muted">
            <summary className="cursor-pointer text-primary">Voir la liste</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {missing.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
          </details>
          <Button size="sm" disabled={importing} onClick={importReferences}>
            <Library className="h-3.5 w-3.5" /> {importing ? "Ajout…" : "Ajouter les protocoles de référence"}
          </Button>
        </div>
      )}
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
