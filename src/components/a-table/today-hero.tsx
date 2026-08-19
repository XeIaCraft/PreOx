"use client";

import { CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MealCard, Recipe } from "@/lib/a-table/types";

interface TodayHeroProps {
  card: MealCard | null;
  recipe: Recipe | null;
  onOpenDetail: () => void;
  onCook: () => void;
  onScrollToGenerator: () => void;
}

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function TodayHero({ card, recipe, onOpenDetail, onCook, onScrollToGenerator }: TodayHeroProps) {
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 18 ? "midday" : "evening";
  const gradients: Record<string, string> = {
    morning: "linear-gradient(135deg,#fdf6e3,#f5e6c8)",
    midday: "linear-gradient(135deg,#eaf2ec,#d3e6da)",
    evening: "linear-gradient(135deg,#e9e3f0,#d3c7e0)",
  };

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border p-6"
      style={{ background: gradients[period] }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Aujourd&rsquo;hui</p>

      {recipe ? (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif-display text-2xl font-medium text-foreground">{recipe.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {recipe.cooking_minutes != null ? `${recipe.cooking_minutes} min · ` : ""}
              {card?.servings} pers.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenDetail}>
              Détail
            </Button>
            <Button size="sm" onClick={onCook}>
              <CheckCircle2 className="h-4 w-4" />
              Cuisiné
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-foreground-muted">
            <Info className="h-4 w-4" />
            Rien de prévu pour aujourd&rsquo;hui.
          </div>
          <Button variant="secondary" size="sm" onClick={onScrollToGenerator}>
            Générer des idées
          </Button>
        </div>
      )}
    </div>
  );
}

export { WEEKDAY_KEYS };
