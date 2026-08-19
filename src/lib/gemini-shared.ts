import "server-only";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Recursively unescapes HTML entities Gemini sometimes leaves in JSON string values. */
export function unescapeHtmlEntities<T>(value: T): T {
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

export class GeminiError extends Error {}

/**
 * Extracts and parses the first `{...}` JSON block from a Gemini text
 * response, then unescapes HTML entities throughout. Safety net kept even
 * when `responseMimeType`/`responseSchema` constrain the output, since
 * Gemini occasionally wraps JSON in prose despite the constraint.
 */
export function parseGeminiJson(text: string): unknown {
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
