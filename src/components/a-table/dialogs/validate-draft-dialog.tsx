"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { RefreshCw, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RefineBox } from "@/components/a-table/ui/refine-box";
import { ShoppingListPreview } from "@/components/a-table/ui/shopping-list-preview";
import { Button } from "@/components/ui/button";
import { validateDraft, regenerateProposal, refineProposal } from "@/app/apps/a-table/actions/drafts";
import { buildShoppingList, previewWithExtraIngredients, type ShoppingItem } from "@/lib/a-table/shopping";
import { useToast } from "@/components/ui/toast";
import type { Appetite, DraftProposal, GuestMenu, MealCard, Recipe, ShoppingManualItem } from "@/lib/a-table/types";

interface ValidateDraftDialogProps {
  draftId: string;
  proposals: DraftProposal[];
  onClose: () => void;
  onSaved: () => void;
  /** Current board state, only needed to compute the live shopping-list preview on tablet+. */
  mealCards: MealCard[];
  recipesById: Map<string, Recipe>;
  guestMenus: GuestMenu[];
  appetite: Appetite;
  exportedRecipeIds: string[];
  shoppingChecked: Record<string, boolean>;
  manualItems: ShoppingManualItem[];
}

export function ValidateDraftDialog({
  draftId,
  proposals,
  onClose,
  onSaved,
  mealCards,
  recipesById,
  guestMenus,
  appetite,
  exportedRecipeIds,
  shoppingChecked,
  manualItems,
}: ValidateDraftDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set(proposals.map((_, i) => i)));
  const [openRefine, setOpenRefine] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState<number | null>(null);

  // Live preview (tablet+ two-column layout): current shopping list plus the
  // ingredients of whichever proposals are checked right now, recomputed on
  // every toggle — item requested alongside the "à table" génération flow.
  const baseShoppingList = useMemo(
    () => buildShoppingList(mealCards, recipesById, guestMenus, appetite, exportedRecipeIds, shoppingChecked, manualItems),
    [mealCards, recipesById, guestMenus, appetite, exportedRecipeIds, shoppingChecked, manualItems]
  );
  const previewItems: ShoppingItem[] = useMemo(() => {
    const extraIngredients = Array.from(selected).flatMap((i) => proposals[i]?.ingredients ?? []);
    return previewWithExtraIngredients(baseShoppingList, extraIngredients);
  }, [baseShoppingList, selected, proposals]);

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
      <div className="md:grid md:grid-cols-[240px_1fr] md:gap-5">
        <aside className="hidden md:sticky md:top-0 md:block md:max-h-[65vh] md:overflow-y-auto md:border-r md:border-border md:pr-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            <ShoppingCart className="h-3.5 w-3.5" /> Liste de courses (aperçu)
          </p>
          <ShoppingListPreview items={previewItems} />
        </aside>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
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
      </div>
    </Modal>
  );
}
