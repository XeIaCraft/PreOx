import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Persisted reading + mastery progress for fiches and notion syntheses
 * (requested 2026-08-29). "Read" progress is the highest scroll
 * percentage ever reached in a fiche/synthesis (el_profesor_fiche_read_
 * progress / el_profesor_notion_read_progress — see that migration's own
 * doc comment for why it never regresses). "Mastery" progress is derived
 * on the fly from the same FSRS review state the dashboard's mastery
 * counts already use (state: new/learning/review) — no separate storage,
 * just scoped down to one fiche's or one notion's own flashcards instead
 * of a whole chapter's.
 */
export interface MasteryProgress {
  total: number;
  acquired: number;
  learning: number;
}

const EMPTY_MASTERY: MasteryProgress = { total: 0, acquired: 0, learning: 0 };

/** Batched for a whole chapter's fiches at once — mirrors getBlockReviewStates' batching so the chapter page fetches every fiche's progress in one pass instead of one query per sub-entity. */
export async function getFicheReadProgressBatch(userId: string, ficheIds: string[]): Promise<Record<string, number>> {
  if (ficheIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_fiche_read_progress").select("fiche_id, progress_pct").eq("user_id", userId).in("fiche_id", ficheIds);
  const result: Record<string, number> = {};
  for (const row of data ?? []) result[row.fiche_id] = row.progress_pct;
  return result;
}

export async function getNotionReadProgress(userId: string, notionId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_notion_read_progress")
    .select("progress_pct")
    .eq("user_id", userId)
    .eq("notion_id", notionId)
    .maybeSingle();
  return data?.progress_pct ?? 0;
}

async function masteryForFlashcardIds(supabase: SupabaseClient<Database>, userId: string, flashcardIds: string[]): Promise<MasteryProgress> {
  if (flashcardIds.length === 0) return EMPTY_MASTERY;
  const { data: states } = await supabase.from("el_profesor_review_state").select("flashcard_id, state").eq("user_id", userId).in("flashcard_id", flashcardIds);
  let acquired = 0;
  let learning = 0;
  for (const s of states ?? []) {
    if (s.state === "review") acquired++;
    else if (s.state === "learning" || s.state === "relearning") learning++;
  }
  return { total: flashcardIds.length, acquired, learning };
}

/** Batched per-fiche mastery breakdown for a whole chapter — one flashcard fetch + one state fetch instead of one round trip per sub-entity. */
export async function getFicheMasteryProgressBatch(userId: string, ficheIds: string[]): Promise<Record<string, MasteryProgress>> {
  const result: Record<string, MasteryProgress> = {};
  for (const id of ficheIds) result[id] = { total: 0, acquired: 0, learning: 0 };
  if (ficheIds.length === 0) return result;

  const supabase = await createClient();
  const { data: cards } = await supabase.from("el_profesor_flashcards").select("id, fiche_id").in("fiche_id", ficheIds).eq("status", "published");
  const rows = cards ?? [];
  if (rows.length === 0) return result;

  const { data: states } = await supabase
    .from("el_profesor_review_state")
    .select("flashcard_id, state")
    .eq("user_id", userId)
    .in(
      "flashcard_id",
      rows.map((c) => c.id)
    );
  const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s.state]));

  for (const c of rows) {
    const entry = result[c.fiche_id];
    entry.total++;
    const state = stateByCard.get(c.id);
    if (state === "review") entry.acquired++;
    else if (state === "learning" || state === "relearning") entry.learning++;
  }
  return result;
}

/** Every published flashcard across every non-superseded fiche linked to this notion — same "active" scope as the synthesis itself. */
export async function getNotionMasteryProgress(userId: string, notionId: string): Promise<MasteryProgress> {
  const supabase = await createClient();
  const { data: links } = await supabase.from("el_profesor_notion_links").select("fiche_id").eq("notion_id", notionId);
  const linkedIds = [...new Set((links ?? []).map((l) => l.fiche_id))];
  if (linkedIds.length === 0) return EMPTY_MASTERY;

  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id, superseded_by_fiche_id").in("id", linkedIds);
  const activeIds = (fiches ?? []).filter((f) => !f.superseded_by_fiche_id).map((f) => f.id);
  if (activeIds.length === 0) return EMPTY_MASTERY;

  const { data: cards } = await supabase.from("el_profesor_flashcards").select("id").in("fiche_id", activeIds).eq("status", "published");
  return masteryForFlashcardIds(
    supabase,
    userId,
    (cards ?? []).map((c) => c.id)
  );
}
