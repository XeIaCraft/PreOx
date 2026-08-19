"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RefineBox } from "@/components/a-table/ui/refine-box";
import { Button } from "@/components/ui/button";
import { validateDraft, regenerateProposal, refineProposal } from "@/app/apps/a-table/actions/drafts";
import { useToast } from "@/components/ui/toast";
import type { DraftProposal } from "@/lib/a-table/types";

interface ValidateDraftDialogProps {
  draftId: string;
  proposals: DraftProposal[];
  onClose: () => void;
  onSaved: () => void;
}

export function ValidateDraftDialog({ draftId, proposals, onClose, onSaved }: ValidateDraftDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set(proposals.map((_, i) => i)));
  const [openRefine, setOpenRefine] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState<number | null>(null);

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleValidate() {
    startTransition(async () => {
      const result = await validateDraft({ draftId, selectedIndices: Array.from(selected) });
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
        onClose();
      }
    });
  }

  function handleDiscard() {
    startTransition(async () => {
      await validateDraft({ draftId, discard: true });
      onSaved();
      onClose();
    });
  }

  function handleRegenerate(index: number) {
    setRegenerating(index);
    startTransition(async () => {
      const result = await regenerateProposal(draftId, index);
      setRegenerating(null);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  return (
    <Modal
      title="Propositions générées"
      description="Décoche celles que tu ne veux pas ajouter à À cuisiner."
      onClose={handleDiscard}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleDiscard} disabled={isPending}>
            Tout écarter
          </Button>
          <Button onClick={handleValidate} disabled={isPending || selected.size === 0}>
            Ajouter la sélection ({selected.size})
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {proposals.map((proposal, index) => (
          <div key={index} className="rounded-[var(--radius-md)] border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <label className="flex flex-1 items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(index)}
                  onChange={() => toggle(index)}
                  className="mt-1 h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
                />
                <span className="font-medium text-foreground">{proposal.title}</span>
              </label>
              <button
                type="button"
                onClick={() => handleRegenerate(index)}
                disabled={isPending}
                title="Remplacer cette proposition"
                className="shrink-0 rounded p-1 text-foreground-subtle hover:bg-surface-muted"
              >
                <RefreshCw className={`h-4 w-4 ${regenerating === index ? "animate-spin" : ""}`} />
              </button>
            </div>

            <p className="mt-1 text-xs text-foreground-subtle">
              {proposal.cooking_minutes != null ? `${proposal.cooking_minutes} min · ` : ""}
              {proposal.servings} pers.
              {proposal.price_per_serving != null ? ` · ${proposal.price_per_serving.toFixed(2)} €/part` : ""}
            </p>

            {proposal.notes && <p className="mt-2 text-sm text-foreground-muted">{proposal.notes}</p>}

            <button
              type="button"
              onClick={() => setOpenRefine(openRefine === index ? null : index)}
              className="mt-2 text-xs font-medium text-primary-strong hover:underline"
            >
              {openRefine === index ? "Fermer" : "Ajuster avec l'IA"}
            </button>

            {openRefine === index && (
              <div className="mt-2">
                <RefineBox onSubmit={(message) => refineProposal(draftId, index, message)} onApplied={onSaved} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
