"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
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
          <div key={index} className="overflow-hidden rounded-[var(--radius-md)] border border-border">
            {proposal.image_url && (
              <div className="relative h-32 w-full">
                <Image src={proposal.image_url} alt={proposal.title} fill sizes="400px" className="object-cover" />
              </div>
            )}
            <div className="p-4">
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
              {proposal.nutrition.kcal != null && ` · ${proposal.nutrition.kcal} kcal`}
            </p>

            {(proposal.nutrition.protein_g != null || proposal.nutrition.carb_g != null || proposal.nutrition.fat_g != null) && (
              <p className="mt-0.5 text-xs text-foreground-subtle">
                P {proposal.nutrition.protein_g ?? "–"}g · G {proposal.nutrition.carb_g ?? "–"}g · L {proposal.nutrition.fat_g ?? "–"}g
              </p>
            )}

            {proposal.ingredients.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm text-foreground-muted">
                {proposal.ingredients.slice(0, 5).map((ing, i) => (
                  <li key={i} className="truncate">
                    {typeof ing.quantity === "number" ? ing.quantity : ing.quantity ?? ""} {ing.unit} {ing.name}
                  </li>
                ))}
                {proposal.ingredients.length > 5 && (
                  <li className="text-xs text-foreground-subtle">+ {proposal.ingredients.length - 5} de plus</li>
                )}
              </ul>
            )}

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
          </div>
        ))}
      </div>
    </Modal>
  );
}
