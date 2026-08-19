import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import type { Profile } from "@/lib/supabase/types";
import type {
  ATableData,
  ATableSettings,
  Draft,
  GuestMenu,
  HistoryEntry,
  MealCard,
  Preferences,
  GenerationRules,
  Recipe,
  TemporaryIngredient,
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
  gemini_api_key_encrypted: string | null;
  gemini_model: string;
  pexels_api_key_encrypted: string | null;
  updated_at: string;
}

function toPublicSettings(row: SettingsRow): ATableSettings {
  return {
    user_id: row.user_id,
    preferences: row.preferences,
    generation_rules: row.generation_rules,
    shopping_list_checked: row.shopping_list_checked,
    shopping_list_exported_recipe_ids: row.shopping_list_exported_recipe_ids,
    has_gemini_key: Boolean(row.gemini_api_key_encrypted),
    gemini_model: row.gemini_model,
    has_pexels_key: Boolean(row.pexels_api_key_encrypted),
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

  const [settings, recipesRes, cardsRes, draftsRes, tempRes, guestRes, historyRes] = await Promise.all([
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
  ]);

  return {
    settings,
    recipes: (recipesRes.data ?? []) as unknown as Recipe[],
    mealCards: (cardsRes.data ?? []) as unknown as MealCard[],
    drafts: (draftsRes.data ?? []) as unknown as Draft[],
    temporaryIngredients: (tempRes.data ?? []) as unknown as TemporaryIngredient[],
    guestMenus: (guestRes.data ?? []) as unknown as GuestMenu[],
    history: (historyRes.data ?? []) as unknown as HistoryEntry[],
  };
}
