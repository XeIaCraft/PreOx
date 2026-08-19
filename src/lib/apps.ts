import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AppModule, Profile } from "@/lib/supabase/types";

export interface AppWithAccess extends AppModule {
  hasAccess: boolean;
}

/**
 * Returns every active module with a per-user `hasAccess` flag.
 * Admins implicitly see every module unlocked — they administer the hub.
 */
export async function getAppsForProfile(profile: Profile): Promise<AppWithAccess[]> {
  const supabase = await createClient();

  const { data: apps } = await supabase
    .from("apps")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!apps) return [];

  if (profile.role === "admin") {
    return apps.map((app) => ({ ...app, hasAccess: true }));
  }

  const { data: access } = await supabase
    .from("user_app_access")
    .select("app_id")
    .eq("user_id", profile.id);

  const grantedIds = new Set((access ?? []).map((row) => row.app_id));

  return apps.map((app) => ({ ...app, hasAccess: grantedIds.has(app.id) }));
}

export async function getAppBySlugForProfile(
  slug: string,
  profile: Profile
): Promise<AppWithAccess | null> {
  const apps = await getAppsForProfile(profile);
  return apps.find((app) => app.slug === slug) ?? null;
}
