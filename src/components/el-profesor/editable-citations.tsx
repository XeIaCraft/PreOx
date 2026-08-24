"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Citation } from "@/lib/el-profesor/types";

// Citations extracted before the page-numbering fix (printed page vs. PDF
// file page index) can point to the wrong page. Rather than a fragile
// per-chapter offset, this lets an admin correct one citation's page
// number directly, in place, whenever they notice it lands on the wrong
// page in the PDF viewer.
export function EditableCitations({
  citations,
  onChange,
  onCitationClick,
}: {
  citations: Citation[];
  onChange: (citations: Citation[]) => void;
  onCitationClick?: (c: Citation) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  if (citations.length === 0) return null;

  function commitEdit(index: number, value: string) {
    const next = Number(value);
    if (Number.isFinite(next) && next > 0) {
      onChange(citations.map((c, i) => (i === index ? { ...c, page: next } : c)));
    }
    setEditingIndex(null);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {citations.map((c, i) =>
        editingIndex === i ? (
          <input
            key={i}
            type="number"
            min={1}
            autoFocus
            defaultValue={c.page}
            onBlur={(e) => commitEdit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingIndex(null);
            }}
            className="h-6 w-14 rounded-full border border-primary/40 bg-primary-tint px-2 text-center text-[11px] text-primary-strong focus-visible:outline-none"
            aria-label="Numéro de page corrigé"
          />
        ) : (
          <span key={i} className="flex items-center overflow-hidden rounded-full border border-border-strong text-[11px] text-foreground-subtle">
            {c.page === 0 ? (
              // Sentinel for a citation imported from a source with no PDF
              // to ground-truth against (Word/PowerPoint chapter, or a
              // hand-pasted external extraction) — see importChapterContent.
              <span
                className="bg-surface-muted px-2 py-0.5"
                title="Cette citation vient d'une source sans PDF (import Word/PowerPoint ou externe) — pas de page à afficher."
              >
                Source externe
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onCitationClick?.(c)}
                className="px-2 py-0.5 hover:text-primary-strong"
                title="Aller à cette page dans le PDF"
              >
                p. {c.page}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditingIndex(i)}
              className="border-l border-border-strong px-1.5 py-0.5 hover:text-primary-strong"
              aria-label="Corriger le numéro de page"
              title="Corriger le numéro de page"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </span>
        )
      )}
    </div>
  );
}
