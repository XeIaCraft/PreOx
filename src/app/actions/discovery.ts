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

/**
 * Fire-and-forget-ish: called from a module's own page on every visit,
 * right after that page has already resolved its own profile via
 * getCurrentProfile() — takes userId directly instead of re-resolving it
 * via requireProfile() (which every call site used to do redundantly,
 * costing an extra, non-memoized MFA-assurance round trip on every single
 * app visit). Safe to trust the caller's userId here: the insert below goes
 * through the standard per-request Supabase client, so user_recent_apps'
 * own RLS (`auth.uid() = user_id`) still rejects it if it were ever called
 * with a mismatched id. Never throws — a broken visit log must not break
 * the page.
 */
export async function recordAppVisit(userId: string, slug: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: app } = await supabase.from("apps").select("id").eq("slug", slug).maybeSingle();
    if (!app) return;
    await supabase.from("user_recent_apps").upsert({ user_id: userId, app_id: app.id, visited_at: new Date().toISOString() });
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
