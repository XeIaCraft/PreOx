import "server-only";

import { cookies } from "next/headers";
import type { Profile } from "@/lib/supabase/types";

/**
 * Which view an admin sees the modules in (El Profesor, Préop): their admin
 * view, or the one a normal user has. The profile's `default_view` (set in
 * « Mon profil ») decides; the switch inside a module overrides it on this
 * device with a cookie, until the default is changed again (which clears
 * it). Only a display choice: the session, and its RLS grants, stay the
 * real admin's, so every page computing what to show from `isAdmin` below
 * must also enforce it at the app layer. A non-admin is always in the user
 * view, cookie or not.
 */
export const VIEW_COOKIE = "preox_view";

export type ViewMode = "admin" | "user";

export async function getViewMode(profile: Pick<Profile, "role" | "default_view">): Promise<{ realIsAdmin: boolean; isAdmin: boolean; viewingAsUser: boolean }> {
  if (profile.role !== "admin") return { realIsAdmin: false, isAdmin: false, viewingAsUser: false };
  const cookie = (await cookies()).get(VIEW_COOKIE)?.value;
  // Before migration 106 the column is missing: the admin view, as before.
  const mode: ViewMode = cookie === "user" || cookie === "admin" ? cookie : profile.default_view === "user" ? "user" : "admin";
  return { realIsAdmin: true, isAdmin: mode === "admin", viewingAsUser: mode === "user" };
}
