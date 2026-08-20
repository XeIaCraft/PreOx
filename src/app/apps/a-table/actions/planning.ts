"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { PLACEMENTS, WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import type { HistoryEntry, Placement } from "@/lib/a-table/types";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function moveMealCard(cardId: string, placement: Placement): Promise<ActionState> {
  const profile = await requireATableAccess();

  if (!PLACEMENTS.includes(placement)) return { error: "Emplacement invalide." };

  const supabase = await createClient();

  const { data: card } = await supabase
    .from("a_table_meal_cards")
    .select("status")
    .eq("id", cardId)
    .eq("user_id", profile.id)
    .single();

  if (!card || card.status !== "active") return { error: "Carte introuvable ou déjà traitée." };

  const { data: existing } = await supabase
    .from("a_table_meal_cards")
    .select("position")
    .eq("user_id", profile.id)
    .eq("placement", placement)
    .eq("status", "active")
    .order("position", { ascending: false })
    .limit(1);

  const position = (existing?.[0]?.position ?? -1) + 1;

  const { error } = await supabase
    .from("a_table_meal_cards")
    .update({ placement, position })
    .eq("id", cardId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de déplacer la carte." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function duplicateMealCard(cardId: string, placement: Placement): Promise<ActionState> {
  const profile = await requireATableAccess();
  if (!PLACEMENTS.includes(placement)) return { error: "Emplacement invalide." };

  const supabase = await createClient();
  const { data: card } = await supabase
    .from("a_table_meal_cards")
    .select("recipe_id, servings")
    .eq("id", cardId)
    .eq("user_id", profile.id)
    .eq("status", "active")
    .single();

  if (!card) return { error: "Carte introuvable." };

  const { data: existing } = await supabase
    .from("a_table_meal_cards")
    .select("position")
    .eq("user_id", profile.id)
    .eq("placement", placement)
    .eq("status", "active")
    .order("position", { ascending: false })
    .limit(1);
  const position = (existing?.[0]?.position ?? -1) + 1;

  const { error } = await supabase.from("a_table_meal_cards").insert({
    user_id: profile.id,
    recipe_id: card.recipe_id,
    placement,
    position,
    servings: card.servings,
  });

  if (error) return { error: "Impossible de dupliquer la carte." };

  revalidatePath("/apps/a-table");
  return { success: "Carte dupliquée." };
}

export async function updateMealCardServings(cardId: string, servings: number): Promise<ActionState> {
  const profile = await requireATableAccess();
  if (!Number.isFinite(servings) || servings < 1) return { error: "Nombre de portions invalide." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_meal_cards")
    .update({ servings: Math.round(servings) })
    .eq("id", cardId)
    .eq("user_id", profile.id)
    .eq("status", "active");

  if (error) return { error: "Impossible de mettre à jour les portions." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export interface ClearedCardPlacement {
  id: string;
  placement: Placement;
  position: number;
}

export async function clearWeek(): Promise<ActionState & { cleared?: ClearedCardPlacement[] }> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: toClear } = await supabase
    .from("a_table_meal_cards")
    .select("id, placement, position")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .in("placement", WEEKDAY_PLACEMENTS);

  const { error } = await supabase
    .from("a_table_meal_cards")
    .update({ placement: "backlog" })
    .eq("user_id", profile.id)
    .eq("status", "active")
    .in("placement", WEEKDAY_PLACEMENTS);

  if (error) return { error: "Impossible de vider la semaine." };

  revalidatePath("/apps/a-table");
  return {
    success: "Semaine vidée — les cartes sont repassées dans « À cuisiner ».",
    cleared: (toClear ?? []) as ClearedCardPlacement[],
  };
}

export async function restoreWeekPlacements(cleared: ClearedCardPlacement[]): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  for (const entry of cleared) {
    await supabase
      .from("a_table_meal_cards")
      .update({ placement: entry.placement, position: entry.position })
      .eq("id", entry.id)
      .eq("user_id", profile.id)
      .eq("status", "active");
  }

  revalidatePath("/apps/a-table");
  return { success: "Semaine restaurée." };
}

/** Sequential steps rather than a single DB transaction — see plan's noted simplification. */
export async function cookMealCard(cardId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: card } = await supabase
    .from("a_table_meal_cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", profile.id)
    .single();

  if (!card || card.status !== "active") return { error: "Carte introuvable ou déjà traitée." };

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("times_cooked")
    .eq("id", card.recipe_id)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  const cookedAt = new Date().toISOString();

  const { error: cardError } = await supabase
    .from("a_table_meal_cards")
    .update({ status: "cooked" })
    .eq("id", cardId)
    .eq("user_id", profile.id);
  if (cardError) return { error: "Impossible de marquer la carte comme cuisinée." };

  await supabase
    .from("a_table_recipes")
    .update({ last_cooked_at: cookedAt, times_cooked: (recipe.times_cooked ?? 0) + 1 })
    .eq("id", card.recipe_id)
    .eq("user_id", profile.id);

  await supabase.from("a_table_history").insert({
    user_id: profile.id,
    meal_card_id: card.id,
    recipe_id: card.recipe_id,
    cooked_at: cookedAt,
    servings: card.servings,
  });

  revalidatePath("/apps/a-table");
  return { success: "Bon appétit !" };
}

export async function removeMealCard(cardId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_meal_cards").delete().eq("id", cardId).eq("user_id", profile.id);

  if (error) return { error: "Impossible de supprimer la carte." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function addRecipeToBacklog(recipeId: string, servings?: number): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("servings")
    .eq("id", recipeId)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  const { data: existing } = await supabase
    .from("a_table_meal_cards")
    .select("position")
    .eq("user_id", profile.id)
    .eq("placement", "backlog")
    .eq("status", "active")
    .order("position", { ascending: false })
    .limit(1);

  const position = (existing?.[0]?.position ?? -1) + 1;

  const { error } = await supabase.from("a_table_meal_cards").insert({
    user_id: profile.id,
    recipe_id: recipeId,
    placement: "backlog",
    position,
    servings: servings ?? recipe.servings,
  });

  if (error) return { error: "Impossible d'ajouter la carte." };

  revalidatePath("/apps/a-table");
  return { success: "Ajouté à « À cuisiner »." };
}

export async function removeHistoryEntry(historyId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_history").delete().eq("id", historyId).eq("user_id", profile.id);

  if (error) return { error: "Impossible de supprimer cette entrée." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function restoreHistoryEntry(entry: HistoryEntry): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_history").insert({
    id: entry.id,
    user_id: profile.id,
    meal_card_id: entry.meal_card_id,
    recipe_id: entry.recipe_id,
    cooked_at: entry.cooked_at,
    servings: entry.servings,
  });

  if (error) return { error: "Impossible de restaurer cette entrée." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
