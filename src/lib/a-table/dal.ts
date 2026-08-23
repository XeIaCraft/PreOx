import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import { WEEKDAY_PLACEMENTS, DAY_LABELS } from "./constants";
import { buildShoppingList } from "./shopping";
import { mondayIso } from "./week";
import type { Database, Profile } from "@/lib/supabase/types";
import type {
  ATableData,
  ATableSettings,
  Draft,
  GuestMenu,
  HistoryEntry,
  HouseholdMember,
  MealCard,
  Preferences,
  GenerationRules,
  Recipe,
  RecipeCollection,
  ShoppingManualItem,
  SimpleBoardData,
  SimpleBoardMealSlot,
  TemporaryIngredient,
  WeekTemplate,
} from "./types";

/** Same access-check every other module page uses — gated by the hub's own RBAC. */
export async function requireATableAccess(): Promise<Profile> {
  const profile = await requireProfile();
  const app = await getAppBySlugForProfile("a-table", profile);
  if (!app || !app.hasAccess) {
    notFound();
  }
  return profile;
}

interface SettingsRow {
  user_id: string;
  preferences: Preferences;
  generation_rules: GenerationRules;
  shopping_list_checked: Record<string, boolean>;
  shopping_list_exported_recipe_ids: string[];
  shopping_list_manual_items: ShoppingManualItem[];
  gemini_api_key_encrypted: string | null;
  gemini_model: string;
  pexels_api_key_encrypted: string | null;
  today_widget_token: string | null;
  api_token_hash: string | null;
  updated_at: string;
}

function toPublicSettings(row: SettingsRow): ATableSettings {
  return {
    user_id: row.user_id,
    preferences: row.preferences,
    generation_rules: row.generation_rules,
    shopping_list_checked: row.shopping_list_checked,
    shopping_list_exported_recipe_ids: row.shopping_list_exported_recipe_ids,
    shopping_list_manual_items: row.shopping_list_manual_items ?? [],
    has_gemini_key: Boolean(row.gemini_api_key_encrypted),
    gemini_model: row.gemini_model,
    has_pexels_key: Boolean(row.pexels_api_key_encrypted),
    today_widget_token: row.today_widget_token,
    api_token_hash: row.api_token_hash,
    updated_at: row.updated_at,
  };
}

/** Lazily creates the settings row (defaults from the column definitions) on first visit. */
export async function getOrCreateSettings(userId: string): Promise<ATableSettings> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("a_table_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return toPublicSettings(existing as unknown as SettingsRow);

  const { data: created, error } = await supabase
    .from("a_table_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error("Impossible d'initialiser vos réglages À table.");
  }

  return toPublicSettings(created as unknown as SettingsRow);
}

/** Full board payload — the equivalent of the original's `a_table/get_data`. */
export async function getATableData(userId: string): Promise<ATableData> {
  const supabase = await createClient();

  const [settings, recipesRes, cardsRes, draftsRes, tempRes, guestRes, historyRes, collectionsRes, weekTemplatesRes, householdRes] =
    await Promise.all([
      getOrCreateSettings(userId),
      supabase.from("a_table_recipes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("a_table_meal_cards").select("*").eq("user_id", userId).eq("status", "active"),
      supabase.from("a_table_drafts").select("*").eq("user_id", userId),
      supabase
        .from("a_table_temporary_ingredients")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("a_table_guest_menus").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase
        .from("a_table_history")
        .select("*")
        .eq("user_id", userId)
        .order("cooked_at", { ascending: false })
        .limit(200),
      supabase.from("a_table_collections").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("a_table_week_templates").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("a_table_household_members").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    ]);

  return {
    settings,
    recipes: (recipesRes.data ?? []) as unknown as Recipe[],
    mealCards: (cardsRes.data ?? []) as unknown as MealCard[],
    drafts: (draftsRes.data ?? []) as unknown as Draft[],
    temporaryIngredients: (tempRes.data ?? []) as unknown as TemporaryIngredient[],
    collections: (collectionsRes.data ?? []) as unknown as RecipeCollection[],
    guestMenus: (guestRes.data ?? []) as unknown as GuestMenu[],
    history: (historyRes.data ?? []) as unknown as HistoryEntry[],
    weekTemplates: (weekTemplatesRes.data ?? []) as unknown as WeekTemplate[],
    householdMembers: (householdRes.data ?? []) as unknown as HouseholdMember[],
  };
}

/**
 * Read model for the "one page, no modal" simplified view (today + this
 * week + shopping list) — shared by the owner's authenticated /simple page
 * and a household member's public token-gated page, so it takes the
 * Supabase client as a parameter rather than assuming a session (the member
 * page reads through the admin client instead).
 */
export async function getSimpleBoardData(supabase: SupabaseClient<Database>, userId: string): Promise<SimpleBoardData> {
  const weekStart = mondayIso(new Date());

  const [settingsRes, recipesRes, cardsRes, guestRes] = await Promise.all([
    supabase.from("a_table_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("a_table_recipes").select("*").eq("user_id", userId),
    supabase.from("a_table_meal_cards").select("*").eq("user_id", userId).eq("status", "active").eq("week_start", weekStart),
    supabase.from("a_table_guest_menus").select("*").eq("user_id", userId),
  ]);

  const recipes = (recipesRes.data ?? []) as unknown as Recipe[];
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const cards = (cardsRes.data ?? []) as unknown as MealCard[];
  const settingsRow = settingsRes.data as unknown as SettingsRow | null;

  const todayPlacement = WEEKDAY_PLACEMENTS[(new Date().getDay() + 6) % 7];

  function slotFor(placement: (typeof WEEKDAY_PLACEMENTS)[number]): SimpleBoardMealSlot {
    const card = cards.find((c) => c.placement === placement);
    const recipe = card ? recipesById.get(card.recipe_id) : undefined;
    return {
      placement,
      label: DAY_LABELS[placement],
      isToday: placement === todayPlacement,
      recipeTitle: recipe?.title ?? null,
      recipeImageUrl: recipe?.image_url ?? null,
      servings: card?.servings ?? recipe?.servings ?? null,
      cardId: card?.id ?? null,
    };
  }

  const week = WEEKDAY_PLACEMENTS.map(slotFor);
  const today = week.find((s) => s.isToday) ?? null;

  const shoppingItems: SimpleBoardData["shoppingItems"] = settingsRow
    ? buildShoppingList(
        cards,
        recipesById,
        ((guestRes.data ?? []) as unknown as GuestMenu[]),
        (settingsRow.preferences as Preferences).appetite,
        settingsRow.shopping_list_exported_recipe_ids ?? [],
        (settingsRow.shopping_list_checked as unknown as Record<string, boolean>) ?? {},
        (settingsRow.shopping_list_manual_items as unknown as ShoppingManualItem[]) ?? []
      )
    : [];

  return { today, week, shoppingItems };
}
