"use client";

import { X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockType } from "@/lib/el-profesor/types";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  definition_mecanisme: "Définition / mécanisme",
  valeurs_seuils: "Valeurs & seuils",
  tableau_comparatif: "Tableau comparatif",
  protocole_paliers: "Protocole",
  mnemotechnique: "Mnémotechnique",
  perle_clinique: "Perle clinique",
  piege_erreur: "Piège fréquent",
  formule: "Formule",
  texte_libre: "Note",
};

export type CoverageInfoTarget =
  | { kind: "block"; subEntityName: string; blockType: BlockType; excerpt: string }
  | { kind: "flashcard"; subEntityName: string; front: string; back: string };

/**
 * Small floating card shown when the admin/reader clicks a highlighted
 * coverage region on the PDF (item 26 follow-up, requested 2026-08-24) —
 * answers "which fiche/flashcard does this passage already cover?" right
 * where they clicked, instead of having to search for it in the left pane.
 */
export function CoverageInfoPanel({
  target,
  onClose,
  onNavigate,
}: {
  target: CoverageInfoTarget;
  onClose: () => void;
  /** Omitted when there's nothing to scroll to in the current view (e.g. a flashcard in the read-only reader, which isn't listed inline). */
  onNavigate?: () => void;
}) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 max-w-sm rounded-[var(--radius-lg)] border border-primary/40 bg-surface p-3 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-primary-strong">
            {target.kind === "block" ? `Fiche — ${BLOCK_TYPE_LABELS[target.blockType]}` : "Flashcard"}
          </p>
          <p className="text-[11px] text-foreground-subtle">{target.subEntityName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="shrink-0 text-foreground-subtle hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {target.kind === "block" ? (
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-foreground-muted">{target.excerpt}</p>
      ) : (
        <div className="mt-1.5 space-y-1 text-sm">
          <p className="text-foreground">{target.front}</p>
          <p className="text-foreground-muted">→ {target.back}</p>
        </div>
      )}
      {onNavigate && (
        <Button variant="secondary" size="sm" onClick={onNavigate} className="mt-2">
          Voir dans la fiche <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
