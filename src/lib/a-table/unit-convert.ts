import { normalizeUnit } from "./shopping";

// Only the spoon measures need a fixed ml equivalent — g/ml simply
// auto-scale to the next metric multiple, no lookup needed.
const ML_PER_SPOON: Record<string, number> = { cas: 15, cac: 5 };

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Display-only formatting for an ingredient's quantity+unit in cook mode:
 * auto-scales metric units past 1000 (1000 g → 1 kg, 1000 ml → 1 l) and
 * shows the ml equivalent for spoon measures (cas/cac) — the recipe's
 * stored ingredient is never rewritten, this only affects what's shown.
 */
export function formatCookQuantity(quantity: number | null, unit: string): string {
  const trimmedUnit = (unit || "").trim();
  if (quantity == null) return trimmedUnit;

  const canonical = normalizeUnit(trimmedUnit);
  if (canonical === "g" && quantity >= 1000) return `${round(quantity / 1000)} kg`;
  if (canonical === "ml" && quantity >= 1000) return `${round(quantity / 1000)} l`;
  if (canonical in ML_PER_SPOON) {
    return `${round(quantity)} ${trimmedUnit} (≈ ${round(quantity * ML_PER_SPOON[canonical])} ml)`;
  }
  return `${round(quantity)} ${trimmedUnit}`.trim();
}
