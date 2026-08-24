"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin, getElProfesorGeminiConfig, getElProfesorAiProvider, getElProfesorClaudeConfig } from "@/lib/el-profesor/dal";
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
import { extractChapterContentClaude, extractComplementaryContentClaude, type ClaudeConfig } from "@/lib/el-profesor/anthropic";
import { GeminiError } from "@/lib/gemini-shared";
import { getChapterContent, getFlashcardVariantStats, type FlashcardVariantStat } from "@/lib/el-profesor/dal";
import { logContentChange, getContentLog, type ContentLogEntry } from "@/lib/el-profesor/content-log";
import { blockToPlainText } from "@/lib/el-profesor/block-text";
import { extractPdfPageTexts, correctExtractionCitations, correctComplementaryCitations } from "@/lib/el-profesor/pdf-text";
import type {
  ExtractionResult,
  ComplementaryResult,
  ExtractedSubEntity,
  ExtractedFicheBlock,
  ExtractedFlashcard,
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

function allNeedReviewFlags(extraction: ExtractionResult): VerificationFlag[] {
  const flags: VerificationFlag[] = [];
  extraction.sub_entities.forEach((sub, subIndex) => {
    sub.fiche.blocks.forEach((_, blockIndex) =>
      flags.push({ sub_entity_index: subIndex, block_index: blockIndex, flashcard_index: null, needs_review: true, reason: "Non vérifié automatiquement." })
    );
    sub.fiche.flashcards.forEach((_, flashcardIndex) =>
      flags.push({ sub_entity_index: subIndex, block_index: null, flashcard_index: flashcardIndex, needs_review: true, reason: "Non vérifié automatiquement." })
    );
  });
  return flags;
}

/**
 * Runs the full extraction pipeline for a chapter: upload to the configured
 * provider, structured extraction, then persists everything as `draft` —
 * nothing here is visible to non-admins until reviewed and published via
 * `publishFiche`/`finalizeChapterPublication`.
 *
 * With Gemini (the default), a verification pass double-checks each
 * block/flashcard against the source PDF and only flags the ones it doubts.
 * With Claude — an alternative provider for when Gemini's quota runs out,
 * chosen from "Réglages IA" — there's no equivalent verification call yet,
 * so every element is conservatively marked needs_review instead.
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
    let extraction: ExtractionResult;
    let flags: VerificationFlag[];
    let verificationFailed = false;
    let providerNote = "";

    if (chapter.source_kind !== "pdf") {
      // Word/PowerPoint source (item 5 of the backlog): no file to attach,
      // no page ground-truth to verify against, so this always goes through
      // Gemini's text-only path regardless of the configured provider —
      // Claude's own extraction function is PDF-bytes-only, and adding a
      // second text-only provider path isn't worth it for this source kind.
      const config = await getElProfesorGeminiConfig();
      const { extraction: textExtraction } = await extractChapterContentFromTextWithRotation(config, chapter.title, chapter.source_text ?? "");
      extraction = textExtraction;
      flags = allNeedReviewFlags(extraction);
      providerNote = " Chaque élément est marqué « à vérifier » (pas de document source à vérifier automatiquement pour un import Word/PowerPoint).";

      await persistExtraction(chapterId, extraction, flags);
      await supabase.from("el_profesor_extraction_jobs").insert({ chapter_id: chapterId, status: "succeeded", raw_output: extraction as unknown as never });
      await supabase
        .from("el_profesor_chapters")
        .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
        .eq("id", chapterId);

      revalidatePath("/apps/el-profesor");
      return { success: "Extraction terminée. Relisez le contenu généré avant publication." + providerNote };
    }

    const provider = await getElProfesorAiProvider();
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);

    if (provider === "claude") {
      const claudeConfig = await getElProfesorClaudeConfig();
      const [claudeExtraction, pageTexts] = await Promise.all([
        extractChapterContentClaude(claudeConfig, bytes, chapter.title),
        extractPdfPageTexts(bytes).catch(() => null),
      ]);
      extraction = claudeExtraction;
      if (pageTexts) correctExtractionCitations(extraction, pageTexts);
      flags = allNeedReviewFlags(extraction);
    } else {
      const config = await getElProfesorGeminiConfig();
      const [{ extraction: geminiExtraction, apiKey: winningKey, model, file }, pageTexts] = await Promise.all([
        extractChapterContentWithRotation(config, bytes, chapter.title, chapter.title),
        extractPdfPageTexts(bytes).catch(() => null),
      ]);
      extraction = geminiExtraction;
      apiKey = winningKey;
      geminiFileName = file.name;

      // Ground-truth-corrects citation pages against the PDF's actual text
      // when possible (best-effort — null on a malformed/unparseable file,
      // in which case citations are left exactly as the model produced them).
      if (pageTexts) correctExtractionCitations(extraction, pageTexts);

      const verification = await verifyExtraction(apiKey, model, file, extraction).catch(() => {
        verificationFailed = true;
        return { flags: [] as VerificationFlag[] };
      });
      flags = verification.flags;
    }

    await persistExtraction(chapterId, extraction, flags);

    await supabase
      .from("el_profesor_extraction_jobs")
      .insert({ chapter_id: chapterId, status: "succeeded", raw_output: extraction as unknown as never });
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
          : "") +
        (provider === "claude" ? " Chaque élément est marqué « à vérifier » (pas de passe de vérification automatique avec Claude)." : ""),
    };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de l'extraction du chapitre.";
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await supabase.from("el_profesor_extraction_jobs").insert({ chapter_id: chapterId, status: "failed", error: message });
    return { error: message };
  } finally {
    if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
  }
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
function parseImportedExtraction(raw: string): ExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new GeminiError("JSON invalide — vérifiez que vous avez bien copié toute la réponse, sans texte avant ou après.");
  }
  const subEntitiesRaw = (parsed as { sub_entities?: unknown } | null)?.sub_entities;
  if (!Array.isArray(subEntitiesRaw) || subEntitiesRaw.length === 0) {
    throw new GeminiError("Le JSON doit contenir un tableau « sub_entities » non vide.");
  }

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

  return { sub_entities, estimated_remaining_passes };
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
  try {
    extraction = parseImportedExtraction(rawJson);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "JSON invalide." };
  }

  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  try {
    if (chapter.source_kind === "pdf") {
      const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
      const pageTexts = await extractPdfPageTexts(bytes).catch(() => null);
      if (pageTexts) correctExtractionCitations(extraction, pageTexts);
    }
    // Word/PowerPoint chapters have no PDF to ground-truth-correct citations
    // against — the pasted JSON's citations (page: 0, verbatim quote) are
    // kept exactly as provided.

    await persistExtraction(chapterId, extraction, allNeedReviewFlags(extraction));

    await supabase
      .from("el_profesor_extraction_jobs")
      .insert({ chapter_id: chapterId, status: "succeeded", raw_output: extraction as unknown as never });
    await supabase
      .from("el_profesor_chapters")
      .update({ status: "draft_ready", estimated_remaining_passes: extraction.estimated_remaining_passes })
      .eq("id", chapterId);

    revalidatePath("/apps/el-profesor");
    return { success: "Contenu importé. Chaque élément est marqué « à vérifier » — relisez-le avant publication." };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de l'import.";
    await supabase.from("el_profesor_chapters").update({ status: "failed", extraction_error: message }).eq("id", chapterId);
    await supabase.from("el_profesor_extraction_jobs").insert({ chapter_id: chapterId, status: "failed", error: message });
    return { error: message };
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
        suggested_image_page: card.suggested_image_page ?? null,
        suggested_image_hint: card.suggested_image_hint ?? null,
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
          suggested_image_page: card.suggested_image_page ?? null,
          suggested_image_hint: card.suggested_image_hint ?? null,
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

type ProviderConfig =
  | { provider: "gemini"; config: Awaited<ReturnType<typeof getElProfesorGeminiConfig>> }
  | { provider: "claude"; config: ClaudeConfig };

/**
 * Gap-fill pass: re-reads the chapter's PDF alongside a summary of what's
 * already extracted, and asks the configured provider (Gemini by default,
 * or Claude — see "Réglages IA") to generate only what's missing — never a
 * duplicate of already-covered content. New content lands as
 * `draft`/`needs_review` under the existing sub-entities (or as new
 * sub-entities), and goes through the same admin review before publication.
 */
/** Runs exactly one complementary pass. Throws on API/persist failure — caller handles status/job bookkeeping. */
async function runOneComplementaryPass(
  chapterId: string,
  chapter: { title: string },
  providerConfig: ProviderConfig,
  bytes: Uint8Array,
  existingContent: Awaited<ReturnType<typeof getChapterContent>>,
  pageTexts: string[] | null
): Promise<{ addedCount: number; estimatedRemainingPasses: number | null }> {
  const coverageSummary = buildCoverageSummary(existingContent);
  let geminiFileName: string | null = null;
  let apiKey = "";
  try {
    let complementary: ComplementaryResult;
    if (providerConfig.provider === "claude") {
      complementary = await extractComplementaryContentClaude(providerConfig.config, bytes, chapter.title, coverageSummary);
    } else {
      const result = await extractComplementaryContentWithRotation(providerConfig.config, bytes, chapter.title, chapter.title, coverageSummary);
      complementary = result.complementary;
      apiKey = result.apiKey;
      geminiFileName = result.file.name;
    }
    if (pageTexts) correctComplementaryCitations(complementary, pageTexts);
    // Already conservative regardless of provider — persistComplementaryAdditions
    // marks every gap-fill addition needs_review unconditionally (see below).
    const addedCount = await persistComplementaryAdditions(chapterId, complementary, existingContent);

    const supabase = await createClient();
    await supabase
      .from("el_profesor_extraction_jobs")
      .insert({ chapter_id: chapterId, status: "succeeded", raw_output: complementary as unknown as never });

    return { addedCount, estimatedRemainingPasses: complementary.estimated_remaining_passes };
  } finally {
    if (geminiFileName) await deleteGeminiFile(apiKey, geminiFileName);
  }
}

// Safety cap on auto-run passes — each pass is a real (costly, slow) Gemini
// call, so "until complete" still stops well short of runaway spend if the
// model keeps reporting non-zero remaining passes indefinitely.
const MAX_AUTO_COMPLEMENTARY_PASSES = 6;

/**
 * Gap-fill pass(es). By default runs a single pass (unchanged behavior). With
 * `untilComplete: true`, loops automatically — re-downloading the latest
 * persisted content between passes — until the model reports no remaining
 * gaps, a pass adds nothing new, or the safety cap is hit.
 */
export async function extractChapterComplementary(chapterId: string, options?: { untilComplete?: boolean }): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };
  if (chapter.status === "extracting") return { error: "Une extraction est déjà en cours pour ce chapitre." };
  if (chapter.status === "pending" || chapter.status === "failed") {
    return { error: "Lancez d'abord une extraction initiale avant de chercher des compléments." };
  }
  if (chapter.source_kind !== "pdf") {
    return { error: "Pas de passe de complément pour un chapitre Word/PowerPoint (pas de fichier source à relire) — le texte a déjà été extrait en une seule fois." };
  }

  const originalStatus = chapter.status;
  await supabase.from("el_profesor_chapters").update({ status: "extracting", extraction_error: null }).eq("id", chapterId);

  try {
    const provider = await getElProfesorAiProvider();
    const providerConfig: ProviderConfig =
      provider === "claude" ? { provider: "claude", config: await getElProfesorClaudeConfig() } : { provider: "gemini", config: await getElProfesorGeminiConfig() };
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
    // Extracted once and reused across every auto-run pass (see below) rather than per pass.
    const pageTexts = await extractPdfPageTexts(bytes).catch(() => null);

    let totalAdded = 0;
    let passesRun = 0;
    let estimatedRemainingPasses: number | null = null;
    const maxPasses = options?.untilComplete ? MAX_AUTO_COMPLEMENTARY_PASSES : 1;

    do {
      const existingContent = await getChapterContent(chapterId, true);
      const pass = await runOneComplementaryPass(chapterId, chapter, providerConfig, bytes, existingContent, pageTexts);
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
    await supabase.from("el_profesor_extraction_jobs").insert({ chapter_id: chapterId, status: "failed", error: message });
    return { error: message };
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
  } catch {
    return { error: "Échec de l'envoi de l'image." };
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
