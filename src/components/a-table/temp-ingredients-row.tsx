"use client";

import { Plus, Pencil, X, AlertTriangle } from "lucide-react";
import type { TemporaryIngredient } from "@/lib/a-table/types";

interface TempIngredientsRowProps {
  items: TemporaryIngredient[];
  onAdd: () => void;
  onEdit: (item: TemporaryIngredient) => void;
  onRemove: (id: string) => void;
}

/** Days until the ingredient's date_limit, or null if unset. Negative means already past. */
function daysUntil(dateLimit: string): number | null {
  if (!dateLimit) return null;
  const target = new Date(dateLimit);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function TempIngredientsRow({ items, onAdd, onEdit, onRemove }: TempIngredientsRowProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground-muted">Aliments à utiliser rapidement</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const days = daysUntil(item.date_limit);
          const urgent = days != null && days <= 2;
          return (
          <div
            key={item.id}
            className={`flex items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-1.5 text-sm ${
              urgent ? "border-danger/40 bg-danger-tint" : "border-border bg-surface"
            }`}
          >
            {urgent && (
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0 text-danger"
                aria-label={days! < 0 ? "Date limite dépassée" : days === 0 ? "Date limite aujourd'hui" : "Date limite proche"}
              />
            )}
            <span>
              {item.quantity ? `${item.quantity} ${item.unit} ` : ""}
              {item.name}
            </span>
            <button type="button" onClick={() => onEdit(item)} className="rounded-full p-1 text-foreground-subtle hover:bg-surface-muted">
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="rounded-full p-1 text-foreground-subtle hover:bg-danger-tint hover:text-danger"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 rounded-full border border-dashed border-border-strong px-3 py-1.5 text-sm text-foreground-muted hover:border-primary/40 hover:text-primary-strong"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un aliment
        </button>
      </div>
    </div>
  );
}
