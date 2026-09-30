import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ElProfesorChapterRow } from "@/lib/supabase/types";
import { getElProfesorGeminiConfig, getChapterContent } from "@/lib/el-profesor/dal";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import {
  deleteGeminiFile,
  extractChapterContentWithRotation,
  extractChapterContentFromTextWithRotation,
  extractComplementaryContentWithRotation,
  isQuotaOrCapacityError,
  verifyExtraction,
} from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";
import { correctExtractionCitations, correctComplementaryCitations, extractPdfPageTexts } from "@/lib/el-profesor/pdf-text";
import { extractPdfPageTextsWithOcr } from "@/lib/el-profesor/pdf-ocr";
import { buildComplementaryPrompt, buildExtractionPrompt, buildTextExtractionPrompt } from "@/lib/el-profesor/prompts";
import { insertExtractionJob } from "@/lib/el-profesor/extraction-jobs";
import {
  allNeedReviewFlags,
  buildCoverageSummary,
  MAX_AUTO_COMPLEMENTARY_PASSES,
  persistComplementaryAdditions,
  persistExtraction,
} from "@/lib/el-profesor/extraction-persist";
import type { ExtractionResult, VerificationFlag } from "@/lib/el-profesor/types";

const NEIGHBOUR_TEXT_CHARS = 1500;
const NEIGHBOUR_MAX_NAMES = 40;

/**
 * What surrounds a chapter in its book — the end of the previous part and
 * the start of the next one (a hand-made split can cut a sentence in two),
 * plus the notions their fiches already cover, so Gemini neither skips a
 * cut paragraph nor re-extracts what a neighbour already has. Best-effort:
 * empty on any failure.
 */
export async function buildNeighbourContext(supabase: SupabaseClient<Database>, chapter: ElProfesorChapterRow): Promise<string> {
  try {
    const { data: siblings } = await supabase
      .from("el_profesor_chapters")
      .select("id, title, order_index, source_kind, pdf_storage_path")
      .eq("book_id", chapter.book_id)
      .order("order_index", { ascending: true });
    const list = siblings ?? [];
    const i = list.findIndex((c) => c.id === chapter.id);
    if (i < 0) return "";
    const parts: string[] = [];
    for (const [neighbour, where] of [
      [list[i - 1], "précédente"],
      [list[i + 1], "suivante"],
    ] as const) {
      if (!neighbour) continue;
      const lines = [`Partie ${where} : « ${neighbour.title} »`];
      if (neighbour.source_kind === "pdf" && neighbour.pdf_storage_path) {
        const pages = await extractPdfPageTexts(await downloadChapterPdfBytes(neighbour.pdf_storage_path)).catch(() => null);
        const text = (where === "précédente" ? pages?.at(-1) : pages?.[0])?.replace(/\s+/g, " ").trim();
        if (text) lines.push(where === "précédente" ? `Fin de son texte : « …${text.slice(-NEIGHBOUR_TEXT_CHARS)} »` : `Début de son texte : « ${text.slice(0, NEIGHBOUR_TEXT_CHARS)}… »`);
      }
      const covered = await getChapterContent(neighbour.id, true, supabase).catch(() => []);
      const names = covered.map((s) => s.name).slice(0, NEIGHBOUR_MAX_NAMES);
      if (names.length) lines.push(`Notions déjà couvertes par ses fiches : ${names.join(" ; ")}`);
      if (lines.length > 1) parts.push(lines.join("\n"));
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

export type GeminiRunResult =
  | { ok: true; verificationFailed: boolean; textSource: boolean }
  | { ok: false; message: string; quota: boolean };

/**
 * The synchronous Gemini extraction of one chapter (PDF or Word/PowerPoint
 * text), shared by the « Extraire » button (actions/extraction.ts) and the
 * server-side queue (gemini-queue.ts) — takes the caller's Supabase client
 * because the queue runs from a cron route with no user session. Sets the
 * chapter to extracting, then draft_ready or failed, and logs the job.
 */
export async function runGeminiChapterExtraction(supabase: SupabaseClient<Database>, chapter: ElProfesorChapterRow): Promise<GeminiRunResult> {
  const chapterId = chapter.id;
  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  let geminiFileName: string | null = null;
  let apiKey = "";
  // Captured as soon as each path gets its response back, so the failure
  // log below still has a request/response pair to retry from.
  let debugRequestPrompt: string | null = null;
  let debugRawResponse: string | null = null;

  try {
    let extraction: ExtractionResult;
    let flags: VerificationFlag[];
    let verificationFailed = false;

    if (chapter.source_kind !== "pdf") {
      // Word/PowerPoint source: no file to attach, no page ground truth to verify against.
      const config = await getElProfesorGeminiConfig();
      const { extraction: textExtraction, model, rawResponseText } = await extractChapterContentFromTextWithRotation(config, chapter.title, chapter.source_text ?? "");
      extraction = textExtraction;
      debugRequestPrompt = buildTextExtractionPrompt(chapter.title, chapter.source_text ?? "");
      debugRawResponse = rawResponseText;
      if (extraction.sub_entities.length === 0) {
        // A real chapter always has something extractable: an empty result is a silent failure, not a success.
        throw new GeminiError("Extraction vide — aucune sous-entité produite. Réessayez, ou vérifiez que le document contient bien du contenu.");
      }
      flags = allNeedReviewFlags(extraction);
      await persistExtraction(supabase, chapterId, extraction, flags);
      await insertExtractionJob(supabase, { chapterId, status: "succeeded", rawOutput: extraction, provider: "gemini", model, requestPrompt: debugRequestPrompt, rawResponse: rawResponseText });
      await supabase.from("el_profesor_chapters").update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes }).eq("id", chapterId);
      return { ok: true, verificationFailed: false, textSource: true };
    }

    const config = await getElProfesorGeminiConfig();
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
    const neighbourContext = await buildNeighbourContext(supabase, chapter);
    const [{ extraction: geminiExtraction, apiKey: winningKey, model, file, rawResponseText }, pageTexts] = await Promise.all([
      extractChapterContentWithRotation(config, bytes, chapter.title, chapter.title, neighbourContext),
      extractPdfPageTextsWithOcr(bytes, chapter.title).catch(() => null),
    ]);
    extraction = geminiExtraction;
    apiKey = winningKey;
    geminiFileName = file.name;
    debugRequestPrompt = buildExtractionPrompt(chapter.title, neighbourContext);
    debugRawResponse = rawResponseText;

    if (extraction.sub_entities.length === 0) {
      throw new GeminiError("Extraction vide — aucune sous-entité produite. Réessayez, ou vérifiez que le PDF contient bien du contenu extractible.");
    }

    // Ground-truth-corrects citation pages against the PDF's actual text (best-effort).
    if (pageTexts) correctExtractionCitations(extraction, pageTexts);

    const verification = await verifyExtraction(apiKey, model, file, extraction).catch(() => {
      verificationFailed = true;
      return { flags: [] as VerificationFlag[] };
    });
    flags = verification.flags;

    await persistExtraction(supabase, chapterId, extraction, flags);
    await insertExtractionJob(supabase, { chapterId, status: "succeeded", rawOutput: extraction, provider: "gemini", model, requestPrompt: debugRequestPrompt, rawResponse: rawResponseText });
    await supabase.from("el_profesor_chapters").update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes }).eq("id", chapterId);
    return { ok: true, verificationFailed, textSource: false };
  } catch (err) {
    // Unexpected errors keep their own message, so the attempt history says what actually broke.
    const message = err instanceof GeminiError ? err.message : `Échec de l'extraction du chapitre : ${err instanceof Error ? err.message : String(err)}`;
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await insertExtractionJob(supabase, { chapterId, status: "failed", error: message, provider: "gemini", requestPrompt: debugRequestPrompt, rawResponse: debugRawResponse });
    return { ok: false, message, quota: isQuotaOrCapacityError(err) };
  } finally {
    if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
  }
}

export { GEMINI_QUEUE_NOTE } from "@/lib/el-profesor/gemini-queue-note";

export type GeminiComplementResult =
  | { ok: true; added: number; passes: number; stillRemaining: boolean }
  | { ok: false; message: string; quota: boolean };

/**
 * Gap-fill pass(es) of an already-extracted PDF chapter with Gemini — one
 * pass, or passes until the model reports full coverage (capped). Shared by
 * the « Compléter » button and the server-side queue. The chapter is shown
 * « extracting » while it runs, then gets its previous status back.
 */
export async function runGeminiComplement(
  supabase: SupabaseClient<Database>,
  chapter: ElProfesorChapterRow,
  untilComplete: boolean,
  freshClient: () => SupabaseClient<Database>,
  statusToRestore?: ElProfesorChapterRow["status"] | null
): Promise<GeminiComplementResult> {
  const chapterId = chapter.id;
  const originalStatus = statusToRestore ?? (chapter.status === "extracting" || chapter.status === "queued" ? "draft_ready" : chapter.status);
  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  try {
    const config = await getElProfesorGeminiConfig();
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
    // Extracted once and reused by every pass.
    const pageTexts = await extractPdfPageTextsWithOcr(bytes, chapter.title).catch(() => null);
    const neighbourContext = await buildNeighbourContext(supabase, chapter);

    let added = 0;
    let passes = 0;
    let remaining: number | null = null;
    const maxPasses = untilComplete ? MAX_AUTO_COMPLEMENTARY_PASSES : 1;

    do {
      // A fresh client each pass: getChapterContent is memoised per arguments, and each pass must see the previous one's additions.
      const existingContent = await getChapterContent(chapterId, true, freshClient());
      const coverageSummary = buildCoverageSummary(existingContent);
      let geminiFileName: string | null = null;
      let apiKey = "";
      try {
        const result = await extractComplementaryContentWithRotation(config, bytes, chapter.title, chapter.title, coverageSummary, neighbourContext);
        apiKey = result.apiKey;
        geminiFileName = result.file.name;
        if (pageTexts) correctComplementaryCitations(result.complementary, pageTexts);
        const count = await persistComplementaryAdditions(supabase, chapterId, result.complementary, existingContent);
        await insertExtractionJob(supabase, {
          chapterId,
          status: "succeeded",
          rawOutput: result.complementary,
          provider: "gemini",
          model: result.model,
          requestPrompt: buildComplementaryPrompt(chapter.title, coverageSummary, neighbourContext),
          rawResponse: result.rawResponseText,
        });
        added += count;
        passes += 1;
        remaining = result.complementary.estimated_remaining_passes;
        await supabase.from("el_profesor_chapters").update({ estimated_remaining_passes: remaining }).eq("id", chapterId);
        if (count === 0) break; // no progress: further passes won't help
      } finally {
        if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
      }
    } while (untilComplete && (remaining ?? 0) > 0 && passes < maxPasses);

    await supabase.from("el_profesor_chapters").update({ status: originalStatus, extraction_error: null }).eq("id", chapterId);
    return { ok: true, added, passes, stillRemaining: untilComplete && (remaining ?? 0) > 0 && passes >= maxPasses };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : `Échec de la génération complémentaire : ${err instanceof Error ? err.message : String(err)}`;
    await supabase.from("el_profesor_chapters").update({ status: originalStatus, extraction_error: message }).eq("id", chapterId);
    await insertExtractionJob(supabase, { chapterId, status: "failed", error: message, provider: "gemini" });
    return { ok: false, message, quota: isQuotaOrCapacityError(err) };
  }
}
