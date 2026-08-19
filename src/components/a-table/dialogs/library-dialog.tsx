"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Star, Archive, ArchiveRestore, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
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

export function LibraryDialog({ recipes, onClose, onSaved, onOpenDetail }: LibraryDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      if (r.is_archived !== showArchived) return false;
      if (favoritesOnly && !r.is_favorite) return false;
      if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [recipes, search, favoritesOnly, showArchived]);

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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-9" />
        </div>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${favoritesOnly ? "border-accent bg-accent-tint text-accent-foreground" : "border-border text-foreground-muted"}`}
        >
          <Star className="h-3.5 w-3.5" /> Favoris
        </button>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${showArchived ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-muted"}`}
        >
          <Archive className="h-3.5 w-3.5" /> Archivées
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground-subtle">Aucune recette trouvée.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((recipe) => (
            <li key={recipe.id} className="flex items-center justify-between gap-3 py-2.5">
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
    </Modal>
  );
}
