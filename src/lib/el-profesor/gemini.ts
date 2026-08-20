import "server-only";

import { GeminiError, parseGeminiJson } from "@/lib/gemini-shared";
import { buildExtractionPrompt, buildVerificationPrompt, buildComplementaryPrompt } from "@/lib/el-profesor/prompts";
import type { ComplementaryResult, ExtractionResult, VerificationResult, BlockType } from "@/lib/el-profesor/types";

const FILES_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILES_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODELS_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// A rolling alias (Google hot-swaps it to the current best Flash release)
// rather than a pinned version string like "gemini-3.1-flash" — pinned
// Flash versions get retired every few months and start 404ing.
export const EL_PROFESOR_GEMINI_MODEL = "gemini-flash-latest";

const BLOCK_TYPES: BlockType[] = [
  "definition_mecanisme",
  "valeurs_seuils",
  "tableau_comparatif",
  "protocole_paliers",
  "mnemotechnique",
  "perle_clinique",
  "piege_erreur",
  "formule",
  "texte_libre",
];

const CITATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    page: { type: "INTEGER" },
    quote: { type: "STRING" },
  },
  required: ["page", "quote"],
};

// One flat schema for every block_type rather than a JSON-schema union:
// constrained decoding handles "all these optional fields, fill what's
// relevant" far more reliably than oneOf/anyOf branching.
const BLOCK_CONTENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING" },
    headers: { type: "ARRAY", items: { type: "STRING" } },
    rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          detail: { type: "STRING" },
          condition: { type: "STRING" },
        },
        required: ["label", "detail"],
      },
    },
  },
};

const FICHE_BLOCK_ITEM_SCHEMA = {
  type: "OBJECT",
  properties: {
    block_type: { type: "STRING", enum: BLOCK_TYPES },
    content: BLOCK_CONTENT_SCHEMA,
    citations: { type: "ARRAY", items: CITATION_SCHEMA },
  },
  required: ["block_type", "content", "citations"],
};

const FLASHCARD_ITEM_SCHEMA = {
  type: "OBJECT",
  properties: {
    front: { type: "STRING" },
    back: { type: "STRING" },
    citations: { type: "ARRAY", items: CITATION_SCHEMA },
  },
  required: ["front", "back", "citations"],
};

const SUB_ENTITY_ITEM_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    summary: { type: "STRING" },
    fiche: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        blocks: { type: "ARRAY", items: FICHE_BLOCK_ITEM_SCHEMA },
        flashcards: { type: "ARRAY", items: FLASHCARD_ITEM_SCHEMA },
      },
      required: ["title", "blocks", "flashcards"],
    },
  },
  required: ["name", "summary", "fiche"],
};

const ESTIMATED_REMAINING_PASSES_SCHEMA = {
  type: "INTEGER",
  description:
    "Ton estimation honnête du nombre de passes de complément (gap-fill) encore probablement nécessaires pour une couverture quasi-exhaustive de ce chapitre. 0 si tu penses avoir couvert l'essentiel.",
};

const EXTRACTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sub_entities: { type: "ARRAY", items: SUB_ENTITY_ITEM_SCHEMA },
    estimated_remaining_passes: ESTIMATED_REMAINING_PASSES_SCHEMA,
  },
  required: ["sub_entities", "estimated_remaining_passes"],
};

const COMPLEMENTARY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    additions_for_existing: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sub_entity_name: { type: "STRING" },
          blocks: { type: "ARRAY", items: FICHE_BLOCK_ITEM_SCHEMA },
          flashcards: { type: "ARRAY", items: FLASHCARD_ITEM_SCHEMA },
        },
        required: ["sub_entity_name", "blocks", "flashcards"],
      },
    },
    new_sub_entities: { type: "ARRAY", items: SUB_ENTITY_ITEM_SCHEMA },
    estimated_remaining_passes: ESTIMATED_REMAINING_PASSES_SCHEMA,
  },
  required: ["additions_for_existing", "new_sub_entities", "estimated_remaining_passes"],
};

const VERIFICATION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    flags: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sub_entity_index: { type: "INTEGER" },
          block_index: { type: "INTEGER", nullable: true },
          flashcard_index: { type: "INTEGER", nullable: true },
          needs_review: { type: "BOOLEAN" },
          reason: { type: "STRING" },
        },
        required: ["sub_entity_index", "needs_review", "reason"],
      },
    },
  },
  required: ["flags"],
};

export type UploadedGeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
};

/**
 * Uploads a PDF to the Gemini Files API (resumable upload protocol) rather
 * than sending it inline — avoids the inline-request size cap, which matters
 * for scanned/photographed chapters that can run several tens of MB.
 */
export async function uploadPdfToGemini(
  apiKey: string,
  bytes: Uint8Array,
  displayName: string
): Promise<UploadedGeminiFile> {
  const startResponse = await fetch(`${FILES_UPLOAD_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

  if (!startResponse.ok) {
    const body = await startResponse.text().catch(() => "");
    throw new GeminiError(`Échec de l'initialisation de l'upload PDF (${startResponse.status}) : ${body.slice(0, 300)}`);
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new GeminiError("L'API Gemini n'a pas renvoyé d'URL d'upload.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    // Cast needed: TS's dom lib types Uint8Array's `buffer` as ArrayBufferLike
    // (which includes SharedArrayBuffer, not a valid BlobPart) even though a
    // Uint8Array is always a valid BlobPart at runtime.
    body: new Blob([bytes as unknown as BlobPart]),
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => "");
    throw new GeminiError(`Échec de l'upload du PDF (${uploadResponse.status}) : ${body.slice(0, 300)}`);
  }

  const payload = await uploadResponse.json();
  const file = payload?.file;
  if (!file?.uri || !file?.name) {
    throw new GeminiError("Réponse d'upload Gemini invalide.");
  }

  return await waitUntilActive(apiKey, file.name, file.uri, file.mimeType ?? "application/pdf");
}

async function waitUntilActive(
  apiKey: string,
  name: string,
  uri: string,
  mimeType: string,
  attempt = 0
): Promise<UploadedGeminiFile> {
  const response = await fetch(`${FILES_BASE_URL}/${name}?key=${apiKey}`);
  if (!response.ok) {
    throw new GeminiError(`Impossible de vérifier l'état du fichier PDF uploadé (${response.status}).`);
  }
  const payload = await response.json();
  if (payload.state === "ACTIVE") {
    return { name, uri, mimeType };
  }
  if (payload.state === "FAILED") {
    throw new GeminiError("Le traitement du PDF par l'API Gemini a échoué.");
  }
  if (attempt >= 15) {
    throw new GeminiError("Le PDF met trop de temps à être traité par l'API Gemini.");
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return waitUntilActive(apiKey, name, uri, mimeType, attempt + 1);
}

export async function deleteGeminiFile(apiKey: string, name: string): Promise<void> {
  await fetch(`${FILES_BASE_URL}/${name}?key=${apiKey}`, { method: "DELETE" }).catch(() => {});
}

// Google's Flash models occasionally return 503 ("high demand, try again
// later") or 429 (rate limit) — both are transient and worth a couple of
// retries with backoff before surfacing an error to the admin.
const RETRYABLE_STATUS = new Set([429, 503]);
const RETRY_DELAYS_MS = [2000, 5000];

async function callGeminiWithFile(
  apiKey: string,
  model: string,
  file: UploadedGeminiFile,
  instructions: string,
  responseSchema: Record<string, unknown>,
  attempt = 0
): Promise<unknown> {
  const response = await fetch(`${MODELS_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }, { text: instructions }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });

  if (!response.ok) {
    if (RETRYABLE_STATUS.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      return callGeminiWithFile(apiKey, model, file, instructions, responseSchema, attempt + 1);
    }
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

export async function extractChapterContent(
  apiKey: string,
  model: string,
  file: UploadedGeminiFile,
  chapterTitle: string
): Promise<ExtractionResult> {
  const result = await callGeminiWithFile(apiKey, model, file, buildExtractionPrompt(chapterTitle), EXTRACTION_RESPONSE_SCHEMA);
  return result as ExtractionResult;
}

/** Gap-fill pass: given what's already extracted, generate only what's missing. */
export async function extractComplementaryContent(
  apiKey: string,
  model: string,
  file: UploadedGeminiFile,
  chapterTitle: string,
  coverageSummaryJson: string
): Promise<ComplementaryResult> {
  const prompt = buildComplementaryPrompt(chapterTitle, coverageSummaryJson);
  const result = await callGeminiWithFile(apiKey, model, file, prompt, COMPLEMENTARY_RESPONSE_SCHEMA);
  return result as ComplementaryResult;
}

export async function verifyExtraction(
  apiKey: string,
  model: string,
  file: UploadedGeminiFile,
  extraction: ExtractionResult
): Promise<VerificationResult> {
  const prompt = buildVerificationPrompt(JSON.stringify(extraction));
  const result = await callGeminiWithFile(apiKey, model, file, prompt, VERIFICATION_RESPONSE_SCHEMA);
  return result as VerificationResult;
}
