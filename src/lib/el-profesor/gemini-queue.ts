import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GEMINI_QUEUE_NOTE, runGeminiChapterExtraction, runGeminiComplement } from "@/lib/el-profesor/gemini-run";
import { MAX_AUTO_COMPLEMENTARY_PASSES } from "@/lib/el-profesor/extraction-persist";

// Server-side queue of Gemini extractions, so the admin can queue a whole
// book on the free tier and close the window: pg_cron calls the queue route
// every 5 minutes (migration 092), and the « Mettre en file » action also
// starts it right away. Free-tier refusals (429/503 once every key and model
// has been tried) only postpone the chapter; other failures get one retry.

/** A running item older than this was killed (function timeout): back to waiting. */
const STUCK_RUNNING_MS = 10 * 60 * 1000;
/** Retries after a quota refusal before giving up (spread over ~2 days). */
const MAX_QUOTA_ATTEMPTS = 20;
/** Attempts for any other error. */
const MAX_OTHER_ATTEMPTS = 2;

/** Minutes before the next try after `attempts` quota refusals: 15, 30, 60, then every 3 h. */
export function quotaBackoffMinutes(attempts: number): number {
  return attempts <= 1 ? 15 : attempts === 2 ? 30 : attempts === 3 ? 60 : 180;
}

const hhmm = (d: Date) => d.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

export interface GeminiQueueRunSummary {
  processed: number;
  succeeded: number;
  postponed: number;
  failed: number;
  remaining: number;
}

/**
 * Extracts queued chapters one after the other within `budgetMs`: a new
 * chapter is only started while there is still room for a full extraction
 * (`startBeforeMs`), so the function never gets killed mid-chapter.
 */
export async function processGeminiQueue({ budgetMs = 240_000, startBeforeMs = 120_000 } = {}): Promise<GeminiQueueRunSummary> {
  const supabase = createAdminClient();
  const started = Date.now();
  const summary: GeminiQueueRunSummary = { processed: 0, succeeded: 0, postponed: 0, failed: 0, remaining: 0 };

  // Items left « running » by a killed invocation.
  await supabase
    .from("el_profesor_gemini_queue")
    .update({ status: "waiting", started_at: null })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - STUCK_RUNNING_MS).toISOString());

  while (Date.now() - started < Math.min(budgetMs, startBeforeMs)) {
    const { data: next } = await supabase
      .from("el_profesor_gemini_queue")
      .select("chapter_id, attempts, mode, until_complete, passes_done, original_status")
      .eq("status", "waiting")
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) break;

    // Claim it (another invocation may have taken it in between).
    const { data: claimed } = await supabase
      .from("el_profesor_gemini_queue")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("chapter_id", next.chapter_id)
      .eq("status", "waiting")
      .select("chapter_id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", next.chapter_id).maybeSingle();
    if (!chapter) {
      await supabase.from("el_profesor_gemini_queue").delete().eq("chapter_id", next.chapter_id);
      continue;
    }

    summary.processed++;
    const attempts = next.attempts + 1;

    if (next.mode === "complementary") {
      // One pass per turn (a pass takes 1–2 min): the item comes back for the next pass while coverage isn't complete.
      const result = await runGeminiComplement(supabase, chapter, false, () => createAdminClient(), next.original_status as typeof chapter.status | null);
      if (result.ok) {
        const passesDone = next.passes_done + 1;
        const again = next.until_complete && result.added > 0 && passesDone < MAX_AUTO_COMPLEMENTARY_PASSES;
        const { data: fresh } = await supabase.from("el_profesor_chapters").select("estimated_remaining_passes").eq("id", chapter.id).maybeSingle();
        if (again && (fresh?.estimated_remaining_passes ?? 0) > 0) {
          await supabase.from("el_profesor_gemini_queue").update({ status: "waiting", attempts: 0, passes_done: passesDone, next_attempt_at: new Date().toISOString(), started_at: null, last_error: null }).eq("chapter_id", chapter.id);
          await supabase.from("el_profesor_chapters").update({ extraction_error: `${GEMINI_QUEUE_NOTE} : passe de complément ${passesDone + 1} à venir (${passesDone} faite(s)).` }).eq("id", chapter.id);
        } else {
          summary.succeeded++;
          await supabase.from("el_profesor_gemini_queue").delete().eq("chapter_id", chapter.id);
        }
        continue;
      }
      const retry = result.quota ? attempts < MAX_QUOTA_ATTEMPTS : attempts < MAX_OTHER_ATTEMPTS;
      if (retry) {
        const at = new Date(Date.now() + (result.quota ? quotaBackoffMinutes(attempts) : 10) * 60_000);
        summary.postponed++;
        await supabase.from("el_profesor_gemini_queue").update({ status: "waiting", attempts, next_attempt_at: at.toISOString(), started_at: null, last_error: result.message }).eq("chapter_id", chapter.id);
        // The chapter keeps its status (a published chapter stays visible): only the note says it's waiting.
        await supabase
          .from("el_profesor_chapters")
          .update({ extraction_error: `${GEMINI_QUEUE_NOTE} : complément reporté (${result.quota ? "quota gratuit atteint" : "erreur"}), nouvel essai vers ${hhmm(at)}.` })
          .eq("id", chapter.id);
        if (result.quota) break;
      } else {
        summary.failed++;
        await supabase.from("el_profesor_gemini_queue").update({ status: "failed", attempts, started_at: null, last_error: result.message }).eq("chapter_id", chapter.id);
      }
      continue;
    }

    const result = await runGeminiChapterExtraction(supabase, chapter);

    if (result.ok) {
      summary.succeeded++;
      await supabase.from("el_profesor_gemini_queue").delete().eq("chapter_id", chapter.id);
      continue;
    }

    const retry = result.quota ? attempts < MAX_QUOTA_ATTEMPTS : attempts < MAX_OTHER_ATTEMPTS;
    if (retry) {
      const at = new Date(Date.now() + (result.quota ? quotaBackoffMinutes(attempts) : 10) * 60_000);
      const note = result.quota ? `Quota Gemini gratuit atteint — nouvel essai automatique vers ${hhmm(at)}.` : `${result.message} Nouvel essai automatique vers ${hhmm(at)}.`;
      summary.postponed++;
      await supabase.from("el_profesor_gemini_queue").update({ status: "waiting", attempts, next_attempt_at: at.toISOString(), started_at: null, last_error: result.message }).eq("chapter_id", chapter.id);
      await supabase.from("el_profesor_chapters").update({ status: "queued", extraction_error: note }).eq("id", chapter.id);
      // The quota is shared by every key: no point trying the next chapter right now.
      if (result.quota) break;
    } else {
      summary.failed++;
      await supabase.from("el_profesor_gemini_queue").update({ status: "failed", attempts, started_at: null, last_error: result.message }).eq("chapter_id", chapter.id);
    }
  }

  const { count } = await supabase.from("el_profesor_gemini_queue").select("chapter_id", { count: "exact", head: true }).neq("status", "failed");
  summary.remaining = count ?? 0;
  return summary;
}
