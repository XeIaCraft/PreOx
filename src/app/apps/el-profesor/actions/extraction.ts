"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import {
  deleteGeminiFile,
  extractChapterContentWithRotation,
  extractComplementaryContentWithRotation,
  verifyExtraction,
  generateMnemonic,
} from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";
import { getChapterContent } from "@/lib/el-profesor/dal";
import { logContentChange, getContentLog, type ContentLogEntry } from "@/lib/el-profesor/content-log";
import type {
  ExtractionResult,
  ComplementaryResult,
  ExtractedSubEntity,
  VerificationFlag,
  Citation,
  BlockContent,
  FlashcardSide,
  TableBlockContent,
  ProtocolBlockContent,
} from "@/lib/el-profesor/types";

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
  let apiKey = "";

  try {
    const config = await getElProfesorGeminiConfig();

    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
    const { extraction, apiKey: winningKey, model, file } = await extractChapterContentWithRotation(
      config,
      bytes,
      chapter.title,
      chapter.title
    );
    apiKey = winningKey;
    geminiFileName = file.name;

    const verification = await verifyExtraction(apiKey, model, file, extraction).catch(() => ({ flags: [] as VerificationFlag[] }));

    await persistExtraction(chapterId, extraction, verification.flags);

    await supabase
      .from("el_profesor_extraction_jobs")
      .insert({ chapter_id: chapterId, status: "succeeded", raw_output: extraction as unknown as never });
    await supabase
      .from("el_profesor_chapters")
      .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
      .eq("id", chapterId);

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

/** Inserts one sub-entity + its fiche + blocks + flashcards. Shared by the initial and complementary extraction pipelines. */
async function insertNewSubEntity(
  chapterId: string,
  sub: ExtractedSubEntity,
  orderIndex: number,
  blockNeedsReview: (blockIndex: number) => boolean,
  cardNeedsReview: (cardIndex: number) => boolean
): Promise<{ blockCount: number; cardCount: number }> {
  const supabase = await createClient();

  const { data: subEntity, error: subError } = await supabase
    .from("el_profesor_sub_entities")
    .insert({ chapter_id: chapterId, name: sub.name, order_index: orderIndex, summary: sub.summary })
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
    const { error } = await supabase.from("el_profesor_fiche_blocks").insert(
      sub.fiche.blocks.map((block, blockIndex) => ({
        fiche_id: fiche.id,
        order_index: blockIndex,
        block_type: block.block_type,
        content: block.content as unknown as BlockContent as never,
        citations: block.citations as unknown as Citation[] as never,
        needs_review: blockNeedsReview(blockIndex),
        status: "draft",
      }))
    );
    if (error) throw new GeminiError("Échec de l'enregistrement des blocs de contenu.");
  }

  if (sub.fiche.flashcards.length > 0) {
    const { error } = await supabase.from("el_profesor_flashcards").insert(
      sub.fiche.flashcards.map((card, cardIndex) => ({
        fiche_id: fiche.id,
        front: { text: card.front } as FlashcardSide as never,
        back: { text: card.back } as FlashcardSide as never,
        citations: card.citations as unknown as Citation[] as never,
        status: "draft",
        needs_review: cardNeedsReview(cardIndex),
      }))
    );
    if (error) throw new GeminiError("Échec de l'enregistrement des flashcards.");
  }

  return { blockCount: sub.fiche.blocks.length, cardCount: sub.fiche.flashcards.length };
}

async function persistExtraction(chapterId: string, extraction: ExtractionResult, flags: VerificationFlag[]) {
  for (let subIndex = 0; subIndex < extraction.sub_entities.length; subIndex++) {
    const sub = extraction.sub_entities[subIndex];
    await insertNewSubEntity(
      chapterId,
      sub,
      subIndex,
      (blockIndex) => needsReview(flags, subIndex, blockIndex, null),
      (cardIndex) => needsReview(flags, subIndex, null, cardIndex)
    );
  }
}

function blockExcerpt(blockType: string, content: BlockContent): string {
  if (blockType === "tableau_comparatif") {
    const c = content as TableBlockContent;
    return `Tableau : ${(c.headers ?? []).join(" | ")}`;
  }
  if (blockType === "protocole_paliers") {
    const c = content as ProtocolBlockContent;
    return (c.steps ?? []).map((s) => s.label).join(" -> ");
  }
  return ((content as { text?: string }).text ?? "").slice(0, 200);
}

/** Concise summary of what a chapter already covers, sent to Gemini so the gap-fill pass knows what NOT to repeat. */
function buildCoverageSummary(subEntities: Awaited<ReturnType<typeof getChapterContent>>): string {
  const summary = subEntities
    .filter((s) => s.fiche)
    .map((s) => ({
      sub_entity_name: s.name,
      blocks: s.fiche!.blocks.map((b) => ({ block_type: b.blockType, excerpt: blockExcerpt(b.blockType, b.content) })),
      flashcard_fronts: s.fiche!.flashcards.map((c) => c.front.text),
    }));
  return JSON.stringify(summary);
}

async function persistComplementaryAdditions(
  chapterId: string,
  result: ComplementaryResult,
  existingContent: Awaited<ReturnType<typeof getChapterContent>>
): Promise<number> {
  const supabase = await createClient();
  let added = 0;

  const subEntityByName = new Map(existingContent.filter((s) => s.fiche).map((s) => [s.name.trim().toLowerCase(), s]));
  let nextOrder = existingContent.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

  for (const addition of result.additions_for_existing) {
    const match = subEntityByName.get(addition.sub_entity_name.trim().toLowerCase());
    const ficheId = match?.fiche?.id;
    // No confident name match — skip rather than guess where this content belongs;
    // Gemini should have proposed a new sub-entity instead in that case.
    if (!ficheId) continue;

    const blockOffset = match!.fiche!.blocks.length;

    if (addition.blocks.length > 0) {
      const { error } = await supabase.from("el_profesor_fiche_blocks").insert(
        addition.blocks.map((block, i) => ({
          fiche_id: ficheId,
          order_index: blockOffset + i,
          block_type: block.block_type,
          content: block.content as unknown as BlockContent as never,
          citations: block.citations as unknown as Citation[] as never,
          needs_review: true,
          status: "draft",
        }))
      );
      if (error) throw new GeminiError(`Échec de l'enregistrement des blocs complémentaires pour « ${addition.sub_entity_name} ».`);
      added += addition.blocks.length;
    }

    if (addition.flashcards.length > 0) {
      const { error } = await supabase.from("el_profesor_flashcards").insert(
        addition.flashcards.map((card) => ({
          fiche_id: ficheId,
          front: { text: card.front } as FlashcardSide as never,
          back: { text: card.back } as FlashcardSide as never,
          citations: card.citations as unknown as Citation[] as never,
          status: "draft",
          needs_review: true,
        }))
      );
      if (error) throw new GeminiError(`Échec de l'enregistrement des flashcards complémentaires pour « ${addition.sub_entity_name} ».`);
      added += addition.flashcards.length;
    }
  }

  for (const sub of result.new_sub_entities) {
    const counts = await insertNewSubEntity(
      chapterId,
      sub,
      nextOrder++,
      () => true,
      () => true
    );
    added += counts.blockCount + counts.cardCount + 1;
  }

  return added;
}

/**
 * Gap-fill pass: re-reads the chapter's PDF alongside a summary of what's
 * already extracted, and asks Gemini to generate only what's missing —
 * never a duplicate of already-covered content. New content lands as
 * `draft`/`needs_review` under the existing sub-entities (or as new
 * sub-entities), and goes through the same admin review before publication.
 */
export async function extractChapterComplementary(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };
  if (chapter.status === "extracting") return { error: "Une extraction est déjà en cours pour ce chapitre." };
  if (chapter.status === "pending" || chapter.status === "failed") {
    return { error: "Lancez d'abord une extraction initiale avant de chercher des compléments." };
  }

  const originalStatus = chapter.status;
  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  let geminiFileName: string | null = null;
  let apiKey = "";

  try {
    const config = await getElProfesorGeminiConfig();

    const existingContent = await getChapterContent(chapterId, true);
    const coverageSummary = buildCoverageSummary(existingContent);

    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path);
    const { complementary, apiKey: winningKey, file } = await extractComplementaryContentWithRotation(
      config,
      bytes,
      chapter.title,
      chapter.title,
      coverageSummary
    );
    apiKey = winningKey;
    geminiFileName = file.name;
    const addedCount = await persistComplementaryAdditions(chapterId, complementary, existingContent);

    await supabase
      .from("el_profesor_extraction_jobs")
      .insert({ chapter_id: chapterId, status: "succeeded", raw_output: complementary as unknown as never });
    await supabase
      .from("el_profesor_chapters")
      .update({ status: originalStatus, estimated_remaining_passes: complementary.estimated_remaining_passes })
      .eq("id", chapterId);

    revalidatePath("/apps/el-profesor");
    if (addedCount === 0) {
      return { success: "Aucun trou détecté : l'extraction semble déjà complète." };
    }
    return { success: `${addedCount} élément(s) complémentaire(s) ajouté(s) en brouillon — à relire avant publication.` };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de la génération complémentaire.";
    await supabase.from("el_profesor_chapters").update({ status: originalStatus, extraction_error: message }).eq("id", chapterId);
    await supabase.from("el_profesor_extraction_jobs").insert({ chapter_id: chapterId, status: "failed", error: message });
    return { error: message };
  } finally {
    if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
  }
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

function blockToPlainText(blockType: string, content: BlockContent): string {
  if (blockType === "tableau_comparatif") {
    const c = content as TableBlockContent;
    return [(c.headers ?? []).join(" | "), ...(c.rows ?? []).map((r) => r.join(" | "))].join("\n");
  }
  if (blockType === "protocole_paliers") {
    const c = content as ProtocolBlockContent;
    return (c.steps ?? []).map((s, i) => `${i + 1}. ${s.label} — ${s.detail}`).join("\n");
  }
  return (content as { text?: string }).text ?? "";
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
