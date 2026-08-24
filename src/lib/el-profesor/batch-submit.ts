import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiError } from "@/lib/gemini-shared";
import { getChapterContent, getElProfesorClaudeConfig } from "@/lib/el-profesor/dal";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import { buildCoverageSummary, MAX_AUTO_COMPLEMENTARY_PASSES } from "@/lib/el-profesor/extraction-persist";
import { submitClaudeBatch, claudeBatchTool, buildComplementaryBatchContent, type ClaudeBatchKind, type ClaudeBatchRequestSpec, type ClaudeConfig } from "@/lib/el-profesor/anthropic";
import type { Database, ElProfesorChapterStatus, ElProfesorNotionUpdateSourceKind } from "@/lib/supabase/types";

// Batch submission plumbing shared between the admin-facing actions
// (actions/batches.ts, "use server" — every export there is a client-
// callable Server Action) and the cron poller's auto-continuation of an
// "until complete" complementary chain (no user session, so it can never
// go through an admin-gated Server Action). Kept as a plain lib module
// specifically so continueComplementaryBatch below is NOT a Server Action
// — it bypasses the admin check by design, so it must never be reachable
// via the client-callable RPC boundary a "use server" export creates.

// One request per pair/chapter/fiche, tracked in el_profesor_batch_items so the
// poller (/api/cron/el-profesor-batch-poll) can find its way back to the DB
// entity a result applies to — the custom_id itself carries no meaning, kept
// as an opaque random ID to stay safely within Anthropic's custom_id charset
// (letters/digits/-/_, 64 chars max) regardless of what it points to.
type ChapterExtractionTarget = { type: "chapter"; chapterId: string; mode: "extraction" };
/**
 * `untilComplete`/`passesRun` let the cron poller keep a gap-fill chain
 * going on its own: after applying this pass's result, if there's still
 * estimated coverage missing and the chapter made progress, the poller
 * calls continueComplementaryBatch to submit pass `passesRun + 1` — up to
 * MAX_AUTO_COMPLEMENTARY_PASSES — without any admin/browser involved.
 */
type ChapterComplementaryTarget = {
  type: "chapter";
  chapterId: string;
  mode: "complementary";
  originalStatus: ElProfesorChapterStatus;
  untilComplete: boolean;
  passesRun: number;
};
type FicheNotionTarget = { type: "fiche"; ficheId: string };
type ContradictionTarget = { type: "contradiction"; notionId: string; ficheIdA: string; ficheIdB: string };
type NotionUpdateTarget = {
  type: "notion_update";
  notionId: string;
  ficheId: string;
  sourceKind: ElProfesorNotionUpdateSourceKind;
  sourceExcerpt: string;
};
export type BatchItemTarget = ChapterExtractionTarget | ChapterComplementaryTarget | FicheNotionTarget | ContradictionTarget | NotionUpdateTarget;

export async function insertBatchJob(
  supabase: SupabaseClient<Database>,
  kind: ClaudeBatchKind,
  anthropicBatchId: string,
  requestCount: number,
  createdBy: string | null,
  model: string
): Promise<string> {
  const { data, error } = await supabase
    .from("el_profesor_batch_jobs")
    .insert({ kind, anthropic_batch_id: anthropicBatchId, request_count: requestCount, created_by: createdBy, model })
    .select("id")
    .single();
  if (error || !data) throw new GeminiError("Lot Claude soumis, mais son suivi n'a pas pu être enregistré.");
  return data.id;
}

export async function insertBatchItems(
  supabase: SupabaseClient<Database>,
  batchJobId: string,
  items: { customId: string; target: BatchItemTarget }[]
): Promise<void> {
  const { error } = await supabase
    .from("el_profesor_batch_items")
    .insert(items.map((i) => ({ batch_job_id: batchJobId, custom_id: i.customId, target: i.target as never })));
  if (error) throw new GeminiError("Lot Claude soumis, mais le détail des requêtes n'a pas pu être enregistré.");
}

interface ComplementaryChapterInput {
  id: string;
  title: string;
  pdf_storage_path: string | null;
  status: ElProfesorChapterStatus;
}

/**
 * Core complementary-batch submission, parameterized on the Supabase client
 * so it works both under a real admin session (submitComplementaryBatch)
 * and from the cron poller's service-role client (continueComplementaryBatch
 * below) — see the module doc comment for why this can't be a Server Action.
 */
export async function submitComplementaryBatchCore(
  supabase: SupabaseClient<Database>,
  config: ClaudeConfig,
  chapters: ComplementaryChapterInput[],
  createdBy: string | null,
  untilComplete: boolean,
  passesRunByChapterId: Map<string, number>
): Promise<{ requestCount: number }> {
  const requests: (ClaudeBatchRequestSpec & { target: BatchItemTarget })[] = [];
  for (const chapter of chapters) {
    const [bytes, existingContent] = await Promise.all([
      downloadChapterPdfBytes(chapter.pdf_storage_path!),
      getChapterContent(chapter.id, true, supabase),
    ]);
    const coverageSummary = buildCoverageSummary(existingContent);
    requests.push({
      customId: randomUUID(),
      content: buildComplementaryBatchContent(chapter.title, bytes, coverageSummary),
      tool: claudeBatchTool("complementary"),
      target: {
        type: "chapter",
        chapterId: chapter.id,
        mode: "complementary",
        originalStatus: chapter.status,
        untilComplete,
        passesRun: passesRunByChapterId.get(chapter.id) ?? 0,
      },
    });
  }
  if (requests.length === 0) throw new GeminiError("Aucun chapitre éligible.");

  const anthropicBatchId = await submitClaudeBatch(config, "complementary", requests);
  const batchJobId = await insertBatchJob(supabase, "complementary", anthropicBatchId, requests.length, createdBy, config.model);
  await insertBatchItems(supabase, batchJobId, requests);
  await supabase
    .from("el_profesor_chapters")
    .update({ status: "queued", extraction_error: null })
    .in("id", chapters.map((c) => c.id));

  return { requestCount: requests.length };
}

/**
 * Re-submits exactly one chapter's next complementary pass — called by the
 * cron poller after applying a batch result, to keep an "until complete"
 * chain going with nobody at the keyboard. Deliberately NOT a Server
 * Action (see module doc comment): it has no admin check of its own
 * because the cron has no user session to check — safe only because this
 * file is never imported by client code, only by actions/batches.ts (the
 * gated entry point) and the cron route.
 */
export async function continueComplementaryBatch(
  supabase: SupabaseClient<Database>,
  chapter: ComplementaryChapterInput,
  createdBy: string | null,
  passesRun: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (passesRun >= MAX_AUTO_COMPLEMENTARY_PASSES) return { ok: false, error: "Limite de passes automatiques atteinte." };
  let config: ClaudeConfig;
  try {
    config = await getElProfesorClaudeConfig();
  } catch {
    return { ok: false, error: "Clé API Claude introuvable pour la passe suivante." };
  }
  try {
    await submitComplementaryBatchCore(supabase, config, [chapter], createdBy, true, new Map([[chapter.id, passesRun]]));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof GeminiError ? err.message : "Échec de la soumission de la passe suivante." };
  }
}
