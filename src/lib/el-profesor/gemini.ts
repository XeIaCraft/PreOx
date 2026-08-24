import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GeminiError, parseGeminiJson } from "@/lib/gemini-shared";
import {
  buildExtractionPrompt,
  buildTextExtractionPrompt,
  buildVerificationPrompt,
  buildComplementaryPrompt,
  buildSelectionPrompt,
  buildMnemonicPrompt,
  buildNotionCategorizationPrompt,
  buildContradictionCheckPrompt,
  buildNotionUpdateCheckPrompt,
  buildWeaknessSynthesisPrompt,
  buildFicheTranslationPrompt,
  buildClinicalCasePrompt,
  buildExamQuestionsPrompt,
  buildMindMapPrompt,
  buildChapterSplitPrompt,
  buildPageOcrPrompt,
  buildLeechRewordingPrompt,
} from "@/lib/el-profesor/prompts";
import type {
  ComplementaryResult,
  ExtractionResult,
  VerificationResult,
  SelectionResult,
  BlockType,
  NotionCategorizationResult,
  ContradictionCheckResult,
  NotionUpdateCheckResult,
} from "@/lib/el-profesor/types";

const FILES_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILES_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODELS_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Default/fallback model — a rolling alias (Google hot-swaps it to the
// current best Flash release) rather than a pinned version string like
// "gemini-3.1-flash", which would get retired and start 404ing within a
// few months. An admin can override the actual model used at runtime via
// the settings row (see getElProfesorGeminiModel in dal.ts); this constant
// only seeds that row's default and covers the case where it's missing.
export const EL_PROFESOR_GEMINI_MODEL_DEFAULT = "gemini-flash-latest";

export const BLOCK_TYPES: BlockType[] = [
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
    // Optional — only set when a nearby diagram/schema would genuinely help
    // this flashcard (PDF sources only, see buildExtractionPrompt).
    suggested_image_page: { type: "INTEGER" },
    suggested_image_hint: { type: "STRING" },
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

const SELECTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    block: FICHE_BLOCK_ITEM_SCHEMA,
    flashcard: FLASHCARD_ITEM_SCHEMA,
  },
  required: ["block"],
};

const MNEMONIC_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING" },
  },
  required: ["text"],
};

const LEECH_REWORDING_SCHEMA = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING" },
    note: { type: "STRING" },
  },
  required: ["text", "note"],
};

const SYNTHESIS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING" },
  },
  required: ["text"],
};

// Fixed two-level tree (not open recursion — Gemini's structured output
// doesn't support self-referencing schemas) — item 2 of the backlog.
const MIND_MAP_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    central: { type: "STRING" },
    branches: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          children: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["label", "children"],
      },
    },
  },
  required: ["central", "branches"],
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

const NOTION_CATEGORIZATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    notions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["notions"],
};

const CONTRADICTION_CHECK_SCHEMA = {
  type: "OBJECT",
  properties: {
    contradictory: { type: "BOOLEAN" },
    explanation: { type: "STRING" },
  },
  required: ["contradictory", "explanation"],
};

const NOTION_UPDATE_CHECK_SCHEMA = {
  type: "OBJECT",
  properties: {
    needs_update: { type: "BOOLEAN" },
    explanation: { type: "STRING" },
    blocks: { type: "ARRAY", items: FICHE_BLOCK_ITEM_SCHEMA },
    flashcards: { type: "ARRAY", items: FLASHCARD_ITEM_SCHEMA },
  },
  required: ["needs_update", "explanation", "blocks", "flashcards"],
};

const CHAPTER_SPLIT_SCHEMA = {
  type: "OBJECT",
  properties: {
    chapters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          start_page: { type: "INTEGER" },
        },
        required: ["title", "start_page"],
      },
    },
  },
  required: ["chapters"],
};

const PAGE_OCR_SCHEMA = {
  type: "OBJECT",
  properties: {
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          page_number: { type: "INTEGER" },
          text: { type: "STRING" },
        },
        required: ["page_number", "text"],
      },
    },
  },
  required: ["pages"],
};

export type UploadedGeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
};

/** Ordered lists to try — see getElProfesorGeminiConfig in lib/el-profesor/dal.ts for how these are built. */
export interface GeminiRotationConfig {
  apiKeys: string[];
  models: string[];
}

function isQuotaOrCapacityError(err: unknown): boolean {
  return err instanceof GeminiError && /\((429|503)\)/.test(err.message);
}

/** Every (key, model) combo to try, primary model across all keys before falling back to the secondary model. */
function rotationCombos(config: GeminiRotationConfig): { apiKey: string; model: string }[] {
  const combos: { apiKey: string; model: string }[] = [];
  for (const model of config.models) for (const apiKey of config.apiKeys) combos.push({ apiKey, model });
  return combos;
}

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

/** Best-effort quota/consumption journal — never lets a logging failure affect the actual Gemini call. */
async function logGeminiUsage(entry: {
  model: string;
  success: boolean;
  statusCode?: number;
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  errorMessage?: string;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("el_profesor_gemini_usage_log").insert({
      model: entry.model,
      success: entry.success,
      status_code: entry.statusCode ?? null,
      prompt_tokens: entry.promptTokens ?? null,
      candidates_tokens: entry.candidatesTokens ?? null,
      total_tokens: entry.totalTokens ?? null,
      error_message: entry.errorMessage ?? null,
    });
  } catch {
    // best-effort — never block the actual Gemini call on logging
  }
}

async function callGeminiJson(
  apiKey: string,
  model: string,
  parts: Array<Record<string, unknown>>,
  responseSchema: Record<string, unknown>,
  attempt = 0
): Promise<unknown> {
  const response = await fetch(`${MODELS_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    await logGeminiUsage({ model, success: false, statusCode: response.status, errorMessage: body.slice(0, 300) });
    if (RETRYABLE_STATUS.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      return callGeminiJson(apiKey, model, parts, responseSchema, attempt + 1);
    }
    throw new GeminiError(`Appel Gemini échoué (${response.status}) : ${body.slice(0, 300) || "erreur inconnue"}.`);
  }

  const payload = await response.json();
  const usage = payload?.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined;
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    await logGeminiUsage({ model, success: false, statusCode: response.status, errorMessage: "Réponse vide ou inattendue." });
    throw new GeminiError("Réponse Gemini vide ou inattendue.");
  }

  await logGeminiUsage({
    model,
    success: true,
    statusCode: response.status,
    promptTokens: usage?.promptTokenCount,
    candidatesTokens: usage?.candidatesTokenCount,
    totalTokens: usage?.totalTokenCount,
  });

  return parseGeminiJson(text);
}

function callGeminiWithFile(
  apiKey: string,
  model: string,
  file: UploadedGeminiFile,
  instructions: string,
  responseSchema: Record<string, unknown>
): Promise<unknown> {
  return callGeminiJson(apiKey, model, [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }, { text: instructions }], responseSchema);
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

/**
 * Uploads the PDF and runs `attempt` for each (key, model) combo, re-uploading
 * only when the key actually changes (the Gemini Files API scopes uploads per
 * key/project, but the model doesn't affect where the file lives). On a
 * quota/capacity failure the file for that key is kept in case a later combo
 * reuses the same key with the fallback model; every file except the winning
 * one (or all of them, on total failure) is cleaned up before returning.
 */
async function withFileRotation<T>(
  config: GeminiRotationConfig,
  bytes: Uint8Array,
  displayName: string,
  attempt: (apiKey: string, model: string, file: UploadedGeminiFile) => Promise<T>
): Promise<{ result: T; apiKey: string; model: string; file: UploadedGeminiFile }> {
  const uploadedByKey = new Map<string, UploadedGeminiFile>();

  async function cleanupExcept(exceptKey: string | null) {
    for (const [key, file] of uploadedByKey) {
      if (key === exceptKey) continue;
      await deleteGeminiFile(key, file.name).catch(() => {});
    }
  }

  let lastError: unknown;
  for (const { apiKey, model } of rotationCombos(config)) {
    try {
      let file = uploadedByKey.get(apiKey);
      if (!file) {
        file = await uploadPdfToGemini(apiKey, bytes, displayName);
        uploadedByKey.set(apiKey, file);
      }
      const result = await attempt(apiKey, model, file);
      await cleanupExcept(apiKey);
      return { result, apiKey, model, file };
    } catch (err) {
      lastError = err;
      if (!isQuotaOrCapacityError(err)) {
        await cleanupExcept(null);
        throw err;
      }
    }
  }
  await cleanupExcept(null);
  throw lastError instanceof Error ? lastError : new GeminiError("Appel Gemini échoué.");
}

/** Rotation-aware wrapper around uploadPdfToGemini + extractChapterContent — see withFileRotation. */
export async function extractChapterContentWithRotation(
  config: GeminiRotationConfig,
  bytes: Uint8Array,
  displayName: string,
  chapterTitle: string
): Promise<{ extraction: ExtractionResult; apiKey: string; model: string; file: UploadedGeminiFile }> {
  const { result, apiKey, model, file } = await withFileRotation(config, bytes, displayName, (key, m, file) =>
    extractChapterContent(key, m, file, chapterTitle)
  );
  return { extraction: result, apiKey, model, file };
}

/** Rotation-aware wrapper around uploadPdfToGemini + extractComplementaryContent — see withFileRotation. */
export async function extractComplementaryContentWithRotation(
  config: GeminiRotationConfig,
  bytes: Uint8Array,
  displayName: string,
  chapterTitle: string,
  coverageSummaryJson: string
): Promise<{ complementary: ComplementaryResult; apiKey: string; model: string; file: UploadedGeminiFile }> {
  const { result, apiKey, model, file } = await withFileRotation(config, bytes, displayName, (key, m, file) =>
    extractComplementaryContent(key, m, file, chapterTitle, coverageSummaryJson)
  );
  return { complementary: result, apiKey, model, file };
}

async function ocrPdfPagesRequest(
  apiKey: string,
  model: string,
  file: UploadedGeminiFile,
  pageNumbers: number[]
): Promise<{ pages: { page_number: number; text: string }[] }> {
  const result = await callGeminiWithFile(apiKey, model, file, buildPageOcrPrompt(pageNumbers), PAGE_OCR_SCHEMA);
  return result as { pages: { page_number: number; text: string }[] };
}

/**
 * OCRs specific pages of a PDF that pdfjs couldn't extract text from
 * (scanned/photographed pages) — item "OCR des PDF scannés" of the pistes
 * d'amélioration 2026-08-24, feeding citation page correction on chapters
 * pdfjs can't read directly. One request covers every requested page, not
 * one request per page. Always Gemini regardless of the module's active
 * provider — same reasoning as detectChapterBoundaries (a one-shot helper;
 * the Claude path here is batch-only by design). Rotates on quota/capacity
 * errors like every other file-based call.
 */
export async function ocrScannedPages(
  config: GeminiRotationConfig,
  bytes: Uint8Array,
  displayName: string,
  pageNumbers: number[]
): Promise<Map<number, string>> {
  if (pageNumbers.length === 0) return new Map();
  const { result } = await withFileRotation(config, bytes, displayName, (apiKey, model, file) => ocrPdfPagesRequest(apiKey, model, file, pageNumbers));
  return new Map(result.pages.map((p) => [p.page_number, p.text]));
}

/**
 * Shared retry loop for every text-only Gemini call (no file attachment):
 * tries each configured (key, model) combo in order, rotating to the next
 * on a quota (429) or capacity (503) error. File-based calls have their own
 * withFileRotation above — they also need to manage upload/cleanup per key,
 * which this simpler loop doesn't need to do.
 */
async function textRotation<T>(
  config: GeminiRotationConfig,
  instructions: string,
  responseSchema: Record<string, unknown>
): Promise<{ result: T; apiKey: string; model: string }> {
  let lastError: unknown;
  for (const { apiKey, model } of rotationCombos(config)) {
    try {
      const result = (await callGeminiJson(apiKey, model, [{ text: instructions }], responseSchema)) as T;
      return { result, apiKey, model };
    } catch (err) {
      lastError = err;
      if (!isQuotaOrCapacityError(err)) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new GeminiError("Appel Gemini échoué.");
}

/**
 * Text-only counterpart to extractChapterContentWithRotation for a chapter
 * sourced from Word/PowerPoint (item 5 of the backlog): no file upload, the
 * already-extracted plain text goes straight into the prompt. No
 * verification pass either (there is no PDF to double-check citations
 * against) — the caller marks every element needs_review, same as the
 * Claude provider path.
 */
export async function extractChapterContentFromTextWithRotation(
  config: GeminiRotationConfig,
  chapterTitle: string,
  sourceText: string
): Promise<{ extraction: ExtractionResult; apiKey: string; model: string }> {
  const instructions = buildTextExtractionPrompt(chapterTitle, sourceText);
  const { result, apiKey, model } = await textRotation<ExtractionResult>(config, instructions, EXTRACTION_RESPONSE_SCHEMA);
  return { extraction: result, apiKey, model };
}

/**
 * Turns one user-selected passage (picked by hand in the PDF viewer, not
 * chosen by the model) into a single fiche block + optional flashcard. No
 * file upload needed — the exact text is already known, so this is a plain
 * text-only call, much cheaper than a full extraction pass. Rotates through
 * every configured key/model on quota (429) or capacity (503) errors.
 */
export async function generateFromSelection(
  config: GeminiRotationConfig,
  subEntityName: string,
  chapterTitle: string,
  page: number,
  quote: string
): Promise<SelectionResult> {
  const instructions = buildSelectionPrompt(subEntityName, chapterTitle, page, quote);
  const { result } = await textRotation<SelectionResult>(config, instructions, SELECTION_RESPONSE_SCHEMA);
  return result;
}

/** Generates a single mnemonic suggestion (as plain text) for a block that doesn't already have one. Rotates on quota/capacity errors. */
export async function generateMnemonic(config: GeminiRotationConfig, subEntityName: string, sourceText: string): Promise<{ text: string }> {
  const instructions = buildMnemonicPrompt(subEntityName, sourceText);
  const { result } = await textRotation<{ text: string }>(config, instructions, MNEMONIC_RESPONSE_SCHEMA);
  return result;
}

/** Suggests a clearer question wording for a "leech" flashcard (item "traitement des cartes sangsues", 2026-08-24). Rotates on quota/capacity errors. */
export async function suggestLeechRewording(
  config: GeminiRotationConfig,
  subEntityName: string,
  front: string,
  back: string,
  againRate: number
): Promise<{ text: string; note: string }> {
  const instructions = buildLeechRewordingPrompt(subEntityName, front, back, againRate);
  const { result } = await textRotation<{ text: string; note: string }>(config, instructions, LEECH_REWORDING_SCHEMA);
  return result;
}

/** Generates a plain-text synthesis of a batch of struggled-with flashcards, grouped by theme with actionable retention tips. Rotates on quota/capacity errors. Item 19 of the backlog. */
export async function generateWeaknessSynthesis(
  config: GeminiRotationConfig,
  items: { front: string; back: string }[]
): Promise<{ text: string }> {
  const instructions = buildWeaknessSynthesisPrompt(items);
  const { result } = await textRotation<{ text: string }>(config, instructions, SYNTHESIS_RESPONSE_SCHEMA);
  return result;
}

/** On-demand fiche translation — ephemeral, never persisted. Rotates on quota/capacity errors. Item 12 of the backlog. */
export async function translateFicheText(config: GeminiRotationConfig, ficheTitle: string, ficheText: string, targetLanguage: string): Promise<{ text: string }> {
  const instructions = buildFicheTranslationPrompt(ficheTitle, ficheText, targetLanguage);
  const { result } = await textRotation<{ text: string }>(config, instructions, SYNTHESIS_RESPONSE_SCHEMA);
  return result;
}

/** On-demand clinical-vignette generation from a fiche's content — ephemeral, never persisted. Rotates on quota/capacity errors. Item 13 of the backlog. */
export async function generateClinicalCase(config: GeminiRotationConfig, subEntityName: string, ficheText: string): Promise<{ text: string }> {
  const instructions = buildClinicalCasePrompt(subEntityName, ficheText);
  const { result } = await textRotation<{ text: string }>(config, instructions, SYNTHESIS_RESPONSE_SCHEMA);
  return result;
}

/** On-demand exam-style question generation from a fiche's content — ephemeral, never persisted. Rotates on quota/capacity errors. Item 8 of the backlog. */
export async function generateExamQuestions(config: GeminiRotationConfig, subEntityName: string, ficheText: string): Promise<{ text: string }> {
  const instructions = buildExamQuestionsPrompt(subEntityName, ficheText);
  const { result } = await textRotation<{ text: string }>(config, instructions, SYNTHESIS_RESPONSE_SCHEMA);
  return result;
}

export interface MindMap {
  central: string;
  branches: { label: string; children: string[] }[];
}

/** On-demand chapter mind map — ephemeral, never persisted. Rotates on quota/capacity errors. Item 2 of the backlog. */
export async function generateMindMap(
  config: GeminiRotationConfig,
  chapterTitle: string,
  subEntitySummaries: { name: string; text: string }[]
): Promise<MindMap> {
  const instructions = buildMindMapPrompt(chapterTitle, subEntitySummaries);
  const { result } = await textRotation<MindMap>(config, instructions, MIND_MAP_RESPONSE_SCHEMA);
  return result;
}

/**
 * AI-assisted first pass for the "diviser un PDF en chapitres" admin tool
 * (item added 2026-08-24) — suggests chapter titles + start pages from
 * short per-page text excerpts; always Gemini regardless of the module's
 * active provider setting, since this is a one-shot interactive helper and
 * the Claude path in this module is batch-only by design (see the module
 * doc comment in anthropic.ts) — a synchronous single-call Claude path
 * doesn't exist here. Rotates on quota/capacity errors.
 */
export async function detectChapterBoundaries(config: GeminiRotationConfig, pageTexts: string[]): Promise<{ title: string; startPage: number }[]> {
  const instructions = buildChapterSplitPrompt(pageTexts);
  const { result } = await textRotation<{ chapters: { title: string; start_page: number }[] }>(config, instructions, CHAPTER_SPLIT_SCHEMA);
  return result.chapters.map((c) => ({ title: c.title, startPage: c.start_page }));
}

/** Assigns 1-3 cross-book "notion" tags to a fiche's content, reusing existing notion names when they fit. Rotates on quota/capacity errors. */
export async function categorizeFicheNotions(
  config: GeminiRotationConfig,
  ficheTitle: string,
  ficheText: string,
  existingNotionNames: string[]
): Promise<NotionCategorizationResult> {
  const instructions = buildNotionCategorizationPrompt(ficheTitle, ficheText, existingNotionNames);
  const { result } = await textRotation<NotionCategorizationResult>(config, instructions, NOTION_CATEGORIZATION_SCHEMA);
  return result;
}

/** Checks whether two fiches sharing a notion actually contradict each other on a factual point. Rotates on quota/capacity errors. */
export async function checkContradiction(
  config: GeminiRotationConfig,
  notionName: string,
  ficheATitle: string,
  ficheAText: string,
  ficheBTitle: string,
  ficheBText: string
): Promise<ContradictionCheckResult> {
  const instructions = buildContradictionCheckPrompt(notionName, ficheATitle, ficheAText, ficheBTitle, ficheBText);
  const { result } = await textRotation<ContradictionCheckResult>(config, instructions, CONTRADICTION_CHECK_SCHEMA);
  return result;
}

/** Compares a fiche to an external source (pasted answer or uploaded article) and proposes what to add/update, if anything. Rotates on quota/capacity errors. */
export async function checkNotionUpdate(
  config: GeminiRotationConfig,
  notionName: string,
  ficheTitle: string,
  ficheText: string,
  sourceLabel: string,
  sourceText: string
): Promise<NotionUpdateCheckResult> {
  const instructions = buildNotionUpdateCheckPrompt(notionName, ficheTitle, ficheText, sourceLabel, sourceText);
  const { result } = await textRotation<NotionUpdateCheckResult>(config, instructions, NOTION_UPDATE_CHECK_SCHEMA);
  return result;
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
