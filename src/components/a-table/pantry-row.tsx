"use client";

import { Plus, X } from "lucide-react";
import type { PantryItem } from "@/lib/a-table/types";

interface PantryRowProps {
  items: PantryItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function PantryRow({ items, onAdd, onRemove }: PantryRowProps) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-foreground-muted">
        Mon garde-manger {items.length > 0 && <span className="text-foreground-subtle">({items.length})</span>}
      </summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pl-3 pr-1.5 text-sm"
          >
            <span>
              {item.quantity ? `${item.quantity} ${item.unit} ` : ""}
              {item.name}
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="rounded-full p-1 text-foreground-subtle hover:bg-danger-tint hover:text-danger"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 rounded-full border border-dashed border-border-strong px-3 py-1.5 text-sm text-foreground-muted hover:border-primary/40 hover:text-primary-strong"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un article
        </button>
      </div>
    </details>
  );
}
