"use client";

// Shared "have they seen the first-use tutorial" flag, namespaced per
// module so El Profesor and À table (and any future module) track it
// independently. Best-effort like the other local-prefs helpers: failures
// (private browsing, SSR, quota) just mean the tour re-shows, never a hard
// error.

function key(moduleKey: string) {
  return `preox:onboarding-seen:${moduleKey}`;
}

export function hasSeenOnboarding(moduleKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key(moduleKey)) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(moduleKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(moduleKey), "1");
  } catch {
    // ignore
  }
}
