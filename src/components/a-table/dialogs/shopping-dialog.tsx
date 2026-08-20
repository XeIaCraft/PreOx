"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw, Printer, Copy, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildShoppingList } from "@/lib/a-table/shopping";
import { SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY } from "@/lib/a-table/constants";
import {
  toggleShoppingChecked,
  clearShoppingChecked,
  addManualShoppingItem,
  removeManualShoppingItem,
} from "@/app/apps/a-table/actions/settings";
import { useToast } from "@/components/ui/toast";
import type { Appetite, GuestMenu, MealCard, Recipe, ShoppingManualItem } from "@/lib/a-table/types";

interface ShoppingDialogProps {
  mealCards: MealCard[];
  recipesById: Map<string, Recipe>;
  guestMenus: GuestMenu[];
  appetite: Appetite;
  exportedRecipeIds: string[];
  checked: Record<string, boolean>;
  manualItems: ShoppingManualItem[];
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
  manualItems,
  onClose,
  onSaved,
}: ShoppingDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [newItemName, setNewItemName] = useState("");

  const items = useMemo(
    () => buildShoppingList(mealCards, recipesById, guestMenus, appetite, exportedRecipeIds, checked, manualItems),
    [mealCards, recipesById, guestMenus, appetite, exportedRecipeIds, checked, manualItems]
  );

  const manualKeyByAggregateKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of manualItems) map.set(`${item.name.toLowerCase()}|${item.unit.toLowerCase()}`, item.key);
    return map;
  }, [manualItems]);

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

  function handleAddManualItem() {
    const name = newItemName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await addManualShoppingItem({ name, quantity: null, unit: "" });
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setNewItemName("");
        onSaved();
      }
    });
  }

  function handleRemoveManualItem(key: string) {
    startTransition(async () => {
      await removeManualShoppingItem(key);
      onSaved();
    });
  }

  function handleCopyAsText() {
    const text = CATEGORY_ORDER.map((category) => {
      const categoryItems = unchecked.filter((i) => i.category === category.key);
      if (categoryItems.length === 0) return null;
      const lines = categoryItems.map((item) =>
        item.uncertain
          ? `- ${item.name} (quantité à ajuster)`
          : `- ${item.quantity ? Math.round(item.quantity * 100) / 100 : ""} ${item.unit} ${item.name}`.replace(/\s+/g, " ").trim()
      );
      return `${category.label}\n${lines.join("\n")}`;
    })
      .filter(Boolean)
      .join("\n\n");

    navigator.clipboard
      .writeText(text)
      .then(() => toast("Liste copiée.", { variant: "success" }))
      .catch(() => toast("Impossible de copier la liste.", { variant: "error" }));
  }

  return (
    <Modal
      title="Liste de courses"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleCopyAsText} disabled={items.length === 0}>
            <Copy className="h-4 w-4" />
            Copier
          </Button>
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
      <div className="mb-4 flex gap-2 print:hidden">
        <Input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddManualItem();
            }
          }}
          placeholder="Ajouter un article (ex. papier essuie-tout)"
          className="flex-1"
        />
        <Button variant="secondary" onClick={handleAddManualItem} disabled={isPending || !newItemName.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

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
                  {categoryItems.map((item) => {
                    const manualKey = manualKeyByAggregateKey.get(item.key);
                    return (
                      <li key={item.key} className="flex items-center gap-1">
                        <label className="flex flex-1 items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-muted">
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
                        {manualKey && (
                          <button
                            type="button"
                            onClick={() => handleRemoveManualItem(manualKey)}
                            disabled={isPending}
                            title="Retirer cet article"
                            className="rounded p-1 text-foreground-subtle hover:bg-danger-tint hover:text-danger print:hidden"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
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
