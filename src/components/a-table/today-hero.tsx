"use client";

import Image from "next/image";
import { CheckCircle2, Info, AlarmClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MealCard, Recipe } from "@/lib/a-table/types";

const DINNER_HOUR = 19;
const DINNER_MINUTE = 30;

function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** null when there's nothing useful to say (no cook time, or dinner has already passed). */
function startCookingReminder(cookingMinutes: number | null): { label: string; urgent: boolean } | null {
  if (cookingMinutes == null) return null;
  const now = new Date();
  const dinner = new Date(now);
  dinner.setHours(DINNER_HOUR, DINNER_MINUTE, 0, 0);
  if (now >= dinner) return null;

  const start = new Date(dinner.getTime() - cookingMinutes * 60 * 1000);
  if (now >= start) return { label: `Pour manger à ${formatTime(dinner)}, il est temps de s'y mettre !`, urgent: true };
  return { label: `Pour manger à ${formatTime(dinner)}, commencez vers ${formatTime(start)}.`, urgent: false };
}

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
  // Built from the app's own theme tokens (not fixed hex) so the card stays
  // legible in dark mode instead of keeping a light-mode-only pastel wash.
  const gradients: Record<string, string> = {
    morning: "linear-gradient(135deg,var(--accent-tint),var(--surface))",
    midday: "linear-gradient(135deg,var(--primary-tint),var(--surface))",
    evening: "linear-gradient(135deg,var(--surface-muted),var(--surface))",
  };

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border p-6"
      style={{ background: gradients[period] }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Aujourd&rsquo;hui</p>

      {recipe ? (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            {recipe.image_url && (
              <button
                type="button"
                onClick={onOpenDetail}
                className="relative hidden h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] sm:block"
              >
                <Image src={recipe.image_url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            )}
            <div>
            <h2 className="font-serif-display text-2xl font-medium text-foreground">{recipe.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {recipe.cooking_minutes != null ? `${recipe.cooking_minutes} min · ` : ""}
              {card?.servings} pers.
            </p>
            {(() => {
              const reminder = startCookingReminder(recipe.cooking_minutes);
              if (!reminder) return null;
              return (
                <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${reminder.urgent ? "text-danger" : "text-foreground-subtle"}`}>
                  <AlarmClock className="h-3.5 w-3.5" /> {reminder.label}
                </p>
              );
            })()}
            </div>
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
