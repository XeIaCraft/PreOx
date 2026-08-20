"use client";

import { useMemo, useState, useTransition } from "react";
import { Trash2, RotateCcw, Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { removeHistoryEntry, restoreHistoryEntry, addRecipeToBacklog } from "@/app/apps/a-table/actions/planning";
import { useToast } from "@/components/ui/toast";
import type { HistoryEntry, Recipe } from "@/lib/a-table/types";

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface HistoryDialogProps {
  history: HistoryEntry[];
  recipesById: Map<string, Recipe>;
  onClose: () => void;
  onSaved: () => void;
}

export function HistoryDialog({ history, recipesById, onClose, onSaved }: HistoryDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState(20);
  const [now] = useState(() => Date.now());

  const visible = useMemo(() => {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return history.filter((h) => new Date(h.cooked_at).getTime() >= cutoff);
  }, [history, days, now]);

  const monthlyBudget = useMemo(() => {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    let total = 0;
    let hasPrice = false;
    for (const entry of history) {
      if (new Date(entry.cooked_at).getTime() < start.getTime()) continue;
      const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : undefined;
      if (recipe?.price_per_serving != null) {
        total += recipe.price_per_serving * entry.servings;
        hasPrice = true;
      }
    }
    return { total, hasPrice };
  }, [history, now, recipesById]);

  const mostCooked = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of visible) {
      if (!entry.recipe_id) continue;
      counts.set(entry.recipe_id, (counts.get(entry.recipe_id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([recipeId, count]) => ({ recipe: recipesById.get(recipeId), count }))
      .filter((e): e is { recipe: Recipe; count: number } => Boolean(e.recipe))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [visible, recipesById]);

  const diversity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of visible) {
      const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : undefined;
      for (const tag of recipe?.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [visible, recipesById]);

  const costByRecipe = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of visible) {
      const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : undefined;
      if (recipe?.price_per_serving == null) continue;
      totals.set(recipe.title, (totals.get(recipe.title) ?? 0) + recipe.price_per_serving * entry.servings);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [visible, recipesById]);

  function handleRecook(recipeId: string) {
    startTransition(async () => {
      const result = await addRecipeToBacklog(recipeId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
      }
    });
  }

  function handleExportCsv() {
    const header = ["Date", "Recette", "Portions"];
    const rows = visible.map((entry) => {
      const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : undefined;
      return [new Date(entry.cooked_at).toLocaleDateString("fr-FR"), recipe?.title ?? "Recette supprimée", String(entry.servings)];
    });
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "historique-repas.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function handleRemove(entry: HistoryEntry) {
    startTransition(async () => {
      const result = await removeHistoryEntry(entry.id);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      onSaved();
      toast("Entrée supprimée.", {
        actionLabel: "Annuler",
        onAction: () => {
          startTransition(async () => {
            await restoreHistoryEntry(entry);
            onSaved();
          });
        },
      });
    });
  }

  return (
    <Modal title="Historique" onClose={onClose}>
      {monthlyBudget.hasPrice && (
        <p className="mb-3 text-sm text-foreground-muted">
          Budget ce mois-ci : <span className="font-medium text-foreground">{monthlyBudget.total.toFixed(2)} €</span>
        </p>
      )}

      {(mostCooked.length > 0 || diversity.length > 0 || costByRecipe.length > 0) && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs font-medium text-foreground-subtle">Statistiques sur la période</summary>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {mostCooked.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Les plus cuisinées</p>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground-muted">
                  {mostCooked.map(({ recipe, count }) => (
                    <li key={recipe.id}>
                      {recipe.title} — {count}×
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {diversity.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Diversité (tags)</p>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground-muted">
                  {diversity.map(([tag, count]) => (
                    <li key={tag}>
                      {tag} — {count}×
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {costByRecipe.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Coût par recette</p>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground-muted">
                  {costByRecipe.map(([title, total]) => (
                    <li key={title}>
                      {title} — {total.toFixed(2)} €
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="mb-4 flex items-center gap-3">
        <input
          type="range"
          min={5}
          max={30}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-24 text-sm text-foreground-muted">{days} derniers jours</span>
        <Button variant="ghost" size="icon" onClick={handleExportCsv} disabled={visible.length === 0} title="Exporter en CSV">
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-subtle">Aucun repas cuisiné sur cette période.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((entry) => {
            const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : undefined;
            return (
              <li key={entry.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{recipe?.title ?? "Recette supprimée"}</p>
                  <p className="text-xs text-foreground-subtle">
                    {new Date(entry.cooked_at).toLocaleDateString("fr-FR")} · {entry.servings} pers.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {recipe && (
                    <button
                      type="button"
                      onClick={() => handleRecook(recipe.id)}
                      disabled={isPending}
                      title="Recuisiner"
                      className="rounded p-1.5 text-foreground-subtle hover:bg-primary-tint hover:text-primary-strong"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(entry)}
                    disabled={isPending}
                    title="Supprimer"
                    className="rounded p-1.5 text-foreground-subtle hover:bg-danger-tint hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
