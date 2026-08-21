"use server";

import { requireElProfesorAccess, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { translateFicheText, generateClinicalCase, generateExamQuestions } from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";

/**
 * On-demand fiche translation — ephemeral, never persisted (the fiche text
 * is passed in by the client, already flattened from what it has loaded,
 * rather than re-fetched here). Item 12 of the backlog.
 */
export async function getFicheTranslation(ficheTitle: string, ficheText: string, targetLanguage: string): Promise<{ text: string } | { error: string }> {
  await requireElProfesorAccess();
  if (!ficheText.trim()) return { error: "Cette fiche n'a pas encore de contenu à traduire." };

  try {
    const config = await getElProfesorGeminiConfig();
    return await translateFicheText(config, ficheTitle, ficheText, targetLanguage);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la traduction." };
  }
}

/** On-demand clinical-vignette generation from a fiche's content — ephemeral, never persisted. Item 13 of the backlog. */
export async function getClinicalCase(subEntityName: string, ficheText: string): Promise<{ text: string } | { error: string }> {
  await requireElProfesorAccess();
  if (!ficheText.trim()) return { error: "Cette fiche n'a pas encore assez de contenu pour générer un cas clinique." };

  try {
    const config = await getElProfesorGeminiConfig();
    return await generateClinicalCase(config, subEntityName, ficheText);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la génération du cas clinique." };
  }
}

/** On-demand exam-style question generation from a fiche's content — ephemeral, never persisted. Item 8 of the backlog. */
export async function getExamQuestions(subEntityName: string, ficheText: string): Promise<{ text: string } | { error: string }> {
  await requireElProfesorAccess();
  if (!ficheText.trim()) return { error: "Cette fiche n'a pas encore assez de contenu pour générer des questions." };

  try {
    const config = await getElProfesorGeminiConfig();
    return await generateExamQuestions(config, subEntityName, ficheText);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la génération des questions." };
  }
}
