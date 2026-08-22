"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import { mondayIso } from "@/lib/a-table/week";
import type { MealCard, Placement, Recipe } from "@/lib/a-table/types";

interface MonthViewDialogProps {
  mealCards: MealCard[];
  recipesById: Map<string, Recipe>;
  onClose: () => void;
  onSelectWeek: (weekStart: string) => void;
}

/** Read-only month calendar (item 8 of the backlog) — purely a different lens on the meal cards already loaded for the board, grouped by each day's week_start; no extra fetch needed. */
export function MonthViewDialog({ mealCards, recipesById, onClose, onSelectWeek }: MonthViewDialogProps) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const cardsByWeekAndDay = useMemo(() => {
    const map = new Map<string, MealCard>();
    for (const card of mealCards) {
      if (card.status !== "active" || !card.week_start || !WEEKDAY_PLACEMENTS.includes(card.placement)) continue;
      map.set(`${card.week_start}|${card.placement}`, card);
    }
    return map;
  }, [mealCards]);

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - ((firstOfMonth.getDay() + 6) % 7));

    const rows: { weekStart: string; days: { date: Date; placement: Placement; inMonth: boolean }[] }[] = [];
    for (let w = 0; w < 6; w++) {
      const weekStartDate = new Date(gridStart);
      weekStartDate.setDate(gridStart.getDate() + w * 7);
      const weekStart = mondayIso(weekStartDate);
      const days = WEEKDAY_PLACEMENTS.map((placement, i) => {
        const date = new Date(weekStartDate);
        date.setDate(weekStartDate.getDate() + i);
        return { date, placement, inMonth: date.getMonth() === cursor.getMonth() };
      });
      rows.push({ weekStart, days });
      // Stop once we've rendered the whole month and hit a row entirely past it.
      if (w >= 3 && days.every((d) => !d.inMonth)) break;
    }
    return rows;
  }, [cursor]);

  return (
    <Modal title="Vue mensuelle" onClose={onClose} size="xl">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-serif-display text-lg font-medium capitalize text-foreground">
          {cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        {weeks.map((row) => (
          <div key={row.weekStart} className="grid grid-cols-7 gap-1.5">
            {row.days.map(({ date, placement, inMonth }) => {
              const card = cardsByWeekAndDay.get(`${row.weekStart}|${placement}`);
              const recipe = card ? recipesById.get(card.recipe_id) : undefined;
              return (
                <button
                  key={placement + date.toISOString()}
                  type="button"
                  onClick={() => onSelectWeek(row.weekStart)}
                  title={recipe?.title}
                  className={`min-h-[64px] rounded-[var(--radius-sm)] border p-1.5 text-left text-xs transition-colors hover:border-primary/40 ${
                    inMonth ? "border-border bg-surface" : "border-border/50 bg-surface-muted/40 text-foreground-subtle"
                  }`}
                >
                  <span className={inMonth ? "text-foreground-subtle" : "text-foreground-subtle/60"}>{date.getDate()}</span>
                  {recipe && <p className="mt-0.5 line-clamp-2 text-foreground">{recipe.title}</p>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-foreground-subtle">Cliquez sur un jour pour ouvrir sa semaine sur le tableau.</p>
    </Modal>
  );
}
