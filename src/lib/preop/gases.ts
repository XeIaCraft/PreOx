// Gases of a general anaesthesia: carrier gas, FiO₂, volatile agent and its
// MAC target, fresh gas flow — and the end-tidal concentration that MAC
// target means for this patient's age.
//
// Age-adjusted MAC: Mapleson, Br J Anaesth 1996 (MAC at 40 years: isoflurane
// 1.17 %, sevoflurane 1.80 %, desflurane 6.6 %, N₂O 104 %; × 10^(−0.00269 ×
// (age − 40))). Infants: sevoflurane MAC 3.3 % (newborn), 3.2 % (1–6 months),
// 2.5 % (6–12 months) — Lerman et al., Anesthesiology 1994.
// Default plan (sevoflurane in air/O₂, low flow, no N₂O routinely): ESAIC 2023
// environmental sustainability position (Glasgow declaration) — avoid
// desflurane and N₂O, fresh gas flow ≤ 1 L/min in maintenance.

import type { GasAgent, GasCarrier, GasPlan } from "./protocols";

export const GAS_AGENTS: { code: GasAgent; label: string; mac40?: number }[] = [
  { code: "sevoflurane", label: "Sévoflurane", mac40: 1.8 },
  { code: "desflurane", label: "Desflurane", mac40: 6.6 },
  { code: "isoflurane", label: "Isoflurane", mac40: 1.17 },
  { code: "tiva", label: "AIVOC (propofol ± rémifentanil), pas d'halogéné" },
];

export const GAS_CARRIERS: { code: GasCarrier; label: string }[] = [
  { code: "air", label: "Air / O₂" },
  { code: "n2o", label: "N₂O / O₂" },
];

const N2O_MAC40 = 104;
const ageFactor = (age: number) => Math.pow(10, -0.00269 * (age - 40));

/** MAC (%) of an agent at this age; infants from Lerman 1994 for sevoflurane. */
export function macAt(agent: GasAgent, ageYears: number | undefined): number | null {
  const a = GAS_AGENTS.find((x) => x.code === agent);
  if (!a?.mac40) return null;
  const age = ageYears ?? 40;
  if (agent === "sevoflurane" && age < 1) return age < 1 / 12 ? 3.3 : age < 0.5 ? 3.2 : 2.5;
  return Math.round(a.mac40 * ageFactor(Math.max(age, 1)) * 100) / 100;
}

/** Share of a MAC brought by the N₂O of the mix (0.5 FiO₂ → 50 % N₂O ≈ 0.5 MAC). */
export function n2oMacShare(n2oPercent: number, ageYears: number | undefined): number {
  return n2oPercent / (N2O_MAC40 * ageFactor(Math.max(ageYears ?? 40, 1)));
}

export interface GasTarget {
  /** End-tidal concentration range of the volatile agent, %. */
  fet: [number, number];
  mac: number;
  n2oShare: number;
}

/** End-tidal target of the volatile agent for this patient (N₂O counted). */
export function gasTarget(plan: GasPlan, ageYears: number | undefined): GasTarget | null {
  if (plan.agent === "tiva" || !plan.mac) return null;
  const mac = macAt(plan.agent, ageYears);
  if (!mac) return null;
  const n2oShare = plan.carrier === "n2o" ? n2oMacShare(Math.round((1 - plan.fio2[1]) * 100), ageYears) : 0;
  const r = (x: number) => Math.round(Math.max(0, x) * mac * 10) / 10;
  return { fet: [r(plan.mac[0] - n2oShare), r(plan.mac[1] - n2oShare)], mac, n2oShare: Math.round(n2oShare * 100) / 100 };
}

const pct = (f: number) => `${Math.round(f * 100)} %`;
const dec = (x: number, digits = 1) => x.toFixed(digits).replace(".", ",");

/** One line per item, for the theatre screen and the handover. */
export function describeGases(plan: GasPlan, ageYears: number | undefined): string[] {
  const out: string[] = [];
  const carrier = GAS_CARRIERS.find((c) => c.code === plan.carrier)?.label ?? "";
  out.push(`${carrier} — FiO₂ ${plan.fio2[0] === plan.fio2[1] ? pct(plan.fio2[0]) : `${pct(plan.fio2[0])}–${pct(plan.fio2[1])}`}`);
  if (plan.agent === "tiva") out.push("AIVOC propofol ± rémifentanil : pas d'halogéné");
  else {
    const label = GAS_AGENTS.find((a) => a.code === plan.agent)?.label ?? plan.agent;
    const t = gasTarget(plan, ageYears);
    const mac = plan.mac ? `CAM ${String(plan.mac[0]).replace(".", ",")}–${String(plan.mac[1]).replace(".", ",")}` : "";
    out.push(t ? `${label} : ${mac} → Fet ${dec(t.fet[0])}–${dec(t.fet[1])} % (1 CAM = ${dec(t.mac, 2)} %${ageYears !== undefined ? ` à ${ageYears < 1 ? `${Math.round(ageYears * 12)} mois` : `${Math.round(ageYears)} ans`}` : " à 40 ans"}${t.n2oShare ? `, N₂O compté ${String(t.n2oShare).replace(".", ",")} CAM` : ""})` : `${label} ${mac}`);
  }
  if (plan.freshGasLMin !== undefined) out.push(`Débit de gaz frais ${String(plan.freshGasLMin).replace(".", ",")} L/min en entretien (bas débit)`);
  if (plan.noN2O) out.push(`Pas de N₂O : ${plan.noN2O}`);
  if (plan.note) out.push(plan.note);
  return out;
}

/** The usual plan: sevoflurane in air/O₂, low flow. */
export const DEFAULT_GASES: GasPlan = { agent: "sevoflurane", carrier: "air", fio2: [0.4, 0.5], mac: [0.7, 1], freshGasLMin: 1 };

export const TIVA_GASES: GasPlan = { agent: "tiva", carrier: "air", fio2: [0.4, 0.5], freshGasLMin: 1 };

export const GASES_SOURCE = "CAM selon l'âge : Mapleson, Br J Anaesth 1996 ; nourrisson : Lerman, Anesthesiology 1994 ; bas débit, pas de desflurane ni de N₂O en routine : ESAIC 2023 (déclaration de Glasgow)";

/** One short line for the handover: « Sévoflurane CAM 0,7–1 (Fet 1,2–1,7 %), air/O₂ FiO₂ 40–50 %, 1 L/min ». */
export function gasesShort(plan: GasPlan, ageYears: number | undefined): string {
  const carrier = plan.carrier === "n2o" ? "N₂O/O₂" : "air/O₂";
  const fio2 = plan.fio2[0] === plan.fio2[1] ? pct(plan.fio2[0]) : `${Math.round(plan.fio2[0] * 100)}–${pct(plan.fio2[1])}`;
  let agent = "AIVOC, pas d'halogéné";
  if (plan.agent !== "tiva") {
    const label = GAS_AGENTS.find((a) => a.code === plan.agent)?.label ?? plan.agent;
    const t = gasTarget(plan, ageYears);
    agent = `${label}${plan.mac ? ` CAM ${dec(plan.mac[0]).replace(",0", "")}–${dec(plan.mac[1]).replace(",0", "")}` : ""}${t ? ` (Fet ${dec(t.fet[0])}–${dec(t.fet[1])} %)` : ""}`;
  }
  return [agent, `${carrier} FiO₂ ${fio2}`, plan.freshGasLMin !== undefined ? `${String(plan.freshGasLMin).replace(".", ",")} L/min` : ""].filter(Boolean).join(", ");
}
