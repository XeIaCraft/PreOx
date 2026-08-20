"use client";

import { useMemo, useTransition } from "react";
import { RotateCcw, Printer } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { buildShoppingList } from "@/lib/a-table/shopping";
import { SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY } from "@/lib/a-table/constants";
import { toggleShoppingChecked, clearShoppingChecked } from "@/app/apps/a-table/actions/settings";
import { useToast } from "@/components/ui/toast";
import type { Appetite, GuestMenu, MealCard, Recipe } from "@/lib/a-table/types";

interface ShoppingDialogProps {
  mealCards: MealCard[];
  recipesById: Map<string, Recipe>;
  guestMenus: GuestMenu[];
  appetite: Appetite;
  exportedRecipeIds: string[];
  checked: Record<string, boolean>;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORY_ORDER = [...SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY];

export function ShoppingDialog({
  mealCards,
  recipesById,
  guestMenus,
  appetite,
  exportedRecipeIds,
  checked,
  onClose,
  onSaved,
}: ShoppingDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const items = useMemo(
    () => buildShoppingList(mealCards, recipesById, guestMenus, appetite, exportedRecipeIds, checked),
    [mealCards, recipesById, guestMenus, appetite, exportedRecipeIds, checked]
  );

  const unchecked = items.filter((i) => !i.checked);
  const checkedItems = items.filter((i) => i.checked);

  function handleToggle(key: string) {
    startTransition(async () => {
      await toggleShoppingChecked(key);
      onSaved();
    });
  }

  function handleReset() {
    startTransition(async () => {
      const result = await clearShoppingChecked();
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  return (
    <Modal
      title="Liste de courses"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => window.print()} disabled={items.length === 0}>
            <Printer className="h-4 w-4" />
            Imprimer
          </Button>
          <Button variant="secondary" onClick={handleReset} disabled={isPending}>
            <RotateCcw className="h-4 w-4" />
            Recommencer la liste
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground-subtle">Aucun repas planifié pour le moment.</p>
      ) : (
        <div className="print-area space-y-5">
          {CATEGORY_ORDER.map((category) => {
            const categoryItems = unchecked.filter((i) => i.category === category.key);
            if (categoryItems.length === 0) return null;
            return (
              <div key={category.key}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{category.label}</p>
                <ul className="space-y-1">
                  {categoryItems.map((item) => (
                    <li key={item.key}>
                      <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => handleToggle(item.key)}
                          disabled={isPending}
                          className="h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
                        />
                        <span className="flex-1 text-foreground">
                          {item.uncertain
                            ? `${item.name} (quantité à ajuster)`
                            : `${item.quantity ? Math.round(item.quantity * 100) / 100 : ""} ${item.unit} ${item.name}`}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {checkedItems.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                En stock ({checkedItems.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {checkedItems.map((item) => (
                  <li key={item.key}>
                    <label className="flex items-center gap-2 rounded px-1 py-1 text-sm text-foreground-subtle line-through hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleToggle(item.key)}
                        disabled={isPending}
                        className="h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
                      />
                      {item.name}
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
