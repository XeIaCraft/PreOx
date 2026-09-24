import type { ProtocolDrug } from "./protocols";

/** A plan drug for tests, with the defaults of a new one. */
export function newDrug(p: Partial<ProtocolDrug>): ProtocolDrug {
  return { id: crypto.randomUUID(), name: "X", route: "bolus_iv", phase: "other", doseMode: "fixed", amount: null, unit: "mg", weightBasis: "total", maxAmount: null, redoseEveryMin: null, note: "", ...p };
}
