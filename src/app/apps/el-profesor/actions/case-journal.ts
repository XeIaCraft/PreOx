"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

/**
 * Piste d'amélioration 2026-08-24 ("journal de cas relié aux notions") —
 * entièrement personnel : RLS restreint chaque ligne à son auteur, aucun
 * admin ni IA n'y accède jamais. Le tag vers une notion est optionnel et
 * purement organisationnel (retrouver ses cas au même endroit que les
 * fiches/flashcards sur le sujet).
 */
export async function addCaseJournalEntry(title: string, body: string, notionId: string | null): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const trimmedTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!trimmedTitle) return { error: "Le titre est obligatoire." };

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_case_journal_entries").insert({
    user_id: profile.id,
    notion_id: notionId,
    title: trimmedTitle,
    body: body.trim().slice(0, MAX_BODY_LENGTH),
  });
  if (error) return { error: "Impossible d'enregistrer ce cas." };

  revalidatePath("/apps/el-profesor/journal");
  revalidatePath("/apps/el-profesor");
  return { success: "Cas ajouté à votre journal." };
}

export async function updateCaseJournalEntry(id: string, title: string, body: string, notionId: string | null): Promise<ActionState> {
  await requireElProfesorAccess();
  const trimmedTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!trimmedTitle) return { error: "Le titre est obligatoire." };

  const supabase = await createClient();
  // RLS restricts this update to the caller's own row — no extra check needed.
  const { error } = await supabase
    .from("el_profesor_case_journal_entries")
    .update({ title: trimmedTitle, body: body.trim().slice(0, MAX_BODY_LENGTH), notion_id: notionId })
    .eq("id", id);
  if (error) return { error: "Impossible de mettre à jour ce cas." };

  revalidatePath("/apps/el-profesor/journal");
  revalidatePath("/apps/el-profesor");
  return { success: "Cas mis à jour." };
}

export async function deleteCaseJournalEntry(id: string): Promise<ActionState> {
  await requireElProfesorAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_case_journal_entries").delete().eq("id", id);
  if (error) return { error: "Impossible de supprimer ce cas." };

  revalidatePath("/apps/el-profesor/journal");
  revalidatePath("/apps/el-profesor");
  return { success: "Cas supprimé." };
}
