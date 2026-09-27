// Starting settings of the ventilator and the monitor alarms, computed for
// the patient (ideal weight, age, baseline blood pressure and heart rate,
// lung disease, obesity, laparoscopy, one-lung ventilation, raised ICP).
// They are starting points to adjust, not orders.
//
// Ventilation: perioperative protective ventilation consensus (Young et al.,
// Br J Anaesth 2019: Vt 6–8 mL/kg predicted body weight, PEEP ≥ 5,
// individualised; driving pressure); Manuel pratique d'anesthésie 2020
// (chap. 26 ventilation unipulmonaire, 37 enfant, 44 obésité).
// Alarms: set from the patient's own values (PAM ≥ 65 mmHg and within 20 %
// of the baseline; heart rate and pressures by age for children).

import { idealBodyWeight, type Sex } from "./scores";

export interface VentilationPatient {
  age?: number;
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
  sbp?: number;
  dbp?: number;
  hr?: number;
  copd?: boolean;
  asthma?: boolean;
  raisedIcp?: boolean;
  betaBlocked?: boolean;
  coronary?: boolean;
}

export interface VentilationContext {
  laparoscopy?: boolean;
  oneLung?: boolean;
  /** FiO₂ range of the gas plan. */
  fio2?: [number, number];
}

export interface SettingLine {
  label: string;
  value: string;
  why?: string;
}

const r10 = (x: number) => Math.round(x / 10) * 10;
const n = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Predicted body weight for the tidal volume: ideal weight (adult), or the weight for age in a child. */
export function predictedWeight(p: VentilationPatient): number | undefined {
  if (p.age !== undefined && p.age < 16) {
    if (p.weightKg) return p.weightKg;
    return p.age < 1 ? undefined : 2 * p.age + 8;
  }
  if (p.sex && p.heightCm) return Math.max(idealBodyWeight(p.sex, p.heightCm), 30);
  return undefined;
}

const bmiOf = (p: VentilationPatient) => (p.weightKg && p.heightCm ? p.weightKg / (p.heightCm / 100) ** 2 : undefined);

export function ventilationSettings(p: VentilationPatient, ctx: VentilationContext = {}): SettingLine[] {
  const child = p.age !== undefined && p.age < 16;
  const w = predictedWeight(p);
  const bmi = bmiOf(p);
  const obstructive = !!(p.copd || p.asthma);
  const out: SettingLine[] = [];
  if (ctx.oneLung) {
    out.push({ label: "Volume courant (unipulmonaire)", value: w ? `${r10(4 * w)}–${r10(6 * w)} mL` : "4–6 mL/kg de poids idéal", why: w ? `4–6 mL/kg × ${n(w)} kg (poids idéal)` : "Taille et sexe requis pour le poids idéal" });
  } else if (child) {
    out.push({ label: "Mode", value: "Pression contrôlée ou volume contrôlé à régulation de pression", why: "Fuite autour de la sonde, compliance du circuit" });
    out.push({ label: "Volume courant", value: w ? `${r10(6 * w)}–${r10(8 * w)} mL` : "6–8 mL/kg", why: w ? `6–8 mL/kg × ${n(w)} kg` : "Poids requis" });
    out.push({ label: "Pression inspiratoire", value: "10–20 cmH₂O au-dessus de la PEP", why: "Titrée sur le volume courant obtenu" });
  } else {
    out.push({ label: "Volume courant", value: w ? `${r10(6 * w)}–${r10(8 * w)} mL` : "6–8 mL/kg de poids idéal", why: w ? `6–8 mL/kg × ${n(w)} kg de poids idéal${p.weightKg && p.weightKg > w * 1.2 ? ` (pas le poids réel, ${p.weightKg} kg)` : ""}` : "Taille et sexe requis pour le poids idéal" });
  }
  const rr = child
    ? p.age! < 1
      ? "25–35/min"
      : p.age! < 6
        ? "20–25/min"
        : p.age! < 12
          ? "16–20/min"
          : "12–16/min"
    : obstructive
      ? "8–12/min"
      : "12–15/min";
  out.push({ label: "Fréquence", value: rr, why: obstructive ? "Obstructif : fréquence basse et expiration longue (éviter l'auto-PEP)" : "Ajuster sur l'EtCO₂" });
  out.push({ label: "I:E", value: obstructive ? "1:3 à 1:4" : "1:2" });
  const peep = ctx.oneLung ? "5 cmH₂O" : child ? "4–5 cmH₂O" : (bmi !== undefined && bmi >= 35) || ctx.laparoscopy ? "8–10 cmH₂O" : "5 cmH₂O";
  out.push({ label: "PEP", value: peep, why: bmi !== undefined && bmi >= 35 ? `IMC ${Math.round(bmi)} : PEP plus haute, recrutement` : ctx.laparoscopy ? "Pneumopéritoine : PEP plus haute" : "Individualiser (compliance, pression motrice)" });
  out.push({ label: "FiO₂", value: ctx.fio2 ? `${pct(ctx.fio2[0])}–${pct(ctx.fio2[1])} en entretien` : "40–50 % en entretien", why: "100 % à la préoxygénation et avant l'extubation ; puis la plus basse pour SpO₂ ≥ 94 %" + (ctx.oneLung ? " (≥ 92 % en unipulmonaire)" : "") });
  out.push({ label: "EtCO₂ visée", value: p.raisedIcp ? "35–40 mmHg" : "35–45 mmHg", why: p.raisedIcp ? "HTIC : normocapnie basse, pas d'hyperventilation prolongée" : undefined });
  out.push({ label: "Limites de pression", value: child ? "Plateau < 25 cmH₂O" : "Plateau < 30 (idéalement < 27) ; pression motrice < 15 cmH₂O" });
  out.push({ label: "Recrutement", value: "Après l'intubation et chaque déconnexion, si hémodynamique stable", why: "Ex. 30 cmH₂O pendant 30 s, ou PEP croissante par paliers" });
  return out;
}

export interface AlarmLine {
  label: string;
  low?: string;
  high?: string;
  why?: string;
}

/** Heart rate and systolic pressure limits by age (children). */
function childLimits(age: number): { hr: [number, number]; sbp: [number, number] } {
  if (age < 1) return { hr: [100, 180], sbp: [60, 110] };
  if (age < 6) return { hr: [80, 150], sbp: [70, 120] };
  if (age < 12) return { hr: [60, 130], sbp: [80, 130] };
  return { hr: [50, 120], sbp: [90, 140] };
}

export function alarmSettings(p: VentilationPatient, ctx: VentilationContext = {}): AlarmLine[] {
  const child = p.age !== undefined && p.age < 16;
  const out: AlarmLine[] = [];
  out.push({ label: "SpO₂", low: p.copd ? "88 %" : child && p.age! < 0.25 ? "90 %" : "92 %", high: child && p.age! < 0.25 ? "95 % (prématuré, nouveau-né)" : undefined, why: p.copd ? "BPCO hypercapnique : 88–92 %" : undefined });
  if (child) {
    const l = childLimits(p.age!);
    out.push({ label: "FC", low: `${l.hr[0]}/min`, high: `${l.hr[1]}/min`, why: `Enfant de ${p.age! < 1 ? `${Math.round(p.age! * 12)} mois` : `${Math.round(p.age!)} ans`}` });
    out.push({ label: "PAS", low: `${l.sbp[0]} mmHg`, high: `${l.sbp[1]} mmHg`, why: "Hypotension : baisse de 10–20 % de la valeur avant l'induction" });
  } else {
    const hrLow = p.hr ? Math.max(40, Math.round(p.hr * 0.75 / 5) * 5) : 45;
    const hrHigh = p.coronary || p.betaBlocked ? 100 : p.hr ? Math.min(130, Math.round((p.hr * 1.3) / 5) * 5) : 120;
    out.push({ label: "FC", low: `${hrLow}/min`, high: `${hrHigh}/min`, why: p.hr ? `Base ${p.hr}/min${p.coronary ? " ; coronarien : éviter la tachycardie" : ""}` : undefined });
    const baseMap = p.sbp && p.dbp ? p.dbp + (p.sbp - p.dbp) / 3 : undefined;
    const mapLow = baseMap ? Math.max(65, Math.round((baseMap * 0.8) / 5) * 5) : 65;
    const mapHigh = baseMap ? Math.round((baseMap * 1.2) / 5) * 5 : 110;
    out.push({ label: "PAM", low: `${mapLow} mmHg`, high: `${mapHigh} mmHg`, why: baseMap ? `PAM de base ≈ ${Math.round(baseMap)} mmHg (${p.sbp}/${p.dbp}) : ≥ 65 et ± 20 %` : "PA de base inconnue : PAM ≥ 65 mmHg" });
    out.push({ label: "PAS", high: p.sbp ? `${Math.min(180, Math.round((p.sbp * 1.2) / 5) * 5)} mmHg` : "160 mmHg" });
  }
  out.push({ label: "EtCO₂", low: p.raisedIcp ? "32 mmHg" : "30 mmHg", high: p.raisedIcp ? "42 mmHg" : "50 mmHg" });
  out.push({ label: "Pression des voies aériennes (Pmax)", high: child ? "25–30 cmH₂O" : ctx.laparoscopy || (p.weightKg && p.heightCm && p.weightKg / (p.heightCm / 100) ** 2 >= 35) ? "40 cmH₂O" : "35 cmH₂O", why: "Alarme haute : obstruction, bronchospasme, sonde sélective, pneumothorax, curarisation insuffisante" });
  const w = predictedWeight(p);
  out.push({ label: "Volume minute", low: w ? `${n((6 * w * (child ? 20 : 12)) / 1000 * 0.7)} L/min` : "≈ 70 % du volume réglé", why: "Fuite, débranchement, reprise ventilatoire" });
  out.push({ label: "Apnée", high: "20 s", why: "Ventilation spontanée, sédation" });
  out.push({ label: "FiO₂", low: "25 %", why: "Analyseur d'O₂ : jamais de mélange hypoxique" });
  out.push({ label: "Température", low: "36 °C", high: "38 °C", why: "Hyperthermie inexpliquée : penser à l'hyperthermie maligne" });
  out.push({ label: "BIS", low: "40", high: "60" });
  return out;
}

export const VENTILATION_SOURCE =
  "Ventilation protectrice : Young et al., Br J Anaesth 2019 ; Manuel pratique d'anesthésie 2020 (chap. 26, 37, 44). Alarmes : bornes calculées sur les valeurs du patient (PAM ≥ 65 mmHg et ± 20 % de la base), à ajuster ; normes de l'enfant selon l'âge.";
