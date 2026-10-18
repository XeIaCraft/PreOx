import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { chunk } from "./plan";

/**
 * Once a merged fiche is published, its cards take over from the source
 * cards they fused (choice made with the user: no card is reviewed twice,
 * once in the book and once in the merged book). Each published source card
 * becomes 'replaced' — out of every review queue, which only read published
 * cards — and each reader's most advanced history among the sources is
 * carried over to the merged card, so nobody starts again from zero on what
 * they already know. All of it is one SQL statement per slice of fiches
 * (el_profesor_replace_source_cards, migration 098), whatever the number of
 * cards. Deleting the merged card gives the sources back (trigger).
 *
 * Runs with the service-role client: review states belong to every reader,
 * not to the admin publishing. No-op for an ordinary book's fiches.
 */
export async function replaceSourceCards(ficheIds: string[]): Promise<{ replaced: number; histories: number }> {
  const total = { replaced: 0, histories: 0 };
  if (ficheIds.length === 0) return total;
  const supabase = createAdminClient();
  for (const part of chunk(ficheIds, 400)) {
    const { data, error } = await supabase.rpc("el_profesor_replace_source_cards", { p_fiche_ids: part });
    // Before migration 098 the function doesn't exist: publishing an ordinary book carries on unaffected.
    if (error) {
      console.error("[el-profesor/merge] replace_source_cards:", error.message);
      continue;
    }
    total.replaced += data?.[0]?.replaced ?? 0;
    total.histories += data?.[0]?.histories ?? 0;
  }
  return total;
}
