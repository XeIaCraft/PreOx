"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function addHouseholdMember(input: { name: string; allergies: string[]; diet: string }): Promise<ActionState> {
  const profile = await requireATableAccess();
  const name = input.name.trim();
  if (!name) return { error: "Le nom est requis." };

  const supabase = await createClient();
  const { error } = await supabase.from("a_table_household_members").insert({
    user_id: profile.id,
    name,
    allergies: input.allergies,
    diet: input.diet.trim(),
  });

  if (error) return { error: "Impossible d'ajouter ce profil." };

  revalidatePath("/apps/a-table");
  return { success: "Profil ajouté." };
}

export async function updateHouseholdMember(id: string, input: { name: string; allergies: string[]; diet: string }): Promise<ActionState> {
  const profile = await requireATableAccess();
  const name = input.name.trim();
  if (!name) return { error: "Le nom est requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_household_members")
    .update({ name, allergies: input.allergies, diet: input.diet.trim() })
    .eq("id", id)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour ce profil." };

  revalidatePath("/apps/a-table");
  return { success: "Profil mis à jour." };
}

export async function removeHouseholdMember(id: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_household_members").delete().eq("id", id).eq("user_id", profile.id);

  if (error) return { error: "Impossible de supprimer ce profil." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
