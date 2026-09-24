import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Data Access Layer: every server-side authorization decision funnels
 * through these functions so the checks stay in one place.
 */

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
});

// 2FA is opt-in per user (see src/app/actions/mfa.ts): signInWithPassword
// alone only ever grants aal1. A user who enrolled a verified TOTP factor
// must additionally clear the /mfa-challenge step before nextLevel (what
// their own factors require) and currentLevel (what this session has)
// agree — otherwise every page behind requireUser()/requireProfile()
// would be reachable with just a password, defeating the point of 2FA.
// Split out from requireUser() so requireProfile() (below) can run this
// alongside getCurrentProfile() instead of strictly after it — both only
// need a user to already be known to exist (checked by the caller before
// either starts), not each other's result.
async function checkMfaOrRedirect() {
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    redirect("/mfa-challenge");
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await checkMfaOrRedirect();
  return user;
}

export async function requireProfile(): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // MFA check and profile fetch are independent once a user is known to
  // exist — running them in parallel instead of sequentially (as
  // requireUser() + getCurrentProfile() used to) shaves one full round-trip
  // off every page behind this, on every navigation (getCurrentProfile()
  // re-derives the user too, but that's memoized by getCurrentUser's own
  // cache(), so it's free).
  const [, profile] = await Promise.all([checkMfaOrRedirect(), getCurrentProfile()]);
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/apps");
  return profile;
}
