// How many Gemini passes a chapter gets, by its page count (Réglages IA).
// Calibrated on « Le livre de l'interne » (2026-09-30): one Gemini lite call
// returns ~25–30 blocks + flashcards whatever the chapter length, while
// Claude reaches ~8 per page on the same book — hence about one pass per 3
// pages to come close, with an early stop when a pass brings (almost)
// nothing new, rather than trusting the model's own estimate (it says
// « complete » after one pass almost every time).

export interface GeminiPassSettings {
  /** One pass (extraction or complement) per this many PDF pages. */
  pagesPerPass: number;
  /** Ceiling on total passes (extraction included). */
  maxPasses: number;
  /** A complement pass adding fewer new items than this ends the series. */
  minAddedPerPass: number;
}

export const DEFAULT_GEMINI_PASS_SETTINGS: GeminiPassSettings = { pagesPerPass: 3, maxPasses: 8, minAddedPerPass: 3 };

/** Total passes planned for a chapter of `pages` pages (extraction included), at least 1. */
export function plannedGeminiPasses(pages: number | null | undefined, s: GeminiPassSettings = DEFAULT_GEMINI_PASS_SETTINGS): number {
  if (!pages || pages <= 0 || !(s.pagesPerPass > 0)) return 1;
  return Math.max(1, Math.min(Math.max(1, Math.round(s.maxPasses)), Math.ceil(pages / s.pagesPerPass)));
}

export interface PageWindow {
  from: number;
  to: number;
}

/**
 * Page windows swept by the complement passes after the first extraction:
 * one window per `pagesPerPass` pages, at most `maxPasses - 1` windows (the
 * windows then widen to still cover every page). Asking Gemini lite to
 * « find what's missing in the whole chapter » gets an empty answer; asking
 * it to extract everything from pages 4–6 works.
 */
export function complementWindows(pages: number | null | undefined, s: GeminiPassSettings = DEFAULT_GEMINI_PASS_SETTINGS): PageWindow[] {
  if (!pages || pages <= 0 || !(s.pagesPerPass > 0)) return [];
  const count = Math.max(1, Math.min(Math.max(1, Math.round(s.maxPasses) - 1), Math.ceil(pages / s.pagesPerPass)));
  const size = Math.ceil(pages / count);
  const out: PageWindow[] = [];
  for (let from = 1; from <= pages; from += size) out.push({ from, to: Math.min(pages, from + size - 1) });
  return out;
}
