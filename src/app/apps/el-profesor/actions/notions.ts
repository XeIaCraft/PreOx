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
  getNotionSummaries,
} from "@/lib/el-profesor/dal";
import { categorizeFicheNotions, checkContradiction } from "@/lib/el-profesor/gemini";
import { submitNotionCategorizationBatch, submitContradictionCheckBatch } from "./batches";
import { GeminiError } from "@/lib/gemini-shared";

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
    for (const fiche of fiches) {
      const content = await getFicheTextForAI(fiche.id);
      if (!content || !content.text.trim()) continue;

      const existingNames = await getAllNotionNames();
      const result = await categorizeFicheNotions(config, content.title, content.text, existingNames);

      for (const notionName of result.notions.slice(0, 3)) {
        const notionId = await findOrCreateNotion(notionName);
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

  let foundCount = 0;
  let checkedCount = 0;
  try {
    for (const [ficheIdA, ficheIdB] of pairs) {
      const [contentA, contentB] = await Promise.all([getFicheTextForAI(ficheIdA), getFicheTextForAI(ficheIdB)]);
      if (!contentA?.text.trim() || !contentB?.text.trim()) continue;

      const result = await checkContradiction(config, summary.notion.name, contentA.title, contentA.text, contentB.title, contentB.text);
      checkedCount += 1;
      if (!result.contradictory || !result.explanation.trim()) continue;

      const { error } = await supabase.from("el_profesor_contradictions").insert({
        notion_id: notionId,
        fiche_id_a: ficheIdA,
        fiche_id_b: ficheIdB,
        explanation: result.explanation,
      });
      // A unique-constraint conflict just means this pair was already flagged — not a failure.
      if (!error) foundCount += 1;
    }
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la détection de contradictions." };
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
