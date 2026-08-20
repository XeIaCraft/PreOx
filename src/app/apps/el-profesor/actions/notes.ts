"use server";

import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function getMyNote(subEntityId: string): Promise<string> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_notes")
    .select("content")
    .eq("user_id", profile.id)
    .eq("sub_entity_id", subEntityId)
    .maybeSingle();
  return data?.content ?? "";
}

/** Upserts the current user's note for a sub-entity — one row per user per sub-entity (unique constraint). */
export async function saveMyNote(subEntityId: string, content: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("el_profesor_notes")
    .upsert({ user_id: profile.id, sub_entity_id: subEntityId, content }, { onConflict: "user_id,sub_entity_id" });

  if (error) return { error: "Impossible d'enregistrer la note." };
  return { success: "" };
}
