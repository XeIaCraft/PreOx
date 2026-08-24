"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadChapterPdf, deleteChapterPdf } from "@/lib/el-profesor/storage";
import { extractPdfPageTexts } from "@/lib/el-profesor/pdf-text";
import { splitPdfByRanges, getPdfPageCount } from "@/lib/el-profesor/pdf-split";
import { detectChapterBoundaries } from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";

// "Diviser un PDF en chapitres" admin tool (requested 2026-08-24): upload
// the whole book once instead of pre-splitting each chapter into its own
// file by hand before uploading. Two-step flow, both against the same File
// held client-side (never persisted as a standalone "book" object — only
// the resulting per-chapter PDFs are):
//   1. suggestBookChapters (optional) — AI-assisted boundary guesses.
//   2. splitBookIntoChapters (final) — the admin's reviewed/edited ranges,
//      each split into its own PDF and inserted as a chapter.

export interface ActionState {
  error?: string;
  success?: string;
}

export interface ChapterSuggestion {
  title: string;
  startPage: number;
}

export interface ChapterRange {
  title: string;
  startPage: number;
  endPage: number;
}

// Per-page excerpts sent in one prompt (buildChapterSplitPrompt) — bounded
// so the request stays a single reasonably-sized Gemini call; a book past
// this falls back to manual mode (start/end page per chapter, no AI call).
const MAX_PAGES_FOR_AI_DETECTION = 700;

export async function getBookPdfPageCount(file: File): Promise<ActionState & { pageCount?: number }> {
  await requireElProfesorAdmin();
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return { pageCount: await getPdfPageCount(bytes) };
  } catch {
    return { error: "PDF illisible." };
  }
}

export async function suggestBookChapters(file: File): Promise<ActionState & { suggestions?: ChapterSuggestion[]; pageCount?: number }> {
  await requireElProfesorAdmin();
  const bytes = new Uint8Array(await file.arrayBuffer());

  let pageCount: number;
  try {
    pageCount = await getPdfPageCount(bytes);
  } catch {
    return { error: "PDF illisible." };
  }
  if (pageCount > MAX_PAGES_FOR_AI_DETECTION) {
    return {
      error: `Ce livre compte ${pageCount} pages — trop pour la suggestion automatique (limite ${MAX_PAGES_FOR_AI_DETECTION}). Utilisez le découpage manuel ci-dessous.`,
      pageCount,
    };
  }

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor pour utiliser la suggestion automatique.", pageCount };
  }

  const pageTexts = await extractPdfPageTexts(bytes);
  try {
    const chapters = await detectChapterBoundaries(config, pageTexts);
    if (chapters.length === 0) return { error: "Aucun découpage détecté — essayez le mode manuel.", pageCount };
    return { success: `${chapters.length} chapitre(s) suggéré(s) — à vérifier avant de confirmer.`, suggestions: chapters, pageCount };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la suggestion automatique.", pageCount };
  }
}

export async function splitBookIntoChapters(bookId: string, startOrderIndex: number, file: File, chapters: ChapterRange[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (chapters.length === 0) return { error: "Aucun chapitre défini." };
  for (const c of chapters) {
    if (!c.title.trim()) return { error: "Chaque chapitre doit avoir un titre." };
    if (c.startPage < 1 || c.endPage < c.startPage) return { error: `Plage de pages invalide pour « ${c.title} ».` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let parts: Uint8Array[];
  try {
    parts = await splitPdfByRanges(
      bytes,
      chapters.map((c) => ({ startPage: c.startPage, endPage: c.endPage }))
    );
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la division du PDF." };
  }

  const supabase = await createClient();
  const createdChapterIds: string[] = [];
  const uploadedPaths: string[] = [];

  async function rollback() {
    if (createdChapterIds.length > 0) await supabase.from("el_profesor_chapters").delete().in("id", createdChapterIds);
    for (const p of uploadedPaths) await deleteChapterPdf(p).catch(() => {});
  }

  for (let i = 0; i < chapters.length; i++) {
    const chapterId = randomUUID();
    let storagePath: string;
    try {
      storagePath = await uploadChapterPdf(bookId, chapterId, parts[i]);
    } catch {
      await rollback();
      return { error: `Échec de l'envoi du chapitre « ${chapters[i].title} ».` };
    }
    uploadedPaths.push(storagePath);

    const { error } = await supabase.from("el_profesor_chapters").insert({
      id: chapterId,
      book_id: bookId,
      title: chapters[i].title.trim(),
      order_index: startOrderIndex + i,
      pdf_storage_path: storagePath,
      source_kind: "pdf",
      status: "pending",
    });
    if (error) {
      await rollback();
      return { error: "Impossible d'enregistrer les chapitres." };
    }
    createdChapterIds.push(chapterId);
  }

  revalidatePath("/apps/el-profesor");
  return { success: `${chapters.length} chapitre(s) créé(s) depuis le livre. Lancez l'extraction quand vous êtes prêt.` };
}
