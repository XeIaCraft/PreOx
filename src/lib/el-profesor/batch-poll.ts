import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { getElProfesorClaudeConfig, findOrCreateNotion, linkFicheToNotion, getChapterContent } from "@/lib/el-profesor/dal";
import {
  retrieveClaudeBatch,
  getClaudeBatchResults,
  normalizeExtractionResult,
  normalizeComplementaryResult,
  wasArrayFieldTruncated,
  type ClaudeBatchResult,
} from "@/lib/el-profesor/anthropic";
import { persistExtraction, persistComplementaryAdditions, allNeedReviewFlags, buildCoverageSummary } from "@/lib/el-profesor/extraction-persist";
import { continueComplementaryBatch, type BatchItemTarget } from "@/lib/el-profesor/batch-submit";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import { correctExtractionCitations, correctComplementaryCitations } from "@/lib/el-profesor/pdf-text";
import { extractPdfPageTextsWithOcr } from "@/lib/el-profesor/pdf-ocr";
import { GeminiError } from "@/lib/gemini-shared";
import { buildExtractionPrompt, buildComplementaryPrompt } from "@/lib/el-profesor/prompts";
import { insertExtractionJob } from "@/lib/el-profesor/extraction-jobs";
import type { ExtractionResult, ComplementaryResult, NotionCategorizationResult, ContradictionCheckResult, NotionUpdateCheckResult } from "@/lib/el-profesor/types";

/**
 * Extra debug context attached to a GeminiError thrown from inside
 * applyBatchResult (below), so the outer polling loop's catch block — the
 * generic safety net for ANY failure, not just this one — can still log a
 * useful request/response pair to el_profesor_extraction_jobs instead of
 * just a bare error message. Requested 2026-08-25 alongside the "loud
 * failure" guards themselves — exactly the malformed/empty-response cases
 * this carries context for are the ones that used to be hardest to debug.
 */
interface ExtractionFailureDebug {
  requestPrompt: string | null;
  rawResponse: string | null;
}

function extractionFailure(message: string, debug: ExtractionFailureDebug): never {
  const err = new GeminiError(message) as GeminiError & { debug?: ExtractionFailureDebug };
  err.debug = debug;
  throw err;
}

/** True when `raw[key]` is a non-empty array — used to tell "Claude genuinely found nothing" apart from "normalization had to drop everything because the response was malformed" (see the two call sites below). */
function hadRawArray(raw: unknown, key: string): boolean {
  const v = (raw as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(v) && v.length > 0;
}

/**
 * The actual polling logic (extracted 2026-08-25 from the cron route so it
 * can also be called on demand — see pollClaudeBatchesNow in
 * actions/batches.ts. The cron only fires once a day on the Vercel Hobby
 * plan (see vercel.json), which otherwise leaves a chapter sitting at
 * "En file (lot Claude)" for up to 24h after Claude has actually finished
 * and billed the batch — the "Vérifier maintenant" button runs this same
 * pass immediately instead of waiting for the next scheduled fire.
 */

/** Best-effort citation page correction against the chapter's actual PDF text — same ground-truth pass the synchronous path runs, just re-run here since the batch prompt was built once at submission time. */
async function correctCitationsIfPossible(
  admin: ReturnType<typeof createAdminClient>,
  chapterId: string,
  result: ExtractionResult,
  mode: "extraction"
): Promise<void>;
async function correctCitationsIfPossible(
  admin: ReturnType<typeof createAdminClient>,
  chapterId: string,
  result: ComplementaryResult,
  mode: "complementary"
): Promise<void>;
async function correctCitationsIfPossible(
  admin: ReturnType<typeof createAdminClient>,
  chapterId: string,
  result: ExtractionResult | ComplementaryResult,
  mode: "extraction" | "complementary"
) {
  try {
    const { data: chapter } = await admin.from("el_profesor_chapters").select("pdf_storage_path, title").eq("id", chapterId).maybeSingle();
    if (!chapter?.pdf_storage_path) return;
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
    const pageTexts = await extractPdfPageTextsWithOcr(bytes, chapter.title);
    if (mode === "extraction") correctExtractionCitations(result as ExtractionResult, pageTexts);
    else correctComplementaryCitations(result as ComplementaryResult, pageTexts);
  } catch {
    // Best-effort — leave citations exactly as Claude produced them if the PDF can't be re-read.
  }
}

/**
 * Applies one item's result. Returns `continued: true` only when this was
 * an intermediate pass of an "until complete" complementary chain that
 * just queued its next pass — the caller uses that to skip a push
 * notification for a chapter that isn't actually done yet, so a 6-pass
 * chain doesn't spam 6 "lot terminé" pushes.
 */
async function applyBatchResult(
  admin: ReturnType<typeof createAdminClient>,
  target: BatchItemTarget,
  result: ClaudeBatchResult,
  createdBy: string | null,
  model: string
): Promise<{ continued: boolean }> {
  if (result.outcome !== "succeeded") {
    if (target.type === "chapter") {
      const message = result.outcome === "errored" ? result.message : `Lot ${result.outcome === "expired" ? "expiré" : "annulé"} côté Claude.`;
      await admin.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", target.chapterId);
      await insertExtractionJob(admin, { chapterId: target.chapterId, status: "failed", error: message, provider: "claude", model });
    }
    // Notion/contradiction failures: nothing to roll back (no chapter status involved) —
    // the batch item itself keeps the error for the admin "Lots Claude" panel.
    return { continued: false };
  }

  if (target.type === "chapter" && target.mode === "extraction") {
    const { data: chapterRow } = await admin.from("el_profesor_chapters").select("title").eq("id", target.chapterId).maybeSingle();
    const requestPrompt = chapterRow ? buildExtractionPrompt(chapterRow.title) : null;
    const rawResponse = JSON.stringify(result.output);

    const extraction = normalizeExtractionResult(result.output);
    if (extraction.sub_entities.length === 0) {
      // A real chapter always has something extractable — zero sub-entities
      // is always a failure worth surfacing, whether Claude's own response
      // was already empty or normalization rejected everything as malformed
      // (found 2026-08-25: a report of an "empty generation" with no error
      // shown, on a chapter confirmed to have real text via manual
      // selection — "succeeding" silently with nothing is what that looked
      // like from the outside).
      const reason = hadRawArray(result.output, "sub_entities")
        ? "toutes les sous-entités ont été rejetées lors de la validation (réponse mal formée)"
        : "la réponse ne contenait aucune sous-entité";
      extractionFailure(`Extraction vide — ${reason}. Réessayez.`, { requestPrompt, rawResponse });
    }
    await correctCitationsIfPossible(admin, target.chapterId, extraction, "extraction");
    const flags = allNeedReviewFlags(extraction);
    await persistExtraction(admin, target.chapterId, extraction, flags);
    // A truncated-but-salvaged sub_entities array (see coerceArray/
    // salvageTruncatedObjectArray) still "succeeds" here — recorded with a
    // note rather than silently, since coverage is likely incomplete.
    const truncationNote = wasArrayFieldTruncated(result.output, "sub_entities")
      ? `Réponse tronquée — ${extraction.sub_entities.length} sous-entité(s) complète(s) récupérée(s), la suite du chapitre manque. Relancez « Compléter l'extraction ».`
      : null;
    await insertExtractionJob(admin, {
      chapterId: target.chapterId,
      status: "succeeded",
      rawOutput: extraction,
      provider: "claude",
      model,
      requestPrompt,
      rawResponse,
      error: truncationNote,
    });
    await admin
      .from("el_profesor_chapters")
      .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
      .eq("id", target.chapterId);
    return { continued: false };
  }

  if (target.type === "chapter" && target.mode === "complementary") {
    const [{ data: chapterRow }, existingContentForPrompt] = await Promise.all([
      admin.from("el_profesor_chapters").select("title").eq("id", target.chapterId).maybeSingle(),
      getChapterContent(target.chapterId, true, admin),
    ]);
    const requestPrompt = chapterRow ? buildComplementaryPrompt(chapterRow.title, buildCoverageSummary(existingContentForPrompt)) : null;
    const rawResponse = JSON.stringify(result.output);

    const complementary = normalizeComplementaryResult(result.output);
    const rawHadAdditions = hadRawArray(result.output, "additions_for_existing") || hadRawArray(result.output, "new_sub_entities");
    if (rawHadAdditions && complementary.additions_for_existing.length === 0 && complementary.new_sub_entities.length === 0) {
      extractionFailure("Réponse Claude illisible (structure inattendue) — tous les ajouts ont été rejetés lors de la validation.", {
        requestPrompt,
        rawResponse,
      });
    }
    await correctCitationsIfPossible(admin, target.chapterId, complementary, "complementary");
    const addedCount = await persistComplementaryAdditions(admin, target.chapterId, complementary, existingContentForPrompt);
    const complementaryTruncationNote =
      wasArrayFieldTruncated(result.output, "additions_for_existing") || wasArrayFieldTruncated(result.output, "new_sub_entities")
        ? "Réponse tronquée — seuls les ajouts complets avant la coupure ont été récupérés. Relancez « Compléter l'extraction »."
        : null;
    await insertExtractionJob(admin, {
      chapterId: target.chapterId,
      status: "succeeded",
      rawOutput: complementary,
      provider: "claude",
      model,
      requestPrompt,
      rawResponse,
      error: complementaryTruncationNote,
    });

    const remaining = complementary.estimated_remaining_passes;
    const nextPasses = target.passesRun + 1;
    // Keeps "jusqu'à couverture" going across async batch round-trips: only
    // continues when this pass actually made progress and the model still
    // reports gaps — same stopping conditions as the synchronous Gemini
    // auto-loop in actions/extraction.ts (no progress, or nothing left, or
    // the shared safety cap — enforced inside continueComplementaryBatch).
    if (target.untilComplete && addedCount > 0 && remaining > 0) {
      const { data: chapterRow } = await admin.from("el_profesor_chapters").select("title, pdf_storage_path").eq("id", target.chapterId).maybeSingle();
      await admin.from("el_profesor_chapters").update({ estimated_remaining_passes: remaining }).eq("id", target.chapterId);
      const outcome = chapterRow
        ? await continueComplementaryBatch(
            admin,
            { id: target.chapterId, title: chapterRow.title, pdf_storage_path: chapterRow.pdf_storage_path, status: target.originalStatus },
            createdBy,
            nextPasses
          )
        : { ok: false as const, error: "Chapitre introuvable." };
      if (outcome.ok) return { continued: true }; // stays 'queued' — the next pass resolves it (or stops the chain) on a later poll
    }

    await admin
      .from("el_profesor_chapters")
      .update({ status: target.originalStatus, estimated_remaining_passes: remaining })
      .eq("id", target.chapterId);
    return { continued: false };
  }

  if (target.type === "fiche") {
    const categorization = result.output as NotionCategorizationResult;
    for (const notionName of categorization.notions.slice(0, 3)) {
      const notionId = await findOrCreateNotion(notionName, admin);
      if (notionId) await linkFicheToNotion(notionId, target.ficheId, admin);
    }
    return { continued: false };
  }

  if (target.type === "contradiction") {
    const check = result.output as ContradictionCheckResult;
    if (check.contradictory && check.explanation.trim()) {
      // A unique-constraint conflict just means this pair was already flagged elsewhere — safe to ignore.
      await admin.from("el_profesor_contradictions").insert({
        notion_id: target.notionId,
        fiche_id_a: target.ficheIdA,
        fiche_id_b: target.ficheIdB,
        explanation: check.explanation,
      });
    }
    return { continued: false };
  }

  // target.type === "notion_update"
  const check = result.output as NotionUpdateCheckResult;
  if (check.needs_update && (check.blocks.length > 0 || check.flashcards.length > 0)) {
    await admin.from("el_profesor_notion_update_proposals").insert({
      notion_id: target.notionId,
      fiche_id: target.ficheId,
      source_kind: target.sourceKind,
      source_excerpt: target.sourceExcerpt,
      explanation: check.explanation,
      additions: { blocks: check.blocks, flashcards: check.flashcards } as never,
    });
  }
  return { continued: false };
}

/** Polls every submitted Claude batch job and applies whatever finished. */
export async function pollAllClaudeBatches(): Promise<{ polled: number; completed: number }> {
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("el_profesor_batch_jobs").select("*").eq("status", "submitted");
  if (!jobs || jobs.length === 0) return { polled: 0, completed: 0 };

  let completedCount = 0;
  let touchedNotions = false;

  for (const job of jobs) {
    let claudeConfig: { apiKey: string; model: string };
    try {
      claudeConfig = await getElProfesorClaudeConfig();
    } catch {
      await admin.from("el_profesor_batch_jobs").update({ status: "failed", error: "Clé API Claude introuvable au moment de la récupération." }).eq("id", job.id);
      continue;
    }

    let status;
    try {
      status = await retrieveClaudeBatch(claudeConfig.apiKey, job.anthropic_batch_id);
    } catch (err) {
      await admin
        .from("el_profesor_batch_jobs")
        .update({ status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Erreur de récupération du lot." })
        .eq("id", job.id);
      continue;
    }
    if (!status.ended) continue; // still processing — picked up again next run

    // Fetched before reading results (rather than after, as before) so the
    // chapter-bound items' PDF page counts can be looked up in one batched
    // query and passed into getClaudeBatchResults — it logs usage inline as
    // results stream in, so it needs this map up front to log per-page data.
    const { data: items } = await admin.from("el_profesor_batch_items").select("*").eq("batch_job_id", job.id);
    const itemByCustomId = new Map((items ?? []).map((i) => [i.custom_id, i]));

    const chapterIds = [...new Set((items ?? []).map((i) => i.target as unknown as BatchItemTarget).filter((t) => t.type === "chapter").map((t) => t.chapterId))];
    const pageCountByChapterId = new Map<string, number>();
    if (chapterIds.length > 0) {
      const { data: chapterRows } = await admin.from("el_profesor_chapters").select("id, pdf_page_count").in("id", chapterIds);
      for (const c of chapterRows ?? []) if (c.pdf_page_count != null) pageCountByChapterId.set(c.id, c.pdf_page_count);
    }
    const pageCountByCustomId = new Map<string, number>();
    for (const i of items ?? []) {
      const target = i.target as unknown as BatchItemTarget;
      if (target.type === "chapter") {
        const pageCount = pageCountByChapterId.get(target.chapterId);
        if (pageCount != null) pageCountByCustomId.set(i.custom_id, pageCount);
      }
    }

    let results: ClaudeBatchResult[];
    try {
      results = await getClaudeBatchResults(claudeConfig.apiKey, job.anthropic_batch_id, claudeConfig.model, pageCountByCustomId);
    } catch (err) {
      await admin
        .from("el_profesor_batch_jobs")
        .update({ status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Erreur de lecture des résultats." })
        .eq("id", job.id);
      continue;
    }

    let succeeded = 0;
    let errored = 0;
    let promptTokens = 0;
    let candidatesTokens = 0;
    let anyFinished = false; // false if every item was just an intermediate "until complete" pass — see applyBatchResult's doc comment
    for (const result of results) {
      const item = itemByCustomId.get(result.customId);
      if (!item) continue;
      try {
        const { continued } = await applyBatchResult(admin, item.target as unknown as BatchItemTarget, result, job.created_by, claudeConfig.model);
        if (!continued) anyFinished = true;
        if (result.outcome === "succeeded") {
          succeeded++;
          promptTokens += result.usage.inputTokens;
          candidatesTokens += result.usage.outputTokens;
        } else errored++;
        await admin
          .from("el_profesor_batch_items")
          .update({ status: result.outcome, processed_at: new Date().toISOString(), error: result.outcome === "errored" ? result.message : null })
          .eq("id", item.id);
      } catch (err) {
        errored++;
        anyFinished = true;
        const message = err instanceof Error ? err.message.slice(0, 300) : "Échec de l'application du résultat.";
        await admin.from("el_profesor_batch_items").update({ status: "errored", processed_at: new Date().toISOString(), error: message }).eq("id", item.id);
        // applyBatchResult already flips a chapter to "failed" when Claude's
        // own outcome wasn't "succeeded" — but a chapter whose Claude call DID
        // succeed and then threw here (a malformed/unexpected result shape,
        // or a DB write failure while persisting it) would otherwise stay
        // stuck at "queued" forever, since nothing else ever revisits it once
        // this job leaves "submitted" status (bug found 2026-08-25: two
        // chapters submitted together both got stuck this way).
        const target = item.target as unknown as BatchItemTarget;
        if (target.type === "chapter") {
          const debug = (err as { debug?: ExtractionFailureDebug })?.debug;
          await admin.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", target.chapterId);
          await insertExtractionJob(admin, {
            chapterId: target.chapterId,
            status: "failed",
            error: message,
            provider: "claude",
            model: claudeConfig.model,
            requestPrompt: debug?.requestPrompt ?? null,
            rawResponse: debug?.rawResponse ?? null,
          });
        }
      }
      if (job.kind === "notion_categorization" || job.kind === "contradiction_check" || job.kind === "notion_update_check") touchedNotions = true;
    }

    // Token sums accumulate across every poll of this job — if some items
    // are still mid-"until complete"-chain (anyFinished false for them) the
    // job stays "completed" with whatever succeeded on this poll; the chain
    // continuation is tracked by the newly-spawned job it triggered, not
    // this one, so no double-counting here.
    await admin
      .from("el_profesor_batch_jobs")
      .update({
        status: "completed",
        succeeded_count: succeeded,
        errored_count: errored,
        prompt_tokens: promptTokens,
        candidates_tokens: candidatesTokens,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    completedCount++;

    // A batch job that only spawned continuation passes (every item mid-chain
    // in an "until complete" loop) isn't actually done yet — skip the push so
    // a 6-pass chain doesn't send 6 "lot terminé" notifications.
    if (anyFinished) {
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
      for (const a of admins ?? []) {
        await sendPushToUser(a.id, {
          title: "Lot Claude terminé — El Profesor",
          body: `${succeeded} réussite(s), ${errored} échec(s).`,
          link: "/apps/el-profesor",
        });
      }
    }
  }

  revalidatePath("/apps/el-profesor");
  if (touchedNotions) revalidatePath("/apps/el-profesor/notions");

  return { polled: jobs.length, completed: completedCount };
}
