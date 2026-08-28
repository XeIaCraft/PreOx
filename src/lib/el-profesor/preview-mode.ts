import "server-only";

import { cookies } from "next/headers";

/**
 * Admin-only "preview as a normal user" toggle (requested 2026-08-28) — lets
 * an admin see El Profesor exactly as a non-admin would, without creating a
 * second real account. A plain per-request cookie, not a session/role swap:
 * the underlying Supabase session (and its RLS grants) stays the real
 * admin's throughout, so every page that computes visibility from
 * `effectiveIsAdmin` (via getEffectiveIsAdmin below) must also be the one
 * enforcing it at the app layer — RLS alone won't hide anything for this
 * user while previewing. See getNotionSynthesis's `includeDraft` param for
 * the one place this mattered (it used to lean on RLS alone).
 */
const PREVIEW_COOKIE = "el_profesor_preview_as_user";

export async function isPreviewingAsUser(): Promise<boolean> {
  const store = await cookies();
  return store.get(PREVIEW_COOKIE)?.value === "1";
}

/**
 * `realIsAdmin` decides visibility of the toggle itself and is never
 * overridden — only an actual admin's request can ever carry the preview
 * cookie's effect; a non-admin's `effectiveIsAdmin` is always false already,
 * preview cookie or not.
 */
export async function getEffectiveIsAdmin(realIsAdmin: boolean): Promise<{ effectiveIsAdmin: boolean; previewingAsUser: boolean }> {
  if (!realIsAdmin) return { effectiveIsAdmin: false, previewingAsUser: false };
  const previewing = await isPreviewingAsUser();
  return { effectiveIsAdmin: !previewing, previewingAsUser: previewing };
}

export { PREVIEW_COOKIE };
