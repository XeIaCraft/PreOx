"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin, getElProfesorGeminiConfig, getElProfesorAiProvider } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { downloadChapterPdfBytes, uploadPublicImage } from "@/lib/el-profesor/storage";
import {
  deleteGeminiFile,
  extractChapterContentWithRotation,
  extractChapterContentFromTextWithRotation,
  extractComplementaryContentWithRotation,
  verifyExtraction,
  generateMnemonic,
  BLOCK_TYPES,
} from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";
import { coerceKeyedObjectArray, wasArrayFieldTruncated } from "@/lib/el-profesor/anthropic";
import { getChapterContent, getFlashcardVariantStats, type FlashcardVariantStat } from "@/lib/el-profesor/dal";
import { logContentChange, getContentLog, type ContentLogEntry } from "@/lib/el-profesor/content-log";
import { blockToPlainText } from "@/lib/el-profesor/block-text";
import { correctExtractionCitations, correctComplementaryCitations } from "@/lib/el-profesor/pdf-text";
import { extractPdfPageTextsWithOcr } from "@/lib/el-profesor/pdf-ocr";
import { parseClozeText } from "@/lib/el-profesor/cloze";
import { buildExtractionPrompt, buildTextExtractionPrompt, buildComplementaryPrompt } from "@/lib/el-profesor/prompts";
import { insertExtractionJob } from "@/lib/el-profesor/extraction-jobs";
import {
  allNeedReviewFlags,
  persistExtraction,
  persistComplementaryAdditions,
  buildCoverageSummary,
  MAX_AUTO_COMPLEMENTARY_PASSES,
} from "@/lib/el-profesor/extraction-persist";
import { submitExtractionBatch, submitComplementaryBatch } from "./batches";
import type {
  ExtractionResult,
  ExtractedSubEntity,
  ExtractedFicheBlock,
  ExtractedFlashcard,
  VerificationFlag,
  Citation,
  BlockContent,
  FlashcardSide,
} from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Runs the full extraction pipeline for a chapter: upload to the configured
 * provider, structured extraction, then persists everything as `draft` —
 * nothing here is visible to non-admins until reviewed and published via
 * `publishFiche`/`finalizeChapterPublication`.
 *
 * With Gemini (the default), this runs synchronously with a verification
 * pass that double-checks each block/flashcard against the source PDF and
 * only flags the ones it doubts. With Claude — chosen from "Réglages IA" —
 * every PDF chapter instead goes through the (cheaper, asynchronous)
 * Message Batches API: see submitExtractionBatch in actions/batches.ts and
 * the cron poller at /api/cron/el-profesor-batch-poll. There's no Claude
 * verification pass, so every element lands needs_review regardless.
 */
export async function extractChapter(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };
  if (chapter.status === "extracting" || chapter.status === "queued") {
    return { error: "Une extraction est déjà en cours ou en file pour ce chapitre." };
  }

  if (chapter.source_kind === "pdf") {
    const provider = await getElProfesorAiProvider();
    if (provider === "claude") {
      return submitExtractionBatch([chapterId]);
    }
  }

  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  let geminiFileName: string | null = null;
  let apiKey = "";
  // Captured as soon as each path gets its response back, so the catch
  // block below can still log a useful request/response pair even when the
  // failure is the "zero sub-entities" throw right after — mirrors the
  // .debug pattern batch-poll.ts already uses for the Claude batch path
  // (extractionFailure), which this synchronous Gemini path didn't have:
  // without it, a recoverable-looking-but-empty response (e.g. the
  // double-encoded-JSON bug fixed in coerceArray) was lost, leaving nothing
  // for the "réessayer depuis cette réponse" button to work from.
  let debugRequestPrompt: string | null = null;
  let debugRawResponse: string | null = null;

  try {
    let extraction: ExtractionResult;
    let flags: VerificationFlag[];
    let verificationFailed = false;

    if (chapter.source_kind !== "pdf") {
      // Word/PowerPoint source (item 5 of the backlog): no file to attach,
      // no page ground-truth to verify against, so this always goes through
      // Gemini's text-only path regardless of the configured provider — no
      // Claude batch path exists for a source with no PDF to attach.
      const config = await getElProfesorGeminiConfig();
      const { extraction: textExtraction, model: textModel, rawResponseText: textRawResponse } = await extractChapterContentFromTextWithRotation(
        config,
        chapter.title,
        chapter.source_text ?? ""
      );
      extraction = textExtraction;
      const textRequestPrompt = buildTextExtractionPrompt(chapter.title, chapter.source_text ?? "");
      debugRequestPrompt = textRequestPrompt;
      debugRawResponse = textRawResponse;
      if (extraction.sub_entities.length === 0) {
        // A real chapter always has something extractable — an empty result
        // here means the call silently produced nothing usable (found
        // 2026-08-25: a report of an "empty generation" with no error shown,
        // on a chapter confirmed to have real text via manual selection).
        // Surfacing it as a failure is far safer than "succeeding" with an
        // empty chapter the admin has no reason to notice or retry.
        throw new GeminiError("Extraction vide — aucune sous-entité produite. Réessayez, ou vérifiez que le document contient bien du contenu.");
      }
      flags = allNeedReviewFlags(extraction);

      await persistExtraction(supabase, chapterId, extraction, flags);
      await insertExtractionJob(supabase, {
        chapterId,
        status: "succeeded",
        rawOutput: extraction,
        provider: "gemini",
        model: textModel,
        requestPrompt: textRequestPrompt,
        rawResponse: textRawResponse,
      });
      await supabase
        .from("el_profesor_chapters")
        .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
        .eq("id", chapterId);

      revalidatePath("/apps/el-profesor");
      return {
        success:
          "Extraction terminée. Relisez le contenu généré avant publication. Chaque élément est marqué « à vérifier » (pas de document source à vérifier automatiquement pour un import Word/PowerPoint).",
      };
    }

    // PDF chapter, Gemini provider (Claude was already routed to the batch path above).
    const config = await getElProfesorGeminiConfig();
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
    const [{ extraction: geminiExtraction, apiKey: winningKey, model, file, rawResponseText: pdfRawResponse }, pageTexts] = await Promise.all([
      extractChapterContentWithRotation(config, bytes, chapter.title, chapter.title),
      extractPdfPageTextsWithOcr(bytes, chapter.title).catch(() => null),
    ]);
    extraction = geminiExtraction;
    apiKey = winningKey;
    geminiFileName = file.name;
    const pdfRequestPrompt = buildExtractionPrompt(chapter.title);
    debugRequestPrompt = pdfRequestPrompt;
    debugRawResponse = pdfRawResponse;

    if (extraction.sub_entities.length === 0) {
      // Same reasoning as the Word/PowerPoint path above — a chapter with
      // real content should never produce zero sub-entities.
      throw new GeminiError("Extraction vide — aucune sous-entité produite. Réessayez, ou vérifiez que le PDF contient bien du contenu extractible.");
    }

    // Ground-truth-corrects citation pages against the PDF's actual text
    // when possible (best-effort — null on a malformed/unparseable file, in
    // which case citations are left exactly as the model produced them).
    if (pageTexts) correctExtractionCitations(extraction, pageTexts);

    const verification = await verifyExtraction(apiKey, model, file, extraction).catch(() => {
      verificationFailed = true;
      return { flags: [] as VerificationFlag[] };
    });
    flags = verification.flags;

    await persistExtraction(supabase, chapterId, extraction, flags);

    await insertExtractionJob(supabase, {
      chapterId,
      status: "succeeded",
      rawOutput: extraction,
      provider: "gemini",
      model,
      requestPrompt: pdfRequestPrompt,
      rawResponse: pdfRawResponse,
    });
    await supabase
      .from("el_profesor_chapters")
      .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
      .eq("id", chapterId);

    revalidatePath("/apps/el-profesor");
    return {
      success:
        "Extraction terminée. Relisez le contenu généré avant publication." +
        (verificationFailed
          ? " Attention : la passe de vérification des citations a échoué et n'a pas pu tourner — relecture manuelle recommandée."
          : ""),
    };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de l'extraction du chapitre.";
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await insertExtractionJob(supabase, {
      chapterId,
      status: "failed",
      error: message,
      provider: "gemini",
      requestPrompt: debugRequestPrompt,
      rawResponse: debugRawResponse,
    });
    return { error: message };
  } finally {
    if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
  }
}

// How long a chapter can sit in "extracting" before it's offered as
// resettable — comfortably above a normal Gemini extraction (typically
// under a minute), so this never interrupts a genuinely in-progress run,
// but short enough that a stuck one (killed by a function timeout or a
// dropped connection — the try/catch in extractChapter that would normally
// flip the status to "failed" never gets to run in that case) doesn't sit
// unrecoverable for long.
const STUCK_EXTRACTION_MINUTES = 3;

/**
 * Manual escape hatch for a chapter stuck at "extracting" or "queued" (item
 * requested 2026-08-25, after reports of both: Gemini-mode chapters staying
 * stuck with no way to retry other than deleting the whole chapter, then a
 * Claude batch that completed — tokens billed, "2 erreurs" visible in
 * Réglages IA — while its two chapters stayed at "queued" forever). Neither
 * case has anything left to actually cancel — the process/batch that would
 * have set the real status is already gone or resolved — so this only
 * clears the stale status so the normal "Extraire" retry button reappears.
 *
 * "extracting" (Gemini's synchronous path) uses a time heuristic: the only
 * way it doesn't self-heal via extractChapter's own catch block is the
 * process being killed outright (Vercel function timeout, dropped
 * connection), which leaves no other signal to check against.
 *
 * "queued" (a submitted Claude batch item) instead checks the batch item's
 * own resolved status rather than guessing from elapsed time — a batch can
 * legitimately take hours, so time alone can't tell "still processing"
 * apart from "stuck". If Claude's own outcome was errored/expired/canceled,
 * applyBatchResult (batch-poll.ts) already sets the chapter to "failed"
 * itself; this only catches the gap where that pass threw on a supposedly
 * "succeeded" result (malformed shape, DB write failure) and never got to
 * — that bug is now fixed going forward, but a chapter already orphaned by
 * it before the fix has nothing left to re-poll (its job already left
 * "submitted"), so this is also how it gets unstuck.
 */
export async function resetStuckExtraction(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("status, updated_at").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };

  if (chapter.status === "extracting") {
    const ageMinutes = (Date.now() - new Date(chapter.updated_at).getTime()) / 60_000;
    if (ageMinutes < STUCK_EXTRACTION_MINUTES) {
      return { error: `Attendez encore quelques instants — une extraction met normalement moins de ${STUCK_EXTRACTION_MINUTES} minutes.` };
    }
    const message = "Extraction interrompue (connexion perdue ou délai dépassé) — relancez-la.";
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await insertExtractionJob(supabase, { chapterId, status: "failed", error: message, provider: "gemini" });
    revalidatePath("/apps/el-profesor");
    return { success: "Chapitre réinitialisé — vous pouvez relancer l'extraction." };
  }

  if (chapter.status === "queued") {
    const { data: item } = await supabase
      .from("el_profesor_batch_items")
      .select("status, error")
      .contains("target", { chapterId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!item) return { error: "Aucun lot Claude associé à ce chapitre." };
    if (item.status === "pending") {
      return { error: "Le lot Claude est toujours en cours de traitement chez Claude — réessayez plus tard, ou utilisez « Vérifier maintenant » dans Réglages IA." };
    }
    const message = item.error || "Le résultat du lot Claude n'a pas pu être appliqué à ce chapitre — relancez l'extraction.";
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await insertExtractionJob(supabase, { chapterId, status: "failed", error: message, provider: "claude" });
    revalidatePath("/apps/el-profesor");
    return { success: "Chapitre réinitialisé — vous pouvez relancer l'extraction." };
  }

  return { error: "Ce chapitre n'est pas en cours d'extraction." };
}

export interface ExtractionJobHistoryEntry {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  provider: string | null;
  model: string | null;
  requestPrompt: string | null;
  rawResponse: string | null;
  error: string | null;
  createdAt: string;
}

/**
 * Debugging aid (requested 2026-08-25, after two separate "empty
 * generation, no error shown" reports impossible to root-cause without
 * seeing the actual exchange) — the last 5 extraction attempts logged for
 * this chapter, whichever provider handled them, exactly what was sent and
 * received. See insertExtractionJob (lib/el-profesor/extraction-jobs.ts)
 * for where these rows come from.
 */
export async function getExtractionJobHistory(chapterId: string): Promise<ExtractionJobHistoryEntry[]> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_extraction_jobs")
    .select("id, status, provider, model, request_prompt, raw_response, error, created_at")
    .eq("chapter_id", chapterId)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    requestPrompt: row.request_prompt,
    rawResponse: row.raw_response,
    error: row.error,
    createdAt: row.created_at,
  }));
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function isCitationArray(v: unknown): v is Citation[] {
  return Array.isArray(v) && v.every((c) => c && typeof c === "object" && typeof (c as Citation).page === "number" && typeof (c as Citation).quote === "string");
}

/**
 * Validates hand-pasted JSON (e.g. from an external Claude.ai chat, via the
 * "Importer" dialog's copy-prompt flow) against the same shape Gemini's
 * structured output already guarantees — a human paste has no such
 * guarantee, so every field is checked defensively with a specific error
 * pointing at what's wrong, rather than crashing on a malformed shape.
 */
function parseImportedExtraction(raw: string): { extraction: ExtractionResult; wasTruncated: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new GeminiError("JSON invalide — vérifiez que vous avez bien copié toute la réponse, sans texte avant ou après.");
  }
  // coerceKeyedObjectArray recovers the case where a model (or a hand-paste
  // from one) sent sub_entities double-encoded as its own JSON string
  // instead of a real array — whether the string is genuinely cut short
  // (salvaged up to the truncation point) or just has a malformed object
  // boundary somewhere in the middle (salvaged per sub-entity, keyed on
  // "name" — see salvageObjectArrayByKey's doc comment in anthropic.ts for
  // the real case this fixes: Claude dropping one closing brace between
  // two sub-entities on a long chapter). Applied here too so this parser
  // and the "réessayer depuis l'historique" button (which reuses it via
  // importChapterContent) can both recover from it. A string value that
  // fails a clean JSON.parse but still yields elements via salvage means
  // something was recovered rather than received cleanly — flagged below
  // so the caller can warn that a "Compléter l'extraction" pass may be
  // worth running afterward just in case something was missed.
  const subEntitiesRaw = coerceKeyedObjectArray((parsed as { sub_entities?: unknown } | null)?.sub_entities, "name");
  if (subEntitiesRaw.length === 0) {
    throw new GeminiError("Le JSON doit contenir un tableau « sub_entities » non vide.");
  }
  const wasTruncated = wasArrayFieldTruncated(parsed, "sub_entities");

  const sub_entities: ExtractedSubEntity[] = subEntitiesRaw.map((subRaw, i) => {
    const sub = (subRaw ?? {}) as Record<string, unknown>;
    const label = typeof sub.name === "string" && sub.name.trim() ? sub.name : `#${i + 1}`;
    if (typeof sub.name !== "string" || !sub.name.trim()) throw new GeminiError(`Sous-entité ${label} : « name » manquant.`);
    if (typeof sub.summary !== "string") throw new GeminiError(`Sous-entité « ${label} » : « summary » manquant.`);

    const fiche = sub.fiche as Record<string, unknown> | undefined;
    if (!fiche || typeof fiche.title !== "string") throw new GeminiError(`Sous-entité « ${label} » : « fiche.title » manquant.`);

    const blocksRaw = fiche.blocks;
    if (!Array.isArray(blocksRaw)) throw new GeminiError(`Sous-entité « ${label} » : « fiche.blocks » doit être un tableau.`);
    const blocks: ExtractedFicheBlock[] = blocksRaw.map((blockRaw, bi) => {
      const block = (blockRaw ?? {}) as Record<string, unknown>;
      if (!BLOCK_TYPES.includes(block.block_type as (typeof BLOCK_TYPES)[number])) {
        throw new GeminiError(`Sous-entité « ${label} », bloc #${bi + 1} : « block_type » invalide (« ${String(block.block_type)} »).`);
      }
      if (!block.content || typeof block.content !== "object") {
        throw new GeminiError(`Sous-entité « ${label} », bloc #${bi + 1} : « content » manquant.`);
      }
      if (!isCitationArray(block.citations)) {
        throw new GeminiError(`Sous-entité « ${label} », bloc #${bi + 1} : « citations » manquant ou invalide (chaque citation a besoin de « page » et « quote »).`);
      }
      return { block_type: block.block_type as ExtractedFicheBlock["block_type"], content: block.content as BlockContent, citations: block.citations };
    });

    const flashcardsRaw = fiche.flashcards;
    if (!Array.isArray(flashcardsRaw)) throw new GeminiError(`Sous-entité « ${label} » : « fiche.flashcards » doit être un tableau.`);
    const flashcards: ExtractedFlashcard[] = flashcardsRaw.map((cardRaw, ci) => {
      const card = (cardRaw ?? {}) as Record<string, unknown>;
      if (typeof card.front !== "string" || typeof card.back !== "string") {
        throw new GeminiError(`Sous-entité « ${label} », flashcard #${ci + 1} : « front »/« back » manquant.`);
      }
      if (!isCitationArray(card.citations)) {
        throw new GeminiError(`Sous-entité « ${label} », flashcard #${ci + 1} : « citations » manquant ou invalide.`);
      }
      return {
        front: card.front,
        back: card.back,
        citations: card.citations,
        suggested_image_page: typeof card.suggested_image_page === "number" ? card.suggested_image_page : null,
        suggested_image_hint: typeof card.suggested_image_hint === "string" ? card.suggested_image_hint : null,
      };
    });

    return { name: sub.name, summary: sub.summary, fiche: { title: fiche.title, blocks, flashcards } };
  });

  const estimatedRaw = (parsed as { estimated_remaining_passes?: unknown } | null)?.estimated_remaining_passes;
  const estimated_remaining_passes = typeof estimatedRaw === "number" && Number.isFinite(estimatedRaw) ? estimatedRaw : 0;

  return { extraction: { sub_entities, estimated_remaining_passes }, wasTruncated };
}

/**
 * Imports hand-pasted extraction JSON (produced elsewhere, e.g. by pasting
 * buildExternalImportPrompt's prompt into an external Claude.ai chat with
 * the chapter PDF attached) instead of calling Gemini automatically — an
 * escape hatch for when Gemini's own quota is exhausted. Goes through the
 * exact same citation ground-truth correction as a normal extraction, and
 * every imported block/flashcard is marked needs_review since it never went
 * through our own verification pass.
 */
export async function importChapterContent(chapterId: string, rawJson: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };
  if (chapter.status === "extracting") return { error: "Une extraction est déjà en cours pour ce chapitre." };

  let extraction: ExtractionResult;
  let wasTruncated: boolean;
  try {
    ({ extraction, wasTruncated } = parseImportedExtraction(rawJson));
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "JSON invalide." };
  }

  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  try {
    if (chapter.source_kind === "pdf") {
      const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
      const pageTexts = await extractPdfPageTextsWithOcr(bytes, chapter.title).catch(() => null);
      if (pageTexts) correctExtractionCitations(extraction, pageTexts);
    }
    // Word/PowerPoint chapters have no PDF to ground-truth-correct citations
    // against — the pasted JSON's citations (page: 0, verbatim quote) are
    // kept exactly as provided.

    await persistExtraction(supabase, chapterId, extraction, allNeedReviewFlags(extraction));

    await insertExtractionJob(supabase, {
      chapterId,
      status: "succeeded",
      rawOutput: extraction,
      provider: "external",
      rawResponse: rawJson,
    });
    await supabase
      .from("el_profesor_chapters")
      .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
      .eq("id", chapterId);

    revalidatePath("/apps/el-profesor");
    const truncationNote = wasTruncated
      ? ` Note : la réponse importée avait un format inhabituel (${extraction.sub_entities.length} sous-entité(s) récupérée(s) après reconstruction) — vérifiez que rien ne manque, ou lancez « Compléter l'extraction » par précaution.`
      : "";
    return { success: `Contenu importé. Chaque élément est marqué « à vérifier » — relisez-le avant publication.${truncationNote}` };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de l'import.";
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await insertExtractionJob(supabase, { chapterId, status: "failed", error: message, provider: "external" });
    return { error: message };
  }
}

/**
 * Gap-fill pass: re-reads the chapter's PDF alongside a summary of what's
 * already extracted, and asks Gemini to generate only what's missing —
 * never a duplicate of already-covered content. New content lands as
 * `draft`/`needs_review` under the existing sub-entities (or as new
 * sub-entities), and goes through the same admin review before publication.
 * Gemini-only: with Claude, extractChapterComplementary below routes to the
 * batch path instead (see submitComplementaryBatch in actions/batches.ts) —
 * there's no way to know how many more passes are needed until an async
 * batch's results come back, so the untilComplete auto-loop doesn't apply.
 */
/** Runs exactly one complementary pass. Throws on API/persist failure — caller handles status/job bookkeeping. */
async function runOneComplementaryPass(
  chapterId: string,
  chapter: { title: string },
  config: Awaited<ReturnType<typeof getElProfesorGeminiConfig>>,
  bytes: Uint8Array,
  existingContent: Awaited<ReturnType<typeof getChapterContent>>,
  pageTexts: string[] | null
): Promise<{ addedCount: number; estimatedRemainingPasses: number | null }> {
  const coverageSummary = buildCoverageSummary(existingContent);
  const supabase = await createClient();
  let geminiFileName: string | null = null;
  let apiKey = "";
  try {
    const result = await extractComplementaryContentWithRotation(config, bytes, chapter.title, chapter.title, coverageSummary);
    const complementary = result.complementary;
    apiKey = result.apiKey;
    geminiFileName = result.file.name;

    if (pageTexts) correctComplementaryCitations(complementary, pageTexts);
    // persistComplementaryAdditions marks every gap-fill addition needs_review unconditionally.
    const addedCount = await persistComplementaryAdditions(supabase, chapterId, complementary, existingContent);

    await insertExtractionJob(supabase, {
      chapterId,
      status: "succeeded",
      rawOutput: complementary,
      provider: "gemini",
      model: result.model,
      requestPrompt: buildComplementaryPrompt(chapter.title, coverageSummary),
      rawResponse: result.rawResponseText,
    });

    return { addedCount, estimatedRemainingPasses: complementary.estimated_remaining_passes };
  } finally {
    if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
  }
}

/**
 * Gap-fill pass(es). With Gemini, runs a single pass by default, or loops
 * automatically with `untilComplete: true` — re-downloading the latest
 * persisted content between passes — until the model reports no remaining
 * gaps, a pass adds nothing new, or the safety cap is hit. With Claude,
 * delegates to the batch path instead (see the doc comment above
 * runOneComplementaryPass) — `untilComplete` is forwarded there too: the
 * cron poller re-submits a fresh one-chapter batch after each result until
 * the same cap is hit, so "jusqu'à couverture" keeps working end to end
 * even though each pass is a separate async round-trip.
 */
export async function extractChapterComplementary(chapterId: string, options?: { untilComplete?: boolean }): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };
  if (chapter.status === "extracting" || chapter.status === "queued") {
    return { error: "Une extraction est déjà en cours ou en file pour ce chapitre." };
  }
  if (chapter.status === "pending" || chapter.status === "failed") {
    return { error: "Lancez d'abord une extraction initiale avant de chercher des compléments." };
  }
  if (chapter.source_kind !== "pdf") {
    return { error: "Pas de passe de complément pour un chapitre Word/PowerPoint (pas de fichier source à relire) — le texte a déjà été extrait en une seule fois." };
  }

  const provider = await getElProfesorAiProvider();
  if (provider === "claude") {
    return submitComplementaryBatch([chapterId], { untilComplete: options?.untilComplete });
  }

  const originalStatus = chapter.status;
  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  try {
    const config = await getElProfesorGeminiConfig();
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
    // Extracted once and reused across every auto-run pass (see below) rather than per pass.
    const pageTexts = await extractPdfPageTextsWithOcr(bytes, chapter.title).catch(() => null);

    let totalAdded = 0;
    let passesRun = 0;
    let estimatedRemainingPasses: number | null = null;
    const maxPasses = options?.untilComplete ? MAX_AUTO_COMPLEMENTARY_PASSES : 1;

    do {
      const existingContent = await getChapterContent(chapterId, true);
      const pass = await runOneComplementaryPass(chapterId, chapter, config, bytes, existingContent, pageTexts);
      totalAdded += pass.addedCount;
      passesRun += 1;
      estimatedRemainingPasses = pass.estimatedRemainingPasses;
      await supabase.from("el_profesor_chapters").update({ estimated_remaining_passes: estimatedRemainingPasses }).eq("id", chapterId);

      if (pass.addedCount === 0) break; // no progress this pass — further passes won't help
    } while (options?.untilComplete && (estimatedRemainingPasses ?? 0) > 0 && passesRun < maxPasses);

    await supabase.from("el_profesor_chapters").update({ status: originalStatus }).eq("id", chapterId);
    revalidatePath("/apps/el-profesor");

    if (totalAdded === 0) {
      return { success: "Aucun trou détecté : l'extraction semble déjà complète." };
    }
    const passSuffix = passesRun > 1 ? ` en ${passesRun} passes` : "";
    const stillRemaining = options?.untilComplete && (estimatedRemainingPasses ?? 0) > 0 && passesRun >= maxPasses;
    return {
      success:
        `${totalAdded} élément(s) complémentaire(s) ajouté(s)${passSuffix} — à relire avant publication.` +
        (stillRemaining ? " Du contenu reste probablement à combler (limite de passes automatiques atteinte)." : ""),
    };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de la génération complémentaire.";
    await supabase.from("el_profesor_chapters").update({ status: originalStatus, extraction_error: message }).eq("id", chapterId);
    await insertExtractionJob(supabase, { chapterId, status: "failed", error: message, provider: "gemini" });
    return { error: message };
  }
}

/**
 * Renames a fiche's title (requested 2026-08-26) — the reader-facing name
 * shown in FicheViewer, the admin-review header, and every fiche listing
 * (notion view, glossary).
 */
export async function renameFiche(ficheId: string, title: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = title.trim();
  if (!trimmed) return { error: "Le titre ne peut pas être vide." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_fiches").update({ title: trimmed }).eq("id", ficheId);
  if (error) return { error: "Impossible de renommer cette fiche." };

  revalidatePath("/apps/el-profesor");
  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  return { success: "Fiche renommée." };
}

export async function publishFiche(ficheId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error: ficheError } = await supabase.from("el_profesor_fiches").update({ status: "published" }).eq("id", ficheId);
  if (ficheError) return { error: "Impossible de publier la fiche." };

  await supabase.from("el_profesor_fiche_blocks").update({ status: "published" }).eq("fiche_id", ficheId);
  await supabase.from("el_profesor_flashcards").update({ status: "published" }).eq("fiche_id", ficheId);

  revalidatePath("/apps/el-profesor");
  return { success: "Fiche publiée." };
}

/** Publishes every draft fiche/flashcard for a chapter and marks the chapter published. */
export async function finalizeChapterPublication(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id").eq("chapter_id", chapterId);
  const subEntityIds = (subEntities ?? []).map((s) => s.id);
  if (subEntityIds.length === 0) return { error: "Ce chapitre n'a pas encore été extrait." };

  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id").in("sub_entity_id", subEntityIds);
  const ficheIds = (fiches ?? []).map((f) => f.id);

  if (ficheIds.length > 0) {
    await supabase.from("el_profesor_fiches").update({ status: "published" }).in("id", ficheIds);
    await supabase.from("el_profesor_fiche_blocks").update({ status: "published" }).in("fiche_id", ficheIds);
    await supabase.from("el_profesor_flashcards").update({ status: "published" }).in("fiche_id", ficheIds);
  }

  const { error } = await supabase.from("el_profesor_chapters").update({ status: "published" }).eq("id", chapterId);
  if (error) return { error: "Impossible de finaliser la publication du chapitre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Chapitre publié." };
}

export async function updateFicheBlock(
  blockId: string,
  input: { content: BlockContent; citations: Citation[] }
): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("el_profesor_fiche_blocks")
    .update({ content: input.content as never, citations: input.citations as never, needs_review: false })
    .eq("id", blockId);
  if (error) return { error: "Impossible de mettre à jour ce bloc." };

  await logContentChange(profile.id, "block", blockId, "edit");
  revalidatePath("/apps/el-profesor");
  return { success: "Bloc mis à jour." };
}

/**
 * Piste d'amélioration 2026-08-24 ("mode urgence / bloc") — flags an
 * already-published, already-reviewed block as an emergency quick-reference
 * entry. Pure labeling, no content change, never touched by any AI call.
 */
export async function setBlockEmergency(blockId: string, isEmergency: boolean): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("el_profesor_fiche_blocks").update({ is_emergency: isEmergency }).eq("id", blockId);
  if (error) return { error: "Impossible de mettre à jour ce bloc." };

  await logContentChange(profile.id, "block", blockId, isEmergency ? "mark_emergency" : "unmark_emergency");
  revalidatePath("/apps/el-profesor");
  revalidatePath("/apps/el-profesor/emergency");
  return { success: isEmergency ? "Marqué comme référence d'urgence." : "Retiré du mode urgence." };
}

export async function updateFlashcard(
  flashcardId: string,
  input: { front: FlashcardSide; back: FlashcardSide; citations: Citation[] }
): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("el_profesor_flashcards")
    .update({
      front: input.front as never,
      back: input.back as never,
      citations: input.citations as never,
      needs_review: false,
    })
    .eq("id", flashcardId);
  if (error) return { error: "Impossible de mettre à jour cette flashcard." };

  await logContentChange(profile.id, "flashcard", flashcardId, "edit");
  revalidatePath("/apps/el-profesor");
  return { success: "Flashcard mise à jour." };
}

const MAX_FLASHCARD_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Attaches an image/schema to a flashcard (item 23 of the backlog) — either
 * a manual upload or a crop captured client-side from the PDF viewer's own
 * canvas (see PdfViewer's captureMode). Shown alongside the front side
 * during review; plain image-based recall, not a clickable-hotspot diagram.
 */
export async function uploadFlashcardImage(flashcardId: string, imageBase64: string, mimeType: string, alt?: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.byteLength > MAX_FLASHCARD_IMAGE_BYTES) return { error: "Image trop lourde (5 Mo maximum)." };

  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const path = `${flashcardId}-${Date.now()}.${ext}`;

  let publicUrl: string;
  try {
    publicUrl = await uploadPublicImage("el-profesor-flashcard-images", path, bytes, mimeType);
  } catch (err) {
    // Surface the real Supabase Storage error (bucket missing, RLS denial,
    // payload rejected...) instead of a generic message that hid the
    // actual cause and made this near-impossible to diagnose remotely.
    // Covers both a GeminiError from uploadPublicImage's own { error }
    // check AND an outright thrown exception from the storage client
    // itself (network failure, an unexpected SDK error...) — the earlier
    // "err instanceof GeminiError" check missed that second case and fell
    // through to a generic message with no real cause visible.
    const message = err instanceof Error ? err.message : "erreur inconnue";
    return { error: `Échec de l'envoi de l'image : ${message}` };
  }

  const supabase = await createClient();
  // Clears the extraction-time suggestion (item 23 follow-up) — it's served its purpose now that an image is actually attached.
  const { error } = await supabase
    .from("el_profesor_flashcards")
    .update({ image_url: publicUrl, image_alt: alt?.trim() || null, suggested_image_page: null, suggested_image_hint: null })
    .eq("id", flashcardId);
  if (error) return { error: "Image envoyée, mais impossible de l'enregistrer." };

  revalidatePath("/apps/el-profesor");
  return { success: "Image ajoutée à la flashcard." };
}

/** Alternate front-wordings to test against each other (item 47) — the back never changes, only how the question is asked. */
export async function updateFlashcardVariants(flashcardId: string, variants: { id: string; text: string }[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_flashcards").update({ variants: variants as never }).eq("id", flashcardId);
  if (error) return { error: "Impossible d'enregistrer les formulations." };
  revalidatePath("/apps/el-profesor");
  return { success: "Formulations mises à jour." };
}

/**
 * Cloze card editing (piste "flashcards à trous", 2026-08-24) — `rawText`
 * is the admin's `{{...}}`-marked passage; parseClozeText strips the
 * markers into plain text + the ranges to hide, which is what's actually
 * persisted (front.text + cloze_ranges), never the raw markup itself.
 * Passing an empty `rawText` (or one with no `{{...}}`) clears
 * cloze_ranges — the card reverts to being an ordinary Q&A flashcard.
 */
export async function updateFlashcardCloze(flashcardId: string, rawText: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = rawText.trim();
  if (!trimmed) return { error: "Le texte à trous ne peut pas être vide." };

  const { text, ranges } = parseClozeText(trimmed);
  if (!text.trim()) return { error: "Le texte à trous ne peut pas être vide." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_flashcards")
    .update({ front: { text } as never, cloze_ranges: ranges as never })
    .eq("id", flashcardId);
  if (error) return { error: "Impossible d'enregistrer le texte à trous." };
  revalidatePath("/apps/el-profesor");
  return { success: ranges.length > 0 ? "Carte à trous mise à jour." : "Aucun trou marqué — la carte redevient une carte question/réponse classique." };
}

/**
 * Labeled masked regions on a flashcard's image ("retrouve la légende" —
 * follow-up to item 23): normalized 0-1 coordinates so they survive any
 * display size. Every region is hidden on the front, all revealed on the
 * back — one card tests the whole diagram at once rather than one card per
 * region, keeping the review flow unchanged.
 */
export async function updateFlashcardOcclusions(
  flashcardId: string,
  occlusions: { id: string; x: number; y: number; width: number; height: number; label: string }[]
): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_flashcards").update({ image_occlusions: occlusions as never }).eq("id", flashcardId);
  if (error) return { error: "Impossible d'enregistrer les zones masquées." };
  revalidatePath("/apps/el-profesor");
  return { success: "Zones masquées mises à jour." };
}

export async function getFlashcardVariantStatsAction(
  flashcardId: string,
  originalText: string,
  variants: { id: string; text: string }[]
): Promise<FlashcardVariantStat[]> {
  await requireElProfesorAdmin();
  return getFlashcardVariantStats(flashcardId, originalText, variants);
}

export async function removeFlashcardImage(flashcardId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_flashcards").update({ image_url: null, image_alt: null }).eq("id", flashcardId);
  if (error) return { error: "Impossible de retirer l'image." };
  revalidatePath("/apps/el-profesor");
  return { success: "Image retirée." };
}

/**
 * Attaches an illustration to a fiche block (2026-08-27) — extends the
 * image support already on flashcards (item 23) to fiche blocks in
 * general, in a dedicated bucket. Manual upload only, never AI-generated —
 * the notion synthesis later reuses this verbatim on any synthesized block
 * that draws from an illustrated source block (see generateNotionSynthesis
 * in actions/notions.ts), it never generates its own.
 */
export async function uploadFicheBlockImage(blockId: string, imageBase64: string, mimeType: string, alt?: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.byteLength > MAX_FLASHCARD_IMAGE_BYTES) return { error: "Image trop lourde (5 Mo maximum)." };

  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const path = `${blockId}-${Date.now()}.${ext}`;

  let publicUrl: string;
  try {
    publicUrl = await uploadPublicImage("el-profesor-block-images", path, bytes, mimeType);
  } catch (err) {
    // Surface the real Supabase Storage error (bucket missing, RLS denial,
    // payload rejected...) instead of a generic message that hid the
    // actual cause and made this near-impossible to diagnose remotely.
    // Covers both a GeminiError from uploadPublicImage's own { error }
    // check AND an outright thrown exception from the storage client
    // itself (network failure, an unexpected SDK error...) — the earlier
    // "err instanceof GeminiError" check missed that second case and fell
    // through to a generic message with no real cause visible.
    const message = err instanceof Error ? err.message : "erreur inconnue";
    return { error: `Échec de l'envoi de l'image : ${message}` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_fiche_blocks").update({ image_url: publicUrl, image_alt: alt?.trim() || null }).eq("id", blockId);
  if (error) return { error: "Image envoyée, mais impossible de l'enregistrer." };

  revalidatePath("/apps/el-profesor");
  return { success: "Image ajoutée au bloc." };
}

export async function removeFicheBlockImage(blockId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_fiche_blocks").update({ image_url: null, image_alt: null }).eq("id", blockId);
  if (error) return { error: "Impossible de retirer l'image." };
  revalidatePath("/apps/el-profesor");
  return { success: "Image retirée." };
}

/** Proposes a mnemonic as a new draft block on the same fiche, for a block that isn't itself a mnemonic. Never overwrites the source block. */
export async function suggestMnemonicForBlock(blockId: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: block } = await supabase.from("el_profesor_fiche_blocks").select("fiche_id, block_type, content").eq("id", blockId).single();
  if (!block) return { error: "Bloc introuvable." };

  const { data: fiche } = await supabase.from("el_profesor_fiches").select("sub_entity_id").eq("id", block.fiche_id).single();
  const { data: subEntity } = fiche ? await supabase.from("el_profesor_sub_entities").select("name").eq("id", fiche.sub_entity_id).single() : { data: null };

  const sourceText = blockToPlainText(block.block_type, block.content as unknown as BlockContent);
  if (!sourceText.trim()) return { error: "Ce bloc n'a pas assez de contenu pour en tirer un moyen mnémotechnique." };

  try {
    const config = await getElProfesorGeminiConfig();
    const result = await generateMnemonic(config, subEntity?.name ?? "", sourceText);

    const { count } = await supabase.from("el_profesor_fiche_blocks").select("id", { count: "exact", head: true }).eq("fiche_id", block.fiche_id);
    const { error } = await supabase.from("el_profesor_fiche_blocks").insert({
      fiche_id: block.fiche_id,
      order_index: count ?? 0,
      block_type: "mnemotechnique",
      content: { text: result.text } as unknown as BlockContent as never,
      citations: [] as unknown as Citation[] as never,
      needs_review: true,
      status: "draft",
    });
    if (error) return { error: "Impossible d'enregistrer la mnémotechnique proposée." };

    await logContentChange(profile.id, "block", blockId, "suggest_mnemonic");
    revalidatePath("/apps/el-profesor");
    return { success: "Mnémotechnique proposée en brouillon." };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la génération du moyen mnémotechnique." };
  }
}

export async function getFicheBlockHistory(blockId: string): Promise<ContentLogEntry[]> {
  await requireElProfesorAdmin();
  return getContentLog("block", blockId);
}

export async function getFlashcardHistory(flashcardId: string): Promise<ContentLogEntry[]> {
  await requireElProfesorAdmin();
  return getContentLog("flashcard", flashcardId);
}

export async function deleteFicheBlock(blockId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_fiche_blocks").delete().eq("id", blockId);
  if (error) return { error: "Impossible de supprimer ce bloc." };
  revalidatePath("/apps/el-profesor");
  return { success: "Bloc supprimé." };
}

export async function deleteFlashcard(flashcardId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_flashcards").delete().eq("id", flashcardId);
  if (error) return { error: "Impossible de supprimer cette flashcard." };
  revalidatePath("/apps/el-profesor");
  return { success: "Flashcard supprimée." };
}

/** Swaps a block's order_index with its previous/next sibling within the same fiche. No-op at either end. */
export async function moveFicheBlock(blockId: string, direction: "up" | "down"): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: block } = await supabase.from("el_profesor_fiche_blocks").select("id, fiche_id, order_index").eq("id", blockId).single();
  if (!block) return { error: "Bloc introuvable." };

  const { data: siblings } = await supabase
    .from("el_profesor_fiche_blocks")
    .select("id, order_index")
    .eq("fiche_id", block.fiche_id)
    .order("order_index", { ascending: true });
  const list = siblings ?? [];
  const index = list.findIndex((b) => b.id === blockId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return { success: "OK" };
  }

  const target = list[targetIndex];
  const current = list[index];
  const [error1, error2] = await Promise.all([
    supabase.from("el_profesor_fiche_blocks").update({ order_index: target.order_index }).eq("id", current.id).then((r) => r.error),
    supabase.from("el_profesor_fiche_blocks").update({ order_index: current.order_index }).eq("id", target.id).then((r) => r.error),
  ]);
  if (error1 || error2) return { error: "Impossible de réordonner ce bloc." };

  revalidatePath("/apps/el-profesor");
  return { success: "Bloc déplacé." };
}

/** Swaps a sub-entity's order_index with its previous/next sibling within the chapter. No-op at either end. */
export async function moveSubEntity(subEntityId: string, direction: "up" | "down"): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: subEntity } = await supabase
    .from("el_profesor_sub_entities")
    .select("id, chapter_id, order_index")
    .eq("id", subEntityId)
    .single();
  if (!subEntity) return { error: "Sous-entité introuvable." };

  const { data: siblings } = await supabase
    .from("el_profesor_sub_entities")
    .select("id, order_index")
    .eq("chapter_id", subEntity.chapter_id)
    .order("order_index", { ascending: true });
  const list = siblings ?? [];
  const index = list.findIndex((s) => s.id === subEntityId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return { success: "OK" };
  }

  const target = list[targetIndex];
  const current = list[index];
  const [error1, error2] = await Promise.all([
    supabase.from("el_profesor_sub_entities").update({ order_index: target.order_index }).eq("id", current.id).then((r) => r.error),
    supabase.from("el_profesor_sub_entities").update({ order_index: current.order_index }).eq("id", target.id).then((r) => r.error),
  ]);
  if (error1 || error2) return { error: "Impossible de réordonner cette sous-entité." };

  revalidatePath("/apps/el-profesor");
  return { success: "Sous-entité déplacée." };
}
