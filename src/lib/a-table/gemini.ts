import "server-only";

import { GeminiError, parseGeminiJson } from "@/lib/gemini-shared";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export { GeminiError };

/** Only keeps step_labels if it parallels steps 1:1 — otherwise the UI falls back to auto-labels. */
export function validStepLabels(steps: unknown, stepLabels: unknown): string[] {
  if (
    Array.isArray(steps) &&
    Array.isArray(stepLabels) &&
    stepLabels.length === steps.length &&
    stepLabels.every((l) => typeof l === "string")
  ) {
    return stepLabels as string[];
  }
  return [];
}

interface GeminiImageInput {
  data: string;
  mimeType: string;
}

interface CallGeminiOptions {
  apiKey: string;
  model: string;
  instructions: string;
  image?: GeminiImageInput;
}

/**
 * Calls Gemini's generateContent with structured JSON output, then applies
 * the same defensive post-processing as the original Home Assistant
 * integration: regex-extract the first `{...}` block (safety net even with
 * responseMimeType=json), JSON.parse, unescape HTML entities.
 */
export async function callGemini({ apiKey, model, instructions, image }: CallGeminiOptions): Promise<unknown> {
  const parts: Array<Record<string, unknown>> = [{ text: instructions }];
  if (image) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GeminiError(`Appel Gemini échoué (${response.status}) : ${body.slice(0, 300) || "erreur inconnue"}.`);
  }

  const payload = await response.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new GeminiError("Réponse Gemini vide ou inattendue.");
  }

  return parseGeminiJson(text);
}
