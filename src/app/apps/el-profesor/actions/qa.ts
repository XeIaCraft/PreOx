"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess, getFicheQuestions } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FicheQuestion } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

const MAX_BODY_LENGTH = 2000;

export async function getFicheQuestionsForFiche(ficheId: string): Promise<FicheQuestion[]> {
  const profile = await requireElProfesorAccess();
  return getFicheQuestions(ficheId, profile.id);
}

/** Questions-réponses sous une fiche, visibles par tous — item 28 of the backlog. */
export async function addFicheQuestion(ficheId: string, body: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const trimmed = body.trim().slice(0, MAX_BODY_LENGTH);
  if (!trimmed) return { error: "La question est vide." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_fiche_questions").insert({ fiche_id: ficheId, author_id: profile.id, body: trimmed });
  if (error) return { error: "Impossible d'enregistrer la question." };

  revalidatePath("/apps/el-profesor");
  return { success: "Question publiée." };
}

export async function addFicheAnswer(questionId: string, body: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const trimmed = body.trim().slice(0, MAX_BODY_LENGTH);
  if (!trimmed) return { error: "La réponse est vide." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_fiche_answers").insert({ question_id: questionId, author_id: profile.id, body: trimmed });
  if (error) return { error: "Impossible d'enregistrer la réponse." };

  revalidatePath("/apps/el-profesor");
  return { success: "Réponse publiée." };
}

export async function deleteFicheQuestion(questionId: string): Promise<ActionState> {
  await requireElProfesorAccess();
  const supabase = await createClient();
  // RLS restricts the delete to the author or an admin — no extra check needed here.
  const { error } = await supabase.from("el_profesor_fiche_questions").delete().eq("id", questionId);
  if (error) return { error: "Impossible de supprimer cette question." };
  revalidatePath("/apps/el-profesor");
  return { success: "Question supprimée." };
}

export async function deleteFicheAnswer(answerId: string): Promise<ActionState> {
  await requireElProfesorAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_fiche_answers").delete().eq("id", answerId);
  if (error) return { error: "Impossible de supprimer cette réponse." };
  revalidatePath("/apps/el-profesor");
  return { success: "Réponse supprimée." };
}

/**
 * Reports a question/answer as inappropriate — sets a "flagged" marker
 * visible to admins and the author (not a full moderation queue: an admin
 * browsing normally sees the marker and can delete directly). Uses the
 * admin client since there's deliberately no RLS UPDATE policy letting any
 * user flip another user's row — only this trusted, single-field write is
 * allowed, matching the pattern already used elsewhere (e.g. toggleFicheShare).
 */
export async function flagFicheQuestion(questionId: string): Promise<ActionState> {
  await requireElProfesorAccess();
  const admin = createAdminClient();
  const { error } = await admin.from("el_profesor_fiche_questions").update({ flagged: true }).eq("id", questionId);
  if (error) return { error: "Impossible de signaler cette question." };
  revalidatePath("/apps/el-profesor");
  return { success: "Question signalée." };
}

export async function flagFicheAnswer(answerId: string): Promise<ActionState> {
  await requireElProfesorAccess();
  const admin = createAdminClient();
  const { error } = await admin.from("el_profesor_fiche_answers").update({ flagged: true }).eq("id", answerId);
  if (error) return { error: "Impossible de signaler cette réponse." };
  revalidatePath("/apps/el-profesor");
  return { success: "Réponse signalée." };
}
