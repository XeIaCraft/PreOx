"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { callGemini, GeminiError, validStepLabels } from "@/lib/a-table/gemini";
import { searchPexelsImage, PexelsError } from "@/lib/a-table/pexels";
import { getDecryptedGeminiConfig, getDecryptedPexelsKey } from "@/lib/a-table/ai-config";
import { buildImportInstructions, buildRefineInstructions } from "@/lib/a-table/prompts";
import { WINE_INSTRUCTION } from "@/lib/a-table/guest-prompts";
import { uploadRecipePhoto as uploadRecipePhotoToStorage } from "@/lib/a-table/storage";
import type { Ingredient, Nutrition, WinePairing } from "@/lib/a-table/types";
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

export interface RecipeSearchResult {
  id: string;
  title: string;
}

/** Quick title-only match for the hub-wide search box on /apps — the full ingredient/tag search lives in the library dialog. */
export async function searchMyRecipeTitles(query: string): Promise<RecipeSearchResult[]> {
  const profile = await requireATableAccess();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  // Matches the title OR the personal notes field — notes is where cooking
  // history/commentary tends to live ("parfait pour Noël", "trop salé la
  // fois où..."), so searching it too covers "search my cooking history"
  // without needing a separate index over a_table_history. Strips ",()"
  // since those are structural characters in PostgREST's or() mini-syntax —
  // eq(user_id) stays a separate hard filter regardless, so this is about
  // not mangling the query, not about access control.
  const safeTerm = trimmed.replace(/[,()]/g, " ");
  const { data } = await supabase
    .from("a_table_recipes")
    .select("id, title")
    .eq("user_id", profile.id)
    .or(`title.ilike.%${safeTerm}%,notes.ilike.%${safeTerm}%`)
    .limit(8);

  return data ?? [];
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

export async function toggleNeedsDefrost(recipeId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("a_table_recipes")
    .select("needs_defrost")
    .eq("id", recipeId)
    .eq("user_id", profile.id)
    .single();

  if (!recipe) return { error: "Recette introuvable." };

  const { error } = await supabase
    .from("a_table_recipes")
    .update({ needs_defrost: !recipe.needs_defrost })
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

/** Toggles a public, read-only share link for a recipe — generates a fresh opaque token when enabling, clears it (revoking any previously shared link) when disabling. */
export async function toggleRecipeShare(recipeId: string, share: boolean): Promise<ActionState & { shareToken?: string | null }> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const shareToken = share ? randomUUID() : null;
  const { error } = await supabase
    .from("a_table_recipes")
    .update({ share_token: shareToken })
    .eq("id", recipeId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour le partage." };

  revalidatePath("/apps/a-table");
  return { success: share ? "Lien de partage créé." : "Partage désactivé.", shareToken };
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

/** Ephemeral: not persisted, just returned for display in the current session. */
export async function suggestWineForRecipe(recipeId: string): Promise<ActionState & { winePairings?: WinePairing[] }> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase.from("a_table_recipes").select("title, ingredients").eq("id", recipeId).eq("user_id", profile.id).single();
  if (!recipe) return { error: "Recette introuvable." };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages pour utiliser l'IA." };
  }

  const ingredientNames = ((recipe.ingredients as unknown as Ingredient[]) ?? []).map((i) => i.name).join(", ");
  const instructions = `Voici un plat : "${recipe.title}" (ingrédients principaux : ${ingredientNames}).\n\n${WINE_INSTRUCTION}\n\nRÉSULTAT ATTENDU (JSON strict) :\n{"wine_pairings": [{"style": "...", "description": "...", "producers": []}]}`;

  try {
    const result = (await callGemini({ ...config, instructions })) as { wine_pairings?: WinePairing[] };
    if (!result.wine_pairings?.length) throw new GeminiError("Aucune suggestion obtenue.");
    return { winePairings: result.wine_pairings };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Suggestion impossible pour le moment." };
  }
}

export async function uploadRecipePhoto(recipeId: string, imageBase64: string, mimeType: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: recipe } = await supabase.from("a_table_recipes").select("id").eq("id", recipeId).eq("user_id", profile.id).single();
  if (!recipe) return { error: "Recette introuvable." };

  let imageUrl: string;
  try {
    imageUrl = await uploadRecipePhotoToStorage(profile.id, recipeId, Buffer.from(imageBase64, "base64"), mimeType);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de l'envoi de la photo." };
  }

  const { error } = await supabase
    .from("a_table_recipes")
    .update({ image_url: imageUrl, image_status: "found" })
    .eq("id", recipeId)
    .eq("user_id", profile.id);
  if (error) return { error: "Photo envoyée, mais impossible de l'enregistrer." };

  revalidatePath("/apps/a-table");
  return { success: "Photo ajoutée." };
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

/**
 * Open Graph meta tags (og:title/og:description) — on JS-rendered pages like
 * Instagram/TikTok, the server-rendered body is mostly an empty app shell,
 * but the caption is almost always still present in these meta tags, so
 * pulling them out separately and putting them first gives the AI parser a
 * much better shot than the stripped body text alone.
 */
function extractOpenGraphText(html: string): string {
  const get = (property: string) => {
    const match = html.match(new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']*)["']`, "i"));
    return match?.[1]?.trim() ?? "";
  };
  const title = get("title");
  const description = get("description");
  if (!title && !description) return "";
  return [title, description].filter(Boolean).join("\n\n");
}

/** Strips tags/scripts/styles down to readable text — good enough input for Gemini to parse, no HTML parser dependency needed. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
}

/** Generates one new recipe idea built primarily around current leftovers (temporary ingredients). */
export async function generateRecipeFromLeftovers(): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: leftovers } = await supabase.from("a_table_temporary_ingredients").select("name, quantity, unit").eq("user_id", profile.id);
  if (!leftovers || leftovers.length === 0) return { error: "Aucun reste enregistré pour l'instant." };

  const list = leftovers.map((i) => `${i.quantity ? `${i.quantity} ${i.unit} ` : ""}${i.name}`).join(", ");
  const prompt = `Invente une recette qui utilise en priorité ces restes à écouler : ${list}. Complète avec des ingrédients de base courants (huile, sel, épices…) si nécessaire, sans en abuser.`;

  return importRecipe({ text: prompt });
}

export async function importRecipeFromUrl(url: string): Promise<ActionState> {
  await requireATableAccess();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "URL invalide." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "L'URL doit commencer par http:// ou https://." };
  }
  // Defense-in-depth against SSRF toward internal services/cloud metadata —
  // authenticated hub users are trusted, but this endpoint fetches arbitrary
  // attacker-chosen URLs server-side, so it shouldn't be able to reach
  // anything on the private network regardless.
  const hostname = parsed.hostname.toLowerCase();
  const isPrivateHost =
    hostname === "localhost" ||
    hostname === "169.254.169.254" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === "::1";
  if (isPrivateHost) {
    return { error: "Cette adresse n'est pas autorisée." };
  }

  let html: string;
  try {
    const response = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PreOx-recipe-import/1.0)" },
    });
    if (!response.ok) return { error: `Impossible de charger cette page (${response.status}).` };
    html = await response.text();
  } catch {
    return { error: "Impossible de joindre cette page. Vérifiez l'URL." };
  }

  const openGraphText = extractOpenGraphText(html);
  const text = [openGraphText, htmlToText(html)].filter(Boolean).join("\n\n---\n\n");
  if (text.length < 100) return { error: "Cette page ne semble pas contenir de recette exploitable." };

  return importRecipe({ text });
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
