"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { getReviewState } from "@/lib/el-profesor/dal";
import { scheduleReview } from "@/lib/el-profesor/fsrs";
import { createClient } from "@/lib/supabase/server";
import type { ReviewRating, ReviewSource } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Records a self-graded review. Only `source: "scheduled"` reviews update
 * the FSRS memorization state — `source: "free"` (on-demand, out-of-schedule
 * chapter review) is logged for history but never touches the schedule,
 * mirroring Anki's cram mode so free practice can't be used to game the
 * due-today count.
 */
export async function submitReview(flashcardId: string, rating: ReviewRating, source: ReviewSource): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const { error: logError } = await supabase
    .from("el_profesor_review_log")
    .insert({ user_id: profile.id, flashcard_id: flashcardId, rating, source });
  if (logError) return { error: "Impossible d'enregistrer cette révision." };

  if (source === "scheduled") {
    const currentState = await getReviewState(profile.id, flashcardId);
    const next = scheduleReview(currentState, rating);

    const { error: upsertError } = await supabase.from("el_profesor_review_state").upsert(
      {
        user_id: profile.id,
        flashcard_id: flashcardId,
        due: next.due,
        stability: next.stability,
        difficulty: next.difficulty,
        elapsed_days: next.elapsedDays,
        scheduled_days: next.scheduledDays,
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        last_review: next.lastReview,
      },
      { onConflict: "user_id,flashcard_id" }
    );
    if (upsertError) return { error: "Impossible de mettre à jour la planification." };
  }

  revalidatePath("/apps/el-profesor");
  return { success: "Révision enregistrée." };
}
