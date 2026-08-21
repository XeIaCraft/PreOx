"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireElProfesorAdmin,
  getElProfesorGeminiConfig,
  getChapterContent,
  getFicheTextForAI,
  getAllNotionNames,
  findOrCreateNotion,
  linkFicheToNotion,
  getNotionSummaries,
} from "@/lib/el-profesor/dal";
import { categorizeFicheNotions, checkContradiction } from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Tags every published fiche of a chapter with 1-3 cross-book "notions"
 * (reusing existing ones when they fit — see buildNotionCategorizationPrompt).
 * Admin-triggered per chapter rather than automatic on publish, to keep
 * Gemini calls (and their cost) predictable.
 */
export async function categorizeChapterNotions(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();

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
