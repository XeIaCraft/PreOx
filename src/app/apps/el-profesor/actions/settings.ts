"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

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

/** Stores the shared Gemini API key used for extraction/complément/propositions, encrypted at rest — replaces the old EL_PROFESOR_GEMINI_API_KEY env var. */
export async function updateGeminiApiKey(apiKey: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = apiKey.trim();
  if (!trimmed) return { error: "La clé API est obligatoire." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_secrets")
    .update({ gemini_api_key_encrypted: encryptSecret(trimmed), updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible d'enregistrer la clé API." };

  revalidatePath("/apps/el-profesor");
  return { success: "Clé API enregistrée." };
}

export async function clearGeminiApiKey(): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_secrets")
    .update({ gemini_api_key_encrypted: null, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible de supprimer la clé API." };

  revalidatePath("/apps/el-profesor");
  return { success: "Clé API supprimée." };
}
