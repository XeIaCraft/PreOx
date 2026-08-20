"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function createCollection(name: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom de la collection est requis." };

  const supabase = await createClient();
  const { error } = await supabase.from("a_table_collections").insert({ user_id: profile.id, name: trimmed });
  if (error) return { error: "Impossible de créer la collection." };

  revalidatePath("/apps/a-table");
  return { success: "Collection créée." };
}

export async function renameCollection(collectionId: string, name: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom de la collection est requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_collections")
    .update({ name: trimmed })
    .eq("id", collectionId)
    .eq("user_id", profile.id);
  if (error) return { error: "Impossible de renommer la collection." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function deleteCollection(collectionId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("a_table_collections").delete().eq("id", collectionId).eq("user_id", profile.id);
  if (error) return { error: "Impossible de supprimer la collection." };

  revalidatePath("/apps/a-table");
  return { success: "Collection supprimée." };
}

export async function toggleRecipeInCollection(collectionId: string, recipeId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: collection } = await supabase
    .from("a_table_collections")
    .select("recipe_ids")
    .eq("id", collectionId)
    .eq("user_id", profile.id)
    .single();
  if (!collection) return { error: "Collection introuvable." };

  const current = collection.recipe_ids ?? [];
  const next = current.includes(recipeId) ? current.filter((id) => id !== recipeId) : [...current, recipeId];

  const { error } = await supabase
    .from("a_table_collections")
    .update({ recipe_ids: next })
    .eq("id", collectionId)
    .eq("user_id", profile.id);
  if (error) return { error: "Impossible de mettre à jour la collection." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
