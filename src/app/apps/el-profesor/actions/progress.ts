"use server";

import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Best-effort, debounced save called from the fiche/synthesis scroll
 * handler — never worth surfacing an error toast for a background
 * progress ping, so this stays void-returning; a failure just means the
 * highest-reached percentage doesn't advance until the next scroll tick.
 */
export async function saveFicheReadProgress(ficheId: string, progressPct: number): Promise<void> {
  const profile = await requireElProfesorAccess();
  const clamped = Math.max(0, Math.min(100, Math.round(progressPct)));
  const supabase = await createClient();
  await supabase
    .from("el_profesor_fiche_read_progress")
    .upsert({ user_id: profile.id, fiche_id: ficheId, progress_pct: clamped, updated_at: new Date().toISOString() }, { onConflict: "user_id,fiche_id" });
}

export async function saveNotionReadProgress(notionId: string, progressPct: number): Promise<void> {
  const profile = await requireElProfesorAccess();
  const clamped = Math.max(0, Math.min(100, Math.round(progressPct)));
  const supabase = await createClient();
  await supabase
    .from("el_profesor_notion_read_progress")
    .upsert({ user_id: profile.id, notion_id: notionId, progress_pct: clamped, updated_at: new Date().toISOString() }, { onConflict: "user_id,notion_id" });
}

export async function resetFicheReadProgress(ficheId: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  await supabase.from("el_profesor_fiche_read_progress").delete().eq("user_id", profile.id).eq("fiche_id", ficheId);
  return { success: "Progression de lecture réinitialisée." };
}

export async function resetNotionReadProgress(notionId: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  await supabase.from("el_profesor_notion_read_progress").delete().eq("user_id", profile.id).eq("notion_id", notionId);
  return { success: "Progression de lecture réinitialisée." };
}

/**
 * Deletes this user's FSRS review state for every flashcard of this fiche
 * — the same "no row = new" convention getMasteryCountsByChapter already
 * relies on, so the cards simply reappear as unlearned next review rather
 * than needing a separate "reset" state. Never touches el_profesor_
 * review_log (the raw review history stays — this resets scheduling, not
 * the audit trail of past reviews).
 */
export async function resetFicheMastery(ficheId: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  const { data: cards } = await supabase.from("el_profesor_flashcards").select("id").eq("fiche_id", ficheId);
  const ids = (cards ?? []).map((c) => c.id);
  if (ids.length > 0) {
    await supabase.from("el_profesor_review_state").delete().eq("user_id", profile.id).in("flashcard_id", ids);
  }
  return { success: "Progression de mémorisation réinitialisée — ces cartes repartiront de zéro." };
}

/** Same as resetFicheMastery, scoped to every fiche linked to this notion instead of one fiche. */
export async function resetNotionMastery(notionId: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  const { data: links } = await supabase.from("el_profesor_notion_links").select("fiche_id").eq("notion_id", notionId);
  const ficheIds = [...new Set((links ?? []).map((l) => l.fiche_id))];
  if (ficheIds.length === 0) return { success: "Rien à réinitialiser pour cette notion." };

  const { data: cards } = await supabase.from("el_profesor_flashcards").select("id").in("fiche_id", ficheIds);
  const ids = (cards ?? []).map((c) => c.id);
  if (ids.length > 0) {
    await supabase.from("el_profesor_review_state").delete().eq("user_id", profile.id).in("flashcard_id", ids);
  }
  return { success: "Progression de mémorisation réinitialisée pour cette notion." };
}
