/**
 * Free-tier Gemini quota heuristic for the chapter card's page-count badge —
 * researched 2026-08-27 per user request ("à partir de combien de pages
 * Claude devient nécessaire plutôt que le free tier Gemini ?"). Sourced from
 * Google's own published figures (ai.google.dev), not guessed:
 *
 * - Document understanding charges a fixed token budget per PDF page, set
 *   by the `media_resolution` in effect. This app never passes
 *   `media_resolution` explicitly (see gemini.ts's callGeminiJson), so a
 *   Gemini 3 model falls back to its per-media-type default — MEDIUM for
 *   PDFs specifically (560 tokens/page), not the flat 258 tokens/page of
 *   pre-3 Gemini models. Google's own guidance is that medium is already
 *   the sweet spot for document/OCR quality ("quality typically saturates
 *   at medium") — dropping to LOW (280 tokens/page) would risk misreading
 *   dosages, drug names, and dense tables in a medical textbook to save a
 *   marginal amount, so this app doesn't do that. This constant only models
 *   the resulting input-token cost of the current (recommended) setting.
 * - The free tier shares one combined 250,000 tokens-per-minute (TPM)
 *   budget across every model tier. RPM/RPD (10-15 req/min, 250-1000
 *   req/day depending on the model) throttle call *frequency* — already
 *   handled reactively by this app's key/model rotation on 429s (see
 *   isQuotaOrCapacityError in gemini.ts). TPM is different: it caps the
 *   size of a single call, and every free-tier key hits the same wall, so
 *   rotation can't route around it.
 *
 * A chapter whose PDF-page tokens alone approach 250k risks an outright
 * rejection on a single free-tier Gemini extraction call. The safe budget
 * below reserves headroom for the prompt, extraction schema, and response
 * tokens that same call also spends (never negligible for this module's
 * detailed structured output).
 *
 * The card badge (board.tsx) does flatly recommend Claude when this budget
 * is exceeded: per the user's own usage (2026-08-27), Claude reliably
 * reaches full coverage in one pass, noticeably more often than Gemini does
 * — even on short chapters (~15 pages), well below this budget's own
 * threshold — so there's no real coverage trade-off pulling back toward
 * Gemini here. That said, this module's own single-pass coverage gap
 * between the two providers is an empirical observation from this app's
 * actual prompts/schema, not something sourced from Google's docs the way
 * the token-budget math above is — it isn't reflected in
 * GEMINI_FREE_TIER_SAFE_PAGE_BUDGET (that threshold is strictly about the
 * hard per-minute token wall, not general thoroughness), so a short chapter
 * under the budget can still need several "Compléter jusqu'à couverture"
 * passes on Gemini without the badge ever firing.
 */
export const GEMINI_PDF_TOKENS_PER_PAGE = 560;
export const GEMINI_FREE_TIER_TPM = 250_000;
const NON_PDF_TOKEN_HEADROOM = 40_000;

/** Largest chapter page count still comfortably clear of the free-tier per-minute token ceiling in a single extraction call. */
export const GEMINI_FREE_TIER_SAFE_PAGE_BUDGET = Math.floor((GEMINI_FREE_TIER_TPM - NON_PDF_TOKEN_HEADROOM) / GEMINI_PDF_TOKENS_PER_PAGE);

/** True once a chapter's page count alone risks exceeding the free-tier per-minute token budget in a single Gemini extraction call. */
export function exceedsGeminiFreeTierBudget(pageCount: number): boolean {
  return pageCount > GEMINI_FREE_TIER_SAFE_PAGE_BUDGET;
}
