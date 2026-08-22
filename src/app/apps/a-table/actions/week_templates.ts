"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import type { Placement, WeekTemplateItem } from "@/lib/a-table/types";
import type { Json } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/** Snapshots the given week's weekday placements (recipe + servings per day) as a reusable named template. */
export async function saveWeekAsTemplate(name: string, weekStart: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Donnez un nom au modèle." };

  const supabase = await createClient();
  const { data: cards } = await supabase
    .from("a_table_meal_cards")
    .select("placement, recipe_id, servings")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .eq("week_start", weekStart)
    .in("placement", WEEKDAY_PLACEMENTS);

  if (!cards || cards.length === 0) return { error: "Aucun repas planifié cette semaine à enregistrer." };

  const items: WeekTemplateItem[] = cards.map((c) => ({
    placement: c.placement as Placement,
    recipe_id: c.recipe_id,
    servings: c.servings,
  }));

  const { error } = await supabase.from("a_table_week_templates").insert({ user_id: profile.id, name: trimmed, items: items as unknown as Json });
  if (error) return { error: "Impossible d'enregistrer ce modèle." };

  revalidatePath("/apps/a-table");
  return { success: `Modèle « ${trimmed} » enregistré (${items.length} jour${items.length > 1 ? "s" : ""}).` };
}

/**
 * Applies a saved template to the current week — only fills weekday
 * placements that are currently empty, so it never overwrites a plan
 * already in progress. Skips items whose recipe was since deleted.
 */
export async function applyWeekTemplate(templateId: string, weekStart: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("a_table_week_templates")
    .select("items")
    .eq("id", templateId)
    .eq("user_id", profile.id)
    .single();
  if (!template) return { error: "Modèle introuvable." };

  const items = (template.items as unknown as WeekTemplateItem[]) ?? [];
  if (items.length === 0) return { error: "Ce modèle est vide." };

  const [{ data: occupied }, { data: recipes }] = await Promise.all([
    supabase
      .from("a_table_meal_cards")
      .select("placement")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .eq("week_start", weekStart)
      .in("placement", WEEKDAY_PLACEMENTS),
    supabase
      .from("a_table_recipes")
      .select("id")
      .eq("user_id", profile.id)
      .in(
        "id",
        items.map((i) => i.recipe_id)
      ),
  ]);
  const occupiedPlacements = new Set((occupied ?? []).map((c) => c.placement));
  const validRecipeIds = new Set((recipes ?? []).map((r) => r.id));

  const toInsert = items.filter((i) => !occupiedPlacements.has(i.placement) && validRecipeIds.has(i.recipe_id));
  const skippedCount = items.length - toInsert.length;

  if (toInsert.length === 0) {
    return { error: skippedCount > 0 ? "Tous les jours de ce modèle sont déjà occupés ou la recette a été supprimée." : "Rien à appliquer." };
  }

  const { error } = await supabase.from("a_table_meal_cards").insert(
    toInsert.map((i) => ({ user_id: profile.id, recipe_id: i.recipe_id, placement: i.placement, servings: i.servings, position: 0, week_start: weekStart }))
  );
  if (error) return { error: "Impossible d'appliquer ce modèle." };

  revalidatePath("/apps/a-table");
  return {
    success:
      `${toInsert.length} jour${toInsert.length > 1 ? "s" : ""} rempli${toInsert.length > 1 ? "s" : ""}` +
      (skippedCount > 0 ? ` (${skippedCount} déjà occupé(s) ou ignoré(s)).` : "."),
  };
}

export async function deleteWeekTemplate(templateId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("a_table_week_templates").delete().eq("id", templateId).eq("user_id", profile.id);
  if (error) return { error: "Impossible de supprimer ce modèle." };

  revalidatePath("/apps/a-table");
  return { success: "Modèle supprimé." };
}
