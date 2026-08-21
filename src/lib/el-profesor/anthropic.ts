import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GeminiError, unescapeHtmlEntities } from "@/lib/gemini-shared";
import { buildExtractionPrompt, buildComplementaryPrompt } from "@/lib/el-profesor/prompts";
import { BLOCK_TYPES } from "./gemini";
import type { ComplementaryResult, ExtractionResult } from "@/lib/el-profesor/types";

// Claude as an alternate extraction provider to Gemini — another lever
// against quota exhaustion, chosen from the "Réglages IA" panel. Kept as a
// self-contained sibling to gemini.ts rather than merged into it: the two
// APIs differ enough (tool-forced JSON vs responseSchema, inline base64 PDF
// vs an upload/files-API dance, different retry-status codes) that a shared
// abstraction would mostly be indirection. GeminiError is reused here for
// Claude failures too rather than introducing a second error class — every
// call site already catches `err instanceof GeminiError` generically ("the
// AI call failed"), and duplicating that plumbing for a second class isn't
// worth it.

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const EL_PROFESOR_CLAUDE_MODEL_DEFAULT = "claude-sonnet-5";

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}

// Same logical shape as Gemini's schemas in gemini.ts, kept as a separate
// copy: Gemini's dialect uses upper-case type names ("OBJECT"/"STRING") for
// its responseSchema, Anthropic's tool input_schema is regular JSON Schema
// ("object"/"string") — the two aren't interchangeable.
const CITATION_SCHEMA = {
  type: "object",
  properties: {
    page: { type: "integer" },
    quote: { type: "string" },
  },
  required: ["page", "quote"],
};

const BLOCK_CONTENT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    headers: { type: "array", items: { type: "string" } },
    rows: { type: "array", items: { type: "array", items: { type: "string" } } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          detail: { type: "string" },
          condition: { type: "string" },
        },
        required: ["label", "detail"],
      },
    },
  },
};

const FICHE_BLOCK_ITEM_SCHEMA = {
  type: "object",
  properties: {
    block_type: { type: "string", enum: BLOCK_TYPES },
    content: BLOCK_CONTENT_SCHEMA,
    citations: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["block_type", "content", "citations"],
};

const FLASHCARD_ITEM_SCHEMA = {
  type: "object",
  properties: {
    front: { type: "string" },
    back: { type: "string" },
    citations: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["front", "back", "citations"],
};

const SUB_ENTITY_ITEM_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    fiche: {
      type: "object",
      properties: {
        title: { type: "string" },
        blocks: { type: "array", items: FICHE_BLOCK_ITEM_SCHEMA },
        flashcards: { type: "array", items: FLASHCARD_ITEM_SCHEMA },
      },
      required: ["title", "blocks", "flashcards"],
    },
  },
  required: ["name", "summary", "fiche"],
};

const ESTIMATED_REMAINING_PASSES_SCHEMA = { type: "integer" };

const EXTRACTION_TOOL = {
  name: "submit_extraction",
  description: "Soumet le résultat structuré de l'extraction du chapitre.",
  input_schema: {
    type: "object",
    properties: {
      sub_entities: { type: "array", items: SUB_ENTITY_ITEM_SCHEMA },
      estimated_remaining_passes: ESTIMATED_REMAINING_PASSES_SCHEMA,
    },
    required: ["sub_entities", "estimated_remaining_passes"],
  },
};

const COMPLEMENTARY_TOOL = {
  name: "submit_complementary",
  description: "Soumet le résultat structuré de la passe complémentaire.",
  input_schema: {
    type: "object",
    properties: {
      additions_for_existing: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sub_entity_name: { type: "string" },
            blocks: { type: "array", items: FICHE_BLOCK_ITEM_SCHEMA },
            flashcards: { type: "array", items: FLASHCARD_ITEM_SCHEMA },
          },
          required: ["sub_entity_name", "blocks", "flashcards"],
        },
      },
      new_sub_entities: { type: "array", items: SUB_ENTITY_ITEM_SCHEMA },
      estimated_remaining_passes: ESTIMATED_REMAINING_PASSES_SCHEMA,
    },
    required: ["additions_for_existing", "new_sub_entities", "estimated_remaining_passes"],
  },
};

/** Best-effort usage journal — same table as Gemini's, a "claude:" model prefix distinguishes the provider in the dashboard. */
async function logClaudeUsage(entry: {
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
      model: `claude:${entry.model}`,
      success: entry.success,
      status_code: entry.statusCode ?? null,
      prompt_tokens: entry.promptTokens ?? null,
      candidates_tokens: entry.candidatesTokens ?? null,
      total_tokens: entry.totalTokens ?? null,
      error_message: entry.errorMessage ?? null,
    });
  } catch {
    // best-effort — never block the actual Claude call on logging
  }
}

// 429 = rate limit, 529 = Anthropic's "overloaded" status — both transient
// and worth a couple of retries with backoff, mirroring gemini.ts.
const RETRYABLE_STATUS = new Set([429, 529]);
const RETRY_DELAYS_MS = [2000, 5000];

async function callClaudeTool(
  apiKey: string,
  model: string,
  content: Array<Record<string, unknown>>,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  attempt = 0
): Promise<unknown> {
  const response = await fetch(MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: "user", content }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    await logClaudeUsage({ model, success: false, statusCode: response.status, errorMessage: body.slice(0, 300) });
    if (RETRYABLE_STATUS.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      return callClaudeTool(apiKey, model, content, tool, attempt + 1);
    }
    throw new GeminiError(`Appel Claude échoué (${response.status}) : ${body.slice(0, 300) || "erreur inconnue"}.`);
  }

  const payload = await response.json();
  const usage = payload?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const blocks = payload?.content as Array<Record<string, unknown>> | undefined;
  const toolUse = blocks?.find((b) => b.type === "tool_use");

  if (!toolUse || !toolUse.input) {
    await logClaudeUsage({ model, success: false, statusCode: response.status, errorMessage: "Réponse Claude sans résultat structuré." });
    throw new GeminiError("Réponse Claude vide ou inattendue.");
  }

  await logClaudeUsage({
    model,
    success: true,
    statusCode: response.status,
    promptTokens: usage?.input_tokens,
    candidatesTokens: usage?.output_tokens,
    totalTokens: usage?.input_tokens != null && usage?.output_tokens != null ? usage.input_tokens + usage.output_tokens : undefined,
  });

  return unescapeHtmlEntities(toolUse.input);
}

function pdfDocumentBlock(bytes: Uint8Array): Record<string, unknown> {
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from(bytes).toString("base64"),
    },
  };
}

export async function extractChapterContentClaude(config: ClaudeConfig, bytes: Uint8Array, chapterTitle: string): Promise<ExtractionResult> {
  const content = [pdfDocumentBlock(bytes), { type: "text", text: buildExtractionPrompt(chapterTitle) }];
  const result = await callClaudeTool(config.apiKey, config.model, content, EXTRACTION_TOOL);
  return result as ExtractionResult;
}

/** Gap-fill pass via Claude — mirrors extractComplementaryContent in gemini.ts. */
export async function extractComplementaryContentClaude(
  config: ClaudeConfig,
  bytes: Uint8Array,
  chapterTitle: string,
  coverageSummaryJson: string
): Promise<ComplementaryResult> {
  const content = [pdfDocumentBlock(bytes), { type: "text", text: buildComplementaryPrompt(chapterTitle, coverageSummaryJson) }];
  const result = await callClaudeTool(config.apiKey, config.model, content, COMPLEMENTARY_TOOL);
  return result as ComplementaryResult;
}
