import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiToken } from "@/lib/a-table/api-token";
import { buildShoppingList } from "@/lib/a-table/shopping";
import { WEEKDAY_PLACEMENTS, DAY_LABELS } from "@/lib/a-table/constants";
import type {
  ATableGuestMenuRow,
  ATableMealCardRow,
  ATableRecipeRow,
  ATableSettingsRow,
} from "@/lib/supabase/types";
import type { GuestMenu, MealCard, Preferences, Recipe, ShoppingManualItem } from "@/lib/a-table/types";

export const dynamic = "force-dynamic";

/**
 * Personal, read-only automation endpoint (item 46 of the backlog:
 * "scripter ses automatisations"). Auth is a bearer token whose sha256 hash
 * is compared against `a_table_settings.api_token_hash` — same non-session
 * pattern as the public share links, but requiring an explicit header
 * instead of an unguessable URL, since this is meant to be called from a
 * script rather than opened in a browser.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "En-tête Authorization: Bearer <jeton> requis." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from("a_table_settings")
    .select("*")
    .eq("api_token_hash", hashApiToken(token))
    .maybeSingle();

  if (!settingsRow) {
    return NextResponse.json({ error: "Jeton invalide ou révoqué." }, { status: 401 });
  }

  const settings = settingsRow as ATableSettingsRow;
  const userId = settings.user_id;

  const [cardsRes, recipesRes, guestRes] = await Promise.all([
    supabase.from("a_table_meal_cards").select("*").eq("user_id", userId).eq("status", "active"),
    supabase.from("a_table_recipes").select("*").eq("user_id", userId),
    supabase.from("a_table_guest_menus").select("*").eq("user_id", userId),
  ]);

  const mealCards = (cardsRes.data ?? []) as unknown as ATableMealCardRow[] as MealCard[];
  const recipes = (recipesRes.data ?? []) as unknown as ATableRecipeRow[] as Recipe[];
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const guestMenus = (guestRes.data ?? []) as unknown as ATableGuestMenuRow[] as GuestMenu[];
  const preferences = settings.preferences as unknown as Preferences;

  const todayPlacement = WEEKDAY_PLACEMENTS[(new Date().getDay() + 6) % 7];
  const todayCard = mealCards.find((c) => c.placement === todayPlacement);
  const todayRecipe = todayCard ? recipesById.get(todayCard.recipe_id) : undefined;

  const week = WEEKDAY_PLACEMENTS.map((placement) => {
    const card = mealCards.find((c) => c.placement === placement);
    const recipe = card ? recipesById.get(card.recipe_id) : undefined;
    return {
      day: placement,
      label: DAY_LABELS[placement],
      title: recipe?.title ?? null,
      servings: card?.servings ?? null,
    };
  });

  const shoppingList = buildShoppingList(
    mealCards,
    recipesById,
    guestMenus,
    preferences.appetite,
    settings.shopping_list_exported_recipe_ids ?? [],
    (settings.shopping_list_checked as unknown as Record<string, boolean>) ?? {},
    (settings.shopping_list_manual_items as unknown as ShoppingManualItem[]) ?? []
  ).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    checked: item.checked,
  }));

  return NextResponse.json({
    date: new Date().toISOString().slice(0, 10),
    today: todayRecipe ? { title: todayRecipe.title, servings: todayCard?.servings ?? todayRecipe.servings, cooking_minutes: todayRecipe.cooking_minutes } : null,
    week,
    shopping_list: shoppingList,
  });
}
