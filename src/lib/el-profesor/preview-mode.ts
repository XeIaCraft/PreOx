import "server-only";

import { getViewMode } from "@/lib/auth/view-mode";
import type { Profile } from "@/lib/supabase/types";

/**
 * Admin "preview as a normal user" (requested 2026-08-28, now the hub-wide
 * view of src/lib/auth/view-mode.ts: a default in « Mon profil », switched
 * here from the dashboard). The underlying Supabase session (and its RLS
 * grants) stays the real admin's throughout, so every page that computes
 * visibility from `effectiveIsAdmin` must also be the one enforcing it at
 * the app layer — RLS alone won't hide anything for this user while
 * previewing. See getNotionSynthesis's `includeDraft` param for the one
 * place this mattered (it used to lean on RLS alone).
 */
export async function getEffectiveIsAdmin(profile: Pick<Profile, "role" | "default_view">): Promise<{ effectiveIsAdmin: boolean; previewingAsUser: boolean }> {
  const { isAdmin, viewingAsUser } = await getViewMode(profile);
  return { effectiveIsAdmin: isAdmin, previewingAsUser: viewingAsUser };
}
