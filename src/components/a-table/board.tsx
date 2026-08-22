"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBasket, BookOpen, FolderHeart, History as HistoryIcon, Settings, RefreshCw, Plus, GlassWater, HelpCircle, Printer, CalendarPlus, Sparkles, CookingPot, ImageDown, LayoutTemplate } from "lucide-react";
import { OnboardingTour } from "@/components/onboarding-tour";
import { hasSeenOnboarding } from "@/lib/onboarding";
import { A_TABLE_ONBOARDING_STEPS } from "@/components/a-table/onboarding-steps";
import { Button } from "@/components/ui/button";
import { DAY_LABELS, WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import { useToast } from "@/components/ui/toast";
import { TodayHero } from "@/components/a-table/today-hero";
import { TempIngredientsRow } from "@/components/a-table/temp-ingredients-row";
import { GeneratorBar } from "@/components/a-table/generator-bar";
import { DayColumn } from "@/components/a-table/day-column";
import { MealCard } from "@/components/a-table/meal-card";
import { RecipeDetailDialog } from "@/components/a-table/dialogs/recipe-detail-dialog";
import { AddRecipeDialog } from "@/components/a-table/dialogs/add-recipe-dialog";
import { TempIngredientDialog } from "@/components/a-table/dialogs/temp-ingredient-dialog";
import { LibraryDialog } from "@/components/a-table/dialogs/library-dialog";
import { BatchCookDialog } from "@/components/a-table/dialogs/batch-cook-dialog";
import { WeekTemplatesDialog } from "@/components/a-table/dialogs/week-templates-dialog";
import { CollectionsDialog } from "@/components/a-table/dialogs/collections-dialog";
import { RateDialog } from "@/components/a-table/dialogs/rate-dialog";
import { HistoryDialog } from "@/components/a-table/dialogs/history-dialog";
import { ShoppingDialog } from "@/components/a-table/dialogs/shopping-dialog";
import { ValidateDraftDialog } from "@/components/a-table/dialogs/validate-draft-dialog";
import { SettingsDialog } from "@/components/a-table/dialogs/settings-dialog";
import { GuestMenuDialog } from "@/components/a-table/dialogs/guest-menu-dialog";
import { CookModeDialog } from "@/components/a-table/dialogs/cook-mode-dialog";
import { TimerBar, useTimers } from "@/components/a-table/ui/timer-bar";
import {
  moveMealCard,
  cookMealCard,
  removeMealCard,
  addRecipeToBacklog,
  updateMealCardServings,
  duplicateMealCard,
  toggleMealCardLock,
  clearWeek,
  restoreWeekPlacements,
} from "@/app/apps/a-table/actions/planning";
import { generateDraft } from "@/app/apps/a-table/actions/drafts";
import { generateRecipeFromLeftovers } from "@/app/apps/a-table/actions/recipes";
import { removeTemporaryIngredient } from "@/app/apps/a-table/actions/temp_ingredients";
import { scaleFactor, findRareIngredientOverlaps } from "@/lib/a-table/shopping";
import { buildWeekIcs } from "@/lib/a-table/ics";
import { buildWeekImage } from "@/lib/a-table/week-image";
import { findOutOfSeasonIngredients } from "@/lib/a-table/seasonality";
import { mondayIso, addDaysIso, formatWeekRange } from "@/lib/a-table/week";
import { MonthViewDialog } from "@/components/a-table/dialogs/month-view-dialog";
import type { ATableData, Placement, TemporaryIngredient } from "@/lib/a-table/types";

type ModalState =
  | { type: "detail"; recipeId: string }
  | { type: "add" }
  | { type: "add_temp" }
  | { type: "edit_temp"; ingredient: TemporaryIngredient }
  | { type: "library" }
  | { type: "batch_cook" }
  | { type: "week_templates" }
  | { type: "collections" }
  | { type: "rate"; recipeId: string; recipeTitle: string }
  | { type: "history" }
  | { type: "shopping" }
  | { type: "validate"; draftId: string }
  | { type: "settings" }
  | { type: "guest"; menuId: string | null }
  | { type: "cook"; recipeIds: string[] }
  | { type: "month" }
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
  const [tourOpen, setTourOpen] = useState(() => !hasSeenOnboarding("a-table"));
  const { timers, startTimer, dismissTimer } = useTimers();
  const [selectingForCombinedCook, setSelectingForCombinedCook] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  // Multi-week planning: which week the board currently displays. Backlog
  // cards ignore this entirely (they aren't tied to any week); only the
  // weekday columns, week totals, and print/export views are scoped to it.
  const [viewedWeekStart, setViewedWeekStart] = useState(() => mondayIso(new Date()));
  const isCurrentWeek = viewedWeekStart === mondayIso(new Date());
  // Cards being actively cooked (mode recette open) are frozen — protects
  // against an accidental drag/removal mid-cook, distinct from the manual
  // "locked" flag which only guards against "Vider la semaine".
  const [cookingCardIds, setCookingCardIds] = useState<Set<string>>(new Set());

  function refresh() {
    startTransition(() => router.refresh());
  }

  const recipesById = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const r of data.recipes) for (const tag of r.tags) tags.add(tag);
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [data.recipes]);
  const activeCards = useMemo(() => data.mealCards.filter((c) => c.status === "active"), [data.mealCards]);
  const weekCards = useMemo(
    () => activeCards.filter((c) => WEEKDAY_PLACEMENTS.includes(c.placement) && c.week_start === viewedWeekStart),
    [activeCards, viewedWeekStart]
  );
  const weekTotals = useMemo(() => {
    let kcal = 0;
    let cost = 0;
    let protein = 0;
    let carb = 0;
    let fat = 0;
    let mealCount = 0;
    let hasKcal = false;
    let hasCost = false;
    let cookingMinutes = 0;
    for (const card of weekCards) {
      const recipe = recipesById.get(card.recipe_id);
      if (!recipe) continue;
      mealCount += 1;
      if (recipe.cooking_minutes != null) cookingMinutes += recipe.cooking_minutes;
      const factor = scaleFactor(recipe.servings, card.servings || recipe.servings, data.settings.preferences.appetite);
      if (recipe.nutrition.kcal != null) {
        kcal += recipe.nutrition.kcal * factor;
        hasKcal = true;
      }
      if (recipe.nutrition.protein_g != null) protein += recipe.nutrition.protein_g * factor;
      if (recipe.nutrition.carb_g != null) carb += recipe.nutrition.carb_g * factor;
      if (recipe.nutrition.fat_g != null) fat += recipe.nutrition.fat_g * factor;
      if (recipe.price_per_serving != null) {
        cost += recipe.price_per_serving * (card.servings || recipe.servings);
        hasCost = true;
      }
    }
    const macroKcal = protein * 4 + carb * 4 + fat * 9;
    const macroPct =
      macroKcal > 0
        ? { protein_pct: Math.round((protein * 4 * 100) / macroKcal), carb_pct: Math.round((carb * 4 * 100) / macroKcal), fat_pct: Math.round((fat * 9 * 100) / macroKcal) }
        : null;
    return {
      kcal: Math.round(kcal),
      cost,
      hasKcal,
      hasCost,
      avgKcalPerMeal: mealCount > 0 ? Math.round(kcal / mealCount) : 0,
      macroPct,
      cookingMinutes,
    };
  }, [weekCards, data.settings.preferences.appetite, recipesById]);
  const allergyRecipeIds = useMemo(() => {
    // Union with every household member's own allergies — warn if the meal
    // could bother anyone in the household, not just the account owner.
    const allergies = [
      ...data.settings.preferences.allergies,
      ...data.householdMembers.flatMap((m) => m.allergies),
    ].map((a) => a.toLowerCase());
    if (allergies.length === 0) return new Set<string>();
    const ids = new Set<string>();
    for (const r of data.recipes) {
      const haystack = [...r.tags, ...r.ingredients.map((i) => i.name)].map((s) => s.toLowerCase());
      if (allergies.some((a) => haystack.some((h) => h.includes(a)))) ids.add(r.id);
    }
    return ids;
  }, [data.recipes, data.settings.preferences.allergies, data.householdMembers]);

  const cookableWithLeftovers = useMemo(() => {
    const leftoverNames = data.temporaryIngredients.map((t) => t.name.toLowerCase());
    if (leftoverNames.length === 0) return [];
    return data.recipes
      .filter((r) => !r.is_archived)
      .map((r) => ({
        recipe: r,
        matches: r.ingredients.filter((ing) => leftoverNames.some((name) => ing.name.toLowerCase().includes(name))).length,
      }))
      .filter((entry) => entry.matches > 0)
      .sort((a, b) => b.matches - a.matches)
      .slice(0, 4);
  }, [data.temporaryIngredients, data.recipes]);
  const backlogCards = useMemo(
    () => activeCards.filter((c) => c.placement === "backlog").sort((a, b) => a.position - b.position),
    [activeCards]
  );

  const todayKey = WEEKDAY_PLACEMENTS[(new Date().getDay() + 6) % 7];
  const currentRealWeekStart = mondayIso(new Date());
  const todayCard = activeCards.find((c) => c.placement === todayKey && c.week_start === currentRealWeekStart) ?? null;
  const todayRecipe = todayCard ? (recipesById.get(todayCard.recipe_id) ?? null) : null;

  const outOfSeasonIngredients = useMemo(() => {
    const names = weekCards.flatMap((c) => recipesById.get(c.recipe_id)?.ingredients.map((i) => i.name) ?? []);
    return findOutOfSeasonIngredients(names);
  }, [weekCards, recipesById]);

  const rareIngredientOverlaps = useMemo(() => {
    const entries = weekCards
      .map((c) => recipesById.get(c.recipe_id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({ title: r.title, ingredients: r.ingredients }));
    return findRareIngredientOverlaps(entries);
  }, [weekCards, recipesById]);

  function handleMove(cardId: string, placement: Placement) {
    setPendingCardId(cardId);
    startTransition(async () => {
      const result = await moveMealCard(cardId, placement, placement === "backlog" ? null : viewedWeekStart);
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

  function handlePrintWeek() {
    window.print();
  }

  function handleExportIcs() {
    const ics = buildWeekIcs(weekCards, recipesById, new Date(`${viewedWeekStart}T00:00:00`));
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "menu-semaine.ics";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function handleShareWeekImage() {
    try {
      const blob = await buildWeekImage(weekCards, recipesById, new Date(`${viewedWeekStart}T00:00:00`));
      const file = new File([blob], "menu-semaine.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Menu de la semaine" });
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "menu-semaine.png";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // user cancelled the share sheet
      toast("Impossible de générer l'image de la semaine.", { variant: "error" });
    }
  }

  function handleToggleLock(cardId: string, locked: boolean) {
    startTransition(async () => {
      const result = await toggleMealCardLock(cardId, locked);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  function handleGenerateFromLeftovers() {
    startGenerating(async () => {
      const result = await generateRecipeFromLeftovers();
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function handleSurpriseMe() {
    const candidates = data.recipes.filter((r) => !r.is_archived);
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setModal({ type: "detail", recipeId: pick.id });
  }

  function handleDuplicateCard(cardId: string) {
    startTransition(async () => {
      const result = await duplicateMealCard(cardId, "backlog");
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function handleServingsChange(cardId: string, servings: number) {
    startTransition(async () => {
      const result = await updateMealCardServings(cardId, servings);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  function handleClearWeek() {
    startTransition(async () => {
      const result = await clearWeek(viewedWeekStart);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      refresh();
      toast(result.success ?? "", {
        actionLabel: "Annuler",
        onAction: () => {
          startTransition(async () => {
            await restoreWeekPlacements(result.cleared ?? []);
            refresh();
          });
        },
      });
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
          <Button data-tour="a-table-shopping" variant="secondary" size="sm" onClick={() => setModal({ type: "shopping" })}>
            <ShoppingBasket className="h-4 w-4" /> Courses
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "library" })}>
            <BookOpen className="h-4 w-4" /> Mes recettes
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "batch_cook" })}>
            <CookingPot className="h-4 w-4" /> Cuisiner en lot
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "week_templates" })}>
            <LayoutTemplate className="h-4 w-4" /> Modèles de semaine
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "collections" })}>
            <FolderHeart className="h-4 w-4" /> Collections
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: "history" })}>
            <HistoryIcon className="h-4 w-4" /> Historique
          </Button>
          <Button data-tour="a-table-guest" variant="secondary" size="sm" onClick={() => setModal({ type: "guest", menuId: data.guestMenus[0]?.id ?? null })}>
            <GlassWater className="h-4 w-4" /> Repas spécial
          </Button>
          <Button data-tour="a-table-settings" variant="secondary" size="sm" onClick={() => setModal({ type: "settings" })}>
            <Settings className="h-4 w-4" /> Réglages
          </Button>
          <Button variant="ghost" size="icon" onClick={refresh} title="Actualiser">
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setTourOpen(true)} title="Revoir le tutoriel" aria-label="Revoir le tutoriel">
            <HelpCircle className="h-4 w-4" />
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

      {cookableWithLeftovers.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-dashed border-primary/30 bg-primary-tint/30 px-3 py-2.5">
          <p className="text-xs font-medium text-primary-strong">Avec ce qu&rsquo;il vous reste, vous pouvez cuisiner :</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {cookableWithLeftovers.map(({ recipe }) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => setModal({ type: "detail", recipeId: recipe.id })}
                className="rounded-full border border-primary/30 bg-surface px-3 py-1 text-xs text-foreground hover:border-primary/50"
              >
                {recipe.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.temporaryIngredients.length > 0 && (
        <Button variant="ghost" size="sm" onClick={handleGenerateFromLeftovers} disabled={isGenerating}>
          <Sparkles className="h-4 w-4" /> Inventer une recette avec mes restes
        </Button>
      )}

      <div data-tour="a-table-generator" className="flex flex-wrap items-center gap-3">
        <GeneratorBar defaultCount={data.settings.preferences.default_recipe_count} onGenerate={handleGenerate} isPending={isGenerating} />
        {data.recipes.some((r) => !r.is_archived) && (
          <Button variant="ghost" size="sm" onClick={handleSurpriseMe}>
            <Sparkles className="h-4 w-4" /> Surprends-moi
          </Button>
        )}
      </div>

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

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-foreground-muted">Semaine</p>
          {(weekTotals.hasKcal || weekTotals.hasCost || weekTotals.cookingMinutes > 0) && (
            <p className="text-xs text-foreground-subtle">
              {weekTotals.hasKcal && `${weekTotals.kcal} kcal`}
              {weekTotals.hasKcal && weekTotals.hasCost && " · "}
              {weekTotals.hasCost && `${weekTotals.cost.toFixed(2)} €`}
              {(weekTotals.hasKcal || weekTotals.hasCost) && weekTotals.cookingMinutes > 0 && " · "}
              {weekTotals.cookingMinutes > 0 &&
                `${weekTotals.cookingMinutes >= 60 ? `${Math.floor(weekTotals.cookingMinutes / 60)} h ${(weekTotals.cookingMinutes % 60).toString().padStart(2, "0")}` : `${weekTotals.cookingMinutes} min`} en cuisine`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeCards.some((c) => WEEKDAY_PLACEMENTS.includes(c.placement)) && (
            <>
              <button type="button" onClick={handleExportIcs} className="flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground">
                <CalendarPlus className="h-3.5 w-3.5" /> Calendrier
              </button>
              <button type="button" onClick={handlePrintWeek} className="flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground">
                <Printer className="h-3.5 w-3.5" /> Imprimer
              </button>
              <button type="button" onClick={handleShareWeekImage} className="flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground">
                <ImageDown className="h-3.5 w-3.5" /> Image à partager
              </button>
              <button type="button" onClick={handleClearWeek} disabled={isPending} className="text-xs text-foreground-subtle underline hover:text-foreground">
                Vider la semaine
              </button>
            </>
          )}
        </div>
      </div>

      {weekTotals.hasCost &&
        data.settings.preferences.weekly_budget_cap != null &&
        weekTotals.cost > data.settings.preferences.weekly_budget_cap && (
          <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger print:hidden">
            Budget dépassé : {weekTotals.cost.toFixed(2)} € prévus cette semaine pour un plafond de{" "}
            {data.settings.preferences.weekly_budget_cap.toFixed(2)} €.
          </div>
        )}

      {outOfSeasonIngredients.length > 0 && (
        <p className="text-xs text-foreground-subtle print:hidden">
          Hors saison ce mois-ci : {outOfSeasonIngredients.join(", ")}.
        </p>
      )}

      {rareIngredientOverlaps.length > 0 && (
        <p className="text-xs text-foreground-subtle print:hidden">
          Ingrédient rare demandé par plusieurs recettes cette semaine —{" "}
          {rareIngredientOverlaps.map((o) => `${o.ingredientName} (${o.recipeTitles.join(", ")})`).join(" · ")} : pensez à en acheter assez
          en une fois.
        </p>
      )}

      {weekTotals.hasKcal && (data.settings.preferences.target_kcal_per_serving || weekTotals.macroPct) && (
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-md)] border border-border bg-surface-muted/50 px-3 py-2 text-xs text-foreground-muted print:hidden">
          {data.settings.preferences.target_kcal_per_serving && (
            <span>
              {weekTotals.avgKcalPerMeal} kcal/repas en moyenne{" "}
              <span className="text-foreground-subtle">(objectif : {data.settings.preferences.target_kcal_per_serving})</span>
            </span>
          )}
          {weekTotals.macroPct && (
            <span>
              Macros réelles : {weekTotals.macroPct.protein_pct}P / {weekTotals.macroPct.carb_pct}G / {weekTotals.macroPct.fat_pct}L{" "}
              <span className="text-foreground-subtle">
                (objectif : {data.settings.preferences.macro_ratios.protein_pct}/{data.settings.preferences.macro_ratios.carb_pct}/
                {data.settings.preferences.macro_ratios.fat_pct})
              </span>
            </span>
          )}
        </div>
      )}

      <div className="print-area hidden print:block">
        <h1 className="mb-4 font-serif-display text-xl font-medium text-foreground">Menu de la semaine du {formatWeekRange(viewedWeekStart)}</h1>
        {WEEKDAY_PLACEMENTS.map((placement) => {
          const dayCards = weekCards.filter((c) => c.placement === placement);
          return (
            <div key={placement} className="mb-3">
              <p className="font-semibold text-foreground">{DAY_LABELS[placement]}</p>
              {dayCards.length === 0 ? (
                <p className="text-sm text-foreground-subtle">—</p>
              ) : (
                <ul className="ml-4 list-disc">
                  {dayCards.map((card) => {
                    const recipe = recipesById.get(card.recipe_id);
                    return (
                      <li key={card.id} className="text-sm text-foreground-muted">
                        {recipe?.title ?? "Recette supprimée"} ({card.servings} pers.)
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewedWeekStart((w) => addDaysIso(w, -7))}
            aria-label="Semaine précédente"
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
          >
            ‹
          </button>
          <p className="text-sm font-medium text-foreground-muted">
            {isCurrentWeek ? "Cette semaine" : `Semaine du ${formatWeekRange(viewedWeekStart)}`}
          </p>
          <button
            type="button"
            onClick={() => setViewedWeekStart((w) => addDaysIso(w, 7))}
            aria-label="Semaine suivante"
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
          >
            ›
          </button>
          {!isCurrentWeek && (
            <button type="button" onClick={() => setViewedWeekStart(mondayIso(new Date()))} className="text-xs text-primary-strong underline">
              Revenir à cette semaine
            </button>
          )}
          <button type="button" onClick={() => setModal({ type: "month" })} className="text-xs text-foreground-subtle underline hover:text-foreground">
            Vue mensuelle
          </button>
        </div>
        {selectingForCombinedCook ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-subtle">{selectedCardIds.size} sélectionnée(s)</span>
            <Button
              size="sm"
              disabled={selectedCardIds.size < 2}
              onClick={() => {
                setModal({ type: "cook", recipeIds: [...selectedCardIds].map((id) => activeCards.find((c) => c.id === id)?.recipe_id).filter((id): id is string => Boolean(id)) });
                setCookingCardIds(new Set(selectedCardIds));
                setSelectingForCombinedCook(false);
                setSelectedCardIds(new Set());
              }}
            >
              Cuisiner ensemble
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectingForCombinedCook(false);
                setSelectedCardIds(new Set());
              }}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setSelectingForCombinedCook(true)}>
            Cuisiner plusieurs repas ensemble
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7 print:hidden">
        {WEEKDAY_PLACEMENTS.map((placement) => (
          <DayColumn
            key={placement}
            placement={placement}
            label={DAY_LABELS[placement]}
            cards={weekCards.filter((c) => c.placement === placement).sort((a, b) => a.position - b.position)}
            recipesById={recipesById}
            isToday={isCurrentWeek && placement === todayKey}
            onDrop={handleMove}
            onOpenDetail={(recipeId) => setModal({ type: "detail", recipeId })}
            onCook={handleCook}
            onRemove={handleRemove}
            onMove={handleMove}
            onDuplicate={handleDuplicateCard}
            onToggleLock={handleToggleLock}
            allergyRecipeIds={allergyRecipeIds}
            frozenCardIds={cookingCardIds}
            selectable={selectingForCombinedCook}
            selectedCardIds={selectedCardIds}
            onToggleSelect={(cardId) =>
              setSelectedCardIds((prev) => {
                const next = new Set(prev);
                if (next.has(cardId)) next.delete(cardId);
                else next.add(cardId);
                return next;
              })
            }
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
          onCookMode={() => {
            setModal({ type: "cook", recipeIds: [detailRecipe.id] });
            setCookingCardIds(detailCard ? new Set([detailCard.id]) : new Set());
          }}
          onServingsChange={detailCard ? (s) => handleServingsChange(detailCard.id, s) : undefined}
        />
      )}

      {modal?.type === "cook" && (
        <CookModeDialog
          recipes={modal.recipeIds
            .map((id) => recipesById.get(id))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((r) => ({ id: r.id, title: r.title, ingredients: r.ingredients, steps: r.steps }))}
          onClose={() => {
            setModal(null);
            setCookingCardIds(new Set());
          }}
          timers={timers}
          onStartTimer={startTimer}
          onDismissTimer={dismissTimer}
        />
      )}

      {modal?.type === "add" && (
        <AddRecipeDialog existingTags={allTags} existingRecipes={data.recipes} onClose={() => setModal(null)} onSaved={refresh} />
      )}

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

      {modal?.type === "batch_cook" && (
        <BatchCookDialog
          recipes={data.recipes}
          weekStart={viewedWeekStart}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}

      {modal?.type === "collections" && (
        <CollectionsDialog collections={data.collections} recipes={data.recipes} onClose={() => setModal(null)} onSaved={refresh} />
      )}

      {modal?.type === "week_templates" && (
        <WeekTemplatesDialog
          templates={data.weekTemplates}
          recipesById={recipesById}
          weekStart={viewedWeekStart}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}

      {modal?.type === "month" && (
        <MonthViewDialog
          mealCards={data.mealCards}
          recipesById={recipesById}
          onClose={() => setModal(null)}
          onSelectWeek={(weekStart) => {
            setViewedWeekStart(weekStart);
            setModal(null);
          }}
        />
      )}

      {modal?.type === "rate" && (
        <RateDialog
          recipeId={modal.recipeId}
          recipeTitle={modal.recipeTitle}
          pastRatings={recipesById.get(modal.recipeId)?.ratings}
          isFavorite={recipesById.get(modal.recipeId)?.is_favorite}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
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
          manualItems={data.settings.shopping_list_manual_items}
          categoryOrder={data.settings.preferences.shopping_category_order}
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
          mealCards={activeCards}
          recipesById={recipesById}
          guestMenus={data.guestMenus}
          appetite={data.settings.preferences.appetite}
          exportedRecipeIds={data.settings.shopping_list_exported_recipe_ids}
          shoppingChecked={data.settings.shopping_list_checked}
          manualItems={data.settings.shopping_list_manual_items}
        />
      )}

      {modal?.type === "settings" && (
        <SettingsDialog settings={data.settings} householdMembers={data.householdMembers} onClose={() => setModal(null)} onSaved={refresh} />
      )}

      {modal?.type === "guest" && (
        <GuestMenuDialog
          menu={data.guestMenus.find((m) => m.id === modal.menuId) ?? null}
          onClose={() => setModal(null)}
          onSaved={refresh}
          onCreated={(menuId) => setModal({ type: "guest", menuId })}
          timers={timers}
          onStartTimer={startTimer}
          onDismissTimer={dismissTimer}
        />
      )}

      <OnboardingTour moduleKey="a-table" steps={A_TABLE_ONBOARDING_STEPS} open={tourOpen} onOpenChange={setTourOpen} />
      <TimerBar timers={timers} onDismiss={dismissTimer} />
    </div>
  );
}
