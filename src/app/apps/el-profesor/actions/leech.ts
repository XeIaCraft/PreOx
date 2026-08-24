"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { suggestLeechRewording } from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";
import type { FlashcardVariant } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Piste d'amélioration 2026-08-24 ("traitement des cartes sangsues") : lie
 * la détection de cartes sangsues (getLeechFlashcards, dal.ts) au
 * mécanisme existant de test de formulations (item 47) — la reformulation
 * générée est ajoutée comme une variante ordinaire, testée en A/B
 * exactement comme une formulation saisie à la main. Jamais appliquée
 * automatiquement à la question d'origine : l'admin garde la main via le
 * même flux de test que pour toute autre variante.
 */
export async function suggestLeechVariant(
  flashcardId: string,
  subEntityName: string,
  againRate: number
): Promise<ActionState & { suggestion?: string; note?: string }> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: flashcard } = await supabase.from("el_profesor_flashcards").select("front, back, variants").eq("id", flashcardId).maybeSingle();
  if (!flashcard) return { error: "Flashcard introuvable." };

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor." };
  }

  const front = (flashcard.front as unknown as { text: string }).text;
  const back = (flashcard.back as unknown as { text: string }).text;

  let suggestion: { text: string; note: string };
  try {
    suggestion = await suggestLeechRewording(config, subEntityName, front, back, againRate);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la suggestion." };
  }
  if (!suggestion.text.trim()) return { error: "Aucune reformulation proposée." };

  const existingVariants = (flashcard.variants as unknown as FlashcardVariant[]) ?? [];
  const nextVariants: FlashcardVariant[] = [...existingVariants, { id: randomUUID(), text: suggestion.text.trim() }];

  const { error } = await supabase.from("el_profesor_flashcards").update({ variants: nextVariants as never }).eq("id", flashcardId);
  if (error) return { error: "Suggestion générée, mais l'enregistrement a échoué." };

  revalidatePath("/apps/el-profesor");
  return {
    success: "Reformulation ajoutée comme variante à tester.",
    suggestion: suggestion.text,
    note: suggestion.note || undefined,
  };
}
