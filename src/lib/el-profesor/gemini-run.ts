import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ElProfesorChapterRow } from "@/lib/supabase/types";
import { getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import {
  deleteGeminiFile,
  extractChapterContentWithRotation,
  extractChapterContentFromTextWithRotation,
  isQuotaOrCapacityError,
  verifyExtraction,
} from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";
import { correctExtractionCitations } from "@/lib/el-profesor/pdf-text";
import { extractPdfPageTextsWithOcr } from "@/lib/el-profesor/pdf-ocr";
import { buildExtractionPrompt, buildTextExtractionPrompt } from "@/lib/el-profesor/prompts";
import { insertExtractionJob } from "@/lib/el-profesor/extraction-jobs";
import { allNeedReviewFlags, persistExtraction } from "@/lib/el-profesor/extraction-persist";
import type { ExtractionResult, VerificationFlag } from "@/lib/el-profesor/types";

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
    const [{ extraction: geminiExtraction, apiKey: winningKey, model, file, rawResponseText }, pageTexts] = await Promise.all([
      extractChapterContentWithRotation(config, bytes, chapter.title, chapter.title),
      extractPdfPageTextsWithOcr(bytes, chapter.title).catch(() => null),
    ]);
    extraction = geminiExtraction;
    apiKey = winningKey;
    geminiFileName = file.name;
    debugRequestPrompt = buildExtractionPrompt(chapter.title);
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
