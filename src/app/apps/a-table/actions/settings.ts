"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { callGemini, GeminiError } from "@/lib/a-table/gemini";
import { getDecryptedGeminiConfig } from "@/lib/a-table/ai-config";
import type { GenerationRules, Preferences } from "@/lib/a-table/types";
import type { Json } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

const NESTED_PREFERENCE_KEYS = new Set(["macro_ratios", "recipe_sources"]);

async function loadRawPreferences(userId: string): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase.from("a_table_settings").select("preferences").eq("user_id", userId).single();
  return (data?.preferences as Record<string, unknown>) ?? {};
}

async function loadRawRules(userId: string): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("a_table_settings")
    .select("generation_rules")
    .eq("user_id", userId)
    .single();
  return (data?.generation_rules as Record<string, unknown>) ?? {};
}

/** Non-destructive merge, one level deep for nested objects — mirrors the original coordinator. */
export async function updatePreferences(patch: Partial<Preferences>): Promise<ActionState> {
  const profile = await requireATableAccess();
  const current = await loadRawPreferences(profile.id);

  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (NESTED_PREFERENCE_KEYS.has(key) && typeof value === "object" && value !== null) {
      merged[key] = { ...(current[key] as object), ...value };
    } else {
      merged[key] = value;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_settings")
    .update({ preferences: merged as Json })
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible d'enregistrer vos préférences." };

  revalidatePath("/apps/a-table");
  return { success: "Préférences enregistrées." };
}

export async function updateGenerationRules(patch: Partial<GenerationRules>): Promise<ActionState> {
  const profile = await requireATableAccess();
  const current = await loadRawRules(profile.id);
  const merged = { ...current, ...patch };

  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_settings")
    .update({ generation_rules: merged as Json })
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible d'enregistrer les règles de génération." };

  revalidatePath("/apps/a-table");
  return { success: "Règles enregistrées." };
}

interface ApiKeysPatch {
  geminiApiKey?: string | null;
  geminiModel?: string;
  pexelsApiKey?: string | null;
}

/** null clears the key; undefined leaves it untouched; a non-empty string re-encrypts and stores it. */
export async function updateApiKeys(patch: ApiKeysPatch): Promise<ActionState> {
  const profile = await requireATableAccess();
  const update: {
    gemini_api_key_encrypted?: string | null;
    pexels_api_key_encrypted?: string | null;
    gemini_model?: string;
  } = {};

  if (patch.geminiApiKey !== undefined) {
    update.gemini_api_key_encrypted = patch.geminiApiKey ? encryptSecret(patch.geminiApiKey) : null;
  }
  if (patch.pexelsApiKey !== undefined) {
    update.pexels_api_key_encrypted = patch.pexelsApiKey ? encryptSecret(patch.pexelsApiKey) : null;
  }
  if (patch.geminiModel) {
    update.gemini_model = patch.geminiModel;
  }

  if (Object.keys(update).length === 0) return { success: "Rien à mettre à jour." };

  const supabase = await createClient();
  const { error } = await supabase.from("a_table_settings").update(update).eq("user_id", profile.id);

  if (error) return { error: "Impossible d'enregistrer les clés API." };

  revalidatePath("/apps/a-table");
  return { success: "Clés API mises à jour." };
}

export async function testGeminiConnection(apiKey: string, model: string): Promise<ActionState> {
  const profile = await requireATableAccess();

  let config: { apiKey: string; model: string };
  if (apiKey.trim()) {
    config = { apiKey: apiKey.trim(), model: model.trim() || "gemini-flash-latest" };
  } else {
    try {
      config = await getDecryptedGeminiConfig(profile.id);
    } catch {
      return { error: "Aucune clé à tester — collez une clé ou enregistrez-en une d'abord." };
    }
  }

  try {
    await callGemini({ ...config, instructions: 'Réponds uniquement avec {"ok": true} au format JSON.' });
    return { success: "Connexion réussie." };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "La connexion a échoué." };
  }
}

export async function toggleShoppingChecked(itemKey: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data } = await supabase
    .from("a_table_settings")
    .select("shopping_list_checked")
    .eq("user_id", profile.id)
    .single();

  const checked = { ...((data?.shopping_list_checked as Record<string, boolean>) ?? {}) };
  checked[itemKey] = !checked[itemKey];

  const { error } = await supabase
    .from("a_table_settings")
    .update({ shopping_list_checked: checked })
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour la liste de courses." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function addManualShoppingItem(input: { name: string; quantity: number | null; unit: string }): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) return { error: "Le nom de l'article est requis." };

  const { data } = await supabase
    .from("a_table_settings")
    .select("shopping_list_manual_items")
    .eq("user_id", profile.id)
    .single();

  const items = [
    ...((data?.shopping_list_manual_items as { key: string; name: string; quantity: number | null; unit: string }[]) ?? []),
    { key: `manual-${Date.now()}`, name, quantity: input.quantity, unit: input.unit.trim() },
  ];

  const { error } = await supabase
    .from("a_table_settings")
    .update({ shopping_list_manual_items: items })
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible d'ajouter cet article." };

  revalidatePath("/apps/a-table");
  return { success: "Article ajouté." };
}

export async function removeManualShoppingItem(key: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data } = await supabase
    .from("a_table_settings")
    .select("shopping_list_manual_items")
    .eq("user_id", profile.id)
    .single();

  const items = ((data?.shopping_list_manual_items as { key: string }[]) ?? []).filter((item) => item.key !== key);

  const { error } = await supabase
    .from("a_table_settings")
    .update({ shopping_list_manual_items: items })
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de retirer cet article." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function clearShoppingChecked(): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("a_table_settings")
    .update({ shopping_list_checked: {}, shopping_list_exported_recipe_ids: [] })
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de réinitialiser la liste." };

  revalidatePath("/apps/a-table");
  return { success: "Liste réinitialisée." };
}

export async function clearCardsAndHistory(): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  await supabase.from("a_table_meal_cards").delete().eq("user_id", profile.id);
  await supabase.from("a_table_history").delete().eq("user_id", profile.id);
  await supabase.from("a_table_drafts").delete().eq("user_id", profile.id);
  await supabase.from("a_table_recipes").delete().eq("user_id", profile.id);

  revalidatePath("/apps/a-table");
  return { success: "Cartes et historique vidés." };
}

interface TasteAnalysis {
  liked_suggestions: string[];
  disliked_suggestions: string[];
}

export async function analyzeTastes(): Promise<ActionState & { data?: TasteAnalysis }> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: prefsRow } = await supabase
    .from("a_table_settings")
    .select("preferences")
    .eq("user_id", profile.id)
    .single();
  const preferences = (prefsRow?.preferences as Preferences) ?? null;
  const days = preferences?.history_days_for_generation ?? 20;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: history } = await supabase
    .from("a_table_history")
    .select("recipe_id, cooked_at")
    .eq("user_id", profile.id)
    .gte("cooked_at", since)
    .order("cooked_at", { ascending: false })
    .limit(30);

  if (!history || history.length === 0) {
    return { success: "", data: { liked_suggestions: [], disliked_suggestions: [] } };
  }

  const recipeIds = Array.from(new Set(history.map((h) => h.recipe_id).filter((id): id is string => Boolean(id))));
  const { data: recipes } = await supabase
    .from("a_table_recipes")
    .select("id, title, ratings")
    .in("id", recipeIds);

  const recipesById = new Map((recipes ?? []).map((r) => [r.id, r]));
  const lines: string[] = [];
  for (const entry of history) {
    if (!entry.recipe_id) continue;
    const recipe = recipesById.get(entry.recipe_id);
    if (!recipe) continue;
    const ratings = (recipe.ratings as { liked: boolean; comment: string }[]) ?? [];
    const last = ratings[ratings.length - 1];
    if (!last) continue;
    lines.push(`- ${recipe.title} (${last.liked ? "aimé" : "pas aimé"}${last.comment ? `: ${last.comment}` : ""})`);
  }

  if (lines.length === 0) {
    return { success: "", data: { liked_suggestions: [], disliked_suggestions: [] } };
  }

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages avant d'analyser vos goûts." };
  }

  const instructions = `Voici l'historique récent de repas cuisinés avec retours :\n${lines.join("\n")}\n\nAnalyse ces retours et suggère des ingrédients probablement aimés et probablement à éviter.\n\nRÉSULTAT ATTENDU (JSON strict) :\n{"liked_suggestions": ["ingrédient", ...], "disliked_suggestions": ["ingrédient", ...]}`;

  try {
    const result = (await callGemini({ ...config, instructions })) as TasteAnalysis;
    const likedExisting = new Set((preferences?.liked_ingredients ?? []).map((i) => i.toLowerCase()));
    const dislikedExisting = new Set((preferences?.disliked_ingredients ?? []).map((i) => i.toLowerCase()));

    return {
      success: "",
      data: {
        liked_suggestions: (result.liked_suggestions ?? [])
          .filter((i) => !likedExisting.has(i.toLowerCase()))
          .slice(0, 5),
        disliked_suggestions: (result.disliked_suggestions ?? [])
          .filter((i) => !dislikedExisting.has(i.toLowerCase()))
          .slice(0, 5),
      },
    };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Analyse impossible pour le moment.";
    return { error: message };
  }
}
