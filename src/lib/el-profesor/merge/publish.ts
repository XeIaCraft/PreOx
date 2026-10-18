import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ElProfesorReviewStateRow } from "@/lib/supabase/types";
import { selectInChunks } from "../dal/shared";
import { chunk } from "./plan";

/**
 * Once a merged fiche is published, its cards take over from the source
 * cards they fused (choice made with the user: no card is reviewed twice,
 * once in the book and once in the merged book). Each published source card
 * becomes 'replaced' — out of every review queue, which only read published
 * cards — and each reader's most advanced history among the sources
 * (highest stability, then most repetitions) is carried over to the merged
 * card, so nobody starts again from zero on what they already know.
 * Deleting the merged card gives the sources back (trigger, migration 098).
 *
 * Runs with the service-role client: review states belong to every reader,
 * not to the admin publishing. No-op for an ordinary book's fiches.
 */
export async function replaceSourceCards(ficheIds: string[]): Promise<{ replaced: number; histories: number }> {
  if (ficheIds.length === 0) return { replaced: 0, histories: 0 };
  const supabase = createAdminClient();
  const merged = (
    await selectInChunks(ficheIds, (part) =>
      supabase.from("el_profesor_flashcards").select("id, source_flashcard_ids").in("fiche_id", part).eq("status", "published")
    )
  ).filter((c) => (c.source_flashcard_ids ?? []).length > 0);
  if (merged.length === 0) return { replaced: 0, histories: 0 };

  const mergedOf = new Map<string, string>();
  for (const m of merged) for (const src of m.source_flashcard_ids ?? []) if (!mergedOf.has(src)) mergedOf.set(src, m.id);
  const sourceIds = [...mergedOf.keys()];

  // Only cards readers actually review are replaced: a draft source card stays a draft.
  const live = await selectInChunks(sourceIds, (part) => supabase.from("el_profesor_flashcards").select("id").in("id", part).eq("status", "published"));
  const byMerged = new Map<string, string[]>();
  for (const { id } of live) byMerged.set(mergedOf.get(id)!, [...(byMerged.get(mergedOf.get(id)!) ?? []), id]);
  await Promise.all(
    [...byMerged.entries()].flatMap(([mergedId, ids]) =>
      chunk(ids, 150).map((part) =>
        supabase.from("el_profesor_flashcards").update({ status: "replaced", replaced_by_flashcard_id: mergedId }).in("id", part).eq("status", "published")
      )
    )
  );

  // History: the best source state per (reader, merged card), unless the reader already has one on the merged card.
  const states = (await selectInChunks(sourceIds, (part) => supabase.from("el_profesor_review_state").select("*").in("flashcard_id", part))) as ElProfesorReviewStateRow[];
  const existing = (await selectInChunks(merged.map((m) => m.id), (part) =>
    supabase.from("el_profesor_review_state").select("user_id, flashcard_id").in("flashcard_id", part)
  )) as { user_id: string; flashcard_id: string }[];
  const taken = new Set(existing.map((e) => `${e.user_id}|${e.flashcard_id}`));
  const best = new Map<string, ElProfesorReviewStateRow>();
  for (const s of states) {
    const target = mergedOf.get(s.flashcard_id);
    if (!target) continue;
    const key = `${s.user_id}|${target}`;
    if (taken.has(key)) continue;
    const current = best.get(key);
    if (!current || s.stability > current.stability || (s.stability === current.stability && s.reps > current.reps)) best.set(key, s);
  }
  const rows = [...best.entries()].map(([key, s]) => ({
    user_id: s.user_id,
    flashcard_id: key.split("|")[1],
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review,
  }));
  for (const part of chunk(rows, 500)) await supabase.from("el_profesor_review_state").upsert(part, { onConflict: "user_id,flashcard_id", ignoreDuplicates: true });

  return { replaced: live.length, histories: rows.length };
}
