"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import { getElProfesorGeminiApiKey } from "@/lib/supabase/env";
import {
  uploadPdfToGemini,
  deleteGeminiFile,
  extractChapterContent,
  verifyExtraction,
  EL_PROFESOR_GEMINI_MODEL,
} from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";
import type { ExtractionResult, VerificationFlag, Citation, BlockContent, FlashcardSide } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

function needsReview(flags: VerificationFlag[], subEntityIndex: number, blockIndex: number | null, flashcardIndex: number | null) {
  return flags.some(
    (f) =>
      f.sub_entity_index === subEntityIndex &&
      (blockIndex !== null ? f.block_index === blockIndex : f.flashcard_index === flashcardIndex)
  );
}

/**
 * Runs the full extraction pipeline for a chapter: upload to Gemini,
 * structured extraction, verification pass, then persists everything as
 * `draft` — nothing here is visible to non-admins until reviewed and
 * published via `publishFiche`/`finalizeChapterPublication`.
 */
export async function extractChapter(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };
  if (chapter.status === "extracting") return { error: "Une extraction est déjà en cours pour ce chapitre." };

  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  let geminiFileName: string | null = null;
  const apiKey = getElProfesorGeminiApiKey();

  try {
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
    const file = await uploadPdfToGemini(apiKey, bytes, chapter.title);
    geminiFileName = file.name;

    const extraction = await extractChapterContent(apiKey, EL_PROFESOR_GEMINI_MODEL, file, chapter.title);
    const verification = await verifyExtraction(apiKey, EL_PROFESOR_GEMINI_MODEL, file, extraction).catch(
      () => ({ flags: [] as VerificationFlag[] })
    );

    await persistExtraction(chapterId, extraction, verification.flags);

    await supabase
      .from("el_profesor_extraction_jobs")
      .insert({ chapter_id: chapterId, status: "succeeded", raw_output: extraction as unknown as never });
    await supabase.from("el_profesor_chapters").update({ status: "draft_ready" }).eq("id", chapterId);

    revalidatePath("/apps/el-profesor");
    return { success: "Extraction terminée. Relisez le contenu généré avant publication." };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de l'extraction du chapitre.";
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await supabase.from("el_profesor_extraction_jobs").insert({ chapter_id: chapterId, status: "failed", error: message });
    return { error: message };
  } finally {
    if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
  }
}

async function persistExtraction(chapterId: string, extraction: ExtractionResult, flags: VerificationFlag[]) {
  const supabase = await createClient();

  for (let subIndex = 0; subIndex < extraction.sub_entities.length; subIndex++) {
    const sub = extraction.sub_entities[subIndex];

    const { data: subEntity, error: subError } = await supabase
      .from("el_profesor_sub_entities")
      .insert({ chapter_id: chapterId, name: sub.name, order_index: subIndex, summary: sub.summary })
      .select("id")
      .single();
    if (subError || !subEntity) throw new GeminiError(`Échec de l'enregistrement de « ${sub.name} ».`);

    const { data: fiche, error: ficheError } = await supabase
      .from("el_profesor_fiches")
      .insert({ sub_entity_id: subEntity.id, title: sub.fiche.title, status: "draft" })
      .select("id")
      .single();
    if (ficheError || !fiche) throw new GeminiError(`Échec de l'enregistrement de la fiche « ${sub.fiche.title} ».`);

    if (sub.fiche.blocks.length > 0) {
      const { error: blocksError } = await supabase.from("el_profesor_fiche_blocks").insert(
        sub.fiche.blocks.map((block, blockIndex) => ({
          fiche_id: fiche.id,
          order_index: blockIndex,
          block_type: block.block_type,
          content: block.content as unknown as BlockContent as never,
          citations: block.citations as unknown as Citation[] as never,
          needs_review: needsReview(flags, subIndex, blockIndex, null),
        }))
      );
      if (blocksError) throw new GeminiError("Échec de l'enregistrement des blocs de contenu.");
    }

    if (sub.fiche.flashcards.length > 0) {
      const { error: cardsError } = await supabase.from("el_profesor_flashcards").insert(
        sub.fiche.flashcards.map((card, cardIndex) => ({
          fiche_id: fiche.id,
          front: { text: card.front } as FlashcardSide as never,
          back: { text: card.back } as FlashcardSide as never,
          citations: card.citations as unknown as Citation[] as never,
          status: "draft",
          needs_review: needsReview(flags, subIndex, null, cardIndex),
        }))
      );
      if (cardsError) throw new GeminiError("Échec de l'enregistrement des flashcards.");
    }
  }
}

export async function publishFiche(ficheId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error: ficheError } = await supabase.from("el_profesor_fiches").update({ status: "published" }).eq("id", ficheId);
  if (ficheError) return { error: "Impossible de publier la fiche." };

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
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("el_profesor_fiche_blocks")
    .update({ content: input.content as never, citations: input.citations as never, needs_review: false })
    .eq("id", blockId);
  if (error) return { error: "Impossible de mettre à jour ce bloc." };

  revalidatePath("/apps/el-profesor");
  return { success: "Bloc mis à jour." };
}

export async function updateFlashcard(
  flashcardId: string,
  input: { front: FlashcardSide; back: FlashcardSide; citations: Citation[] }
): Promise<ActionState> {
  await requireElProfesorAdmin();
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

  revalidatePath("/apps/el-profesor");
  return { success: "Flashcard mise à jour." };
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
