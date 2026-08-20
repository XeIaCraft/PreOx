import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

/**
 * Best-effort: a logging failure should never break the admin action it's
 * recording. Called after the action already succeeded.
 */
export async function logActivity(actorId: string, action: string, targetLabel?: string, detail?: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.from("hub_activity_log").insert({
    actor_id: actorId,
    action,
    target_label: targetLabel ?? null,
    detail: (detail ?? {}) as Json,
  });
}
