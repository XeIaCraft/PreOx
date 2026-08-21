"use server";

import { requireElProfesorAccess, getLibrary, getDifficultQueue, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { generateWeaknessSynthesis } from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";

// Bounds the prompt (and the cost) regardless of how large the carnet
// d'erreurs has grown — the most-struggled cards are what matters most,
// and getDifficultQueue is already shuffled so this isn't a fixed subset.
const MAX_CARDS = 60;

/** On-demand AI synthesis of the user's current weak points, across every chapter — item 19 of the backlog. */
export async function getWeaknessSynthesis(): Promise<{ text: string } | { error: string }> {
  const profile = await requireElProfesorAccess();
  const books = await getLibrary();
  const chapters = books.flatMap((b) => b.chapters).filter((c) => c.status === "published");

  const difficult = await getDifficultQueue(profile.id, chapters);
  if (difficult.length === 0) {
    return { error: "Aucune carte difficile identifiée pour l'instant — continuez à réviser, cette synthèse se construira avec le temps." };
  }

  try {
    const config = await getElProfesorGeminiConfig();
    const items = difficult.slice(0, MAX_CARDS).map((c) => ({ front: c.front.text, back: c.back.text }));
    return await generateWeaknessSynthesis(config, items);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la génération de la synthèse." };
  }
}
