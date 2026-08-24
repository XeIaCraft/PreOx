"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { PLACEMENTS, WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import { uploadHistoryPhoto } from "@/lib/a-table/storage";
import type { HistoryEntry, MealCardStatus, Placement } from "@/lib/a-table/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/** `weekStart` (the target week's Monday, ISO date) is required for a weekday placement, ignored (forced to null) for backlog — a card in the queue isn't tied to any week. */
export async function moveMealCard(cardId: string, placement: Placement, weekStart: string | null = null): Promise<ActionState> {
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

  const targetWeekStart = placement === "backlog" ? null : weekStart;

  let positionQuery = supabase
    .from("a_table_meal_cards")
    .select("position")
    .eq("user_id", profile.id)
    .eq("placement", placement)
    .eq("status", "active");
  positionQuery = targetWeekStart ? positionQuery.eq("week_start", targetWeekStart) : positionQuery.is("week_start", null);
  const { data: existing } = await positionQuery.order("position", { ascending: false }).limit(1);

  const position = (existing?.[0]?.position ?? -1) + 1;

  const { error } = await supabase
    .from("a_table_meal_cards")
    .update({ placement, position, week_start: targetWeekStart })
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

export async function toggleMealCardLock(cardId: string, locked: boolean): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_meal_cards")
    .update({ locked })
    .eq("id", cardId)
    .eq("user_id", profile.id)
    .eq("status", "active");

  if (error) return { error: "Impossible de mettre à jour la carte." };

  revalidatePath("/apps/a-table");
  return { success: "" };
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
  week_start: string | null;
  recipe_id: string;
  status: MealCardStatus;
  servings: number;
}

export async function clearWeek(weekStart: string): Promise<ActionState & { cleared?: ClearedCardPlacement[] }> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: toClear } = await supabase
    .from("a_table_meal_cards")
    .select("id, placement, position, week_start, recipe_id, status, servings")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .eq("locked", false)
    .eq("week_start", weekStart)
    .in("placement", WEEKDAY_PLACEMENTS);

  const { error } = await supabase
    .from("a_table_meal_cards")
    .update({ placement: "backlog", week_start: null })
    .eq("user_id", profile.id)
    .eq("status", "active")
    .eq("locked", false)
    .eq("week_start", weekStart)
    .in("placement", WEEKDAY_PLACEMENTS);

  if (error) return { error: "Impossible de vider la semaine." };

  revalidatePath("/apps/a-table");
  return {
    success: "Semaine vidée — les cartes sont repassées dans « À cuisiner ».",
    cleared: (toClear ?? []) as ClearedCardPlacement[],
  };
}

export async function restoreWeekPlacements(cleared: ClearedCardPlacement[]): Promise<ActionState> {
  if (cleared.length === 0) return { success: "Semaine restaurée." };
  const profile = await requireATableAccess();
  const supabase = await createClient();

  // Single upsert instead of one UPDATE per card — id is the primary key,
  // so this targets exactly the rows already read back by clearWeek. The
  // full row shape (not just the changed columns) is carried through so an
  // upsert never risks an incomplete INSERT if a row were concurrently
  // removed between the clear and the undo.
  const { error } = await supabase.from("a_table_meal_cards").upsert(
    cleared.map((entry) => ({
      id: entry.id,
      user_id: profile.id,
      recipe_id: entry.recipe_id,
      status: entry.status,
      placement: entry.placement,
      position: entry.position,
      week_start: entry.week_start,
      servings: entry.servings,
    }))
  );

  if (error) return { error: "Impossible de restaurer la semaine." };

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

/** "Batch cooking": places the same recipe on several days of the given week at once (cook once, eat the leftovers reheated), instead of dragging it onto each day individually. */
export async function batchAddRecipeToDays(recipeId: string, servings: number, placements: Placement[], weekStart: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const targetDays = placements.filter((p) => WEEKDAY_PLACEMENTS.includes(p));
  if (targetDays.length === 0) return { error: "Choisissez au moins un jour." };

  const supabase = await createClient();
  const { data: recipe } = await supabase.from("a_table_recipes").select("servings").eq("id", recipeId).eq("user_id", profile.id).single();
  if (!recipe) return { error: "Recette introuvable." };

  const { data: positions } = await supabase
    .from("a_table_meal_cards")
    .select("placement, position")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .eq("week_start", weekStart)
    .in("placement", targetDays);
  const nextPosition = new Map<Placement, number>();
  for (const row of positions ?? []) {
    const current = nextPosition.get(row.placement as Placement) ?? -1;
    if (row.position > current) nextPosition.set(row.placement as Placement, row.position);
  }

  const rows = targetDays.map((placement) => ({
    user_id: profile.id,
    recipe_id: recipeId,
    placement,
    position: (nextPosition.get(placement) ?? -1) + 1,
    servings: servings || recipe.servings,
    week_start: weekStart,
  }));

  const { error } = await supabase.from("a_table_meal_cards").insert(rows);
  if (error) return { error: "Impossible de placer la recette sur ces jours." };

  revalidatePath("/apps/a-table");
  return { success: `Recette placée sur ${targetDays.length} jour${targetDays.length > 1 ? "s" : ""}.` };
}

export async function addHistoryPhoto(historyId: string, imageBase64: string, mimeType: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: entry } = await supabase.from("a_table_history").select("id").eq("id", historyId).eq("user_id", profile.id).maybeSingle();
  if (!entry) return { error: "Entrée d'historique introuvable." };

  let photoUrl: string;
  try {
    photoUrl = await uploadHistoryPhoto(profile.id, historyId, Buffer.from(imageBase64, "base64"), mimeType);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de l'envoi de la photo." };
  }

  const { error } = await supabase.from("a_table_history").update({ photo_url: photoUrl }).eq("id", historyId).eq("user_id", profile.id);
  if (error) return { error: "Photo envoyée, mais impossible à enregistrer." };

  revalidatePath("/apps/a-table");
  return { success: "Photo ajoutée au journal." };
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
    photo_url: entry.photo_url,
  });

  if (error) return { error: "Impossible de restaurer cette entrée." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
