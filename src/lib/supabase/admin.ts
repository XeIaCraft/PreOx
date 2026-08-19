import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

/**
 * Privileged Supabase client using the service-role key.
 *
 * This bypasses Row Level Security entirely and can call the Auth Admin API
 * (create/invite/delete users). It must NEVER be imported from a Client
 * Component and must only be used after `requireAdmin()` has verified the
 * caller's session server-side.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
