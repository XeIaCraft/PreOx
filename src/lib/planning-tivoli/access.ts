import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requirePlanningAccess } from "./dal";

/**
 * Who is acting on the planning, and with which database client. Signed in
 * with access to the module: the session's client (row level security
 * applies). With the public link's token: the planning is shared on purpose,
 * so anyone holding a valid token acts with the service client; a token
 * that was revoked or regenerated opens nothing.
 */
export async function planningDb(token?: string): Promise<{ db: SupabaseClient<Database>; profileId: string | null }> {
  if (token) {
    const admin = createAdminClient();
    const { data } = await admin.from("planning_tivoli_settings").select("share_token").eq("share_token", token).maybeSingle();
    if (!data) throw new Error("Lien désactivé ou remplacé : demandez le nouveau lien.");
    return { db: admin, profileId: null };
  }
  const profile = await requirePlanningAccess();
  return { db: await createClient(), profileId: profile.id };
}
