// Anaesthesia protocols: reusable plans for an intervention (no patient
// data), stored on the server; copied into a patient dossier as its plan
// and adjusted there. Doses are written per kilo or fixed, with the weight
// they apply to — PreOx computes the dose for the patient and shows the
// basis next to it. Nothing here is pre-filled: doses and targets come
// from the user's own sources (the protocol's "source" field).

import { adjustedBodyWeight, idealBodyWeight, leanBodyWeight, type Sex } from "./scores";
import type { Technique } from "./rules/types";

export type WeightBasis = "total" | "ideal" | "lean" | "adjusted";
export type DoseUnit = "mg" | "µg" | "g" | "mL" | "UI";
export type DrugPhase = "premed" | "induction" | "maintenance" | "alr" | "antibio" | "analgesia" | "ponv" | "haemodynamic" | "other";

export const WEIGHT_BASES: { code: WeightBasis; label: string; short: string }[] = [
  { code: "total", label: "Poids réel", short: "réel" },
  { code: "ideal", label: "Poids idéal", short: "idéal" },
  { code: "lean", label: "Poids maigre", short: "maigre" },
  { code: "adjusted", label: "Poids ajusté", short: "ajusté" },
];

export const DRUG_PHASES: { code: DrugPhase; label: string }[] = [
  { code: "premed", label: "Prémédication" },
  { code: "induction", label: "Induction" },
  { code: "maintenance", label: "Entretien" },
  { code: "alr", label: "ALR" },
  { code: "antibio", label: "Antibioprophylaxie" },
  { code: "analgesia", label: "Analgésie" },
  { code: "ponv", label: "Prévention des NVPO" },
  { code: "haemodynamic", label: "Hémodynamique" },
  { code: "other", label: "Autre" },
];

export interface ProtocolDrug {
  id: string;
  name: string;
  /** Code of DRUG_ROUTES (pharmaco.ts): bolus_iv, pse, aivoc, perinerveux… */
  route: string;
  phase: DrugPhase;
  doseMode: "fixed" | "per_kg";
  amount: number | null;
  unit: DoseUnit;
  weightBasis: WeightBasis;
  /** Upper limit of the computed dose, same unit. */
  maxAmount: number | null;
  /** Re-dosing interval (antibiotic, relaxant…) — drives a timer in theatre. */
  redoseEveryMin: number | null;
  note: string;
}

export interface ProtocolRisk {
  title: string;
  conduct: string;
}

export interface ProtocolContent {
  techniques: Technique[];
  drugs: ProtocolDrug[];
  /** Vital-sign and ventilation targets, one per line ("PAM ≥ 65 mmHg"). */
  targets: string[];
  /** Monitoring and equipment (procedure codes of pharmaco.ts or free text). */
  material: string[];
  risks: ProtocolRisk[];
  postop: string[];
  /** Tourniquet alert threshold, minutes (0 = no tourniquet). */
  tourniquetAlertMin: number | null;
  notes: string;
}

export interface Protocol {
  id: string;
  name: string;
  surgery: string;
  operation_category: string;
  hospital: string;
  content: ProtocolContent;
  source: string;
  created_at: string;
  updated_at: string;
}

export function emptyProtocolContent(): ProtocolContent {
  return { techniques: [], drugs: [], targets: [], material: [], risks: [], postop: [], tourniquetAlertMin: null, notes: "" };
}

export interface BodyData {
  sex?: Sex;
  weightKg?: number;
  heightCm?: number;
}

export function weightFor(basis: WeightBasis, body: BodyData): number | null {
  const { sex, weightKg, heightCm } = body;
  if (!weightKg) return null;
  if (basis === "total") return weightKg;
  if (!sex || !heightCm) return null;
  if (basis === "ideal") return idealBodyWeight(sex, heightCm);
  if (basis === "lean") return leanBodyWeight(sex, weightKg, heightCm);
  return adjustedBodyWeight(sex, weightKg, heightCm);
}

export interface ComputedDose {
  value: number;
  unit: DoseUnit;
  /** Weight used, kg — null for a fixed dose. */
  basisKg: number | null;
  capped: boolean;
}

function roundDose(v: number): number {
  if (v >= 100) return Math.round(v);
  if (v >= 10) return Math.round(v * 2) / 2;
  if (v >= 1) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

/** The dose for this patient, or null when the weight it depends on isn't known yet. */
export function computeDose(drug: Pick<ProtocolDrug, "doseMode" | "amount" | "unit" | "weightBasis" | "maxAmount">, body: BodyData): ComputedDose | null {
  if (drug.amount === null || drug.amount <= 0) return null;
  if (drug.doseMode === "fixed") return { value: drug.amount, unit: drug.unit, basisKg: null, capped: false };
  const kg = weightFor(drug.weightBasis, body);
  if (kg === null) return null;
  let value = drug.amount * kg;
  let capped = false;
  if (drug.maxAmount !== null && drug.maxAmount > 0 && value > drug.maxAmount) {
    value = drug.maxAmount;
    capped = true;
  }
  return { value: roundDose(value), unit: drug.unit, basisKg: Math.round(kg * 10) / 10, capped };
}

export function formatDose(d: ComputedDose): string {
  return `${String(d.value).replace(".", ",")} ${d.unit}`;
}

/** "2 mg/kg × 71 kg (idéal)" — how the dose was obtained. */
export function doseBasis(drug: Pick<ProtocolDrug, "doseMode" | "amount" | "unit" | "weightBasis" | "maxAmount">, d: ComputedDose | null): string {
  if (drug.doseMode === "fixed") return "dose fixe";
  const basis = WEIGHT_BASES.find((b) => b.code === drug.weightBasis)?.short ?? drug.weightBasis;
  const per = `${String(drug.amount ?? "?").replace(".", ",")} ${drug.unit}/kg`;
  if (!d) return `${per} · poids ${basis} inconnu`;
  return `${per} × ${String(d.basisKg).replace(".", ",")} kg (${basis})${d.capped ? ` · plafonné à ${drug.maxAmount} ${drug.unit}` : ""}`;
}
