import "server-only";

import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "./crypto";

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export async function getDecryptedGeminiConfig(userId: string): Promise<GeminiConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("a_table_settings")
    .select("gemini_api_key_encrypted, gemini_model")
    .eq("user_id", userId)
    .single();

  if (!data?.gemini_api_key_encrypted) {
    throw new Error("Aucune clé API Gemini configurée.");
  }

  return {
    apiKey: decryptSecret(data.gemini_api_key_encrypted),
    model: data.gemini_model || "gemini-3.1-flash-lite",
  };
}

export async function getDecryptedPexelsKey(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("a_table_settings")
    .select("pexels_api_key_encrypted")
    .eq("user_id", userId)
    .single();

  if (!data?.pexels_api_key_encrypted) return null;
  return decryptSecret(data.pexels_api_key_encrypted);
}
