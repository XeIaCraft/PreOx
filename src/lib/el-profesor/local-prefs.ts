"use client";

// Small localStorage helpers for client-only, non-critical UI preferences
// (last position, zoom level). Every read/write is best-effort: failures
// (private browsing, quota, SSR) are silently ignored since these only
// affect convenience, never correctness.

const PREFIX = "el-profesor:";

function getItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // ignore
  }
}

export function getLastSubEntity(chapterId: string): string | null {
  return getItem(`last-entity:${chapterId}`);
}

export function setLastSubEntity(chapterId: string, subEntityId: string) {
  setItem(`last-entity:${chapterId}`, subEntityId);
}

export function getLastChapter(): string | null {
  return getItem("last-chapter");
}

export function setLastChapter(chapterId: string) {
  setItem("last-chapter", chapterId);
}

export type FontScale = "sm" | "md" | "lg";

export function getFontScale(): FontScale | null {
  const raw = getItem("font-scale");
  return raw === "sm" || raw === "md" || raw === "lg" ? raw : null;
}

export function setFontScale(scale: FontScale) {
  setItem("font-scale", scale);
}

/** Reading-comfort mode (sepia background) for the fiche content pane — independent of the site's light/dark theme. */
export function getReadingComfort(): boolean {
  return getItem("reading-comfort") === "1";
}

export function setReadingComfort(enabled: boolean) {
  setItem("reading-comfort", enabled ? "1" : "0");
}

const DEFAULT_DAILY_GOAL = 15;

export function getDailyGoal(): number {
  const raw = getItem("daily-goal");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_GOAL;
}

export function setDailyGoal(goal: number) {
  setItem("daily-goal", String(goal));
}

export function getPdfZoom(): number | null {
  const raw = getItem("pdf-zoom");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function setPdfZoom(zoom: number) {
  setItem("pdf-zoom", String(zoom));
}
