/**
 * Best-effort $ cost estimate for the admin usage panel (Réglages IA →
 * Consommation) — requested 2026-08-24. Deliberately approximate: model
 * pricing changes over time and the admin can type any model string into
 * settings, so matching is by tier keyword (flash/pro, sonnet/opus/haiku…)
 * rather than an exhaustive exact-id table. Treat this as "roughly how
 * much", never as the actual bill — the provider's own dashboard is the
 * source of truth for billing.
 */

interface ModelPricing {
  /** $ per 1,000,000 input tokens. */
  inputPerM: number;
  /** $ per 1,000,000 output tokens. */
  outputPerM: number;
}

// Indicative published rates (USD). Ordered most-specific-first within each
// table so e.g. "flash-lite" matches before the broader "flash".
const GEMINI_PRICING: { match: RegExp; pricing: ModelPricing }[] = [
  { match: /flash-lite/i, pricing: { inputPerM: 0.1, outputPerM: 0.4 } },
  { match: /flash/i, pricing: { inputPerM: 0.3, outputPerM: 2.5 } },
  { match: /pro/i, pricing: { inputPerM: 1.25, outputPerM: 10.0 } },
];

const CLAUDE_PRICING: { match: RegExp; pricing: ModelPricing }[] = [
  { match: /opus/i, pricing: { inputPerM: 15.0, outputPerM: 75.0 } },
  { match: /sonnet/i, pricing: { inputPerM: 3.0, outputPerM: 15.0 } },
  { match: /haiku/i, pricing: { inputPerM: 0.8, outputPerM: 4.0 } },
  { match: /fable/i, pricing: { inputPerM: 10.0, outputPerM: 50.0 } },
];

// Every Claude call in this app currently goes through the Message Batches
// API (see the module doc comment in anthropic.ts) — a flat 50% discount on
// both input and output — applied uniformly to every `claude:`-prefixed
// usage-log row since there is deliberately no synchronous Claude path
// right now. Revisit if a synchronous path is ever added (it would need to
// be distinguishable in the log first — see anthropic.ts's logClaudeUsage).
const CLAUDE_BATCH_DISCOUNT = 0.5;

const CLAUDE_MODEL_PREFIX = "claude:";

/**
 * `model` is the raw usage-log string — `claude:`-prefixed for Claude rows
 * (see logClaudeUsage in anthropic.ts), a bare Gemini model id otherwise.
 * Returns `null` when the model string doesn't match any known pricing
 * tier (e.g. a typo'd admin override) — callers should treat that as
 * "unpriced" and say so, never silently treat it as free.
 */
export function estimateCostUsd(model: string, promptTokens: number, candidatesTokens: number): number | null {
  const isClaude = model.startsWith(CLAUDE_MODEL_PREFIX);
  const bareModel = isClaude ? model.slice(CLAUDE_MODEL_PREFIX.length) : model;
  const table = isClaude ? CLAUDE_PRICING : GEMINI_PRICING;
  const entry = table.find((e) => e.match.test(bareModel));
  if (!entry) return null;

  const discount = isClaude ? CLAUDE_BATCH_DISCOUNT : 1;
  return (promptTokens / 1_000_000) * entry.pricing.inputPerM * discount + (candidatesTokens / 1_000_000) * entry.pricing.outputPerM * discount;
}

/** Shared with every panel that shows a $ estimate (Réglages IA, tableau de bord) — kept in one place so the rounding rule stays consistent. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "0 $";
  if (amount < 0.01) return "< 0,01 $";
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
