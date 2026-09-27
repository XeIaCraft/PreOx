// Target-controlled infusion (AIVOC): what to enter in the pump for this
// patient, the usual targets by phase, and the equivalent manual infusion
// rates (mL/h) at a constant plasma target — computed from the published
// three-compartment models.
//
// Models: propofol — Marsh (Br J Anaesth 1991; ke0 0.26 min⁻¹ of the
// Diprifusor), Schnider (Anesthesiology
// 1998–1999), Paedfusor (Absalom, Br J Anaesth 2003); remifentanil — Minto
// (Anesthesiology 1997); sufentanil — Gepts (Anesthesiology 1995). Lean body
// mass of Schnider and Minto: James formula, as the pumps compute it.
// Practical use: Absalom et al., « Target-controlled infusion: a mature
// technology », Anesth Analg 2016. Targets are usual ranges to titrate on the
// clinical response and the depth-of-anaesthesia monitor (BIS 40–60).

import type { Sex } from "./scores";
import { adjustedBodyWeight, bmi, idealBodyWeight } from "./scores";

export type TciDrug = "propofol" | "remifentanil" | "sufentanil";
export type TciModel = "marsh" | "schnider" | "paedfusor" | "minto" | "gepts" | "eleveld";

export interface TciPatient {
  age?: number;
  sex?: Sex;
  weightKg?: number;
  heightCm?: number;
}

interface Pk {
  v1: number;
  k10: number;
  k12: number;
  k13: number;
  k21: number;
  k31: number;
  ke0: number;
}

/** Lean body mass, James formula (the one programmed in the pumps). */
export function jamesLbm(sex: Sex, weightKg: number, heightCm: number): number {
  const r = weightKg / heightCm;
  return sex === "M" ? 1.1 * weightKg - 128 * r * r : 1.07 * weightKg - 148 * r * r;
}

/** James is wrong in obesity (lean mass falls as weight rises): beyond this BMI, do not use it. */
export const JAMES_LIMIT_BMI: Record<Sex, number> = { M: 42, F: 35 };

function fromClearances(v1: number, v2: number, v3: number, cl1: number, cl2: number, cl3: number, ke0: number): Pk {
  return { v1, k10: cl1 / v1, k12: cl2 / v1, k13: cl3 / v1, k21: cl2 / v2, k31: cl3 / v3, ke0 };
}

function pkOf(model: TciModel, p: Required<TciPatient>, weight: number): Pk | null {
  const lbm = jamesLbm(p.sex, weight, p.heightCm);
  switch (model) {
    case "marsh":
      return { v1: 0.228 * weight, k10: 0.119, k12: 0.112, k13: 0.0419, k21: 0.055, k31: 0.0033, ke0: 0.26 };
    case "paedfusor":
      return { v1: 0.4584 * weight, k10: 0.1527 * Math.pow(weight, -0.3), k12: 0.114, k13: 0.0419, k21: 0.055, k31: 0.0033, ke0: 0.26 };
    case "schnider":
      return fromClearances(4.27, 18.9 - 0.391 * (p.age - 53), 238, 1.89 + 0.0456 * (weight - 77) - 0.0681 * (lbm - 59) + 0.0264 * (p.heightCm - 177), 1.29 - 0.024 * (p.age - 53), 0.836, 0.456);
    case "minto":
      return fromClearances(
        5.1 - 0.0201 * (p.age - 40) + 0.072 * (lbm - 55),
        9.82 - 0.0811 * (p.age - 40) + 0.108 * (lbm - 55),
        5.42,
        2.6 - 0.0162 * (p.age - 40) + 0.0191 * (lbm - 55),
        2.05 - 0.0301 * (p.age - 40),
        0.076 - 0.00113 * (p.age - 40),
        0.595 - 0.007 * (p.age - 40)
      );
    case "gepts":
      return { v1: 14.3, k10: 0.0645, k12: 0.1086, k13: 0.0229, k21: 0.0245, k31: 0.0013, ke0: 0.112 };
    case "eleveld":
      return null; // not simulated here: set on the pump (all ages, obesity)
  }
}

/**
 * Infusion rate keeping the plasma concentration constant, t minutes after it
 * was reached (R(t) = V1·Cp·(k10 + k12·e^(−k21·t) + k13·e^(−k31·t))), per minute,
 * in the unit of the concentration × litre (µg/mL × L = mg; ng/mL × L = µg).
 */
export function rateAt(pk: Pk, cp: number, minutes: number): number {
  return pk.v1 * cp * (pk.k10 + pk.k12 * Math.exp(-pk.k21 * minutes) + pk.k13 * Math.exp(-pk.k31 * minutes));
}

export interface TciTarget {
  phase: string;
  range: [number, number];
}

export interface TciModelPlan {
  model: TciModel;
  label: string;
  /** Plasma (Cp) or effect-site (Ce) targeting. */
  mode: "Cp" | "Ce";
  /** What to enter in the pump. */
  inputs: string[];
  valid: boolean;
  warnings: string[];
  targets: TciTarget[];
  /** Equivalent manual rates at the middle maintenance target (mL/h at the syringe concentration). */
  rates: { minutes: number; perHour: number; mlPerHour: number }[];
}

export interface TciDrugInfo {
  code: TciDrug;
  label: string;
  /** Concentration unit of the targets. */
  unit: string;
  /** Amount unit of the rates (target unit × L). */
  amountUnit: "mg" | "µg";
  /** Usual syringe concentration, amount unit per mL. */
  syringe: number;
  syringeLabel: string;
}

export const TCI_DRUGS: TciDrugInfo[] = [
  { code: "propofol", label: "Propofol", unit: "µg/mL", amountUnit: "mg", syringe: 10, syringeLabel: "10 mg/mL (1 %)" },
  { code: "remifentanil", label: "Rémifentanil", unit: "ng/mL", amountUnit: "µg", syringe: 50, syringeLabel: "50 µg/mL (2 mg dans 40 mL)" },
  { code: "sufentanil", label: "Sufentanil", unit: "ng/mL", amountUnit: "µg", syringe: 5, syringeLabel: "5 µg/mL (250 µg dans 50 mL)" },
];

const older = (age: number) => age >= 65;

function targetsFor(drug: TciDrug, p: Required<TciPatient>, frail: boolean): TciTarget[] {
  const reduce = older(p.age) || frail;
  switch (drug) {
    case "propofol":
      if (p.age < 16)
        return [
          { phase: "Induction (enfant)", range: [4, 6] },
          { phase: "Entretien avec opioïde", range: [3, 5] },
          { phase: "Sédation", range: [1, 2] },
        ];
      return reduce
        ? [
            { phase: "Induction (âgé ou fragile : paliers de 0,5)", range: [1.5, 3] },
            { phase: "Entretien avec opioïde", range: [1.5, 3] },
            { phase: "Sédation", range: [0.5, 1] },
            { phase: "Réveil attendu vers", range: [0.8, 1.2] },
          ]
        : [
            { phase: "Induction", range: [4, 6] },
            { phase: "Entretien avec opioïde", range: [2.5, 4] },
            { phase: "Entretien sans opioïde", range: [4, 6] },
            { phase: "Sédation", range: [0.5, 1.5] },
            { phase: "Réveil attendu vers", range: [1, 1.5] },
          ];
    case "remifentanil":
      return [
        { phase: "Intubation", range: reduce ? [2, 4] : [4, 6] },
        { phase: "Entretien (selon la stimulation)", range: reduce ? [2, 5] : [3, 8] },
        { phase: "Sédation en ventilation spontanée", range: [0.5, 1.5] },
      ];
    case "sufentanil":
      return [
        { phase: "Intubation", range: reduce ? [0.2, 0.3] : [0.3, 0.5] },
        { phase: "Entretien", range: reduce ? [0.1, 0.25] : [0.2, 0.4] },
        { phase: "Extubation, ventilation spontanée", range: [0.1, 0.2] },
      ];
  }
}

const MODELS: Record<TciDrug, TciModel[]> = {
  propofol: ["schnider", "marsh", "eleveld", "paedfusor"],
  remifentanil: ["minto", "eleveld"],
  sufentanil: ["gepts"],
};

const MODEL_LABEL: Record<TciModel, string> = {
  marsh: "Marsh (modifié)",
  schnider: "Schnider",
  paedfusor: "Paedfusor",
  minto: "Minto",
  gepts: "Gepts",
  eleveld: "Eleveld",
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const dec = (x: number) => String(r1(x)).replace(".", ",");

/** Every model the pump may offer for this drug, with its settings for this patient. */
export function tciPlan(drug: TciDrug, patient: TciPatient, opts: { frail?: boolean; syringe?: number } = {}): TciModelPlan[] | null {
  const { age, sex, weightKg, heightCm } = patient;
  if (age === undefined || !sex || !weightKg || !heightCm) return null;
  const p = { age, sex, weightKg, heightCm };
  const info = TCI_DRUGS.find((d) => d.code === drug)!;
  const syringe = opts.syringe ?? info.syringe;
  const b = bmi(weightKg, heightCm);
  const obese = b >= 30;
  const jamesBroken = b > JAMES_LIMIT_BMI[sex];
  const abw = adjustedBodyWeight(sex, weightKg, heightCm);
  const targets = targetsFor(drug, p, !!opts.frail);
  const maintenance = targets.find((t) => /Entretien/.test(t.phase)) ?? targets[0];
  const mid = (maintenance.range[0] + maintenance.range[1]) / 2;

  return MODELS[drug].map((model) => {
    const warnings: string[] = [];
    let valid = true;
    let weight = weightKg;
    const inputs: string[] = [];
    let mode: "Cp" | "Ce" = "Ce";
    switch (model) {
      case "marsh":
        mode = "Cp";
        if (age < 16) {
          valid = false;
          warnings.push("Adulte seulement : Paedfusor chez l'enfant.");
        }
        if (obese) {
          weight = abw;
          warnings.push(`Obésité : le poids total surdose (volume central proportionnel au poids) — entrer le poids ajusté (${Math.round(abw)} kg) ou préférer Eleveld.`);
        }
        inputs.push(`Poids ${Math.round(weight)} kg`, "Mode plasma (Cp)");
        break;
      case "schnider":
        if (age < 16) {
          valid = false;
          warnings.push("Validé à partir de 16 ans environ : Paedfusor ou Eleveld chez l'enfant.");
        }
        if (jamesBroken) {
          valid = false;
          warnings.push(`IMC ${Math.round(b)} : la masse maigre de James devient fausse au-delà de ${JAMES_LIMIT_BMI[sex]} (${sex === "M" ? "homme" : "femme"}) — Eleveld, ou Marsh au poids ajusté.`);
        }
        inputs.push(`Âge ${age} ans`, `Poids ${weightKg} kg`, `Taille ${heightCm} cm`, `Sexe ${sex === "M" ? "homme" : "femme"}`, "Mode site effet (Ce)");
        break;
      case "paedfusor":
        mode = "Cp";
        if (age < 1 || age >= 17 || weightKg < 5 || weightKg > 61) {
          valid = false;
          warnings.push("Validé de 1 à 16 ans et de 5 à 61 kg.");
        }
        inputs.push(`Âge ${age} ans`, `Poids ${weightKg} kg`, "Mode plasma (Cp)");
        break;
      case "minto":
        if (age < 12) {
          valid = false;
          warnings.push("Adulte (données de 20 à 85 ans) : prudence chez l'adolescent, pas chez l'enfant.");
        }
        if (jamesBroken) {
          valid = false;
          warnings.push(`IMC ${Math.round(b)} : masse maigre de James fausse — Eleveld, ou perfusion manuelle au poids idéal (${Math.round(idealBodyWeight(sex, heightCm))} kg).`);
        }
        inputs.push(`Âge ${age} ans`, `Poids ${weightKg} kg`, `Taille ${heightCm} cm`, `Sexe ${sex === "M" ? "homme" : "femme"}`, "Mode site effet (Ce)");
        break;
      case "gepts":
        mode = "Cp";
        if (age < 18) warnings.push("Modèle établi chez l'adulte.");
        inputs.push("Poids non utilisé par le modèle (paramètres fixes)", "Mode plasma (Cp) ou site effet selon la pompe");
        break;
      case "eleveld":
        inputs.push(`Âge ${age} ans`, `Poids ${weightKg} kg`, `Taille ${heightCm} cm`, `Sexe ${sex === "M" ? "homme" : "femme"}`, "Mode site effet (Ce)");
        warnings.push("Tous âges et obésité ; présent sur les pompes récentes seulement (débits non calculés ici).");
        break;
    }
    const pk = valid ? pkOf(model, p, weight) : null;
    const rates = pk
      ? [10, 30, 60, 120].map((minutes) => {
          const perMin = rateAt(pk, mid, minutes);
          return { minutes, perHour: r1(perMin * 60), mlPerHour: r1((perMin * 60) / syringe) };
        })
      : [];
    return { model, label: MODEL_LABEL[model], mode, inputs, valid, warnings, targets, rates };
  });
}

/** One line for a product row: « AIVOC Schnider Ce 2,5–4 µg/mL ≈ 12 mL/h à 1 h ». */
export function tciSummary(drug: TciDrug, patient: TciPatient): string | null {
  const plans = tciPlan(drug, patient);
  const plan = plans?.find((x) => x.valid && x.rates.length);
  if (!plan) return null;
  const info = TCI_DRUGS.find((d) => d.code === drug)!;
  const m = plan.targets.find((t) => /Entretien/.test(t.phase)) ?? plan.targets[0];
  const h1 = plan.rates.find((r) => r.minutes === 60);
  return `AIVOC ${plan.label} ${plan.mode} ${dec(m.range[0])}–${dec(m.range[1])} ${info.unit}${h1 ? ` ≈ ${dec(h1.mlPerHour)} mL/h à 1 h (${info.syringeLabel})` : ""}`;
}

/** The drug of a plan line, when it can be given by TCI. */
export function tciDrugOf(name: string): TciDrug | null {
  const n = name.toLowerCase();
  if (/propofol/.test(n)) return "propofol";
  if (/r[ée]mifentanil/.test(n)) return "remifentanil";
  if (/sufentanil/.test(n)) return "sufentanil";
  return null;
}

export const TCI_SOURCE =
  "Modèles : Marsh 1991, Schnider 1998–1999, Paedfusor (Absalom 2003), Minto 1997, Gepts 1995 ; masse maigre de James comme les pompes ; usage : Absalom et al., Anesth Analg 2016. Cibles usuelles à titrer sur la clinique et le BIS (40–60). Débits : maintien d'une concentration plasmatique constante, indicatifs.";

/**
 * Maintenance targets of a TIVA for the gas plan: propofol and remifentanil
 * effect-site ranges for this age (reduced from 65 years or when frail).
 */
export function tivaMaintenance(age: number | undefined, frail = false): { drug: string; range: [number, number]; unit: string; phase: string }[] {
  const p = { age: age ?? 40, sex: "M" as Sex, weightKg: 70, heightCm: 170 };
  const pick = (drug: TciDrug, re: RegExp) => {
    const t = targetsFor(drug, p, frail).find((x) => re.test(x.phase))!;
    const info = TCI_DRUGS.find((d) => d.code === drug)!;
    return { drug: info.label, range: t.range, unit: info.unit, phase: t.phase };
  };
  return [pick("propofol", /Entretien avec opioïde/), pick("remifentanil", /Entretien/), ...(p.age >= 16 ? [pick("propofol", /Réveil/)] : [])];
}
