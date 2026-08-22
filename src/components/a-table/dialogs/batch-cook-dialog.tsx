"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { batchAddRecipeToDays } from "@/app/apps/a-table/actions/planning";
import { DAY_LABELS, EQUIPMENT_OPTIONS, WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import { useToast } from "@/components/ui/toast";
import type { Placement, Recipe } from "@/lib/a-table/types";

/** Which of a recipe's freeform tags name a piece of equipment, matched against the settings' equipment list. */
function equipmentTags(recipe: Recipe): string[] {
  const labels = EQUIPMENT_OPTIONS.map((e) => e.label.toLowerCase());
  return recipe.tags.filter((tag) => labels.some((label) => tag.toLowerCase().includes(label) || label.includes(tag.toLowerCase())));
}

export function BatchCookDialog({
  recipes,
  weekStart,
  onClose,
  onSaved,
}: {
  recipes: Recipe[];
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const active = recipes.filter((r) => !r.is_archived);
  const [recipeId, setRecipeId] = useState(active[0]?.id ?? "");
  const recipe = active.find((r) => r.id === recipeId);
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const [days, setDays] = useState<Set<Placement>>(new Set());

  // "Optimiseur de vaisselle" v1: recipes tagged with the same equipment as
  // the selected one are worth cooking in the same session (oven/plancha
  // already hot, one less appliance to wash) — surfaced as a hint, not
  // auto-selected, since batch cooking one recipe on several days is still
  // the dialog's primary purpose.
  const sameEquipmentRecipes = useMemo(() => {
    if (!recipe) return [];
    const tags = equipmentTags(recipe);
    if (tags.length === 0) return [];
    return active.filter((r) => r.id !== recipe.id && equipmentTags(r).some((t) => tags.includes(t)));
  }, [recipe, active]);

  function toggleDay(day: Placement) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function handleSave() {
    if (!recipeId || days.size === 0) return;
    startTransition(async () => {
      const result = await batchAddRecipeToDays(recipeId, servings, [...days], weekStart);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
        onClose();
      }
    });
  }

  return (
    <Modal title="Cuisiner en lot" onClose={onClose} size="sm">
      <p className="mb-3 text-sm text-foreground-muted">
        Placez la même recette sur plusieurs jours d&rsquo;un coup — pratique pour cuisiner une grande quantité et manger les restes toute la
        semaine.
      </p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="batch-recipe">Recette</Label>
          <Select
            id="batch-recipe"
            value={recipeId}
            onChange={(e) => {
              setRecipeId(e.target.value);
              const r = active.find((x) => x.id === e.target.value);
              if (r) setServings(r.servings);
            }}
          >
            {active.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="batch-servings">Portions par jour</Label>
          <Input id="batch-servings" type="number" min={1} value={servings} onChange={(e) => setServings(Number(e.target.value))} />
        </div>
        {sameEquipmentRecipes.length > 0 && (
          <p className="rounded-[var(--radius-sm)] border border-border bg-surface-muted/50 px-2.5 py-2 text-xs text-foreground-subtle">
            Même équipement : {sameEquipmentRecipes.map((r) => r.title).join(", ")}. Les cuisiner la même session limite la vaisselle.
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Jours</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_PLACEMENTS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  days.has(day) ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-subtle"
                }`}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !recipeId || days.size === 0}>
          Placer sur {days.size || 0} jour{days.size > 1 ? "s" : ""}
        </Button>
      </div>
    </Modal>
  );
}
