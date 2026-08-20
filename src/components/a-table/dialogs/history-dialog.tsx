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
