import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort: a logging failure should never break the admin edit it's
 * recording. Called after the edit already succeeded.
 */
export async function logContentChange(actorId: string, targetType: "block" | "flashcard", targetId: string, action: string, detail?: string) {
  const supabase = await createClient();
  await supabase.from("el_profesor_content_log").insert({
    actor_id: actorId,
    target_type: targetType,
    target_id: targetId,
    action,
    detail: detail ?? null,
  });
}

export interface ContentLogEntry {
  id: string;
  actorName: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

/** Edit history for one block/flashcard — newest first, admin-only view. */
export async function getContentLog(targetType: "block" | "flashcard", targetId: string): Promise<ContentLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_content_log")
    .select("id, actor_id, action, detail, created_at")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data || data.length === 0) return [];

  const actorIds = [...new Set(data.map((r) => r.actor_id).filter((id): id is string => Boolean(id)))];
  const { data: profiles } =
    actorIds.length > 0 ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));

  return data.map((row) => ({
    id: row.id,
    actorName: (row.actor_id && nameById.get(row.actor_id)) || "Système",
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
