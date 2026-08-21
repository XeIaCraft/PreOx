"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

/** Toggles a bookmark on a sub-entity for the current user. Returns the resulting state so the UI can update optimistically. */
export async function toggleBookmark(subEntityId: string): Promise<ActionState & { bookmarked?: boolean }> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("el_profesor_bookmarks")
    .select("id")
    .eq("user_id", profile.id)
    .eq("sub_entity_id", subEntityId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("el_profesor_bookmarks").delete().eq("id", existing.id);
    if (error) return { error: "Impossible de retirer ce favori." };
    revalidatePath("/apps/el-profesor");
    return { bookmarked: false };
  }

  const { error } = await supabase.from("el_profesor_bookmarks").insert({ user_id: profile.id, sub_entity_id: subEntityId });
  if (error) return { error: "Impossible d'ajouter ce favori." };
  revalidatePath("/apps/el-profesor");
  return { bookmarked: true };
}

/** Replaces the personal tags on a bookmarked sub-entity — for filtering "Mes favoris" (item 35 of the backlog). */
export async function setBookmarkTags(subEntityId: string, tags: string[]): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  const { error } = await supabase
    .from("el_profesor_bookmarks")
    .update({ tags: cleaned })
    .eq("user_id", profile.id)
    .eq("sub_entity_id", subEntityId);
  if (error) return { error: "Impossible de mettre à jour les tags." };

  revalidatePath("/apps/el-profesor");
  return { success: "Tags mis à jour." };
}
