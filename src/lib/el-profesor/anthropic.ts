import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { GeminiError, unescapeHtmlEntities } from "@/lib/gemini-shared";
import {
  buildExtractionPrompt,
  buildComplementaryPrompt,
  buildNotionCategorizationPrompt,
  buildContradictionCheckPrompt,
  buildNotionUpdateCheckPrompt,
} from "@/lib/el-profesor/prompts";
import { BLOCK_TYPES } from "./gemini";
import { assertAiSpendCapNotExceeded } from "./ai-spend-cap";

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
//
// Bulk work (chapter extraction/gap-fill, cross-book notion categorization,
// contradiction detection) goes through the Message Batches API instead of
// one synchronous call per item: 50% cheaper, and the admin doesn't have to
// keep a tab open — a submitted batch is picked up later by the cron poller
// (see /api/cron/el-profesor-batch-poll) whenever Anthropic finishes it.
// Small on-demand Claude calls (there currently are none — every ephemeral
// study tool is Gemini-only) would stay synchronous if that ever changes.

export const EL_PROFESOR_CLAUDE_MODEL_DEFAULT = "claude-sonnet-5";

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}

function claudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
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
    suggested_image_page: { type: "integer" },
    suggested_image_hint: { type: "string" },
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
    type: "object" as const,
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
    type: "object" as const,
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

const NOTION_CATEGORIZATION_TOOL = {
  name: "submit_notions",
  description: "Soumet les notions transversales identifiées pour cette fiche.",
  input_schema: {
    type: "object" as const,
    properties: {
      notions: { type: "array", items: { type: "string" } },
    },
    required: ["notions"],
  },
};

const CONTRADICTION_CHECK_TOOL = {
  name: "submit_contradiction_check",
  description: "Soumet le résultat de la comparaison entre les deux fiches.",
  input_schema: {
    type: "object" as const,
    properties: {
      contradictory: { type: "boolean" },
      explanation: { type: "string" },
    },
    required: ["contradictory", "explanation"],
  },
};

const NOTION_UPDATE_CHECK_TOOL = {
  name: "submit_notion_update_check",
  description: "Soumet le résultat de la comparaison entre la fiche et la source externe.",
  input_schema: {
    type: "object" as const,
    properties: {
      needs_update: { type: "boolean" },
      explanation: { type: "string" },
      blocks: { type: "array", items: FICHE_BLOCK_ITEM_SCHEMA },
      flashcards: { type: "array", items: FLASHCARD_ITEM_SCHEMA },
    },
    required: ["needs_update", "explanation", "blocks", "flashcards"],
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
  /** PDF page count for a chapter-bound call (extraction/complementary) — lets the cost estimate scale per chapter instead of a flat average. Null for calls with no single source PDF (notion categorization, contradiction check, notion update). */
  pdfPageCount?: number | null;
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
      pdf_page_count: entry.pdfPageCount ?? null,
    });
  } catch {
    // best-effort — never block the actual Claude call on logging
  }
}

type ClaudeTool = Anthropic.Messages.Tool;
type ClaudeContentBlock = Anthropic.Messages.ContentBlockParam;

function pdfDocumentBlock(bytes: Uint8Array): ClaudeContentBlock {
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from(bytes).toString("base64"),
    },
  } as ClaudeContentBlock;
}

// -- Message Batches API (50% cheaper, asynchronous — no admin babysitting) --
//
// Every Claude call in this module goes through the batch path below —
// extraction, the gap-fill pass, notion categorization, and contradiction
// detection all submit here rather than calling client.messages.create
// synchronously (see actions/batches.ts for the submission side and
// /api/cron/el-profesor-batch-poll for the async result poller). There is
// deliberately no synchronous single-request Claude entry point left in
// this module: every one of these operations is either bulk by nature
// (notion categorization, contradiction checking) or benefits from the same
// flat 50% discount even for a single chapter, so routing everything
// through one path avoids maintaining two versions of each call.

export type ClaudeBatchKind = "extraction" | "complementary" | "notion_categorization" | "contradiction_check" | "notion_update_check";

export interface ClaudeBatchRequestSpec {
  customId: string;
  content: ClaudeContentBlock[];
  tool: ClaudeTool;
}

const BATCH_TOOL_BY_KIND: Record<ClaudeBatchKind, ClaudeTool> = {
  extraction: EXTRACTION_TOOL,
  complementary: COMPLEMENTARY_TOOL,
  notion_categorization: NOTION_CATEGORIZATION_TOOL,
  contradiction_check: CONTRADICTION_CHECK_TOOL,
  notion_update_check: NOTION_UPDATE_CHECK_TOOL,
};

export function claudeBatchTool(kind: ClaudeBatchKind): ClaudeTool {
  return BATCH_TOOL_BY_KIND[kind];
}

export function buildExtractionBatchContent(chapterTitle: string, bytes: Uint8Array): ClaudeContentBlock[] {
  return [pdfDocumentBlock(bytes), { type: "text", text: buildExtractionPrompt(chapterTitle) } as ClaudeContentBlock];
}

export function buildComplementaryBatchContent(chapterTitle: string, bytes: Uint8Array, coverageSummaryJson: string): ClaudeContentBlock[] {
  return [pdfDocumentBlock(bytes), { type: "text", text: buildComplementaryPrompt(chapterTitle, coverageSummaryJson) } as ClaudeContentBlock];
}

export function buildNotionCategorizationBatchContent(ficheTitle: string, ficheText: string, existingNotionNames: string[]): ClaudeContentBlock[] {
  return [{ type: "text", text: buildNotionCategorizationPrompt(ficheTitle, ficheText, existingNotionNames) } as ClaudeContentBlock];
}

export function buildContradictionCheckBatchContent(
  notionName: string,
  ficheATitle: string,
  ficheAText: string,
  ficheBTitle: string,
  ficheBText: string
): ClaudeContentBlock[] {
  return [{ type: "text", text: buildContradictionCheckPrompt(notionName, ficheATitle, ficheAText, ficheBTitle, ficheBText) } as ClaudeContentBlock];
}

export function buildNotionUpdateCheckBatchContent(
  notionName: string,
  ficheTitle: string,
  ficheText: string,
  sourceLabel: string,
  sourceText: string
): ClaudeContentBlock[] {
  return [{ type: "text", text: buildNotionUpdateCheckPrompt(notionName, ficheTitle, ficheText, sourceLabel, sourceText) } as ClaudeContentBlock];
}

/** Submits one batch covering every request at once — returns Anthropic's own batch id to poll later. */
export async function submitClaudeBatch(config: ClaudeConfig, kind: ClaudeBatchKind, requests: ClaudeBatchRequestSpec[]): Promise<string> {
  if (requests.length === 0) throw new GeminiError("Aucune requête à soumettre.");
  await assertAiSpendCapNotExceeded();
  const client = claudeClient(config.apiKey);
  try {
    const batch = await client.messages.batches.create({
      requests: requests.map((r) => ({
        custom_id: r.customId,
        params: {
          model: config.model,
          max_tokens: 32000,
          messages: [{ role: "user", content: r.content }],
          tools: [r.tool],
          tool_choice: { type: "tool", name: r.tool.name },
        },
      })),
    });
    return batch.id;
  } catch (err) {
    throw new GeminiError(`Échec de la soumission du lot Claude : ${err instanceof Error ? err.message : "erreur inconnue"}.`);
  }
}

export interface ClaudeBatchStatus {
  ended: boolean;
  succeeded: number;
  errored: number;
  processing: number;
  canceled: number;
  expired: number;
}

export async function retrieveClaudeBatch(apiKey: string, anthropicBatchId: string): Promise<ClaudeBatchStatus> {
  const client = claudeClient(apiKey);
  const batch = await client.messages.batches.retrieve(anthropicBatchId);
  return {
    ended: batch.processing_status === "ended",
    succeeded: batch.request_counts.succeeded,
    errored: batch.request_counts.errored,
    processing: batch.request_counts.processing,
    canceled: batch.request_counts.canceled,
    expired: batch.request_counts.expired,
  };
}

export type ClaudeBatchResult =
  | { customId: string; outcome: "succeeded"; output: unknown; usage: { inputTokens: number; outputTokens: number } }
  | { customId: string; outcome: "errored"; message: string }
  | { customId: string; outcome: "expired" | "canceled" };

/**
 * Streams every result for an ended batch, normalized to a plain shape
 * (structured tool output already unescaped, same as the sync path).
 * `pageCountByCustomId` (chapter-bound items only — extraction/complementary)
 * lets each logged row carry the source PDF's page count, so the cost
 * estimate can later scale per chapter instead of averaging across every
 * call regardless of size.
 */
export async function getClaudeBatchResults(
  apiKey: string,
  anthropicBatchId: string,
  model: string,
  pageCountByCustomId?: Map<string, number>
): Promise<ClaudeBatchResult[]> {
  const client = claudeClient(apiKey);
  const results: ClaudeBatchResult[] = [];
  for await (const entry of await client.messages.batches.results(anthropicBatchId)) {
    const pdfPageCount = pageCountByCustomId?.get(entry.custom_id) ?? null;
    if (entry.result.type === "succeeded") {
      const toolUse = entry.result.message.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
      if (!toolUse || !toolUse.input) {
        results.push({ customId: entry.custom_id, outcome: "errored", message: "Résultat Claude sans sortie structurée." });
        continue;
      }
      await logClaudeUsage({
        model,
        success: true,
        promptTokens: entry.result.message.usage.input_tokens,
        candidatesTokens: entry.result.message.usage.output_tokens,
        totalTokens: entry.result.message.usage.input_tokens + entry.result.message.usage.output_tokens,
        pdfPageCount,
      });
      results.push({
        customId: entry.custom_id,
        outcome: "succeeded",
        output: unescapeHtmlEntities(toolUse.input),
        usage: { inputTokens: entry.result.message.usage.input_tokens, outputTokens: entry.result.message.usage.output_tokens },
      });
    } else if (entry.result.type === "errored") {
      const message = entry.result.error.error.message || "Erreur inconnue.";
      await logClaudeUsage({ model, success: false, errorMessage: message.slice(0, 300), pdfPageCount });
      results.push({ customId: entry.custom_id, outcome: "errored", message: message.slice(0, 300) });
    } else {
      results.push({ customId: entry.custom_id, outcome: entry.result.type });
    }
  }
  return results;
}
