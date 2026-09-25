"use client";

import { useCallback, useEffect, useState } from "react";

// What you add most often (antecedents, treatments, allergens), counted on
// this device — ids only, no patient data — to offer them in one tap.

const KEY = "preox:preop:usage";
type Kind = "conditions" | "medications" | "allergens";
type Counts = Partial<Record<Kind, Record<string, number>>>;

const DEFAULTS: Record<Kind, string[]> = {
  conditions: ["hypertension", "dyslipidemia", "diabetes_oral", "coronary", "arrhythmia", "osa", "asthma", "copd", "gerd", "ckd"],
  medications: ["C09AA05", "C10AA05", "B01AC06", "A10BA02", "C07AB07", "A02BC02", "C08CA01", "B01AF01", "N02BE01", "H03AA01"],
  allergens: ["betalactams", "latex", "nsaids", "opioids", "iodinated_contrast", "adhesives"],
};

function read(): Counts {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Counts;
  } catch {
    return {};
  }
}

export function useUsage(kind: Kind, limit = 8) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const t = setTimeout(() => setCounts(read()[kind] ?? {}), 0);
    return () => clearTimeout(t);
  }, [kind]);

  const bump = useCallback(
    (id: string) => {
      const all = read();
      const mine = { ...(all[kind] ?? {}), [id]: (all[kind]?.[id] ?? 0) + 1 };
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...all, [kind]: mine }));
      } catch {
        // Storage blocked: no suggestions, nothing else lost.
      }
      setCounts(mine);
    },
    [kind]
  );

  const used = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const top = [...used, ...DEFAULTS[kind].filter((d) => !used.includes(d))].slice(0, limit);
  return { top, bump };
}
