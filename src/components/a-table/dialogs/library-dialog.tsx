"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Search, Star, Archive, ArchiveRestore, Plus, Download, Sparkle, Printer } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { setRecipeArchived } from "@/app/apps/a-table/actions/recipes";
import { addRecipeToBacklog } from "@/app/apps/a-table/actions/planning";
import { useToast } from "@/components/ui/toast";
import type { Recipe } from "@/lib/a-table/types";

interface LibraryDialogProps {
  recipes: Recipe[];
  onClose: () => void;
  onSaved: () => void;
  onOpenDetail: (recipeId: string) => void;
}

type SortKey = "recent" | "most_cooked" | "alphabetical";
const SORT_LABELS: Record<SortKey, string> = {
  recent: "Récemment ajoutées",
  most_cooked: "Les plus cuisinées",
  alphabetical: "Alphabétique",
};

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function LibraryDialog({ recipes, onClose, onSaved, onOpenDetail }: LibraryDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [neverCookedOnly, setNeverCookedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const r of recipes) for (const tag of r.tags) tags.add(tag);
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  const printableRecipes = useMemo(
    () => recipes.filter((r) => !r.is_archived).sort((a, b) => a.title.localeCompare(b.title, "fr")),
    [recipes]
  );

  const filtered = useMemo(() => {
    const result = recipes.filter((r) => {
      if (r.is_archived !== showArchived) return false;
      if (favoritesOnly && !r.is_favorite) return false;
      if (neverCookedOnly && r.times_cooked > 0) return false;
      if (activeTag && !r.tags.includes(activeTag)) return false;
      if (search) {
        const term = search.toLowerCase();
        const matchesTitle = r.title.toLowerCase().includes(term);
        const matchesIngredient = r.ingredients.some((i) => i.name.toLowerCase().includes(term));
        if (!matchesTitle && !matchesIngredient) return false;
      }
      return true;
    });
    return result.sort((a, b) => {
      if (sort === "alphabetical") return a.title.localeCompare(b.title, "fr");
      if (sort === "most_cooked") return b.times_cooked - a.times_cooked;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [recipes, search, favoritesOnly, neverCookedOnly, showArchived, activeTag, sort]);

  function handleExportCsv() {
    const header = ["Titre", "Portions", "Temps (min)", "Tags", "Favori", "Fois cuisinée"];
    const rows = filtered.map((r) => [
      r.title,
      String(r.servings),
      r.cooking_minutes != null ? String(r.cooking_minutes) : "",
      r.tags.join(", "),
      r.is_favorite ? "oui" : "non",
      String(r.times_cooked),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "mes-recettes.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function handleArchiveToggle(recipe: Recipe) {
    startTransition(async () => {
      const result = await setRecipeArchived(recipe.id, !recipe.is_archived);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  function handleAddToBacklog(recipeId: string) {
    startTransition(async () => {
      const result = await addRecipeToBacklog(recipeId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
      }
    });
  }

  return (
    <Modal title="Mes recettes" onClose={onClose} size="lg">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre ou ingrédient…" className="pl-9" />
        </div>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${favoritesOnly ? "border-accent bg-accent-tint text-accent" : "border-border text-foreground-muted"}`}
        >
          <Star className="h-3.5 w-3.5" /> Favoris
        </button>
        <button
          type="button"
          onClick={() => setNeverCookedOnly((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${neverCookedOnly ? "border-accent bg-accent-tint text-accent" : "border-border text-foreground-muted"}`}
        >
          <Sparkle className="h-3.5 w-3.5" /> À essayer
        </button>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${showArchived ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-muted"}`}
        >
          <Archive className="h-3.5 w-3.5" /> Archivées
        </button>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-auto text-sm">
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
          title="Exporter en CSV"
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Exporter
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={printableRecipes.length === 0}
          title="Exporter la bibliothèque complète en PDF (impression)"
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground disabled:opacity-40"
        >
          <Printer className="h-3.5 w-3.5" /> PDF illustré
        </button>
      </div>

      {/* Print-only: the whole non-archived library, illustrated — hidden on
          screen, takes over the page via .print-area (see globals.css) when
          "PDF illustré" triggers window.print(). */}
      <div className="print-area hidden print:block">
        <h1 className="mb-4 font-serif-display text-xl font-medium text-foreground">Ma bibliothèque de recettes</h1>
        {printableRecipes.map((recipe) => (
          <div key={recipe.id} className="mb-6 break-inside-avoid">
            <div className="flex items-start gap-3">
              {recipe.image_url && (
                <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded">
                  <Image src={recipe.image_url} alt={recipe.image_alt || recipe.title} fill sizes="112px" className="object-cover" />
                </div>
              )}
              <div>
                <p className="font-semibold text-foreground">{recipe.title}</p>
                <p className="text-xs text-foreground-subtle">
                  {recipe.servings} portion{recipe.servings > 1 ? "s" : ""}
                  {recipe.cooking_minutes != null ? ` · ${recipe.cooking_minutes} min` : ""}
                  {recipe.tags.length > 0 ? ` · ${recipe.tags.join(", ")}` : ""}
                </p>
              </div>
            </div>
            {recipe.ingredients.length > 0 && (
              <ul className="ml-4 mt-1 list-disc text-sm text-foreground-muted">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>
                    {ing.quantity ? `${ing.quantity} ${ing.unit} ` : ""}
                    {ing.name}
                  </li>
                ))}
              </ul>
            )}
            {recipe.steps.length > 0 && (
              <ol className="ml-4 mt-1 list-decimal text-sm text-foreground-muted">
                {recipe.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag((t) => (t === tag ? null : tag))}
              className={`rounded-full border px-2.5 py-1 text-xs ${activeTag === tag ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-subtle hover:text-foreground"}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-foreground-subtle">
          {search.trim() || favoritesOnly || neverCookedOnly || activeTag ? (
            <>
              <p>Aucun résultat pour ces filtres.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFavoritesOnly(false);
                  setNeverCookedOnly(false);
                  setActiveTag(null);
                }}
                className="mt-2 underline hover:text-foreground"
              >
                Réinitialiser
              </button>
            </>
          ) : (
            <p>{showArchived ? "Aucune recette archivée." : "Aucune recette pour l'instant — ajoutez-en une depuis le tableau."}</p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((recipe) => (
            <li key={recipe.id} className="flex items-center justify-between gap-3 py-[var(--row-py)]">
              <button type="button" onClick={() => onOpenDetail(recipe.id)} className="flex-1 text-left">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {recipe.is_favorite && <Star className="h-3.5 w-3.5 fill-accent text-accent" />}
                  {recipe.title}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {recipe.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="neutral" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {!recipe.is_archived && (
                  <button
                    type="button"
                    onClick={() => handleAddToBacklog(recipe.id)}
                    disabled={isPending}
                    title="Ajouter à À cuisiner"
                    className="rounded p-1.5 text-foreground-subtle hover:bg-primary-tint hover:text-primary-strong"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleArchiveToggle(recipe)}
                  disabled={isPending}
                  title={recipe.is_archived ? "Désarchiver" : "Archiver"}
                  className="rounded p-1.5 text-foreground-subtle hover:bg-surface-muted"
                >
                  {recipe.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {recipes.length > 0 && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-foreground-subtle">
          {recipes.filter((r) => !r.is_archived).length} recette{recipes.filter((r) => !r.is_archived).length > 1 ? "s" : ""} ·{" "}
          {recipes.filter((r) => r.is_favorite).length} favorite{recipes.filter((r) => r.is_favorite).length > 1 ? "s" : ""}
        </p>
      )}
    </Modal>
  );
}
