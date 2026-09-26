// Fluids for one patient: what to run in theatre, what to prescribe after,
// and what the urine output means. Sources:
// - adults: near-zero balance (Heming et al., Br J Surg 2020); euvolaemic
//   patients need 1–4 ml/kg/h of balanced crystalloid in theatre, boluses
//   only for objective hypovolaemia; post-operative maintenance 25–30 ml/kg
//   per 24 h of water, 1 mmol/kg of Na⁺ and K⁺, 50 g of glucose, on ideal
//   weight in obesity (Ess & Lobo, Br J Surg 2025 — NICE CG174). With clear
//   fluids allowed up to 2 h, the fasting "deficit" is no longer replaced by
//   formula: a bolus before induction only after a prolonged fast.
// - children: hourly maintenance 4-2-1 (Holliday–Segar; manual, chap. 37),
//   balanced isotonic solution with 1–2.5 % glucose (Sümpelmann et al.,
//   Paediatr Anaesth 2017, PMID 27747968).

import { bmi, idealBodyWeight, type Sex } from "./scores";

export const FLUID_SOURCES = {
  adult: "Heming et al., Br J Surg 2020 (balance proche de zéro) ; Ess & Lobo, Br J Surg 2025 (1–4 ml/kg/h peropératoire, entretien 25–30 ml/kg/24 h, poids idéal chez l'obèse)",
  child: "Holliday–Segar 4-2-1 (Manuel pratique d'anesthésie 2020, chap. 37) ; Sümpelmann et al., Paediatr Anaesth 2017 (PMID 27747968)",
};

export interface FluidPlan {
  population: "adult" | "child";
  /** Weight the volumes are computed on, and why. */
  weightKg: number;
  basis: "réel" | "idéal";
  /** Theatre background infusion, ml/h. */
  intraopMlH: [number, number];
  /** After surgery, while the patient cannot drink: ml/24 h and ml/h. */
  postop24h: [number, number];
  postopMlH: [number, number];
  sodiumMmol: number;
  potassiumMmol: number;
  glucoseG: number | null;
  solution: string;
  notes: string[];
  source: string;
}

/** Holliday–Segar hourly maintenance: 4 ml/kg for the first 10 kg, 2 for the next 10, 1 beyond. */
export function hollidaySegar(weightKg: number): number {
  const w = Math.max(0, weightKg);
  return Math.round(Math.min(w, 10) * 4 + Math.min(Math.max(w - 10, 0), 10) * 2 + Math.max(w - 20, 0) * 1);
}

export function fluidPlan(p: { age?: number; weightKg?: number; heightCm?: number; sex?: Sex }): FluidPlan | null {
  if (!p.weightKg) return null;
  const child = p.age !== undefined && p.age < 16;
  if (child) {
    const hourly = hollidaySegar(p.weightKg);
    return {
      population: "child",
      weightKg: p.weightKg,
      basis: "réel",
      intraopMlH: [hourly, hourly],
      postop24h: [hourly * 24, hourly * 24],
      postopMlH: [hourly, hourly],
      sodiumMmol: Math.round(p.weightKg * 1),
      potassiumMmol: Math.round(p.weightKg * 1),
      glucoseG: null,
      solution: "Soluté balancé isotonique glucosé à 1–2,5 % en fond ; bolus de 10–20 ml/kg de soluté non glucosé si instabilité.",
      notes: ["Jeûne court (liquides clairs jusqu'à 1 h) : pas de « rattrapage » systématique ; volumes à restreindre et électrolytes à surveiller si la perfusion dure."],
      source: FLUID_SOURCES.child,
    };
  }
  const obese = p.heightCm && p.sex ? bmi(p.weightKg, p.heightCm) >= 30 : false;
  const w = obese && p.heightCm && p.sex ? Math.round(idealBodyWeight(p.sex, p.heightCm)) : p.weightKg;
  return {
    population: "adult",
    weightKg: w,
    basis: obese ? "idéal" : "réel",
    intraopMlH: [Math.round(w * 1), Math.round(w * 4)],
    postop24h: [Math.round(w * 25), Math.round(w * 30)],
    postopMlH: [Math.round((w * 25) / 24), Math.round((w * 30) / 24)],
    sodiumMmol: Math.round(w),
    potassiumMmol: Math.round(w),
    glucoseG: 50,
    solution: "Cristalloïde balancé (Ringer lactate, Plasma-Lyte) plutôt que NaCl 0,9 % ; bolus de 200–250 ml seulement devant une hypovolémie objective.",
    notes: [
      "Objectif : balance proche de zéro (l'excès comme le déficit aggravent le pronostic).",
      "Jeûne : liquides clairs jusqu'à 2 h, pas de compensation du « déficit » par formule ; bolus avant l'induction seulement après un jeûne prolongé.",
      "Oligurie peropératoire et postopératoire précoce souvent physiologique (rétention hydrosodée) : ne pas la traiter par du remplissage seul.",
    ],
    source: FLUID_SOURCES.adult,
  };
}

/** Urine output over the time elapsed, ml/kg/h — null until it can be computed. */
export function urineRate(urineMl: number, weightKg: number | undefined, minutes: number): number | null {
  if (!weightKg || minutes < 30) return null;
  return Math.round((urineMl / weightKg / (minutes / 60)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Normovolaemia: what should have been given so far
// ---------------------------------------------------------------------------
// Manuel pratique d'anesthésie 2020, chap. 21 (tableau 21.2): the fasting
// deficit is the 4-2-1 rule × hours of fasting — half in the first hour,
// the other half over the next two; basal needs 4-2-1 per hour; insensible
// surgical losses 2–4 (surface), 4–8 (digestive) or 8–10 mL/kg/h (major,
// third space); blood loss 3–4 mL of crystalloid or 1 mL of colloid per mL.
// The manual adds that practice has become more restrictive: a reference to
// modulate on clinical signs, not a volume to infuse.

import type { InsensibleLoss } from "./dossier";

export const INSENSIBLE_LOSSES: { code: InsensibleLoss; label: string; perKgH: [number, number] }[] = [
  { code: "surface", label: "Chirurgie de surface", perKgH: [2, 4] },
  { code: "digestive", label: "Chirurgie digestive", perKgH: [4, 8] },
  { code: "major", label: "Chirurgie majeure (3e secteur)", perKgH: [8, 10] },
];

export const NORMOVOLAEMIA_SOURCE = "Manuel pratique d'anesthésie 2020, chap. 21 (tableau 21.2) — la pratique actuelle est plus restrictive : repère à moduler sur la clinique";

export interface Normovolaemia {
  /** Fasting deficit (4-2-1 × hours) and how much of it is due by now. */
  deficitMl: number;
  deficitDueMl: number;
  /** Basal needs so far (4-2-1 per hour). */
  basalMl: number;
  hourlyMl: number;
  /** Insensible losses so far. */
  insensibleMl: [number, number];
  /** Blood loss to replace: crystalloids 3–4 ×, or colloids 1 ×. */
  bloodReplaceMl: [number, number];
  /** Expected total so far with crystalloids. */
  expectedMl: [number, number];
  /** What was given (crystalloids + colloids + blood products + other). */
  givenMl: number;
  /** Given compared with expected: below, within or above (tendency to overload). */
  status: "below" | "within" | "above";
  lines: string[];
}

export function normovolaemia(p: { weightKg?: number; fastingHours?: number; minutes: number; loss?: InsensibleLoss; bloodLossMl: number; givenMl: number; colloidMl?: number }): Normovolaemia | null {
  if (!p.weightKg) return null;
  const w = p.weightKg;
  const hourly = hollidaySegar(w);
  const hours = Math.max(0, p.minutes) / 60;
  const deficit = Math.round(hourly * (p.fastingHours ?? 0));
  // Half in the first hour, the other half over the next two.
  const dueShare = hours <= 1 ? 0.5 * hours : Math.min(1, 0.5 + 0.25 * (hours - 1));
  const deficitDue = Math.round(deficit * dueShare);
  const basal = Math.round(hourly * hours);
  const loss = INSENSIBLE_LOSSES.find((l) => l.code === (p.loss ?? "surface"))!;
  const insensible: [number, number] = [Math.round(loss.perKgH[0] * w * hours), Math.round(loss.perKgH[1] * w * hours)];
  // Colloids given count 1 mL per mL of blood lost; the rest is replaced by crystalloids (3–4 ×).
  const colloidCover = Math.min(p.colloidMl ?? 0, p.bloodLossMl);
  const rest = p.bloodLossMl - colloidCover;
  const blood: [number, number] = [colloidCover + rest * 3, colloidCover + rest * 4];
  const expected: [number, number] = [deficitDue + basal + insensible[0] + blood[0], deficitDue + basal + insensible[1] + blood[1]];
  const status = p.givenMl < expected[0] ? "below" : p.givenMl > expected[1] ? "above" : "within";
  const lines = [
    `Jeûne : ${deficit} mL (${hourly} mL/h × ${p.fastingHours ?? 0} h) — dû à ce stade ${deficitDue} mL`,
    `Besoins de base : ${basal} mL (${hourly} mL/h)`,
    `Pertes insensibles (${loss.label.toLowerCase()}) : ${insensible[0]}–${insensible[1]} mL`,
    p.bloodLossMl ? `Saignement ${p.bloodLossMl} mL : ${blood[0]}–${blood[1]} mL à compenser` : "",
  ].filter(Boolean);
  return { deficitMl: deficit, deficitDueMl: deficitDue, basalMl: basal, hourlyMl: hourly, insensibleMl: insensible, bloodReplaceMl: blood, expectedMl: expected, givenMl: p.givenMl, status, lines };
}
