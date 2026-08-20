"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess, requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
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

export async function resolveFlags(flagIds: string[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (flagIds.length === 0) return { success: "" };
  const supabase = await createClient();

  const { error } = await supabase.from("el_profesor_flags").update({ status: "resolved" }).in("id", flagIds);
  if (error) return { error: "Impossible de marquer ces signalements comme résolus." };

  revalidatePath("/apps/el-profesor");
  return { success: `${flagIds.length} signalement${flagIds.length > 1 ? "s" : ""} résolu${flagIds.length > 1 ? "s" : ""}.` };
}
