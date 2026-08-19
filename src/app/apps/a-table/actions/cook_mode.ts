"use server";

import { requireATableAccess } from "@/lib/a-table/dal";
import { getDecryptedGeminiConfig } from "@/lib/a-table/ai-config";
import { callGemini, GeminiError } from "@/lib/a-table/gemini";

export interface CookPlanStep {
  recipe_index: number;
  step_text: string;
}

export interface ActionState {
  error?: string;
  plan?: CookPlanStep[];
}

interface CookRecipeInput {
  name: string;
  steps: string[];
}

function flatCookPlan(recipes: CookRecipeInput[]): CookPlanStep[] {
  return recipes.flatMap((recipe, index) => recipe.steps.map((step_text) => ({ recipe_index: index, step_text })));
}

/**
 * Interleaves cooking steps across multiple simultaneous dishes via AI —
 * never rewrites step text, only reorders/tags it. Falls back silently to
 * a flat concatenation on any failure (never raises to the caller), exactly
 * like the original: this feature must never hard-fail a cook session.
 */
export async function generateCookPlan(recipes: CookRecipeInput[]): Promise<ActionState> {
  const profile = await requireATableAccess();

  if (recipes.length === 0) return { plan: [] };
  if (recipes.length === 1) return { plan: flatCookPlan(recipes) };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { plan: flatCookPlan(recipes) };
  }

  const allSteps = new Set(recipes.flatMap((r) => r.steps));
  const recipesText = recipes
    .map((r, i) => `Plat ${i} — ${r.name} :\n${r.steps.map((s, j) => `${j + 1}. ${s}`).join("\n")}`)
    .join("\n\n");

  const instructions =
    "Tu aides à cuisiner plusieurs plats en même temps. Voici les étapes de chaque plat :\n\n" +
    `${recipesText}\n\n` +
    "CONSIGNE CRITIQUE : entrelace ces étapes dans un ordre logique pour les cuisiner en parallèle (ex. démarrer une cuisson longue avant une préparation courte), mais NE REFORMULE JAMAIS le texte d'une étape — reprends chaque step_text mot pour mot, à l'identique, juste réordonné et associé à son plat.\n\n" +
    'RÉSULTAT ATTENDU (JSON strict) :\n{"plan": [{"recipe_index": 0, "step_text": "texte exact d\'une étape ci-dessus"}]}';

  try {
    const result = (await callGemini({ ...config, instructions })) as { plan?: unknown };
    const plan = Array.isArray(result.plan) ? (result.plan as CookPlanStep[]) : null;

    if (
      !plan ||
      plan.length === 0 ||
      !plan.every(
        (entry) =>
          typeof entry.recipe_index === "number" &&
          entry.recipe_index >= 0 &&
          entry.recipe_index < recipes.length &&
          typeof entry.step_text === "string" &&
          allSteps.has(entry.step_text)
      )
    ) {
      throw new GeminiError("Plan invalide.");
    }

    return { plan };
  } catch {
    return { plan: flatCookPlan(recipes) };
  }
}
