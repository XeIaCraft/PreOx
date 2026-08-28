/**
 * Provider-agnostic single-pass extraction quality heuristic (2026-08-28),
 * distinct from GEMINI_FREE_TIER_SAFE_PAGE_BUDGET in gemini-quota.ts: that
 * one models a hard Gemini free-tier token wall (~375 pages); this one
 * models an empirically observed thoroughness cliff — the user found Claude
 * self-reportedly misses significantly more content in a single extraction
 * pass on chapters longer than ~20 pages, well before either provider's
 * actual token/context limits are threatened. Kept in its own file rather
 * than gemini-quota.ts because it isn't about quota at all and applies
 * regardless of which provider is active.
 */
export const CHAPTER_QUALITY_SPLIT_PAGE_THRESHOLD = 20;

/** Target size per part when splitting — comfortably under the quality cliff above. */
export const TARGET_SPLIT_PART_PAGES = 15;

/** Smallest chapter worth splitting at all — below this, two parts would both be tiny. */
export const MIN_PAGES_TO_SPLIT = 8;

/** True once a chapter's page count alone risks degraded single-pass extraction coverage, independent of provider. */
export function exceedsQualitySplitThreshold(pageCount: number): boolean {
  return pageCount > CHAPTER_QUALITY_SPLIT_PAGE_THRESHOLD;
}

/**
 * Number of parts to aim for when splitting a chapter. Always at least 2 —
 * callers must gate on the chapter being worth splitting at all (see
 * MIN_PAGES_TO_SPLIT) before calling this; it has no "1 part" output to
 * signal "don't bother", since that decision belongs to the caller and
 * depends on more than just this ratio.
 */
export function computeTargetSplitPartCount(pageCount: number): number {
  return Math.max(2, Math.ceil(pageCount / TARGET_SPLIT_PART_PAGES));
}
