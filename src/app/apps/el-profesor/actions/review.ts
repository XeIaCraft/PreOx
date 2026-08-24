"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { getReviewState, suspendFlashcard, unsuspendFlashcard, getUserFsrsRetention, maybeRecomputeUserFsrsRetention } from "@/lib/el-profesor/dal";
import { scheduleReview } from "@/lib/el-profesor/fsrs";
import { createClient } from "@/lib/supabase/server";
import type { ReviewRating, ReviewSource, ReviewState } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

export interface SubmitReviewResult extends ActionState {
  logId?: string;
  previousState?: ReviewState | null;
}

/**
 * Records a self-graded review. Only `source: "scheduled"` reviews update
 * the FSRS memorization state — `source: "free"` (on-demand, out-of-schedule
 * chapter review) is logged for history but never touches the schedule,
 * mirroring Anki's cram mode so free practice can't be used to game the
 * due-today count.
 *
 * Returns the log id and the pre-update FSRS state so the UI can offer a
 * single-step "undo" (useful for mobile mis-taps) via `undoReview`.
 */
export async function submitReview(
  flashcardId: string,
  rating: ReviewRating,
  source: ReviewSource,
  durationMs?: number,
  variantId?: string | null
): Promise<SubmitReviewResult> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  // Sanity-clamped: a stray multi-minute gap (tab left in background, phone
  // locked mid-review) would otherwise wildly skew the aggregate time stats.
  const cleanDuration = durationMs != null && durationMs > 0 && durationMs < 5 * 60_000 ? Math.round(durationMs) : null;

  // Which front-wording was shown (item 47) — null means the flashcard's
  // original wording, not "no data", so the variant comparison can tally it.
  const { data: logRow, error: logError } = await supabase
    .from("el_profesor_review_log")
    .insert({ user_id: profile.id, flashcard_id: flashcardId, rating, source, duration_ms: cleanDuration, variant_id: variantId ?? null })
    .select("id")
    .single();
  if (logError || !logRow) return { error: "Impossible d'enregistrer cette révision." };

  let previousState: ReviewState | null = null;
  if (source === "scheduled") {
    const [state, retention] = await Promise.all([getReviewState(profile.id, flashcardId), getUserFsrsRetention(profile.id)]);
    previousState = state;
    const next = scheduleReview(previousState, rating, new Date(), retention);

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
    // Cheap no-op most of the time (see maybeRecomputeUserFsrsRetention) —
    // best-effort, never blocks the review itself if it fails.
    await maybeRecomputeUserFsrsRetention(profile.id).catch(() => {});
  }

  revalidatePath("/apps/el-profesor");
  return { success: "Révision enregistrée.", logId: logRow.id, previousState: source === "scheduled" ? previousState : undefined };
}

/** Reverts the single most recent `submitReview` call: deletes its log entry and restores the FSRS state it overwrote (or removes the row entirely if this was the flashcard's first-ever review). */
export async function undoReview(
  flashcardId: string,
  logId: string,
  source: ReviewSource,
  previousState: ReviewState | null
): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  await supabase.from("el_profesor_review_log").delete().eq("id", logId).eq("user_id", profile.id);

  if (source === "scheduled") {
    if (previousState) {
      await supabase
        .from("el_profesor_review_state")
        .update({
          due: previousState.due,
          stability: previousState.stability,
          difficulty: previousState.difficulty,
          elapsed_days: previousState.elapsedDays,
          scheduled_days: previousState.scheduledDays,
          reps: previousState.reps,
          lapses: previousState.lapses,
          state: previousState.state,
          last_review: previousState.lastReview,
        })
        .eq("user_id", profile.id)
        .eq("flashcard_id", flashcardId);
    } else {
      await supabase.from("el_profesor_review_state").delete().eq("user_id", profile.id).eq("flashcard_id", flashcardId);
    }
  }

  revalidatePath("/apps/el-profesor");
  return { success: "Réponse annulée." };
}

/** Excludes a flashcard from this user's own reviews — never affects other users or deletes the card itself. */
export async function excludeFlashcardFromReviews(flashcardId: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  await suspendFlashcard(profile.id, flashcardId);
  revalidatePath("/apps/el-profesor");
  return { success: "Carte exclue de vos révisions." };
}

/** Puts a previously-excluded flashcard back into this user's reviews. */
export async function reincludeFlashcardInReviews(flashcardId: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  await unsuspendFlashcard(profile.id, flashcardId);
  revalidatePath("/apps/el-profesor");
  return { success: "Carte réintégrée dans vos révisions." };
}
