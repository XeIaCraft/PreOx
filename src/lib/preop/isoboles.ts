// Hypnotic–opioid synergy (isoboles): the same depth of anaesthesia with
// less hypnotic and more opioid — faster awakening when the opioid is
// short-acting (remifentanil), less haemodynamic depression. Orders of
// magnitude to titrate on the clinical response and the depth monitor
// (BIS 40–60), never a prescription.
//
// Volatile: MAC reduction by opioids — isoflurane MAC halved by
// remifentanil 1,37 ng/mL, fentanyl 1,67 ng/mL or sufentanil 0,14 ng/mL
// (Lang et al., Anesthesiology 1996, PMID 8873541); sevoflurane MAC −61 %
// with fentanyl 3 ng/mL, −74 % with 6 ng/mL, ceiling beyond (Katoh et al.,
// Anesthesiology 1999, PMID 9952144). The awakening concentration (MAC-awake
// ≈ 0,34 MAC) is lowered much less (≈ −20–25 %, ceiling), so the opioid
// barely delays waking up from sevoflurane but prevents movement and the
// sympathetic response.
// Propofol–remifentanil: remifentanil alone does not ablate the response to
// laryngoscopy but strongly reduces the propofol needed (Bouillon et al.,
// Anesthesiology 2004, PMID 15166553); the fastest awakening comes from a
// low propofol and a high remifentanil concentration (Vuyk et al.,
// Anesthesiology 1997, PMID 9416739).

import { macAt } from "./gases";

export type Opioid = "remifentanil" | "sufentanil" | "fentanyl";

export const OPIOIDS: { code: Opioid; label: string; unit: string; range: [number, number]; step: number }[] = [
  { code: "remifentanil", label: "Rémifentanil (Ce)", unit: "ng/mL", range: [0, 8], step: 0.5 },
  { code: "sufentanil", label: "Sufentanil (Ce)", unit: "ng/mL", range: [0, 0.8], step: 0.05 },
  { code: "fentanyl", label: "Fentanyl (Cp)", unit: "ng/mL", range: [0, 6], step: 0.5 },
];

/** Fentanyl-equivalent concentration, from the concentrations halving the MAC (Lang 1996). */
function fentanylEquivalent(opioid: Opioid, c: number): number {
  return opioid === "fentanyl" ? c : opioid === "remifentanil" ? (c * 1.67) / 1.37 : (c * 1.67) / 0.14;
}

/** Remifentanil-equivalent effect-site concentration. */
export function remifentanilEquivalent(opioid: Opioid, c: number): number {
  return opioid === "remifentanil" ? c : (fentanylEquivalent(opioid, c) * 1.37) / 1.67;
}

const interp = (x: number, pts: [number, number][]) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + ((x - pts[i - 1][0]) * (pts[i][1] - pts[i - 1][1])) / (pts[i][0] - pts[i - 1][0]);
  return pts[pts.length - 1][1];
};

/** Fraction of the MAC removed by the opioid (fentanyl-equivalent points: Lang 1996, Katoh 1999). */
export function macReduction(opioid: Opioid, c: number): number {
  return interp(fentanylEquivalent(opioid, c), [
    [0, 0],
    [1.67, 0.5],
    [3, 0.61],
    [6, 0.74],
    [12, 0.8],
  ]);
}

/** Fraction of the MAC-awake removed (smaller, with an early ceiling). */
export function macAwakeReduction(opioid: Opioid, c: number): number {
  return interp(fentanylEquivalent(opioid, c), [
    [0, 0],
    [1, 0.19],
    [2, 0.24],
    [12, 0.24],
  ]);
}

export interface SevofluraneIsobole {
  mac: number;
  /** End-tidal sevoflurane preventing movement at incision in half the patients, with this opioid. */
  fetMac: number;
  /** ≈ 1,3 MAC-equivalent (95 % no movement). */
  fetMac95: number;
  /** End-tidal at which patients wake up. */
  fetAwake: number;
  reduction: number;
}

export function sevofluraneIsobole(age: number | undefined, opioid: Opioid, c: number): SevofluraneIsobole | null {
  const mac = macAt("sevoflurane", age);
  if (!mac) return null;
  const reduction = macReduction(opioid, c);
  const fetMac = mac * (1 - reduction);
  return { mac, fetMac, fetMac95: fetMac * 1.3, fetAwake: mac * 0.34 * (1 - macAwakeReduction(opioid, c)), reduction };
}

/**
 * Propofol effect-site concentration for tolerance of laryngoscopy (≈ 50–90 %
 * of patients) at a remifentanil concentration — order of magnitude read on
 * the response surface of Bouillon 2004. Hypnosis itself needs ≈ 1,5–2,5
 * µg/mL whatever the opioid: never go below (awareness), check the BIS.
 */
export function propofolForLaryngoscopy(remiCe: number): [number, number] {
  const mid = interp(remiCe, [
    [0, 6],
    [1, 4.5],
    [2, 3.5],
    [3, 2.9],
    [4, 2.5],
    [6, 2.1],
    [8, 1.9],
  ]);
  return [Math.max(1.5, mid * 0.85), mid * 1.15];
}

export const ISOBOLE_SOURCES = [
  "Lang et al., Anesthesiology 1996 (PMID 8873541) : CAM de l'isoflurane divisée par 2 avec rémifentanil 1,37 ng/mL, fentanyl 1,67 ng/mL ou sufentanil 0,14 ng/mL.",
  "Katoh et al., Anesthesiology 1999 (PMID 9952144) : CAM du sévoflurane −61 % avec fentanyl 3 ng/mL, −74 % à 6 ng/mL (plafond).",
  "Bouillon et al., Anesthesiology 2004 (PMID 15166553) : le rémifentanil seul ne supprime pas la réponse à la laryngoscopie mais réduit fortement le propofol nécessaire.",
  "Vuyk et al., Anesthesiology 1997 (PMID 9416739) : réveil le plus rapide avec peu de propofol et beaucoup de rémifentanil.",
];
