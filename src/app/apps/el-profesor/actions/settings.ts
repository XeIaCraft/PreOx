"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function updateGeminiModel(model: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = model.trim();
  if (!trimmed) return { error: "Le nom du modèle est obligatoire." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_settings")
    .update({ gemini_model: trimmed, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible de mettre à jour le modèle." };

  revalidatePath("/apps/el-profesor");
  return { success: "Modèle mis à jour." };
}
