"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, History, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  updateFicheBlock,
  deleteFicheBlock,
  moveFicheBlock,
  getFicheBlockHistory,
  suggestMnemonicForBlock,
} from "@/app/apps/el-profesor/actions/extraction";
import { FlagsList } from "@/components/el-profesor/flags-list";
import { EditableCitations } from "@/components/el-profesor/editable-citations";
import { useToast } from "@/components/ui/toast";
import type { Citation, FicheBlock, Flag, ProtocolBlockContent, TableBlockContent, TextBlockContent } from "@/lib/el-profesor/types";
import type { ContentLogEntry } from "@/lib/el-profesor/content-log";

/** Lazily-loaded edit history — fetched only once the admin actually opens the <details>, since most blocks are never inspected. */
export function EditHistory({ targetId, fetcher }: { targetId: string; fetcher: (id: string) => Promise<ContentLogEntry[]> }) {
  const [entries, setEntries] = useState<ContentLogEntry[] | null>(null);

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open && entries === null) fetcher(targetId).then(setEntries);
  }

  return (
    <details className="mt-2" onToggle={handleToggle}>
      <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-foreground-subtle hover:text-foreground">
        <History className="h-3 w-3" /> Historique des modifications
      </summary>
      <div className="mt-1.5 space-y-1">
        {entries === null && <p className="text-[11px] text-foreground-subtle">Chargement…</p>}
        {entries?.length === 0 && <p className="text-[11px] text-foreground-subtle">Aucune modification enregistrée.</p>}
        {entries?.map((e) => (
          <p key={e.id} className="text-[11px] text-foreground-subtle">
            {new Date(e.createdAt).toLocaleString("fr-FR")} — {e.actorName} ({e.action})
          </p>
        ))}
      </div>
    </details>
  );
}

const IS_TEXT_BLOCK = new Set([
  "definition_mecanisme",
  "valeurs_seuils",
  "mnemotechnique",
  "perle_clinique",
  "piege_erreur",
  "formule",
  "texte_libre",
]);

function TableEditor({ content, onChange }: { content: TableBlockContent; onChange: (c: TableBlockContent) => void }) {
  const headers = content.headers ?? [];
  const rows = content.rows ?? [];

  function setHeader(i: number, value: string) {
    const next = [...headers];
    next[i] = value;
    onChange({ headers: next, rows });
  }
  function setCell(ri: number, ci: number, value: string) {
    const next = rows.map((r) => [...r]);
    next[ri][ci] = value;
    onChange({ headers, rows: next });
  }
  function addColumn() {
    onChange({ headers: [...headers, "Colonne"], rows: rows.map((r) => [...r, ""]) });
  }
  function removeColumn(ci: number) {
    onChange({ headers: headers.filter((_, i) => i !== ci), rows: rows.map((r) => r.filter((_, i) => i !== ci)) });
  }
  function addRow() {
    onChange({ headers, rows: [...rows, headers.map(() => "")] });
  }
  function removeRow(ri: number) {
    onChange({ headers, rows: rows.filter((_, i) => i !== ri) });
  }

  return (
    <div className="space-y-2">
      {/* Below sm: columns edited as a plain list, each row as a stacked
          card of labeled inputs — a dense multi-column grid of narrow
          inputs doesn't fit (or work) on a phone. */}
      <div className="space-y-3 sm:hidden">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Colonnes</p>
          {headers.map((h, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input value={h} onChange={(e) => setHeader(i, e.target.value)} className="h-8 text-xs" />
              <button type="button" onClick={() => removeColumn(i)} className="text-foreground-subtle hover:text-danger" aria-label="Supprimer la colonne">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addColumn}>
            <Plus className="h-3.5 w-3.5" /> Colonne
          </Button>
        </div>

        <div className="space-y-2">
          {rows.map((row, ri) => (
            <div key={ri} className="rounded-[var(--radius-sm)] border border-border p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Ligne {ri + 1}</p>
                <button type="button" onClick={() => removeRow(ri)} className="text-foreground-subtle hover:text-danger" aria-label="Supprimer la ligne">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {row.map((cell, ci) => (
                  <div key={ci}>
                    {headers[ci] && <p className="text-[11px] text-foreground-subtle">{headers[ci]}</p>}
                    <Input value={cell} onChange={(e) => setCell(ri, ci, e.target.value)} className="h-8 text-xs" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="border-b border-border p-1">
                  <div className="flex items-center gap-1">
                    <Input value={h} onChange={(e) => setHeader(i, e.target.value)} className="h-8 text-xs" />
                    <button type="button" onClick={() => removeColumn(i)} className="text-foreground-subtle hover:text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="border-b border-border p-1">
                <Button variant="ghost" size="icon" onClick={addColumn} aria-label="Ajouter une colonne">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border-b border-border p-1">
                    <Input value={cell} onChange={(e) => setCell(ri, ci, e.target.value)} className="h-8 text-xs" />
                  </td>
                ))}
                <td className="border-b border-border p-1">
                  <button type="button" onClick={() => removeRow(ri)} className="text-foreground-subtle hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" size="sm" onClick={addRow}>
        <Plus className="h-3.5 w-3.5" /> Ligne
      </Button>
    </div>
  );
}

function ProtocolEditor({ content, onChange }: { content: ProtocolBlockContent; onChange: (c: ProtocolBlockContent) => void }) {
  const steps = content.steps ?? [];

  function updateStep(i: number, patch: Partial<ProtocolBlockContent["steps"][number]>) {
    const next = steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange({ steps: next });
  }
  function addStep() {
    onChange({ steps: [...steps, { label: "", detail: "", condition: "" }] });
  }
  function removeStep(i: number) {
    onChange({ steps: steps.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="rounded-[var(--radius-sm)] border border-border p-2">
          <div className="flex items-center gap-2">
            <Input placeholder="Étape" value={step.label} onChange={(e) => updateStep(i, { label: e.target.value })} className="h-8 text-xs" />
            <button type="button" onClick={() => removeStep(i)} className="text-foreground-subtle hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Input
            placeholder="Détail"
            value={step.detail}
            onChange={(e) => updateStep(i, { detail: e.target.value })}
            className="mt-1.5 h-8 text-xs"
          />
          <Input
            placeholder="Condition (optionnel)"
            value={step.condition ?? ""}
            onChange={(e) => updateStep(i, { condition: e.target.value })}
            className="mt-1.5 h-8 text-xs"
          />
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={addStep}>
        <Plus className="h-3.5 w-3.5" /> Étape
      </Button>
    </div>
  );
}

export function BlockEditor({
  block,
  onChanged,
  onCitationClick,
  reorder,
  flags,
}: {
  block: FicheBlock;
  onChanged: () => void;
  onCitationClick?: (c: Citation) => void;
  reorder?: { isFirst: boolean; isLast: boolean };
  flags?: Flag[];
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(block.content);
  const [citations, setCitations] = useState(block.citations);

  function handleSave() {
    startTransition(async () => {
      const result = await updateFicheBlock(block.id, { content, citations });
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  function handleDelete() {
    if (!confirm("Supprimer ce bloc ?")) return;
    startTransition(async () => {
      const result = await deleteFicheBlock(block.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  function handleMove(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveFicheBlock(block.id, direction);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  function handleSuggestMnemonic() {
    startTransition(async () => {
      const result = await suggestMnemonicForBlock(block.id);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          {reorder && (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => handleMove("up")}
                disabled={reorder.isFirst || isPending}
                aria-label="Monter ce bloc"
                className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleMove("down")}
                disabled={reorder.isLast || isPending}
                aria-label="Descendre ce bloc"
                className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <span className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{block.blockType}</span>
        </div>
        <div className="flex gap-1.5">
          {block.status === "draft" && <Badge variant="neutral">Brouillon</Badge>}
          {block.needsReview && <Badge variant="accent">À vérifier</Badge>}
        </div>
      </div>

      <div className="mt-2">
        {block.blockType === "tableau_comparatif" && (
          <TableEditor content={content as TableBlockContent} onChange={(c) => setContent(c)} />
        )}
        {block.blockType === "protocole_paliers" && (
          <ProtocolEditor content={content as ProtocolBlockContent} onChange={(c) => setContent(c)} />
        )}
        {IS_TEXT_BLOCK.has(block.blockType) && (
          <textarea
            value={(content as TextBlockContent).text ?? ""}
            onChange={(e) => setContent({ text: e.target.value })}
            rows={4}
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        )}
      </div>

      <FlagsList flags={flags} onResolved={onChanged} />

      <EditableCitations citations={citations} onChange={setCitations} onCitationClick={onCitationClick} />

      <EditHistory targetId={block.id} fetcher={getFicheBlockHistory} />

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {block.blockType !== "mnemotechnique" && (
          <Button variant="ghost" size="sm" onClick={handleSuggestMnemonic} disabled={isPending} title="Suggérer un moyen mnémotechnique par IA">
            <Lightbulb className="h-3.5 w-3.5" /> Suggérer une mnémotechnique
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
