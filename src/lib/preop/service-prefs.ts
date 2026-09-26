// Your service's habits, applied to every protocol when it becomes a
// patient's plan: the volatile agent, FiO₂ and fresh gas flow of the
// department, the 5-HT₃ antagonist and the dexamethasone dose it uses. The
// protocols themselves are not changed (their updates keep arriving); the
// preferences are applied on top, and only where the protocol leaves the
// choice open (a TIVA protocol stays TIVA, a child keeps the paediatric plan).

import { z } from "zod";
import type { GasAgent, ProtocolContent, ProtocolDrug } from "./protocols";

export interface ServicePrefs {
  /** Volatile agent of the adult plans (TIVA plans left as they are); null: the protocol's. */
  agent: Exclude<GasAgent, "tiva"> | null;
  /** FiO₂ of the maintenance (adults); null: the protocol's. */
  fio2: [number, number] | null;
  /** Fresh gas flow in maintenance, L/min; null: the protocol's. */
  freshGasLMin: number | null;
  /** 5-HT₃ antagonist; null: the protocol's (ondansetron). */
  setron: "ondansetron" | "granisetron" | null;
  /** Dexamethasone for PONV, mg (adults); null: the protocol's. */
  dexamethasoneMg: 4 | 8 | null;
}

export const DEFAULT_SERVICE_PREFS: ServicePrefs = { agent: null, fio2: null, freshGasLMin: null, setron: null, dexamethasoneMg: null };

export const servicePrefsSchema = z.object({
  agent: z.enum(["sevoflurane", "desflurane", "isoflurane"]).nullable(),
  fio2: z.tuple([z.number().min(0.21).max(1), z.number().min(0.21).max(1)]).refine(([a, b]) => a <= b, "FiO₂ : le minimum dépasse le maximum").nullable(),
  freshGasLMin: z.number().min(0.3).max(10).nullable(),
  setron: z.enum(["ondansetron", "granisetron"]).nullable(),
  dexamethasoneMg: z.union([z.literal(4), z.literal(8)]).nullable(),
});

export const SETRONS = {
  ondansetron: { name: "Ondansétron", mg: 4, note: "30 min avant la fin." },
  granisetron: { name: "Granisétron", mg: 1, note: "1 mg en fin d'intervention (consensus NVPO, Gan 2020)." },
} as const;

const ADULT_AGE = 16;
const isSetron = (d: ProtocolDrug) => /ondans[ée]tron|granis[ée]tron/i.test(d.name) && d.phase === "ponv";
const isDexa = (d: ProtocolDrug) => /dexam[ée]thasone/i.test(d.name) && d.phase === "ponv";

/** The protocol's plan with the service's habits; what changed, to tell you. */
export function applyServicePrefs(plan: ProtocolContent, prefs: ServicePrefs, ageYears: number | undefined): { plan: ProtocolContent; changed: string[] } {
  const adult = (ageYears ?? 40) >= ADULT_AGE;
  const changed: string[] = [];
  const out: ProtocolContent = { ...plan };
  const g = plan.gases;
  if (g && adult) {
    const next = { ...g };
    if (prefs.agent && g.agent !== "tiva" && g.agent !== prefs.agent) {
      next.agent = prefs.agent;
      changed.push("halogéné");
    }
    if (prefs.fio2 && (g.fio2[0] !== prefs.fio2[0] || g.fio2[1] !== prefs.fio2[1])) {
      next.fio2 = prefs.fio2;
      changed.push("FiO₂");
    }
    if (prefs.freshGasLMin !== null && g.freshGasLMin !== prefs.freshGasLMin) {
      next.freshGasLMin = prefs.freshGasLMin;
      changed.push("débit de gaz frais");
    }
    out.gases = next;
  }
  out.drugs = plan.drugs.map((d) => {
    // Adults only: a child's per-kg ondansetron has no simple granisetron equivalent here.
    if (prefs.setron && adult && isSetron(d) && d.name !== SETRONS[prefs.setron].name) {
      const s = SETRONS[prefs.setron];
      changed.push(s.name.toLowerCase());
      return { ...d, name: s.name, doseMode: "fixed", amount: s.mg, unit: "mg", note: s.note };
    }
    if (prefs.dexamethasoneMg !== null && adult && isDexa(d) && d.doseMode === "fixed" && d.amount !== prefs.dexamethasoneMg) {
      changed.push(`dexaméthasone ${prefs.dexamethasoneMg} mg`);
      return { ...d, amount: prefs.dexamethasoneMg };
    }
    return d;
  });
  return { plan: out, changed: [...new Set(changed)] };
}
