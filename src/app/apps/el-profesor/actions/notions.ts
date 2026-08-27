"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireElProfesorAdmin,
  getElProfesorGeminiConfig,
  getElProfesorAiProvider,
  getChapterContent,
  getFicheTextForAI,
  getAllNotionNames,
  findOrCreateNotion,
  linkFicheToNotion,
  unlinkFicheFromNotion,
  getNotionSummaries,
  getSynthesisSourceBlocks,
} from "@/lib/el-profesor/dal";
import { categorizeFicheNotions, checkContradiction, generateNotionSynthesisContent, BLOCK_TYPES } from "@/lib/el-profesor/gemini";
import { submitNotionCategorizationBatch, submitContradictionCheckBatch } from "./batches";
import { GeminiError } from "@/lib/gemini-shared";
import type { SynthesisCitation, BlockContent } from "@/lib/el-profesor/types";
import type { SynthesisSourceBlock } from "@/lib/el-profesor/dal/notions";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Tags every published fiche of a chapter with 1-3 cross-book "notions"
 * (reusing existing ones when they fit — see buildNotionCategorizationPrompt).
 * Admin-triggered per chapter rather than automatic on publish, to keep AI
 * calls (and their cost) predictable. With Claude selected in "Réglages IA"
 * this is exactly the kind of bulk, non-urgent "réunification" work the
 * cheaper async Message Batches API is for — see submitNotionCategorizationBatch.
 */
export async function categorizeChapterNotions(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();

  const provider = await getElProfesorAiProvider();
  if (provider === "claude") {
    return submitNotionCategorizationBatch(chapterId);
  }

  const subEntities = await getChapterContent(chapterId, false);
  const fiches = subEntities.filter((s) => s.fiche).map((s) => s.fiche!);
  if (fiches.length === 0) return { error: "Aucune fiche publiée dans ce chapitre à catégoriser." };

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor." };
  }

  let taggedCount = 0;
  try {
    // Fetched once rather than re-reading the whole notions table on every
    // fiche — a notion created earlier in this same loop is appended below
    // so later fiches can still reuse it, without a fresh full-table read
    // per iteration (this ran once per fiche before, an easy N+1 for a
    // chapter with many fiches).
    const existingNames = await getAllNotionNames();
    for (const fiche of fiches) {
      const content = await getFicheTextForAI(fiche.id);
      if (!content || !content.text.trim()) continue;

      const result = await categorizeFicheNotions(config, content.title, content.text, existingNames);

      for (const notionName of result.notions.slice(0, 3)) {
        const notionId = await findOrCreateNotion(notionName);
        if (notionId && !existingNames.some((n) => n.toLowerCase() === notionName.trim().toLowerCase())) existingNames.push(notionName.trim());
        if (notionId) await linkFicheToNotion(notionId, fiche.id);
      }
      taggedCount += 1;
    }
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la catégorisation par notions." };
  }

  revalidatePath("/apps/el-profesor/notions");
  return { success: `${taggedCount} fiche(s) catégorisée(s).` };
}

// Bounds the number of Gemini calls a single click can trigger — contradiction
// checking is O(pairs), which grows fast once a notion links many fiches.
const MAX_CONTRADICTION_PAIRS_PER_RUN = 15;

/**
 * Compares every pair of fiches linked to a notion (skipping pairs already
 * checked — the unique constraint on el_profesor_contradictions makes a
 * duplicate insert a no-op we can safely ignore) and records the ones Gemini
 * flags as factually contradictory, for admin arbitration.
 */
export async function detectContradictionsForNotion(notionId: string): Promise<ActionState> {
  await requireElProfesorAdmin();

  const provider = await getElProfesorAiProvider();
  if (provider === "claude") {
    return submitContradictionCheckBatch(notionId);
  }

  const summaries = await getNotionSummaries();
  const summary = summaries.find((s) => s.notion.id === notionId);
  if (!summary) return { error: "Notion introuvable." };
  if (summary.fiches.length < 2) return { error: "Il faut au moins 2 fiches liées à cette notion pour comparer." };

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor." };
  }

  const supabase = await createClient();
  const pairs: [string, string][] = [];
  for (let i = 0; i < summary.fiches.length; i++) {
    for (let j = i + 1; j < summary.fiches.length; j++) {
      pairs.push([summary.fiches[i].ficheId, summary.fiches[j].ficheId]);
      if (pairs.length >= MAX_CONTRADICTION_PAIRS_PER_RUN) break;
    }
    if (pairs.length >= MAX_CONTRADICTION_PAIRS_PER_RUN) break;
  }

  let checkedCount = 0;
  // AI calls stay sequential (one per pair) — only the resulting
  // contradiction rows are batched into a single upsert after the loop.
  const contradictions: { notion_id: string; fiche_id_a: string; fiche_id_b: string; explanation: string }[] = [];
  try {
    for (const [ficheIdA, ficheIdB] of pairs) {
      const [contentA, contentB] = await Promise.all([getFicheTextForAI(ficheIdA), getFicheTextForAI(ficheIdB)]);
      if (!contentA?.text.trim() || !contentB?.text.trim()) continue;

      const result = await checkContradiction(config, summary.notion.name, contentA.title, contentA.text, contentB.title, contentB.text);
      checkedCount += 1;
      if (!result.contradictory || !result.explanation.trim()) continue;

      contradictions.push({ notion_id: notionId, fiche_id_a: ficheIdA, fiche_id_b: ficheIdB, explanation: result.explanation });
    }
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la détection de contradictions." };
  }

  let foundCount = 0;
  if (contradictions.length > 0) {
    // ignoreDuplicates instead of a plain insert: a pair already flagged by
    // an earlier run hits the (notion_id, fiche_id_a, fiche_id_b) unique
    // constraint and should be silently skipped, not fail the whole batch.
    const { data: inserted, error } = await supabase
      .from("el_profesor_contradictions")
      .upsert(contradictions, { onConflict: "notion_id,fiche_id_a,fiche_id_b", ignoreDuplicates: true })
      .select("id");
    if (!error) foundCount = inserted?.length ?? 0;
  }

  revalidatePath("/apps/el-profesor/notions");
  const truncated = summary.fiches.length * (summary.fiches.length - 1) / 2 > MAX_CONTRADICTION_PAIRS_PER_RUN;
  return {
    success:
      `${checkedCount} paire(s) comparée(s), ${foundCount} contradiction(s) trouvée(s).` +
      (truncated ? ` Limite de ${MAX_CONTRADICTION_PAIRS_PER_RUN} paires atteinte — relancez pour continuer.` : ""),
  };
}

export async function resolveContradiction(id: string, resolutionNote: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_contradictions")
    .update({ status: "resolved", resolution_note: resolutionNote.trim(), resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq("id", id);
  if (error) return { error: "Impossible de marquer cette contradiction comme résolue." };

  revalidatePath("/apps/el-profesor/notions");
  return { success: "Marquée comme résolue." };
}

export async function dismissContradiction(id: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_contradictions")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq("id", id);
  if (error) return { error: "Impossible d'ignorer cette contradiction." };

  revalidatePath("/apps/el-profesor/notions");
  return { success: "Ignorée." };
}

/**
 * Marks a fiche as merged into (reason "duplicate") or replaced by (reason
 * "outdated") another one — items 52/56 of the backlog. The superseded
 * fiche's flashcards drop out of every review queue immediately; its
 * content stays in place (readable, with a banner) rather than being
 * deleted, so the merge/supersede is always reversible via clearFicheSuperseded.
 */
export async function markFicheSuperseded(
  ficheId: string,
  supersededByFicheId: string,
  reason: "duplicate" | "outdated",
  note: string
): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (ficheId === supersededByFicheId) return { error: "Une fiche ne peut pas remplacer elle-même." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_fiches")
    .update({ superseded_by_fiche_id: supersededByFicheId, superseded_reason: reason, superseded_note: note.trim() })
    .eq("id", ficheId);
  if (error) return { error: "Impossible de marquer cette fiche." };

  revalidatePath("/apps/el-profesor/notions");
  return { success: reason === "duplicate" ? "Fiches fusionnées." : "Fiche marquée comme remplacée." };
}

export async function clearFicheSuperseded(ficheId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_fiches")
    .update({ superseded_by_fiche_id: null, superseded_reason: null, superseded_note: "" })
    .eq("id", ficheId);
  if (error) return { error: "Impossible d'annuler ce statut." };

  revalidatePath("/apps/el-profesor/notions");
  return { success: "Fiche réactivée." };
}

export async function renameNotion(notionId: string, name: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom ne peut pas être vide." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notions").update({ name: trimmed }).eq("id", notionId);
  if (error) return { error: error.code === "23505" ? "Une notion porte déjà ce nom." : "Impossible de renommer cette notion." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Notion renommée." };
}

/**
 * Manual correction to a notion's grouping (requested 2026-08-27 — the AI
 * categorization pass is a useful first draft but "il y a beaucoup de
 * mouvement et rename à faire pour faire ce que j'ai en tête" needs a
 * direct escape hatch, not another AI call). Appends at the end of the
 * notion's manual fiche order — same no-op-if-already-linked behavior as
 * the AI categorization path (see linkFicheToNotion).
 */
export async function addFicheToNotion(notionId: string, ficheId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  await linkFicheToNotion(notionId, ficheId);

  revalidatePath(`/apps/el-profesor/notions/${notionId}`);
  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Fiche ajoutée à la notion." };
}

/** Removes a fiche from a notion without touching the fiche itself — the inverse of addFicheToNotion. */
export async function removeFicheFromNotion(notionId: string, ficheId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  await unlinkFicheFromNotion(notionId, ficheId);

  revalidatePath(`/apps/el-profesor/notions/${notionId}`);
  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Fiche retirée de la notion." };
}

/**
 * Notion categories (requested 2026-08-26) — a flat, manually-ordered
 * grouping for the notion list, same "purely organizational, no AI"
 * pattern as every other manual-order tool in this module. Deleting a
 * category never deletes its notions (the FK is `on delete set null`) —
 * they just fall back to "sans catégorie".
 */
export async function createNotionCategory(name: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom ne peut pas être vide." };

  const supabase = await createClient();
  const { data: last } = await supabase.from("el_profesor_notion_categories").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const position = (last?.position ?? -1) + 1;
  const { error } = await supabase.from("el_profesor_notion_categories").insert({ name: trimmed, position });
  if (error) return { error: error.code === "23505" ? "Une catégorie porte déjà ce nom." : "Impossible de créer cette catégorie." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Catégorie créée." };
}

export async function renameNotionCategory(categoryId: string, name: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom ne peut pas être vide." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notion_categories").update({ name: trimmed }).eq("id", categoryId);
  if (error) return { error: error.code === "23505" ? "Une catégorie porte déjà ce nom." : "Impossible de renommer cette catégorie." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Catégorie renommée." };
}

export async function deleteNotionCategory(categoryId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notion_categories").delete().eq("id", categoryId);
  if (error) return { error: "Impossible de supprimer cette catégorie." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Catégorie supprimée — ses notions restent, désormais sans catégorie." };
}

/** Assigns (or clears, with `categoryId: null`) a notion's category. */
export async function assignNotionCategory(notionId: string, categoryId: string | null): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notions").update({ category_id: categoryId }).eq("id", notionId);
  if (error) return { error: "Impossible d'assigner cette catégorie." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Catégorie mise à jour." };
}

/** Reorders the category list itself — swaps this category's manual position with its previous/next sibling. No-op at either end. */
export async function moveNotionCategory(categoryId: string, direction: "up" | "down"): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: categories } = await supabase.from("el_profesor_notion_categories").select("id, position").order("position", { ascending: true });
  const list = categories ?? [];
  const index = list.findIndex((c) => c.id === categoryId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return { success: "OK" };
  }

  const current = list[index];
  const target = list[targetIndex];
  const [error1, error2] = await Promise.all([
    supabase.from("el_profesor_notion_categories").update({ position: target.position }).eq("id", current.id).then((r) => r.error),
    supabase.from("el_profesor_notion_categories").update({ position: current.position }).eq("id", target.id).then((r) => r.error),
  ]);
  if (error1 || error2) return { error: "Impossible de réordonner cette catégorie." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Catégorie déplacée." };
}

/**
 * Reorders the notions list itself (requested 2026-08-26) — swaps this
 * notion's manual position with its previous/next sibling *within the same
 * category* (including "sans catégorie" as its own group) — scoping to the
 * global list instead would let a swap land on a notion from a different
 * category, invisible in the grouped display and confusing to click. No-op
 * at either end.
 */
export async function moveNotion(notionId: string, direction: "up" | "down"): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: self } = await supabase.from("el_profesor_notions").select("category_id").eq("id", notionId).maybeSingle();
  if (!self) return { error: "Notion introuvable." };

  let query = supabase.from("el_profesor_notions").select("id, position").order("position", { ascending: true });
  query = self.category_id ? query.eq("category_id", self.category_id) : query.is("category_id", null);
  const { data: notions } = await query;
  const list = notions ?? [];
  const index = list.findIndex((n) => n.id === notionId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return { success: "OK" };
  }

  const current = list[index];
  const target = list[targetIndex];
  const [error1, error2] = await Promise.all([
    supabase.from("el_profesor_notions").update({ position: target.position }).eq("id", current.id).then((r) => r.error),
    supabase.from("el_profesor_notions").update({ position: current.position }).eq("id", target.id).then((r) => r.error),
  ]);
  if (error1 || error2) return { error: "Impossible de réordonner cette notion." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Notion déplacée." };
}

/**
 * Reorders the fiches listed under a notion (requested 2026-08-26) — swaps
 * this fiche's manual position with its previous/next sibling within the
 * same notion. No-op at either end, same pattern as moveSubEntity/moveFicheBlock.
 */
export async function moveNotionFiche(notionId: string, ficheId: string, direction: "up" | "down"): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("el_profesor_notion_links")
    .select("id, fiche_id, position")
    .eq("notion_id", notionId)
    .order("position", { ascending: true });
  const list = links ?? [];
  const index = list.findIndex((l) => l.fiche_id === ficheId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return { success: "OK" };
  }

  const current = list[index];
  const target = list[targetIndex];
  const [error1, error2] = await Promise.all([
    supabase.from("el_profesor_notion_links").update({ position: target.position }).eq("id", current.id).then((r) => r.error),
    supabase.from("el_profesor_notion_links").update({ position: current.position }).eq("id", target.id).then((r) => r.error),
  ]);
  if (error1 || error2) return { error: "Impossible de réordonner cette fiche." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Fiche déplacée." };
}

/**
 * Closes the loop from a contradiction finding straight to obsolescence
 * (item 55): resolving in favor of one fiche marks the other as replaced by
 * it, in one action instead of two separate screens.
 */
export async function resolveContradictionAndSupersede(
  contradictionId: string,
  supersededFicheId: string,
  replacementFicheId: string,
  note: string
): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error: ficheError } = await supabase
    .from("el_profesor_fiches")
    .update({ superseded_by_fiche_id: replacementFicheId, superseded_reason: "outdated", superseded_note: note.trim() })
    .eq("id", supersededFicheId);
  if (ficheError) return { error: "Impossible de marquer la fiche remplacée." };

  const { error } = await supabase
    .from("el_profesor_contradictions")
    .update({
      status: "resolved",
      resolution_note: note.trim() || "Fiche obsolète remplacée par la plus récente.",
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
    })
    .eq("id", contradictionId);
  if (error) return { error: "Fiche marquée, mais impossible de résoudre la contradiction." };

  revalidatePath("/apps/el-profesor/notions");
  return { success: "Fiche remplacée et contradiction résolue." };
}

/**
 * Real cross-book fusion (requested 2026-08-26 — the notion glossary had
 * only ever cross-linked separate fiches, never actually merged their
 * content, so reading a notion still meant opening every book one by one).
 * Reads every published block across the library tagged with this notion
 * and rewrites it via Gemini as one deduplicated fiche. Every synthesized
 * block's citations are resolved from the ACTUAL source blocks the model
 * pointed to (see buildNotionSynthesisPrompt) — never trusted from the
 * model itself, and a block whose citations can't be resolved to a real
 * source is dropped rather than kept with fabricated provenance. Always
 * lands as "draft" — an admin reviews and publishes explicitly, same as
 * every other AI-generated content in this module.
 */
export async function generateNotionSynthesis(notionId: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: notion } = await supabase.from("el_profesor_notions").select("name").eq("id", notionId).maybeSingle();
  if (!notion) return { error: "Notion introuvable." };

  const { ficheIds, sourceBlocks } = await getSynthesisSourceBlocks(notionId);
  if (sourceBlocks.length === 0) return { error: "Aucun contenu publié à synthétiser pour cette notion." };

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor." };
  }

  try {
    const { sections: rawSections, model } = await generateNotionSynthesisContent(
      config,
      notion.name,
      sourceBlocks.map((b) => ({ id: b.sourceBlockId, bookTitle: b.bookTitle, chapterTitle: b.chapterTitle, ficheTitle: b.ficheTitle, blockType: b.blockType, text: b.text }))
    );

    const blockById = new Map(sourceBlocks.map((b) => [b.sourceBlockId, b]));
    let orderIndex = 0;
    const resolvedBlocks: { order_index: number; section_title: string; block_type: string; content: BlockContent; citations: SynthesisCitation[]; source_fiche_ids: string[] }[] = [];
    for (const section of rawSections) {
      const sectionTitle = typeof section.title === "string" ? section.title.trim() : "";
      if (!sectionTitle || !Array.isArray(section.blocks)) continue;
      for (const rb of section.blocks) {
        if (!BLOCK_TYPES.includes(rb.block_type) || !rb.content || typeof rb.content !== "object" || !Array.isArray(rb.source_block_ids)) continue;
        const contributing = rb.source_block_ids
          .map((id) => blockById.get(id))
          .filter((b): b is SynthesisSourceBlock => Boolean(b));
        const citations: SynthesisCitation[] = contributing.flatMap((b) => b.citations);
        // A block the model claimed but that resolves to zero real source
        // citations means every source_block_id it gave was invalid — drop
        // it rather than persist a block with fabricated provenance.
        if (citations.length === 0) continue;
        const sourceFicheIds = [...new Set(contributing.map((b) => b.ficheId))];
        resolvedBlocks.push({ order_index: orderIndex++, section_title: sectionTitle, block_type: rb.block_type, content: rb.content, citations, source_fiche_ids: sourceFicheIds });
      }
    }

    if (resolvedBlocks.length === 0) {
      throw new GeminiError("La synthèse générée n'a produit aucun bloc exploitable (citations introuvables) — réessayez.");
    }

    // Exhaustiveness check (2026-08-27, in response to "on ne doit pas avoir
    // de perte d'informations") — never trust the model's own coverage
    // claim: recompute, from the source_block_ids it actually resolved,
    // which of the source blocks it was given were never cited by any
    // synthesis block. Surfaced to the admin rather than silently dropped.
    const citedSourceBlockIds = new Set(
      rawSections.flatMap((s) => (Array.isArray(s.blocks) ? s.blocks : [])).flatMap((b) => (Array.isArray(b.source_block_ids) ? b.source_block_ids : []))
    );
    const uncoveredSources = sourceBlocks
      .filter((b) => !citedSourceBlockIds.has(b.sourceBlockId))
      .map((b) => ({ ficheId: b.ficheId, ficheTitle: b.ficheTitle, bookTitle: b.bookTitle, chapterTitle: b.chapterTitle }));

    const { data: synthesisRow, error: upsertError } = await supabase
      .from("el_profesor_notion_syntheses")
      .upsert(
        {
          notion_id: notionId,
          status: "draft",
          source_fiche_ids: ficheIds,
          model,
          generated_at: new Date().toISOString(),
          generated_by: profile.id,
          error: null,
          uncovered_sources: uncoveredSources as unknown as never,
        },
        { onConflict: "notion_id" }
      )
      .select("id")
      .single();
    if (upsertError || !synthesisRow) return { error: "Échec de l'enregistrement de la synthèse." };

    await supabase.from("el_profesor_notion_synthesis_blocks").delete().eq("synthesis_id", synthesisRow.id);
    const { error: insertError } = await supabase.from("el_profesor_notion_synthesis_blocks").insert(
      resolvedBlocks.map((b) => ({
        synthesis_id: synthesisRow.id,
        order_index: b.order_index,
        section_title: b.section_title,
        block_type: b.block_type,
        content: b.content as unknown as BlockContent as never,
        citations: b.citations as unknown as SynthesisCitation[] as never,
        source_fiche_ids: b.source_fiche_ids,
      }))
    );
    if (insertError) return { error: "Synthèse générée mais échec de l'enregistrement des blocs." };

    revalidatePath(`/apps/el-profesor/notions/${notionId}`);
    revalidatePath("/apps/el-profesor/notions");
    revalidatePath("/apps/el-profesor/glossary");
    revalidatePath("/apps/el-profesor");
    const coverageNote = uncoveredSources.length > 0 ? ` — ${uncoveredSources.length} source(s) non reprise(s), à vérifier` : "";
    return { success: `Synthèse générée (${resolvedBlocks.length} bloc(s))${coverageNote} — à relire avant publication.` };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "Échec de la génération de la synthèse.";
    await supabase.from("el_profesor_notion_syntheses").upsert({ notion_id: notionId, source_fiche_ids: ficheIds, error: message }, { onConflict: "notion_id" });
    return { error: message };
  }
}

export async function publishNotionSynthesis(notionId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notion_syntheses").update({ status: "published" }).eq("notion_id", notionId);
  if (error) return { error: "Impossible de publier la synthèse." };
  revalidatePath(`/apps/el-profesor/notions/${notionId}`);
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Synthèse publiée." };
}

export async function unpublishNotionSynthesis(notionId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notion_syntheses").update({ status: "draft" }).eq("notion_id", notionId);
  if (error) return { error: "Impossible de repasser la synthèse en brouillon." };
  revalidatePath(`/apps/el-profesor/notions/${notionId}`);
  revalidatePath("/apps/el-profesor/glossary");
  revalidatePath("/apps/el-profesor");
  return { success: "Synthèse repassée en brouillon." };
}

/**
 * Piste d'amélioration 2026-08-24 ("recommandations officielles rattachées
 * aux notions") — attaches a manual link to an official guideline source
 * (HAS, SPILF, société savante...) to a notion. Deliberately no AI
 * involvement whatsoever: an admin types the title/URL/source themselves,
 * exactly like every other trust-sensitive link in this module.
 */
export async function addNotionRecommendation(notionId: string, title: string, url: string, source: string, note: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const trimmedTitle = title.trim();
  const trimmedUrl = url.trim();
  if (!trimmedTitle || !trimmedUrl) return { error: "Le titre et le lien sont obligatoires." };
  if (!/^https?:\/\//i.test(trimmedUrl)) return { error: "Le lien doit commencer par http:// ou https://." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notion_recommendations").insert({
    notion_id: notionId,
    title: trimmedTitle,
    url: trimmedUrl,
    source: source.trim(),
    note: note.trim(),
    created_by: profile.id,
  });
  if (error) return { error: "Impossible d'enregistrer cette recommandation." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  return { success: "Recommandation ajoutée." };
}

export async function deleteNotionRecommendation(id: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_notion_recommendations").delete().eq("id", id);
  if (error) return { error: "Impossible de supprimer cette recommandation." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  return { success: "Recommandation supprimée." };
}

/**
 * Piste d'amélioration 2026-08-24 ("calculateur de doses contextuel") —
 * attaches a weight-based dosing entry to a notion. Deliberately no AI
 * anywhere: an admin types every number themselves, and the only
 * computation ever performed downstream on these values is
 * `min(dosePerKg * weightKg, maxDose)` — see DoseCalculator's doc comment.
 */
export async function addDoseCalculator(
  notionId: string,
  label: string,
  dosePerKg: number,
  doseUnit: string,
  maxDose: number | null,
  frequency: string,
  note: string
): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return { error: "Le libellé est obligatoire." };
  if (!Number.isFinite(dosePerKg) || dosePerKg <= 0) return { error: "La dose par kg doit être un nombre positif." };
  if (maxDose != null && (!Number.isFinite(maxDose) || maxDose <= 0)) return { error: "La dose maximale doit être un nombre positif." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_dose_calculators").insert({
    notion_id: notionId,
    label: trimmedLabel,
    dose_per_kg: dosePerKg,
    dose_unit: doseUnit.trim() || "mg",
    max_dose: maxDose,
    frequency: frequency.trim(),
    note: note.trim(),
    created_by: profile.id,
  });
  if (error) return { error: "Impossible d'enregistrer ce calculateur." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  return { success: "Calculateur ajouté." };
}

export async function deleteDoseCalculator(id: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_dose_calculators").delete().eq("id", id);
  if (error) return { error: "Impossible de supprimer ce calculateur." };

  revalidatePath("/apps/el-profesor/notions");
  revalidatePath("/apps/el-profesor/glossary");
  return { success: "Calculateur supprimé." };
}
