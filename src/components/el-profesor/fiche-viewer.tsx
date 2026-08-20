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

// Quick jump bar to the first block of each distinct type — only worth
// showing once a fiche has enough blocks that scrolling to find one is a
// real chore.
function BlockNav({ blocks }: { blocks: FicheBlock[] }) {
  if (blocks.length < 6) return null;
  const seen = new Set<BlockType>();
  const entries: { type: BlockType; blockId: string }[] = [];
  for (const b of blocks) {
    if (!seen.has(b.blockType)) {
      seen.add(b.blockType);
      entries.push({ type: b.blockType, blockId: b.id });
    }
  }
  if (entries.length < 2) return null;

  return (
    <div className="sticky top-0 z-10 -mx-1 mb-3 flex gap-1 overflow-x-auto bg-surface px-1 py-1.5">
      {entries.map(({ type, blockId }) => {
        const meta = BLOCK_META[type];
        const Icon = meta.icon;
        return (
          <button
            key={type}
            type="button"
            onClick={() =>
              document.getElementById(`fiche-block-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            title={meta.label}
            aria-label={`Aller à : ${meta.label}`}
            className="flex shrink-0 items-center justify-center rounded-full border border-border bg-surface p-1.5 text-foreground-subtle hover:border-primary/40 hover:text-primary-strong"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function FicheViewer({
  title,
  summary,
  blocks,
  onCitationClick,
}: {
  title: string;
  summary?: string;
  blocks: FicheBlock[];
  onCitationClick?: (c: Citation) => void;
}) {
  return (
    <div>
      <h3 className="font-serif-display text-xl font-medium text-foreground">{title}</h3>
      {summary && <p className="mt-1 text-sm text-foreground-subtle">{summary}</p>}
      <BlockNav blocks={blocks} />
      <div className="mt-4 space-y-4">
        {blocks.map((block) => {
          const meta = BLOCK_META[block.blockType];
          const Icon = meta.icon;
          return (
            <div key={block.id} id={`fiche-block-${block.id}`} className="scroll-mt-14 rounded-[var(--radius-md)] border border-border p-4">
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
