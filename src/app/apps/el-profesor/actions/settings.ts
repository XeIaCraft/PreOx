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

/**
 * Additional Gemini keys tried in order after the primary one, only when a
 * call fails with a quota (429) or capacity (503) error — e.g. several free
 * accounts round-robined to spread quota. Appends to the existing list
 * rather than replacing it: the stored keys are never decrypted back to the
 * client, so the admin has no way to see (and therefore no way to safely
 * retype) what's already saved — use clearGeminiExtraKeys() to start over.
 */
export async function addGeminiExtraKeys(keys: string[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = keys.map((k) => k.trim()).filter(Boolean);
  if (trimmed.length === 0) return { error: "Aucune clé à ajouter." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("el_profesor_secrets").select("gemini_extra_keys_encrypted").eq("id", true).maybeSingle();
  const existingKeys = (existing?.gemini_extra_keys_encrypted as string[] | null) ?? [];

  const { error } = await supabase
    .from("el_profesor_secrets")
    .update({
      gemini_extra_keys_encrypted: [...existingKeys, ...trimmed.map((k) => encryptSecret(k))],
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { error: "Impossible d'enregistrer les clés API supplémentaires." };

  revalidatePath("/apps/el-profesor");
  return { success: `${trimmed.length} clé(s) ajoutée(s).` };
}

export async function clearGeminiExtraKeys(): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_secrets")
    .update({ gemini_extra_keys_encrypted: [], updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible de retirer les clés API supplémentaires." };

  revalidatePath("/apps/el-profesor");
  return { success: "Clés supplémentaires retirées." };
}

/** Switches which provider powers extraction/complément — an alternative to Gemini when its quota runs out. */
export async function updateAiProvider(provider: "gemini" | "claude"): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_settings")
    .update({ ai_provider: provider, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible de changer de fournisseur IA." };

  revalidatePath("/apps/el-profesor");
  return { success: provider === "claude" ? "Claude activé pour l'extraction." : "Gemini activé pour l'extraction." };
}

export async function updateClaudeModel(model: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = model.trim();
  if (!trimmed) return { error: "Le nom du modèle est obligatoire." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_settings")
    .update({ claude_model: trimmed, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible de mettre à jour le modèle." };

  revalidatePath("/apps/el-profesor");
  return { success: "Modèle mis à jour." };
}

export async function updateClaudeApiKey(apiKey: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = apiKey.trim();
  if (!trimmed) return { error: "La clé API est obligatoire." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_secrets")
    .update({ claude_api_key_encrypted: encryptSecret(trimmed), updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible d'enregistrer la clé API." };

  revalidatePath("/apps/el-profesor");
  return { success: "Clé API enregistrée." };
}

export async function clearClaudeApiKey(): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_secrets")
    .update({ claude_api_key_encrypted: null, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible de supprimer la clé API." };

  revalidatePath("/apps/el-profesor");
  return { success: "Clé API supprimée." };
}

/** Secondary model tried (for every configured key) if the primary model keeps failing with quota/capacity errors. */
export async function updateGeminiFallbackModel(model: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = model.trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_settings")
    .update({ gemini_fallback_model: trimmed || null, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: "Impossible de mettre à jour le modèle de secours." };

  revalidatePath("/apps/el-profesor");
  return { success: trimmed ? "Modèle de secours enregistré." : "Modèle de secours retiré." };
}
