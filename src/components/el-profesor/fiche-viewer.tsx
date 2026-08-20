"use client";

import {
  BookMarked,
  Gauge,
  Table2,
  ListOrdered,
  Lightbulb,
  Sparkles,
  ShieldAlert,
  Sigma,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FlagButton } from "@/components/el-profesor/flag-button";
import type { BlockType, Citation, FicheBlock, ProtocolBlockContent, TableBlockContent, TextBlockContent } from "@/lib/el-profesor/types";

const BLOCK_META: Record<BlockType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  definition_mecanisme: { label: "Définition / mécanisme", icon: BookMarked },
  valeurs_seuils: { label: "Valeurs & seuils", icon: Gauge },
  tableau_comparatif: { label: "Tableau comparatif", icon: Table2 },
  protocole_paliers: { label: "Protocole", icon: ListOrdered },
  mnemotechnique: { label: "Mnémotechnique", icon: Lightbulb },
  perle_clinique: { label: "Perle clinique", icon: Sparkles },
  piege_erreur: { label: "Piège fréquent", icon: ShieldAlert },
  formule: { label: "Formule", icon: Sigma },
  texte_libre: { label: "Note", icon: FileText },
};

function CitationChips({ citations, onClick }: { citations: Citation[]; onClick?: (c: Citation) => void }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onClick?.(c)}
          className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-foreground-subtle hover:border-primary/40 hover:text-primary-strong"
        >
          p. {c.page}
        </button>
      ))}
    </div>
  );
}

function BlockBody({ block }: { block: FicheBlock }) {
  if (block.blockType === "tableau_comparatif") {
    const content = block.content as TableBlockContent;
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {content.headers?.map((h, i) => (
                <th key={i} className="border-b border-border px-3 py-2 text-left font-medium text-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows?.map((row, ri) => (
              <tr key={ri} className="odd:bg-surface-muted/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="border-b border-border px-3 py-2 text-foreground-muted">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.blockType === "protocole_paliers") {
    const content = block.content as ProtocolBlockContent;
    return (
      <ol className="space-y-2">
        {content.steps?.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[11px] font-medium text-primary-strong">
              {i + 1}
            </span>
            <div>
              <p className="font-medium text-foreground">{step.label}</p>
              <p className="text-sm text-foreground-muted">{step.detail}</p>
              {step.condition && <p className="text-xs text-foreground-subtle">Si : {step.condition}</p>}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  const content = block.content as TextBlockContent;
  return <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground-muted">{content.text}</p>;
}

export function FicheViewer({
  title,
  blocks,
  onCitationClick,
}: {
  title: string;
  blocks: FicheBlock[];
  onCitationClick?: (c: Citation) => void;
}) {
  return (
    <div>
      <h3 className="font-serif-display text-xl font-medium text-foreground">{title}</h3>
      <div className="mt-4 space-y-4">
        {blocks.map((block) => {
          const meta = BLOCK_META[block.blockType];
          const Icon = meta.icon;
          return (
            <div key={block.id} className="rounded-[var(--radius-md)] border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
                  <Icon className="h-3.5 w-3.5" /> {meta.label}
                </span>
                <div className="flex items-center gap-2">
                  {block.needsReview && <Badge variant="accent">À vérifier</Badge>}
                  <FlagButton targetType="block" targetId={block.id} />
                </div>
              </div>
              <div className="mt-2">
                <BlockBody block={block} />
              </div>
              <CitationChips citations={block.citations} onClick={onCitationClick} />
            </div>
          );
        })}
        {blocks.length === 0 && <p className="text-sm text-foreground-subtle">Aucun contenu pour cette fiche.</p>}
      </div>
    </div>
  );
}
