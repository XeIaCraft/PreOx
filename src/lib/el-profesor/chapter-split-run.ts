import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ElProfesorChapterRow } from "@/lib/supabase/types";
import { getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { uploadChapterPdf, deleteChapterPdf, downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import { extractPdfPageTexts } from "@/lib/el-profesor/pdf-text";
import { splitPdfByRanges, getPdfPageCount, MAX_PAGES_FOR_AI_DETECTION } from "@/lib/el-profesor/pdf-split";
import { suggestChapterSplitPoints } from "@/lib/el-profesor/gemini";
import { computeTargetSplitPartCount, MIN_PAGES_TO_SPLIT } from "@/lib/el-profesor/chapter-quality";
import { rangesFromSplitPoints, validateChapterSplitRanges, type ChapterSplitRangeInput } from "@/lib/el-profesor/chapter-split-ranges";
import { GeminiError } from "@/lib/gemini-shared";

// Splitting a chapter into parts, shared by the « Diviser » dialog
// (actions/split-chapter.ts, ranges reviewed by the admin) and the Gemini
// queue (ranges taken straight from the AI suggestion) — takes the caller's
// Supabase client because the queue runs with no user session.

export type ChapterSplitOutcome = { ok: true; newChapterIds: string[]; success: string } | { ok: false; error: string };

/** The AI-suggested parts of a chapter (Gemini, text of each page), as an exact partition ready to apply. Throws GeminiError. */
export async function suggestSplitRanges(chapter: Pick<ElProfesorChapterRow, "title" | "pdf_storage_path" | "pdf_page_count" | "source_kind">): Promise<ChapterSplitRangeInput[]> {
  if (chapter.source_kind !== "pdf" || !chapter.pdf_storage_path) throw new GeminiError("Ce chapitre n'a pas de PDF source à diviser.");
  const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
  const pageCount = chapter.pdf_page_count ?? (await getPdfPageCount(bytes));
  if (pageCount < MIN_PAGES_TO_SPLIT) throw new GeminiError(`Ce chapitre ne compte que ${pageCount} page(s) — trop court pour être divisé utilement.`);
  if (pageCount > MAX_PAGES_FOR_AI_DETECTION) throw new GeminiError(`Ce chapitre compte ${pageCount} pages — trop pour la suggestion automatique (limite ${MAX_PAGES_FOR_AI_DETECTION}).`);
  const config = await getElProfesorGeminiConfig();
  const pageTexts = await extractPdfPageTexts(bytes);
  const points = await suggestChapterSplitPoints(config, chapter.title, pageTexts, computeTargetSplitPartCount(pageCount));
  const ranges = rangesFromSplitPoints(chapter.title, points.map((p) => p.startPage), pageCount);
  if (ranges.length === 0) throw new GeminiError("Aucun découpage détecté — utilisez la division manuelle.");
  return ranges;
}

/**
 * Replaces a chapter by its parts: each range becomes its own PDF and
 * chapter (status pending, right after the original in the book), then the
 * original — and any content it had — is deleted.
 */
export async function applyChapterSplit(supabase: SupabaseClient<Database>, chapterId: string, ranges: ChapterSplitRangeInput[]): Promise<ChapterSplitOutcome> {
  const { data: chapter } = await supabase
    .from("el_profesor_chapters")
    .select("id, book_id, title, order_index, pdf_storage_path, source_kind")
    .eq("id", chapterId)
    .single();
  if (!chapter || chapter.source_kind !== "pdf" || !chapter.pdf_storage_path) {
    return { ok: false, error: "Ce chapitre n'a pas de PDF source à diviser." };
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
  } catch {
    return { ok: false, error: "PDF illisible ou introuvable dans le stockage." };
  }

  let pageCount: number;
  try {
    pageCount = await getPdfPageCount(bytes);
  } catch {
    return { ok: false, error: "PDF illisible." };
  }

  const validationError = validateChapterSplitRanges(ranges, pageCount);
  if (validationError) return { ok: false, error: validationError };

  let parts: Uint8Array[];
  try {
    parts = await splitPdfByRanges(
      bytes,
      ranges.map((r) => ({ startPage: r.startPage, endPage: r.endPage }))
    );
  } catch (err) {
    return { ok: false, error: err instanceof GeminiError ? err.message : "Échec de la division du PDF." };
  }

  const uploadedPaths: string[] = [];
  async function rollbackUploads() {
    for (const p of uploadedPaths) await deleteChapterPdf(p).catch(() => {});
  }

  const chapterRows: {
    id: string;
    book_id: string;
    title: string;
    order_index: number;
    pdf_storage_path: string;
    pdf_page_count: number;
    source_kind: "pdf";
    status: "pending";
  }[] = [];

  for (let i = 0; i < ranges.length; i++) {
    const newChapterId = randomUUID();
    let storagePath: string;
    try {
      storagePath = await uploadChapterPdf(chapter.book_id, newChapterId, parts[i]);
    } catch {
      await rollbackUploads();
      return { ok: false, error: `Échec de l'envoi de la partie « ${ranges[i].title} ».` };
    }
    uploadedPaths.push(storagePath);
    chapterRows.push({
      id: newChapterId,
      book_id: chapter.book_id,
      title: ranges[i].title.trim(),
      order_index: chapter.order_index + i,
      pdf_storage_path: storagePath,
      pdf_page_count: ranges[i].endPage - ranges[i].startPage + 1,
      source_kind: "pdf",
      status: "pending",
    });
  }

  const { error: insertError } = await supabase.from("el_profesor_chapters").insert(chapterRows);
  if (insertError) {
    await rollbackUploads();
    return { ok: false, error: "Impossible d'enregistrer les nouvelles parties." };
  }

  // Cosmetic ordering only, non-fatal if it fails: shifts chapters that
  // came after the original so the new parts (order_index = original's own
  // + 0..ranges.length-1) don't collide with an existing sibling's
  // order_index. Excludes the just-inserted rows themselves — every one of
  // them past the first (i >= 1) has order_index > chapter.order_index too,
  // so without this exclusion the shift would double-count them.
  const newRowIds = chapterRows.map((r) => r.id);
  const { data: siblings } = await supabase
    .from("el_profesor_chapters")
    .select("id, order_index")
    .eq("book_id", chapter.book_id)
    .gt("order_index", chapter.order_index)
    .not("id", "in", `(${newRowIds.join(",")})`);
  if (siblings && siblings.length > 0) {
    await Promise.all(
      siblings.map((s) => supabase.from("el_profesor_chapters").update({ order_index: s.order_index + (ranges.length - 1) }).eq("id", s.id))
    ).catch(() => {});
  }

  // Only now — replacement parts already safely exist — delete the
  // original. Cascades away any existing sub_entities/fiches/blocks/
  // flashcards/extraction_jobs (same mechanism already relied on by
  // deleteChapter in library.ts).
  const { error: deleteError } = await supabase.from("el_profesor_chapters").delete().eq("id", chapterId);
  if (deleteError) {
    return { ok: false, error: `${ranges.length} partie(s) créée(s), mais l'original « ${chapter.title} » n'a pas pu être supprimé — supprimez-le manuellement.` };
  }
  await deleteChapterPdf(chapter.pdf_storage_path).catch(() => {});

  return { ok: true, newChapterIds: newRowIds, success: `Chapitre divisé en ${ranges.length} parties. Lancez l'extraction sur chacune quand vous êtes prêt.` };
}
