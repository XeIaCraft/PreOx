"use client";

import { useTransition } from "react";
import Image from "next/image";
import { Star, Image as ImageIcon, Clock, Users, Euro } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RefineBox } from "@/components/a-table/ui/refine-box";
import { Button } from "@/components/ui/button";
import { toggleFavorite, fetchRecipeImage, refineRecipe } from "@/app/apps/a-table/actions/recipes";
import { useToast } from "@/components/ui/toast";
import { scaleFactor } from "@/lib/a-table/shopping";
import type { Appetite, Recipe } from "@/lib/a-table/types";

interface RecipeDetailDialogProps {
  recipe: Recipe;
  servings: number;
  appetite: Appetite;
  onClose: () => void;
  onSaved: () => void;
  onCookMode?: () => void;
}

export function RecipeDetailDialog({ recipe, servings, appetite, onClose, onSaved, onCookMode }: RecipeDetailDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const factor = scaleFactor(recipe.servings, servings, appetite);

  function handleFavorite() {
    startTransition(async () => {
      const result = await toggleFavorite(recipe.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  function handleFetchImage() {
    startTransition(async () => {
      const result = await fetchRecipeImage(recipe.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  return (
    <Modal title={recipe.title} onClose={onClose} size="lg">
      {recipe.image_url && (
        <div className="relative mb-4 h-48 w-full overflow-hidden rounded-[var(--radius-md)]">
          <Image src={recipe.image_url} alt={recipe.image_alt || recipe.title} fill sizes="600px" className="object-cover" />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant={recipe.is_favorite ? "primary" : "secondary"} size="sm" onClick={handleFavorite} disabled={isPending}>
          <Star className="h-4 w-4" />
          {recipe.is_favorite ? "Favori" : "Ajouter aux favoris"}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleFetchImage} disabled={isPending}>
          <ImageIcon className="h-4 w-4" />
          Illustrer
        </Button>
        {onCookMode && (
          <Button variant="outline" size="sm" onClick={onCookMode}>
            Mode recette
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm text-foreground-muted">
        {recipe.cooking_minutes != null && (
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" /> {recipe.cooking_minutes} min
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users className="h-4 w-4" /> {servings} pers.
        </span>
        {recipe.price_per_serving != null && (
          <span className="flex items-center gap-1">
            <Euro className="h-4 w-4" /> {recipe.price_per_serving.toFixed(2)} / part
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Ingrédients</h3>
          <ul className="space-y-1 text-sm text-foreground-muted">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {typeof ing.quantity === "number" ? Math.round(ing.quantity * factor * 100) / 100 : ing.quantity ?? ""}{" "}
                {ing.unit} {ing.name}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Nutrition (par portion)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-foreground-muted">
            <span>Kcal : {recipe.nutrition.kcal ?? "–"}</span>
            <span>Protéines : {recipe.nutrition.protein_g ?? "–"} g</span>
            <span>Glucides : {recipe.nutrition.carb_g ?? "–"} g</span>
            <span>Lipides : {recipe.nutrition.fat_g ?? "–"} g</span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Étapes</h3>
        <ol className="space-y-2">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground-muted">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint text-xs font-medium text-primary-strong">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {recipe.notes && (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-3 text-sm text-foreground-muted">{recipe.notes}</div>
      )}

      <div className="mt-6">
        <RefineBox onSubmit={(message) => refineRecipe(recipe.id, message)} onApplied={onSaved} />
      </div>
    </Modal>
  );
}
