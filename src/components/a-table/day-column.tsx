"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MealCard } from "@/components/a-table/meal-card";
import type { MealCard as MealCardType, Placement, Recipe } from "@/lib/a-table/types";

interface DayColumnProps {
  placement: Placement;
  label: string;
  cards: MealCardType[];
  recipesById: Map<string, Recipe>;
  isToday?: boolean;
  onDrop: (cardId: string, placement: Placement) => void;
  onOpenDetail: (recipeId: string) => void;
  onCook: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onMove: (cardId: string, placement: Placement) => void;
  onDuplicate?: (cardId: string) => void;
  onToggleLock?: (cardId: string, locked: boolean) => void;
  allergyRecipeIds?: Set<string>;
  selectable?: boolean;
  selectedCardIds?: Set<string>;
  onToggleSelect?: (cardId: string) => void;
}

export function DayColumn({
  placement,
  label,
  cards,
  recipesById,
  isToday,
  onDrop,
  onOpenDetail,
  onCook,
  onRemove,
  onMove,
  onDuplicate,
  onToggleLock,
  allergyRecipeIds,
  selectable,
  selectedCardIds,
  onToggleSelect,
}: DayColumnProps) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId) onDrop(cardId, placement);
      }}
      className={cn(
        "flex min-h-[140px] flex-col gap-2 rounded-[var(--radius-md)] border border-dashed border-border p-2 transition-colors",
        over && "border-primary/50 bg-primary-tint/40"
      )}
    >
      <div className="flex items-center justify-between px-1">
        <span className={cn("text-xs font-semibold uppercase tracking-wide", isToday ? "text-primary-strong" : "text-foreground-subtle")}>
          {label}
        </span>
        <span className="text-xs text-foreground-subtle">{cards.length}</span>
      </div>

      {cards.length === 0 ? (
        <p className="px-1 text-xs text-foreground-subtle">Rien de prévu.</p>
      ) : (
        cards.map((card) => {
          const recipe = recipesById.get(card.recipe_id);
          if (!recipe) return null;
          const cardEl = (
            <MealCard
              key={card.id}
              card={card}
              recipe={recipe}
              onOpenDetail={() => onOpenDetail(recipe.id)}
              onCook={() => onCook(card.id)}
              onRemove={() => onRemove(card.id)}
              onMove={(p) => onMove(card.id, p)}
              onDuplicate={onDuplicate ? () => onDuplicate(card.id) : undefined}
              onToggleLock={onToggleLock ? () => onToggleLock(card.id, !card.locked) : undefined}
              allergyWarning={allergyRecipeIds?.has(recipe.id)}
            />
          );
          if (!selectable) return cardEl;
          return (
            <label key={card.id} className="relative block cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCardIds?.has(card.id) ?? false}
                onChange={() => onToggleSelect?.(card.id)}
                className="absolute left-2 top-2 z-10 h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
              />
              {cardEl}
            </label>
          );
        })
      )}
    </div>
  );
}
