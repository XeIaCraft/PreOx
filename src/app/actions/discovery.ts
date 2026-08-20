"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function togglePinnedApp(appId: string, pinned: boolean): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const next = pinned ? [...new Set([...profile.pinned_app_ids, appId])] : profile.pinned_app_ids.filter((id) => id !== appId);

  const { error } = await supabase.from("profiles").update({ pinned_app_ids: next }).eq("id", profile.id);
  if (error) return { error: "Impossible de mettre à jour les favoris." };

  revalidatePath("/apps");
  return { success: "" };
}

/** Fire-and-forget-ish: called from a module's own page on every visit. Never throws — a broken visit log must not break the page. */
export async function recordAppVisit(slug: string): Promise<void> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();
    const { data: app } = await supabase.from("apps").select("id").eq("slug", slug).maybeSingle();
    if (!app) return;
    await supabase.from("user_recent_apps").upsert({ user_id: profile.id, app_id: app.id, visited_at: new Date().toISOString() });
  } catch (err) {
    console.error("recordAppVisit failed:", err);
  }
}

export interface RecentApp {
  appId: string;
  visitedAt: string;
}

export async function listRecentApps(limit = 4): Promise<RecentApp[]> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_recent_apps")
    .select("app_id, visited_at")
    .eq("user_id", profile.id)
    .order("visited_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({ appId: r.app_id, visitedAt: r.visited_at }));
}
