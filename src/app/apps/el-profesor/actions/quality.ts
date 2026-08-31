"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./library";

export type QualityFindingKind = "duplicate_flashcard" | "similar_sub_entity" | "thin_sub_entity";

/** Order-independent identity for a flagged pair — mirrors getBookQualityDashboard's own pairKey so a dismissal recorded here is actually found there. */
function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join(":");
}

/**
 * "Non, on garde les deux/c'est bon" on the quality dashboard (piste
 * 2026-08-31) — these findings are recomputed fresh on every load (no
 * stable row of their own), so dismissing one just records its key in
 * el_profesor_quality_dismissals; getBookQualityDashboard filters by it on
 * the next load. Idempotent (upsert on the same key) so clicking twice,
 * or two admins dismissing the same pair, never errors.
 */
export async function dismissQualityFinding(kind: QualityFindingKind, entityKey: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_quality_dismissals")
    .upsert({ kind, entity_key: entityKey, dismissed_by: profile.id, dismissed_at: new Date().toISOString() }, { onConflict: "kind,entity_key" });
  if (error) return { error: "Impossible d'ignorer cet élément." };

  revalidatePath("/apps/el-profesor/quality");
  return { success: "Ignoré." };
}

export async function dismissDuplicateFlashcardPair(idA: string, idB: string): Promise<ActionState> {
  return dismissQualityFinding("duplicate_flashcard", pairKey(idA, idB));
}

export async function dismissSimilarSubEntityPair(idA: string, idB: string): Promise<ActionState> {
  return dismissQualityFinding("similar_sub_entity", pairKey(idA, idB));
}

export async function dismissThinSubEntity(subEntityId: string): Promise<ActionState> {
  return dismissQualityFinding("thin_sub_entity", subEntityId);
}
