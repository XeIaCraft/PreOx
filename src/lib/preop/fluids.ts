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
