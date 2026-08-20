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
  onServingsChange?: (cardId: string, servings: number) => void;
  onDuplicate?: (cardId: string) => void;
  onToggleLock?: (cardId: string, locked: boolean) => void;
  onStartTimer?: (minutes: number, label: string) => void;
  allergyRecipeIds?: Set<string>;
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
  onServingsChange,
  onDuplicate,
  onToggleLock,
  onStartTimer,
  allergyRecipeIds,
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
          return (
            <MealCard
              key={card.id}
              card={card}
              recipe={recipe}
              onOpenDetail={() => onOpenDetail(recipe.id)}
              onCook={() => onCook(card.id)}
              onRemove={() => onRemove(card.id)}
              onMove={(p) => onMove(card.id, p)}
              onServingsChange={onServingsChange ? (s) => onServingsChange(card.id, s) : undefined}
              onDuplicate={onDuplicate ? () => onDuplicate(card.id) : undefined}
              onToggleLock={onToggleLock ? () => onToggleLock(card.id, !card.locked) : undefined}
              onStartTimer={onStartTimer}
              allergyWarning={allergyRecipeIds?.has(recipe.id)}
            />
          );
        })
      )}
    </div>
  );
}
