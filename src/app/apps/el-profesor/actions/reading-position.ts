"use server";

import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort, fire-and-forget: records where the user is reading so the
 * resume banner and the chapter view's default sub-entity work across
 * devices. Never surfaces an error to the UI — a failed write here should
 * never interrupt reading, it just means the next device falls back to its
 * own localStorage cache instead.
 */
export async function recordReadingPosition(chapterId: string, subEntityId: string | null): Promise<void> {
  try {
    const profile = await requireElProfesorAccess();
    const supabase = await createClient();
    await supabase
      .from("el_profesor_reading_position")
      .upsert(
        { user_id: profile.id, chapter_id: chapterId, sub_entity_id: subEntityId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
  } catch {
    // best-effort — see doc comment above
  }
}
