"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function addPantryItem(input: { name: string; quantity: number | null; unit: string }): Promise<ActionState> {
  const profile = await requireATableAccess();
  const name = input.name.trim();
  if (!name) return { error: "Le nom de l'article est requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_pantry_items")
    .insert({ user_id: profile.id, name, quantity: input.quantity, unit: input.unit.trim() });
  if (error) return { error: "Impossible d'ajouter cet article." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function removePantryItem(itemId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("a_table_pantry_items").delete().eq("id", itemId).eq("user_id", profile.id);
  if (error) return { error: "Impossible de retirer cet article." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
