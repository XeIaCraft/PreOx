"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBasket, BookOpen, History as HistoryIcon, Settings, RefreshCw, Plus, GlassWater } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DAY_LABELS, WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import { useToast } from "@/components/a-table/toast";
import { TodayHero } from "@/components/a-table/today-hero";
import { TempIngredientsRow } from "@/components/a-table/temp-ingredients-row";
import { GeneratorBar } from "@/components/a-table/generator-bar";
import { DayColumn } from "@/components/a-table/day-column";
import { MealCard } from "@/components/a-table/meal-card";
import { RecipeDetailDialog } from "@/components/a-table/dialogs/recipe-detail-dialog";
import { AddRecipeDialog } from "@/components/a-table/dialogs/add-recipe-dialog";
import { TempIngredientDialog } from "@/components/a-table/dialogs/temp-ingredient-dialog";
import { LibraryDialog } from "@/components/a-table/dialogs/library-dialog";
import { RateDialog } from "@/components/a-table/dialogs/rate-dialog";
import { HistoryDialog } from "@/components/a-table/dialogs/history-dialog";
import { ShoppingDialog } from "@/components/a-table/dialogs/shopping-dialog";
import { ValidateDraftDialog } from "@/components/a-table/dialogs/validate-draft-dialog";
import { SettingsDialog } from "@/components/a-table/dialogs/settings-dialog";
import { GuestMenuDialog } from "@/components/a-table/dialogs/guest-menu-dialog";
import { CookModeDialog } from "@/components/a-table/dialogs/cook-mode-dialog";
import { moveMealCard, cookMealCard, removeMealCard, addRecipeToBacklog } from "@/app/apps/a-table/actions/planning";
import { generateDraft } from "@/app/apps/a-table/actions/drafts";
import { removeTemporaryIngredient } from "@/app/apps/a-table/actions/temp_ingredients";
import type { ATableData, Placement, TemporaryIngredient } from "@/lib/a-table/types";

type ModalState =
  | { type: "detail"; recipeId: string }
  | { type: "add" }
  | { type: "add_temp" }
  | { type: "edit_temp"; ingredient: TemporaryIngredient }
  | { type: "library" }
  | { type: "rate"; recipeId: string; recipeTitle: string }
  | { type: "history" }
  | { type: "shopping" }
  | { type: "validate"; draftId: string }
  | { type: "settings" }
  | { type: "guest"; menuId: string | null }
  | { type: "cook"; recipeIds: string[] }
  | null;

export function ATableBoard({ initialData }: { initialData: ATableData }) {
  const router = useRouter();
  const { toast } = useToast();
  // No local copy: router.refresh() re-runs the server component and this
  // prop already carries the fresh data on the next render.
  const data = initialData;
  const [modal, setModal] = useState<ModalState>(null);
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  const recipesById = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);
  const activeCards = useMemo(() => data.mealCards.filter((c) => c.status === "active"), [data.mealCards]);
  const backlogCards = useMemo(
    () => activeCards.filter((c) => c.placement === "backlog").sort((a, b) => a.position - b.position),
    [activeCards]
  );

  const todayKey = WEEKDAY_PLACEMENTS[(new Date().getDay() + 6) % 7];
  const todayCard = activeCards.find((c) => c.placement === todayKey) ?? null;
  const todayRecipe = todayCard ? (recipesById.get(todayCard.recipe_id) ?? null) : null;

  function handleMove(cardId: string, placement: Placement) {
    setPendingCardId(cardId);
    startTransition(async () => {
      const result = await moveMealCard(cardId, placement);
      setPendingCardId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  function handleCook(cardId: string) {
    const card = data.mealCards.find((c) => c.id === cardId);
    const recipe = card ? recipesById.get(card.recipe_id) : undefined;
    setPendingCardId(cardId);
    startTransition(async () => {
      const result = await cookMealCard(cardId);
      setPendingCardId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        refresh();
        if (recipe) setModal({ type: "rate", recipeId: recipe.id, recipeTitle: recipe.title });
      }
    });
  }

  function handleRemove(cardId: string) {
    setPendingCardId(cardId);
    startTransition(async () => {
      const card = data.mealCards.find((c) => c.id === cardId);
      const result = await removeMealCard(cardId);
      setPendingCardId(null);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      refresh();
      if (card) {
        toast("Carte supprimée.", {
          actionLabel: "Annuler",
          onAction: () => {
            startTransition(async () => {
              await addRecipeToBacklog(card.recipe_id, card.servings);
              refresh();
            });
          },
        });
      }
    });
  }

  function handleGenerate(count: number) {
    startGenerating(async () => {
      const result = await generateDraft(count);
      if (result.error) toast(result.error, { variant: "error" });
      else if (result.draftId) {
        refresh();
        setModal({ type: "validate", draftId: result.draftId });
      }
    });
  }

  function handleRemoveTempIngredient(id: string) {
    startTransition(async () => {
      const result = await removeTemporaryIngredient(id);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  const detailRecipe = modal?.type === "detail" ? recipesById.get(modal.recipeId) : undefined;
  const detailCard = detailRecipe ? activeCards.find((c) => c.recipe_id === detailRecipe.id) : undefined;
  const validateDraft = modal?.type === "validate" ? data.drafts.find((d) => d.id === modal.draftId) : undefined;

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif-display text-2xl font-medium text-foreground">À table</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "shopping" })}>
            <ShoppingBasket className="h-4 w-4" /> Courses
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "library" })}>
            <BookOpen className="h-4 w-4" /> Mes recettes
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "history" })}>
            <HistoryIcon className="h-4 w-4" /> Historique
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "guest", menuId: data.guestMenus[0]?.id ?? null })}>
            <GlassWater className="h-4 w-4" /> Repas spécial
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "settings" })}>
            <Settings className="h-4 w-4" /> Réglages
          </Button>
          <Button variant="ghost" size="icon" onClick={refresh} title="Actualiser">
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <TodayHero
        card={todayCard}
        recipe={todayRecipe}
        onOpenDetail={() => todayRecipe && setModal({ type: "detail", recipeId: todayRecipe.id })}
        onCook={() => todayCard && handleCook(todayCard.id)}
        onScrollToGenerator={() => document.getElementById("a-table-generator")?.scrollIntoView({ behavior: "smooth" })}
      />

      <TempIngredientsRow
        items={data.temporaryIngredients}
        onAdd={() => setModal({ type: "add_temp" })}
        onEdit={(ingredient) => setModal({ type: "edit_temp", ingredient })}
        onRemove={handleRemoveTempIngredient}
      />

      <GeneratorBar defaultCount={data.settings.preferences.default_recipe_count} onGenerate={handleGenerate} isPending={isGenerating} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground-muted">À cuisiner</p>
          <span className="text-xs text-foreground-subtle">{backlogCards.length}</span>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const cardId = e.dataTransfer.getData("text/plain");
            if (cardId) handleMove(cardId, "backlog");
          }}
          className="flex gap-3 overflow-x-auto rounded-[var(--radius-md)] border border-dashed border-border p-2"
        >
          {backlogCards.length === 0 ? (
            <p className="p-2 text-sm text-foreground-subtle">Rien en attente.</p>
          ) : (
            backlogCards.map((card) => {
              const recipe = recipesById.get(card.recipe_id);
              if (!recipe) return null;
              return (
                <div key={card.id} className="w-40 shrink-0">
                  <MealCard
                    card={card}
                    recipe={recipe}
                    onOpenDetail={() => setModal({ type: "detail", recipeId: recipe.id })}
                    onCook={() => handleCook(card.id)}
                    onRemove={() => handleRemove(card.id)}
                    onMove={(p) => handleMove(card.id, p)}
                    isPending={pendingCardId === card.id}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {WEEKDAY_PLACEMENTS.map((placement) => (
          <DayColumn
            key={placement}
            placement={placement}
            label={DAY_LABELS[placement]}
            cards={activeCards.filter((c) => c.placement === placement).sort((a, b) => a.position - b.position)}
            recipesById={recipesById}
            isToday={placement === todayKey}
            onDrop={handleMove}
            onOpenDetail={(recipeId) => setModal({ type: "detail", recipeId })}
            onCook={handleCook}
            onRemove={handleRemove}
            onMove={handleMove}
          />
        ))}
      </div>

      <Button variant="secondary" onClick={() => setModal({ type: "add" })} className="w-full sm:w-auto">
        <Plus className="h-4 w-4" /> Ajouter une recette
      </Button>

      {detailRecipe && (
        <RecipeDetailDialog
          recipe={detailRecipe}
          servings={detailCard?.servings ?? detailRecipe.servings}
          appetite={data.settings.preferences.appetite}
          onClose={() => setModal(null)}
          onSaved={refresh}
          onCookMode={() => setModal({ type: "cook", recipeIds: [detailRecipe.id] })}
        />
      )}

      {modal?.type === "cook" && (
        <CookModeDialog
          recipes={modal.recipeIds
            .map((id) => recipesById.get(id))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((r) => ({ id: r.id, title: r.title, ingredients: r.ingredients, steps: r.steps }))}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === "add" && <AddRecipeDialog onClose={() => setModal(null)} onSaved={refresh} />}

      {modal?.type === "add_temp" && <TempIngredientDialog ingredient={null} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === "edit_temp" && (
        <TempIngredientDialog ingredient={modal.ingredient} onClose={() => setModal(null)} onSaved={refresh} />
      )}

      {modal?.type === "library" && (
        <LibraryDialog
          recipes={data.recipes}
          onClose={() => setModal(null)}
          onSaved={refresh}
          onOpenDetail={(recipeId) => setModal({ type: "detail", recipeId })}
        />
      )}

      {modal?.type === "rate" && (
        <RateDialog recipeId={modal.recipeId} recipeTitle={modal.recipeTitle} onClose={() => setModal(null)} onSaved={refresh} />
      )}

      {modal?.type === "history" && (
        <HistoryDialog history={data.history} recipesById={recipesById} onClose={() => setModal(null)} onSaved={refresh} />
      )}

      {modal?.type === "shopping" && (
        <ShoppingDialog
          mealCards={activeCards}
          recipesById={recipesById}
          guestMenus={data.guestMenus}
          appetite={data.settings.preferences.appetite}
          exportedRecipeIds={data.settings.shopping_list_exported_recipe_ids}
          checked={data.settings.shopping_list_checked}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}

      {validateDraft && (
        <ValidateDraftDialog
          draftId={validateDraft.id}
          proposals={validateDraft.proposals}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}

      {modal?.type === "settings" && (
        <SettingsDialog settings={data.settings} onClose={() => setModal(null)} onSaved={refresh} />
      )}

      {modal?.type === "guest" && (
        <GuestMenuDialog
          menu={data.guestMenus.find((m) => m.id === modal.menuId) ?? null}
          onClose={() => setModal(null)}
          onSaved={refresh}
          onCreated={(menuId) => setModal({ type: "guest", menuId })}
        />
      )}
    </div>
  );
}
