"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

const MAX_INTERVAL_DAYS = 90;

/**
 * Logs a re-read of one content block and reschedules it — item 16 of the
 * backlog, deliberately separate from the flashcard FSRS engine: a block
 * has no "answer" to grade, only a self-reported "still remember it" /
 * "need to revisit", so the spacing here is a simple doubling interval
 * (capped) rather than a full spaced-repetition model.
 */
export async function markBlockReviewed(blockId: string, remembered: boolean): Promise<ActionState & { nextDueAt?: string; intervalDays?: number }> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("el_profesor_block_review_state")
    .select("interval_days")
    .eq("user_id", profile.id)
    .eq("block_id", blockId)
    .maybeSingle();

  const intervalDays = remembered ? Math.min(Math.round((existing?.interval_days ?? 1.5) * 2.2), MAX_INTERVAL_DAYS) : 1;
  const now = new Date();
  const nextDueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("el_profesor_block_review_state").upsert(
    {
      user_id: profile.id,
      block_id: blockId,
      interval_days: intervalDays,
      last_reviewed_at: now.toISOString(),
      next_due_at: nextDueAt,
    },
    { onConflict: "user_id,block_id" }
  );
  if (error) return { error: "Impossible d'enregistrer cette relecture." };

  revalidatePath("/apps/el-profesor");
  return { success: "Relecture enregistrée.", nextDueAt, intervalDays };
}
