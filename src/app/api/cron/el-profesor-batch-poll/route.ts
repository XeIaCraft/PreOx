import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { getElProfesorClaudeConfig, findOrCreateNotion, linkFicheToNotion, getChapterContent } from "@/lib/el-profesor/dal";
import { retrieveClaudeBatch, getClaudeBatchResults, type ClaudeBatchResult } from "@/lib/el-profesor/anthropic";
import { persistExtraction, persistComplementaryAdditions, allNeedReviewFlags } from "@/lib/el-profesor/extraction-persist";
import { continueComplementaryBatch, type BatchItemTarget } from "@/lib/el-profesor/batch-submit";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import { extractPdfPageTexts, correctExtractionCitations, correctComplementaryCitations } from "@/lib/el-profesor/pdf-text";
import type { ExtractionResult, ComplementaryResult, NotionCategorizationResult, ContradictionCheckResult } from "@/lib/el-profesor/types";

export const maxDuration = 60;

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
    const { data: chapter } = await admin.from("el_profesor_chapters").select("pdf_storage_path").eq("id", chapterId).maybeSingle();
    if (!chapter?.pdf_storage_path) return;
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
    const pageTexts = await extractPdfPageTexts(bytes);
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
  createdBy: string | null
): Promise<{ continued: boolean }> {
  if (result.outcome !== "succeeded") {
    if (target.type === "chapter") {
      const message = result.outcome === "errored" ? result.message : `Lot ${result.outcome === "expired" ? "expiré" : "annulé"} côté Claude.`;
      await admin.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", target.chapterId);
      await admin.from("el_profesor_extraction_jobs").insert({ chapter_id: target.chapterId, status: "failed", error: message });
    }
    // Notion/contradiction failures: nothing to roll back (no chapter status involved) —
    // the batch item itself keeps the error for the admin "Lots Claude" panel.
    return { continued: false };
  }

  if (target.type === "chapter" && target.mode === "extraction") {
    const extraction = result.output as ExtractionResult;
    await correctCitationsIfPossible(admin, target.chapterId, extraction, "extraction");
    const flags = allNeedReviewFlags(extraction);
    await persistExtraction(admin, target.chapterId, extraction, flags);
    await admin.from("el_profesor_extraction_jobs").insert({ chapter_id: target.chapterId, status: "succeeded", raw_output: extraction as unknown as never });
    await admin
      .from("el_profesor_chapters")
      .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
      .eq("id", target.chapterId);
    return { continued: false };
  }

  if (target.type === "chapter" && target.mode === "complementary") {
    const complementary = result.output as ComplementaryResult;
    await correctCitationsIfPossible(admin, target.chapterId, complementary, "complementary");
    const existingContent = await getChapterContent(target.chapterId, true, admin);
    const addedCount = await persistComplementaryAdditions(admin, target.chapterId, complementary, existingContent);
    await admin.from("el_profesor_extraction_jobs").insert({ chapter_id: target.chapterId, status: "succeeded", raw_output: complementary as unknown as never });

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

  // target.type === "contradiction"
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

/**
 * Polls every submitted Claude batch job and applies whatever finished —
 * the async half of the "gerer l'envoi et la réception de prompt sans que
 * l'admin soit devant l'ecran" request: submission (see actions/batches.ts)
 * only queues the batch, this cron route is what actually lands the
 * results, on its own schedule, with a push notification when a batch
 * completes (see vercel.json for the interval).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: jobs } = await admin.from("el_profesor_batch_jobs").select("*").eq("status", "submitted");
  if (!jobs || jobs.length === 0) return NextResponse.json({ polled: 0, completed: 0 });

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

    let results: ClaudeBatchResult[];
    try {
      results = await getClaudeBatchResults(claudeConfig.apiKey, job.anthropic_batch_id, claudeConfig.model);
    } catch (err) {
      await admin
        .from("el_profesor_batch_jobs")
        .update({ status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Erreur de lecture des résultats." })
        .eq("id", job.id);
      continue;
    }

    const { data: items } = await admin.from("el_profesor_batch_items").select("*").eq("batch_job_id", job.id);
    const itemByCustomId = new Map((items ?? []).map((i) => [i.custom_id, i]));

    let succeeded = 0;
    let errored = 0;
    let anyFinished = false; // false if every item was just an intermediate "until complete" pass — see applyBatchResult's doc comment
    for (const result of results) {
      const item = itemByCustomId.get(result.customId);
      if (!item) continue;
      try {
        const { continued } = await applyBatchResult(admin, item.target as unknown as BatchItemTarget, result, job.created_by);
        if (!continued) anyFinished = true;
        if (result.outcome === "succeeded") succeeded++;
        else errored++;
        await admin
          .from("el_profesor_batch_items")
          .update({ status: result.outcome, processed_at: new Date().toISOString(), error: result.outcome === "errored" ? result.message : null })
          .eq("id", item.id);
      } catch (err) {
        errored++;
        anyFinished = true;
        const message = err instanceof Error ? err.message.slice(0, 300) : "Échec de l'application du résultat.";
        await admin.from("el_profesor_batch_items").update({ status: "errored", processed_at: new Date().toISOString(), error: message }).eq("id", item.id);
      }
      if (job.kind === "notion_categorization" || job.kind === "contradiction_check") touchedNotions = true;
    }

    await admin
      .from("el_profesor_batch_jobs")
      .update({ status: "completed", succeeded_count: succeeded, errored_count: errored, completed_at: new Date().toISOString() })
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

  return NextResponse.json({ polled: jobs.length, completed: completedCount });
}
