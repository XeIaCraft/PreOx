"use server";

import { createClient } from "@/lib/supabase/server";

/** Best-effort perceived-performance sample from the real Navigation Timing API — never throws, never blocks the page it's called from. */
export async function logPagePerformance(path: string, durationMs: number): Promise<void> {
  try {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120_000) return;
    const supabase = await createClient();
    await supabase.from("page_performance_log").insert({ path: path.split("?")[0], duration_ms: Math.round(durationMs) });
  } catch (err) {
    console.error("logPagePerformance failed:", err);
  }
}
