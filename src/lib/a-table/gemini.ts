import "server-only";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Mirrors the original's `html.unescape()` pass over every string in a parsed structure. */
function unescapeHtmlEntities<T>(value: T): T {
  if (typeof value === "string") {
    let result = value.replace(/&(amp|lt|gt|quot|#039|apos|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
    return result as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => unescapeHtmlEntities(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = unescapeHtmlEntities(v);
    }
    return out as T;
  }
  return value;
}

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

export class GeminiError extends Error {}

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

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new GeminiError("Impossible d'extraire un résultat structuré de la réponse de l'IA.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new GeminiError("La réponse de l'IA n'est pas un JSON valide.");
  }

  return unescapeHtmlEntities(parsed);
}
