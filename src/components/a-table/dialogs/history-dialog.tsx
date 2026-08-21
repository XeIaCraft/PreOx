"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Trash2, RotateCcw, Download, Flame, Award, BookOpen, Camera } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { removeHistoryEntry, restoreHistoryEntry, addRecipeToBacklog, addHistoryPhoto } from "@/app/apps/a-table/actions/planning";
import { useToast } from "@/components/ui/toast";
import { fileToBase64 } from "@/lib/client-file";
import type { HistoryEntry, Recipe } from "@/lib/a-table/types";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

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

  const weeklyTrend = useMemo(() => {
    const WEEKS = 8;
    const weekStart = (t: number) => {
      const d = new Date(t);
      const day = (d.getDay() + 6) % 7; // Monday = 0
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - day);
      return d.getTime();
    };
    const thisWeekStart = weekStart(now);
    const buckets = new Map<number, { meals: number; kcalSum: number; kcalCount: number }>();
    for (let i = WEEKS - 1; i >= 0; i--) {
      buckets.set(thisWeekStart - i * 7 * 24 * 60 * 60 * 1000, { meals: 0, kcalSum: 0, kcalCount: 0 });
    }
    for (const entry of history) {
      const ws = weekStart(new Date(entry.cooked_at).getTime());
      const bucket = buckets.get(ws);
      if (!bucket) continue;
      bucket.meals += 1;
      const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : undefined;
      if (recipe?.nutrition.kcal != null) {
        bucket.kcalSum += recipe.nutrition.kcal;
        bucket.kcalCount += 1;
      }
    }
    const weeks = [...buckets.entries()].map(([start, b]) => ({
      start,
      meals: b.meals,
      avgKcal: b.kcalCount > 0 ? Math.round(b.kcalSum / b.kcalCount) : null,
    }));
    const hasData = weeks.some((w) => w.meals > 0);
    const maxMeals = Math.max(1, ...weeks.map((w) => w.meals));
    const maxKcal = Math.max(1, ...weeks.map((w) => w.avgKcal ?? 0));
    return { weeks, hasData, maxMeals, maxKcal };
  }, [history, recipesById, now]);

  const badges = useMemo(() => {
    const weekStart = (t: number) => {
      const d = new Date(t);
      const day = (d.getDay() + 6) % 7;
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - day);
      return d.getTime();
    };
    const cookedWeeks = new Set(history.map((h) => weekStart(new Date(h.cooked_at).getTime())));
    let streak = 0;
    let cursor = weekStart(now);
    while (cookedWeeks.has(cursor)) {
      streak++;
      cursor -= 7 * 24 * 60 * 60 * 1000;
    }
    const distinctRecipes = new Set(history.map((h) => h.recipe_id).filter(Boolean)).size;
    const totalMeals = history.length;

    return [
      { earned: streak >= 2, icon: Flame, label: "2 semaines de suite" },
      { earned: streak >= 4, icon: Flame, label: "4 semaines de suite" },
      { earned: totalMeals >= 10, icon: Award, label: "10 repas cuisinés" },
      { earned: totalMeals >= 50, icon: Award, label: "50 repas cuisinés" },
      { earned: totalMeals >= 100, icon: Award, label: "100 repas cuisinés" },
      { earned: distinctRecipes >= 10, icon: BookOpen, label: "10 recettes différentes" },
      { earned: distinctRecipes >= 25, icon: BookOpen, label: "25 recettes différentes" },
    ].filter((b) => b.earned);
  }, [history, now]);

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

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  function handlePhotoSelected(file: File | undefined) {
    if (!file || !photoTargetId) return;
    if (!file.type.startsWith("image/")) {
      toast("Seules les images sont acceptées.", { variant: "error" });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast("Photo trop lourde (8 Mo maximum).", { variant: "error" });
      return;
    }
    setUploadingPhoto(true);
    fileToBase64(file)
      .then((base64) => addHistoryPhoto(photoTargetId, base64, file.type || "image/jpeg"))
      .then((result) => {
        if (result.error) toast(result.error, { variant: "error" });
        else onSaved();
      })
      .finally(() => setUploadingPhoto(false));
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

      {badges.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <span
              key={i}
              title={b.label}
              className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent-tint px-2.5 py-1 text-[11px] text-accent"
            >
              <b.icon className="h-3 w-3" /> {b.label}
            </span>
          ))}
        </div>
      )}

      {weeklyTrend.hasData && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs font-medium text-foreground-subtle">Tendance sur les 8 dernières semaines</summary>
          <div className="mt-3 space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Repas cuisinés / semaine</p>
              <div className="flex h-20 items-end gap-1.5">
                {weeklyTrend.weeks.map((w) => (
                  <div key={w.start} className="flex flex-1 flex-col items-center gap-1" title={`${w.meals} repas`}>
                    <div
                      className="w-full rounded-t-[3px] bg-primary/70"
                      style={{ height: `${Math.max(2, (w.meals / weeklyTrend.maxMeals) * 100)}%` }}
                    />
                    <span className="text-[10px] text-foreground-subtle">{new Date(w.start).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
            {weeklyTrend.weeks.some((w) => w.avgKcal != null) && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Kcal moyen / repas</p>
                <div className="flex h-20 items-end gap-1.5">
                  {weeklyTrend.weeks.map((w) => (
                    <div key={w.start} className="flex flex-1 flex-col items-center gap-1" title={w.avgKcal != null ? `${w.avgKcal} kcal` : "Pas de donnée"}>
                      <div
                        className="w-full rounded-t-[3px] bg-accent/70"
                        style={{ height: w.avgKcal != null ? `${Math.max(2, (w.avgKcal / weeklyTrend.maxKcal) * 100)}%` : "2%" }}
                      />
                      <span className="text-[10px] text-foreground-subtle">{new Date(w.start).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
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
              <li key={entry.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2.5">
                  {entry.photo_url && (
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-muted">
                      <Image src={entry.photo_url} alt="" fill sizes="40px" className="object-cover" />
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{recipe?.title ?? "Recette supprimée"}</p>
                    <p className="text-xs text-foreground-subtle">
                      {new Date(entry.cooked_at).toLocaleDateString("fr-FR")} · {entry.servings} pers.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoTargetId(entry.id);
                      photoInputRef.current?.click();
                    }}
                    disabled={uploadingPhoto}
                    title={entry.photo_url ? "Remplacer la photo" : "Ajouter une photo"}
                    className="rounded p-1.5 text-foreground-subtle hover:bg-primary-tint hover:text-primary-strong"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
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
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handlePhotoSelected(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </Modal>
  );
}
