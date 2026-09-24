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

/**
 * Sets a bookmark to an explicit end state rather than flipping whatever the
 * server currently has — used by the local-first write queue (sync-queue.ts,
 * piste 2026-09-24) replaying a queued bookmark change made while offline,
 * where a blind toggleBookmark() could double-flip on a retried flush.
 * `ignoreDuplicates` avoids an ON CONFLICT ... DO UPDATE, which this table's
 * grants (insert/delete only, no update) wouldn't allow.
 */
export async function setBookmark(subEntityId: string, bookmarked: boolean): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  if (bookmarked) {
    const { error } = await supabase
      .from("el_profesor_bookmarks")
      .upsert({ user_id: profile.id, sub_entity_id: subEntityId }, { onConflict: "user_id,sub_entity_id", ignoreDuplicates: true });
    if (error) return { error: "Impossible d'ajouter ce favori." };
  } else {
    const { error } = await supabase.from("el_profesor_bookmarks").delete().eq("user_id", profile.id).eq("sub_entity_id", subEntityId);
    if (error) return { error: "Impossible de retirer ce favori." };
  }
  revalidatePath("/apps/el-profesor");
  return { success: "" };
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
