import { APPETITE_MULTIPLIERS, SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY } from "./constants";
import type {
  Appetite,
  GuestCourse,
  GuestMenu,
  Ingredient,
  MealCard,
  Recipe,
  ShoppingManualItem,
} from "./types";

export interface ShoppingItem {
  key: string;
  name: string;
  unit: string;
  quantity: number | null;
  uncertain: boolean;
  category: string;
  checked: boolean;
}

/** Mirrors the original's client-side scaling formula — the one source of truth in the port. */
export function scaleFactor(recipeServings: number, targetServings: number | null, appetite: Appetite): number {
  const base = recipeServings || targetServings || 1;
  const target = targetServings || base;
  return (target / base) * APPETITE_MULTIPLIERS[appetite];
}

function scaledIngredients(ingredients: Ingredient[], factor: number): Ingredient[] {
  return ingredients.map((ing) => ({
    ...ing,
    quantity: typeof ing.quantity === "number" ? ing.quantity * factor : ing.quantity,
  }));
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Crude but effective for French grocery nouns ("oignon"/"oignons",
// "carotte"/"carottes"): most of what recipes actually use pluralizes with a
// plain trailing "s". Guarded by a minimum length so short words that
// genuinely end in "s" ("riz", "gaz"...) aren't mangled.
function singularize(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

// Recipes come from free-text entry or AI generation, so the same unit gets
// spelled differently ("pièce"/"pièces"/"unité", "g"/"gramme") across
// recipes — without this, otherwise-identical ingredients never merge in
// the aggregated list (e.g. three separate "oignon(s)" lines).
const UNIT_ALIASES: Record<string, string> = {
  piece: "piece",
  unite: "piece",
  g: "g",
  gramme: "g",
  kg: "kg",
  kilo: "kg",
  kilogramme: "kg",
  ml: "ml",
  millilitre: "ml",
  l: "l",
  litre: "l",
  cas: "cas",
  cuilleresoupe: "cas",
  cac: "cac",
  cuillerecafe: "cac",
  pincee: "pincee",
  tranche: "tranche",
  gousse: "gousse",
  botte: "botte",
  sachet: "sachet",
  branche: "branche",
};

/** Matching key for an ingredient name — not for display, which keeps the first-seen spelling. */
function normalizeIngredientName(name: string): string {
  return singularize(stripAccents(name.trim().toLowerCase()));
}

/** Matching key for a unit — not for display, which keeps the first-seen spelling. */
export function normalizeUnit(unit: string): string {
  const cleaned = singularize(stripAccents(unit.trim().toLowerCase()).replace(/[.\s'’]/g, ""));
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

function mergeInto(map: Map<string, ShoppingItem>, ingredients: Ingredient[]) {
  for (const ing of ingredients) {
    const name = (ing.name || "").trim();
    if (!name) continue;
    const unit = (ing.unit || "").trim();
    const key = `${normalizeIngredientName(name)}|${normalizeUnit(unit)}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        key,
        name,
        unit,
        quantity: typeof ing.quantity === "number" ? ing.quantity : null,
        uncertain: typeof ing.quantity !== "number",
        category: categorizeIngredient(name),
        checked: false,
      });
      continue;
    }

    if (existing.uncertain || typeof ing.quantity !== "number") {
      existing.uncertain = true;
      existing.quantity = null;
    } else {
      existing.quantity = (existing.quantity ?? 0) + ing.quantity;
    }
  }
}

export function categorizeIngredient(name: string): string {
  const lower = name.toLowerCase();
  for (const category of SHOPPING_CATEGORIES) {
    if (category.keywords.some((keyword) => lower.includes(keyword))) {
      return category.key;
    }
  }
  return SHOPPING_OTHER_CATEGORY.key;
}

function courseIngredients(course: GuestCourse): Ingredient[] {
  if ("items" in course) {
    return course.items.flatMap((item) => item.ingredients);
  }
  return course.ingredients;
}

/**
 * Aggregates the shopping list from active meal cards (scaled by servings +
 * appetite) and guest menu courses (NOT scaled — a faithful port of the
 * original's asymmetry, see plan). Recipes already exported are excluded.
 */
export function buildShoppingList(
  mealCards: MealCard[],
  recipesById: Map<string, Recipe>,
  guestMenus: GuestMenu[],
  appetite: Appetite,
  exportedRecipeIds: string[],
  checked: Record<string, boolean>,
  manualItems: ShoppingManualItem[] = []
): ShoppingItem[] {
  const exported = new Set(exportedRecipeIds);
  const map = new Map<string, ShoppingItem>();

  for (const card of mealCards) {
    if (card.status !== "active" || exported.has(card.recipe_id)) continue;
    const recipe = recipesById.get(card.recipe_id);
    if (!recipe) continue;
    const factor = scaleFactor(recipe.servings, card.servings || recipe.servings, appetite);
    mergeInto(map, scaledIngredients(recipe.ingredients, factor));
  }

  for (const menu of guestMenus) {
    for (const key of Object.keys(menu.courses)) {
      mergeInto(map, courseIngredients(menu.courses[key]));
    }
  }

  mergeInto(
    map,
    manualItems.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit }))
  );

  return Array.from(map.values())
    .map((item) => ({ ...item, checked: Boolean(checked[item.key]) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Re-merges an already-built shopping list with extra ingredients on top —
 * used to preview "what would the list look like after adding these" (e.g.
 * the currently-selected AI proposals in the génération screen) without
 * recomputing the whole board's aggregation on every selection change.
 */
export function previewWithExtraIngredients(base: ShoppingItem[], extra: Ingredient[]): ShoppingItem[] {
  const map = new Map<string, ShoppingItem>();
  for (const item of base) map.set(item.key, { ...item });
  mergeInto(map, extra);
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
