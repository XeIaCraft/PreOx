import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Debugging aid requested 2026-08-25, after two separate "empty generation,
 * no error shown" reports that were impossible to root-cause without seeing
 * the actual exchange with the AI provider. Every extraction attempt
 * (initial or complementary, success or failure, Gemini or Claude) is logged
 * here with what was actually sent and received, pruned to the 5 most
 * recent attempts per chapter so the table doesn't grow unbounded.
 */
const MAX_EXTRACTION_JOB_HISTORY = 5;

export interface ExtractionJobEntry {
  chapterId: string;
  status: "succeeded" | "failed";
  rawOutput?: unknown;
  error?: string | null;
  /** "gemini" | "claude" | "external" (hand-pasted import — no call made by this app). */
  provider?: string | null;
  model?: string | null;
  requestPrompt?: string | null;
  rawResponse?: string | null;
}

/** Logs one extraction attempt and prunes older attempts beyond the last 5 for that chapter. */
export async function insertExtractionJob(supabase: SupabaseClient<Database>, entry: ExtractionJobEntry): Promise<void> {
  await supabase.from("el_profesor_extraction_jobs").insert({
    chapter_id: entry.chapterId,
    status: entry.status,
    raw_output: (entry.rawOutput as unknown as never) ?? null,
    error: entry.error ?? null,
    provider: entry.provider ?? null,
    model: entry.model ?? null,
    request_prompt: entry.requestPrompt ?? null,
    raw_response: entry.rawResponse ?? null,
  });
  await pruneExtractionJobHistory(supabase, entry.chapterId);
}

async function pruneExtractionJobHistory(supabase: SupabaseClient<Database>, chapterId: string): Promise<void> {
  const { data } = await supabase
    .from("el_profesor_extraction_jobs")
    .select("id")
    .eq("chapter_id", chapterId)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  if (rows.length <= MAX_EXTRACTION_JOB_HISTORY) return;
  const staleIds = rows.slice(MAX_EXTRACTION_JOB_HISTORY).map((r) => r.id);
  await supabase.from("el_profesor_extraction_jobs").delete().in("id", staleIds);
}
