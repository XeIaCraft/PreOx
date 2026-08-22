"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import type { Recipe, RecipeComment } from "@/lib/a-table/types";
import type { ATableRecipeCommentRow, ATableRecipeRow } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/** Opts a recipe in/out of the hub-wide "Découvrir" directory (item 24) — visible to every hub member while shared. */
export async function toggleRecipeSharing(recipeId: string, share: boolean): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("a_table_recipes")
    .update({ shared_at: share ? new Date().toISOString() : null })
    .eq("id", recipeId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour le partage." };

  revalidatePath("/apps/a-table");
  return { success: share ? "Recette partagée avec le hub." : "Recette retirée de la découverte." };
}

/** Every hub member's shared recipes — the extra RLS policy on a_table_recipes lets a plain authenticated read see rows owned by anyone, as long as shared_at is set. */
export async function listSharedRecipes(): Promise<Recipe[]> {
  await requireATableAccess();
  const supabase = await createClient();

  const { data } = await supabase
    .from("a_table_recipes")
    .select("*")
    .not("shared_at", "is", null)
    .order("shared_at", { ascending: false })
    .limit(100);

  return (data ?? []) as unknown as ATableRecipeRow[] as unknown as Recipe[];
}

/** Copies a shared recipe into the current user's own library — attribution stays anonymous ("recommandée par un membre du hub"), never a resolved identity. */
export async function copySharedRecipeToLibrary(recipeId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase.from("a_table_recipes").select("*").eq("id", recipeId).not("shared_at", "is", null).maybeSingle();
  if (!recipe) return { error: "Cette recette n'est plus partagée." };
  if (recipe.user_id === profile.id) return { error: "C'est déjà l'une de vos recettes." };

  const { error } = await supabase.from("a_table_recipes").insert({
    user_id: profile.id,
    title: recipe.title,
    source_kind: "personal_manual",
    servings: recipe.servings,
    cooking_minutes: recipe.cooking_minutes,
    tags: recipe.tags,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    step_labels: recipe.step_labels,
    notes: recipe.notes,
    nutrition: recipe.nutrition,
    price_per_serving: recipe.price_per_serving,
    image_url: recipe.image_url,
    image_status: recipe.image_status,
    recommended_by: "Un membre du hub",
  });

  if (error) return { error: "Impossible de copier cette recette." };

  revalidatePath("/apps/a-table");
  return { success: "Recette copiée dans votre bibliothèque." };
}

export async function listRecipeComments(recipeId: string): Promise<RecipeComment[]> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data } = await supabase
    .from("a_table_recipe_comments")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown as ATableRecipeCommentRow[]).map((row) => ({
    id: row.id,
    recipe_id: row.recipe_id,
    author_user_id: row.author_user_id,
    body: row.body,
    created_at: row.created_at,
    isMine: row.author_user_id === profile.id,
  }));
}

export async function addRecipeComment(recipeId: string, body: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) return { error: "Le commentaire est vide." };

  const supabase = await createClient();
  const { error } = await supabase.from("a_table_recipe_comments").insert({ recipe_id: recipeId, author_user_id: profile.id, body: trimmed });

  if (error) return { error: "Impossible d'ajouter ce commentaire." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function deleteRecipeComment(commentId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_recipe_comments").delete().eq("id", commentId).eq("author_user_id", profile.id);
  if (error) return { error: "Impossible de supprimer ce commentaire." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
