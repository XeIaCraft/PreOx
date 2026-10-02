"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import { extractPdfPageTexts } from "@/lib/el-profesor/pdf-text";
import { getPdfPageCount, MAX_PAGES_FOR_AI_DETECTION } from "@/lib/el-profesor/pdf-split";
import { suggestChapterSplitPoints } from "@/lib/el-profesor/gemini";
import { computeTargetSplitPartCount, MIN_PAGES_TO_SPLIT } from "@/lib/el-profesor/chapter-quality";
import { GeminiError } from "@/lib/gemini-shared";
import { applyChapterSplit } from "@/lib/el-profesor/chapter-split-run";

// "Diviser ce chapitre" (added 2026-08-28, after the user found Claude
// self-reports significantly degraded single-pass extraction quality past
// ~20 pages): the per-CHAPTER counterpart of split-book.ts's whole-book
// split — reads the PDF a chapter already has in storage (no upload step
// needed) and replaces it with several shorter chapters, each split at an
// AI-suggested natural boundary (subsection/paragraph, never mid-content —
// see buildChapterInternalSplitPrompt). Two-step flow, same shape as
// split-book.ts:
//   1. suggestChapterSplit (optional) — AI-assisted boundary guesses.
//   2. splitChapterIntoParts (final) — the admin's reviewed/edited ranges,
//      each split into its own PDF and inserted as a new chapter; only once
//      every part is safely persisted is the original chapter (and
//      whatever content it may already have) deleted.

export interface ActionState {
  error?: string;
  success?: string;
}

export interface ChapterSplitSuggestion {
  startPage: number;
}

export interface ChapterSplitRange {
  title: string;
  startPage: number;
  endPage: number;
}

export async function suggestChapterSplit(
  chapterId: string
): Promise<ActionState & { suggestions?: ChapterSplitSuggestion[]; pageCount?: number; targetPartCount?: number }> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { data: chapter } = await supabase
    .from("el_profesor_chapters")
    .select("title, pdf_storage_path, pdf_page_count, source_kind")
    .eq("id", chapterId)
    .single();
  if (!chapter || chapter.source_kind !== "pdf" || !chapter.pdf_storage_path) {
    return { error: "Ce chapitre n'a pas de PDF source à diviser." };
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
  } catch {
    return { error: "PDF illisible ou introuvable dans le stockage." };
  }

  let pageCount: number;
  try {
    pageCount = chapter.pdf_page_count ?? (await getPdfPageCount(bytes));
  } catch {
    return { error: "PDF illisible." };
  }
  if (pageCount < MIN_PAGES_TO_SPLIT) {
    return { error: `Ce chapitre ne compte que ${pageCount} page(s) — trop court pour être divisé utilement.`, pageCount };
  }

  const targetPartCount = computeTargetSplitPartCount(pageCount);
  if (pageCount > MAX_PAGES_FOR_AI_DETECTION) {
    return {
      error: `Ce chapitre compte ${pageCount} pages — trop pour la suggestion automatique (limite ${MAX_PAGES_FOR_AI_DETECTION}). Utilisez le découpage manuel ci-dessous.`,
      pageCount,
      targetPartCount,
    };
  }

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor pour utiliser la suggestion automatique.", pageCount, targetPartCount };
  }

  let pageTexts: string[];
  try {
    pageTexts = await extractPdfPageTexts(bytes);
  } catch (err) {
    // Surfaces the real pdfjs failure instead of a single generic message
    // for every possible cause — the previous wording ("corrompu, ou trop
    // volumineux") turned out to fire even on a 31-page chapter, which
    // isn't explained by either of those, so the real message is needed to
    // actually diagnose it rather than guess again.
    const detail = err instanceof Error ? err.message : String(err);
    return {
      error: `Échec de la lecture du texte du PDF (${detail}). Utilisez le découpage manuel ci-dessous, ou téléchargez le PDF pour le diviser vous-même.`,
      pageCount,
      targetPartCount,
    };
  }

  try {
    const parts = await suggestChapterSplitPoints(config, chapter.title, pageTexts, targetPartCount);
    if (parts.length === 0) return { error: "Aucun découpage détecté — essayez le mode manuel.", pageCount, targetPartCount };
    return { success: `${parts.length} partie(s) suggérée(s) — à vérifier avant de confirmer.`, suggestions: parts, pageCount, targetPartCount };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la suggestion automatique.", pageCount, targetPartCount };
  }
}

export async function splitChapterIntoParts(chapterId: string, ranges: ChapterSplitRange[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  return doSplitChapterIntoParts(chapterId, ranges);
}

async function doSplitChapterIntoParts(chapterId: string, ranges: ChapterSplitRange[]): Promise<ActionState> {
  const result = await applyChapterSplit(await createClient(), chapterId, ranges);
  if (!result.ok) return { error: result.error };
  revalidatePath("/apps/el-profesor");
  return { success: result.success };
}
