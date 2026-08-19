"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

interface TempIngredientInput {
  name: string;
  quantity?: number | null;
  unit?: string;
  note?: string;
  dateLimit?: string;
}

export async function addTemporaryIngredient(input: TempIngredientInput): Promise<ActionState> {
  const profile = await requireATableAccess();
  if (!input.name.trim()) return { error: "Le nom de l'aliment est requis." };

  const supabase = await createClient();
  const { error } = await supabase.from("a_table_temporary_ingredients").insert({
    user_id: profile.id,
    name: input.name.trim(),
    quantity: input.quantity ?? null,
    unit: input.unit ?? "",
    note: input.note ?? "",
    date_limit: input.dateLimit ?? "",
    status: "active",
  });

  if (error) return { error: "Impossible d'ajouter cet aliment." };

  revalidatePath("/apps/a-table");
  return { success: "Aliment ajouté." };
}

export async function updateTemporaryIngredient(id: string, updates: TempIngredientInput): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("a_table_temporary_ingredients")
    .update({
      name: updates.name,
      quantity: updates.quantity ?? null,
      unit: updates.unit ?? "",
      note: updates.note ?? "",
      date_limit: updates.dateLimit ?? "",
    })
    .eq("id", id)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour cet aliment." };

  revalidatePath("/apps/a-table");
  return { success: "Aliment mis à jour." };
}

export async function removeTemporaryIngredient(id: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_temporary_ingredients").delete().eq("id", id).eq("user_id", profile.id);

  if (error) return { error: "Impossible de supprimer cet aliment." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
