"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { callGemini, GeminiError, validStepLabels } from "@/lib/a-table/gemini";
import { searchPexelsImage, PexelsError } from "@/lib/a-table/pexels";
import { getDecryptedGeminiConfig, getDecryptedPexelsKey } from "@/lib/a-table/ai-config";
import { buildImportInstructions, buildRefineInstructions } from "@/lib/a-table/prompts";
import type { Ingredient, Nutrition } from "@/lib/a-table/types";
import type { Json } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

interface AddRecipeInput {
  title: string;
  servings: number;
  cookingMinutes?: number | null;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  notes: string;
  nutrition: Nutrition;
  pricePerServing?: number | null;
}

async function nextBacklogPosition(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("a_table_meal_cards")
    .select("position")
    .eq("user_id", userId)
    .eq("placement", "backlog")
    .eq("status", "active")
    .order("position", { ascending: false })
    .limit(1);
  return (data?.[0]?.position ?? -1) + 1;
}

export async function addRecipe(input: AddRecipeInput): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe, error: recipeError } = await supabase
    .from("a_table_recipes")
    .insert({
      user_id: profile.id,
      title: input.title,
      source_kind: "personal_manual",
      servings: input.servings,
      cooking_minutes: input.cookingMinutes ?? null,
      tags: input.tags,
      ingredients: input.ingredients,
      steps: input.steps,
      notes: input.notes,
      nutrition: input.nutrition,
      price_per_serving: input.pricePerServing ?? null,
    })
    .select("id")
    .single();

  if (recipeError || !recipe) return { error: "Impossible de créer la recette." };

  const position = await nextBacklogPosition(profile.id);
  const { error: cardError } = await supabase.from("a_table_meal_cards").insert({
    user_id: profile.id,
    recipe_id: recipe.id,
    placement: "backlog",
    position,
    servings: input.servings,
  });

  if (cardError) return { error: "Recette créée, mais impossible d'ajouter la carte." };

  revalidatePath("/apps/a-table");
  return { success: "Recette ajoutée à « À cuisiner »." };
}

export async function toggleFavorite(recipeId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("is_favorite")
    .eq("id", recipeId)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  const { error } = await supabase
    .from("a_table_recipes")
    .update({ is_favorite: !recipe.is_favorite })
    .eq("id", recipeId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour la recette." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function rateRecipe(recipeId: string, liked: boolean, comment: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("ratings")
    .eq("id", recipeId)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  const ratings = [...((recipe.ratings as { date: string; liked: boolean; comment: string }[]) ?? [])];
  ratings.push({ date: new Date().toISOString(), liked, comment });

  const { error } = await supabase
    .from("a_table_recipes")
    .update({ ratings })
    .eq("id", recipeId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible d'enregistrer la note." };

  revalidatePath("/apps/a-table");
  return { success: "Merci pour votre retour." };
}

export async function setRecipeArchived(recipeId: string, archived: boolean): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("a_table_recipes")
    .update({ is_archived: archived })
    .eq("id", recipeId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour la recette." };

  revalidatePath("/apps/a-table");
  return { success: archived ? "Recette archivée." : "Recette désarchivée." };
}

export async function duplicateRecipe(recipeId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("*")
    .eq("id", recipeId)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  const { error } = await supabase.from("a_table_recipes").insert({
    user_id: profile.id,
    title: `${recipe.title} (copie)`,
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
  });

  if (error) return { error: "Impossible de dupliquer la recette." };

  revalidatePath("/apps/a-table");
  return { success: "Recette dupliquée dans « Mes recettes »." };
}

export async function fetchRecipeImage(recipeId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("title")
    .eq("id", recipeId)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  const apiKey = await getDecryptedPexelsKey(profile.id);
  if (!apiKey) return { error: "Configurez votre clé API Pexels dans les réglages pour illustrer vos recettes." };

  try {
    const imageUrl = await searchPexelsImage(recipe.title, apiKey);
    const { error } = await supabase
      .from("a_table_recipes")
      .update({ image_url: imageUrl, image_status: "found" })
      .eq("id", recipeId)
      .eq("user_id", profile.id);
    if (error) return { error: "Image trouvée, mais impossible de l'enregistrer." };
  } catch (err) {
    return { error: err instanceof PexelsError ? err.message : "Recherche d'image impossible. Réessaie." };
  }

  revalidatePath("/apps/a-table");
  return { success: "Illustration ajoutée." };
}

export async function refineRecipe(recipeId: string, message: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("*")
    .eq("id", recipeId)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages pour utiliser l'IA." };
  }

  const instructions = buildRefineInstructions(recipe, message);

  try {
    const result = (await callGemini({ ...config, instructions })) as Record<string, unknown>;
    if (!result.title) throw new GeminiError("Réponse IA incomplète.");

    const { error } = await supabase
      .from("a_table_recipes")
      .update({
        ...result,
        step_labels: validStepLabels(result.steps, result.step_labels),
      })
      .eq("id", recipeId)
      .eq("user_id", profile.id);

    if (error) return { error: "Modification appliquée par l'IA, mais impossible à enregistrer." };
  } catch (err) {
    const message =
      err instanceof GeminiError ? err.message : "L'IA n'a pas pu appliquer cette modification. Réessaie.";
    return { error: message };
  }

  revalidatePath("/apps/a-table");
  return { success: "Recette mise à jour." };
}

interface ImportRecipeInput {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export async function importRecipe(input: ImportRecipeInput): Promise<ActionState> {
  const profile = await requireATableAccess();

  if (!input.text && !input.imageBase64) {
    return { error: "Colle un texte ou ajoute une photo de la recette." };
  }

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages pour utiliser l'IA." };
  }

  const instructions = buildImportInstructions(input.text);

  let result: Record<string, unknown>;
  try {
    result = (await callGemini({
      ...config,
      instructions,
      image: input.imageBase64 ? { data: input.imageBase64, mimeType: input.imageMimeType || "image/jpeg" } : undefined,
    })) as Record<string, unknown>;
    if (!result.title) throw new GeminiError("La recette n'a pas pu être structurée.");
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Import impossible. Réessaie." };
  }

  const supabase = await createClient();
  const { data: recipe, error: recipeError } = await supabase
    .from("a_table_recipes")
    .insert({
      user_id: profile.id,
      title: String(result.title),
      source_kind: "personal_manual",
      servings: Number(result.servings) || 2,
      cooking_minutes: result.cooking_minutes ? Number(result.cooking_minutes) : null,
      tags: Array.isArray(result.tags) ? result.tags : [],
      ingredients: (result.ingredients ?? []) as Json,
      steps: Array.isArray(result.steps) ? result.steps : [],
      step_labels: validStepLabels(result.steps, result.step_labels),
      notes: typeof result.notes === "string" ? result.notes : "",
      nutrition: (result.nutrition ?? {}) as Json,
      price_per_serving: result.price_per_serving ? Number(result.price_per_serving) : null,
    })
    .select("id, servings")
    .single();

  if (recipeError || !recipe) return { error: "Impossible d'enregistrer la recette importée." };

  const position = await nextBacklogPosition(profile.id);
  await supabase.from("a_table_meal_cards").insert({
    user_id: profile.id,
    recipe_id: recipe.id,
    placement: "backlog",
    position,
    servings: recipe.servings,
  });

  revalidatePath("/apps/a-table");
  return { success: "Recette importée et ajoutée à « À cuisiner »." };
}
