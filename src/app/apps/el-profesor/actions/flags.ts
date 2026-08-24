"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess, requireElProfesorAdmin, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { suggestFlashcardFlagFix, suggestBlockFlagFix } from "@/lib/el-profesor/gemini";
import { GeminiError } from "@/lib/gemini-shared";
import type { FlagTargetType } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Lets any user with module access flag a published block or flashcard as
 * wrong. Users can never write directly to the content tables (admin-only
 * RLS) — the insert is picked up by a security-definer trigger that marks
 * the target `needs_review`, surfacing it in the existing admin review flow.
 */
export async function flagContent(targetType: FlagTargetType, targetId: string, reason: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("el_profesor_flags")
    .insert({ target_type: targetType, target_id: targetId, flagged_by: profile.id, reason: reason.trim() });
  if (error) return { error: "Impossible d'enregistrer le signalement." };

  revalidatePath("/apps/el-profesor");
  return { success: "Merci, un administrateur va relire ce contenu." };
}

export async function resolveFlag(flagId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("el_profesor_flags").update({ status: "resolved" }).eq("id", flagId);
  if (error) return { error: "Impossible de marquer ce signalement comme résolu." };

  revalidatePath("/apps/el-profesor");
  return { success: "Signalement résolu." };
}

export interface FlagFixSuggestion {
  front?: string;
  back?: string;
  text?: string;
  note?: string;
}

/**
 * Piste d'amélioration 2026-08-24 ("boucler les signalements vers la
 * régénération") : au lieu de laisser l'admin retaper le contenu à la
 * main après un signalement, propose une correction générée par IA à
 * partir du motif signalé — jamais appliquée automatiquement. Le résultat
 * ne fait que pré-remplir le formulaire d'édition existant ; l'admin
 * relit, ajuste si besoin, puis enregistre via le flux normal (qui
 * marque déjà needs_review) et résout le signalement comme d'habitude.
 */
export async function suggestFlagFix(flagId: string): Promise<ActionState & FlagFixSuggestion> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: flag } = await supabase.from("el_profesor_flags").select("target_type, target_id, reason").eq("id", flagId).maybeSingle();
  if (!flag) return { error: "Signalement introuvable." };

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor." };
  }

  if (flag.target_type === "flashcard") {
    const { data: card } = await supabase.from("el_profesor_flashcards").select("front, back, fiche_id").eq("id", flag.target_id).maybeSingle();
    if (!card) return { error: "Flashcard introuvable." };
    const subEntityName = await getSubEntityNameForFiche(supabase, card.fiche_id);
    const front = (card.front as unknown as { text: string }).text;
    const back = (card.back as unknown as { text: string }).text;

    try {
      const result = await suggestFlashcardFlagFix(config, subEntityName, front, back, flag.reason ?? "");
      return { success: "Suggestion générée.", front: result.front, back: result.back, note: result.note || undefined };
    } catch (err) {
      return { error: err instanceof GeminiError ? err.message : "Échec de la suggestion." };
    }
  }

  const { data: block } = await supabase.from("el_profesor_fiche_blocks").select("block_type, content, fiche_id").eq("id", flag.target_id).maybeSingle();
  if (!block) return { error: "Bloc introuvable." };
  const content = block.content as unknown as { text?: unknown };
  if (typeof content.text !== "string") {
    return { error: "Ce type de bloc (tableau ou protocole) ne peut pas encore être régénéré automatiquement — modifiez-le à la main." };
  }
  const subEntityName = await getSubEntityNameForFiche(supabase, block.fiche_id);

  try {
    const result = await suggestBlockFlagFix(config, subEntityName, block.block_type, content.text, flag.reason ?? "");
    return { success: "Suggestion générée.", text: result.text, note: result.note || undefined };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la suggestion." };
  }
}

async function getSubEntityNameForFiche(supabase: Awaited<ReturnType<typeof createClient>>, ficheId: string): Promise<string> {
  const { data: fiche } = await supabase.from("el_profesor_fiches").select("sub_entity_id").eq("id", ficheId).maybeSingle();
  if (!fiche) return "";
  const { data: subEntity } = await supabase.from("el_profesor_sub_entities").select("name").eq("id", fiche.sub_entity_id).maybeSingle();
  return subEntity?.name ?? "";
}

export async function resolveFlags(flagIds: string[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (flagIds.length === 0) return { success: "" };
  const supabase = await createClient();

  const { error } = await supabase.from("el_profesor_flags").update({ status: "resolved" }).in("id", flagIds);
  if (error) return { error: "Impossible de marquer ces signalements comme résolus." };

  revalidatePath("/apps/el-profesor");
  return { success: `${flagIds.length} signalement${flagIds.length > 1 ? "s" : ""} résolu${flagIds.length > 1 ? "s" : ""}.` };
}
