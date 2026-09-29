// The patient's haemodynamic numbers, computed from age, sex, weight,
// height, Hb and the consultation's blood pressure: blood volume, plasma
// and red cell volume, tolerated blood loss by transfusion threshold,
// haemorrhage classes in millilitres, expected cardiac output and stroke
// volume, pressure targets, fluid challenge, maintenance, urine output,
// oxygen delivery. Orders of magnitude for this patient, not measurements.
//
// Blood volume: Nadler, Hidalgo, Bloch, Surgery 1962 (PMID 21936146);
// obesity: Lemmens, Bernstein, Brodsky, Obes Surg 2006 (PMID 16756741);
// children: 75–90 mL/kg. Tolerated loss: Gross, Anesthesiology 1983 (PMID
// 6829965). Pressure: individualised target, SBP within 10 % of baseline
// (Futier et al., INPRESS, JAMA 2017, PMID 28973220). Fluid challenge:
// Cecconi et al., Crit Care 2011 (PMID 21843353).

import type { Sex } from "./scores";
import { adjustedBodyWeight, bmi, idealBodyWeight, leanBodyWeight } from "./scores";
import { bodySurface } from "./monitoring";

export interface HaemoInput {
  age?: number;
  sex?: Sex;
  weightKg?: number;
  heightCm?: number;
  hb?: number;
  sbp?: number;
  dbp?: number;
  hr?: number;
  /** Coronary disease, heart failure, cardiac surgery: transfusion threshold 9. */
  cardiac?: boolean;
}

export interface HaemoRow {
  label: string;
  value: string;
  detail?: string;
}

export interface HaemoProfile {
  body: HaemoRow[];
  volumes: HaemoRow[];
  bleeding: HaemoRow[];
  pump: HaemoRow[];
  fluids: HaemoRow[];
  /** Estimated blood volume (mL). */
  ebv?: number;
  missing: string[];
}

export const HAEMO_SOURCES = [
  "Volume sanguin : Nadler, Hidalgo, Bloch, Surgery 1962 (PMID 21936146) ; obésité : Lemmens et al., Obes Surg 2006 (PMID 16756741), 70 / √(IMC/22) mL/kg.",
  "Pertes tolérées : Gross, Anesthesiology 1983 (PMID 6829965) — VS × (Hb initiale − Hb seuil) / Hb moyenne.",
  "Pression individualisée : PAS à ± 10 % de la valeur de base (Futier et al., INPRESS, JAMA 2017, PMID 28973220) ; PAM ≥ 65 mmHg.",
  "Épreuve de remplissage : Cecconi et al., Crit Care 2011 (PMID 21843353).",
];

const r = (x: number, step = 1) => Math.round(x / step) * step;
const n = (x: number, d = 1) => x.toLocaleString("fr-BE", { maximumFractionDigits: d });
const ml = (x: number) => `${n(r(x, x >= 1000 ? 50 : 10), 0)} mL`;

/** Estimated blood volume (mL) and how it was obtained. */
export function bloodVolume(i: HaemoInput): { ml: number; how: string } | null {
  const { age, sex, weightKg: w, heightCm: h } = i;
  if (!w) return null;
  if (age !== undefined && age < 16) {
    const perKg = age < 1 / 12 ? 90 : age < 1 ? 80 : age < 12 ? 75 : 70;
    return { ml: w * perKg, how: `${perKg} mL/kg (enfant de cet âge)` };
  }
  if (h) {
    const b = bmi(w, h);
    if (b >= 30) {
      const perKg = 70 / Math.sqrt(b / 22);
      return { ml: w * perKg, how: `obésité (IMC ${n(b, 0)}) : 70 / √(IMC/22) = ${n(perKg, 0)} mL/kg (Lemmens)` };
    }
    if (sex) {
      const m = h / 100;
      const litres = sex === "M" ? 0.3669 * m ** 3 + 0.03219 * w + 0.6041 : 0.3561 * m ** 3 + 0.03308 * w + 0.1833;
      return { ml: litres * 1000, how: `formule de Nadler (${sex === "M" ? "homme" : "femme"}, taille, poids) ≈ ${n((litres * 1000) / w, 0)} mL/kg` };
    }
  }
  const perKg = sex === "F" ? 65 : 70;
  return { ml: w * perKg, how: `${perKg} mL/kg${age !== undefined && age >= 65 ? " (plutôt 60 chez le sujet âgé)" : ""}` };
}

export function haemoProfile(i: HaemoInput): HaemoProfile {
  const missing: string[] = [];
  if (!i.weightKg) missing.push("poids");
  if (!i.heightCm) missing.push("taille");
  if (!i.sex) missing.push("sexe");
  if (i.hb === undefined) missing.push("Hb");
  if (!i.sbp || !i.dbp) missing.push("pression artérielle de base");
  const w = i.weightKg;
  const h = i.heightCm;
  const child = i.age !== undefined && i.age < 16;

  const body: HaemoRow[] = [];
  const bsa = w && h ? bodySurface(w, h) : undefined;
  if (w && h) {
    body.push({ label: "IMC", value: n(bmi(w, h)) });
    body.push({ label: "Surface corporelle", value: `${n(bsa!, 2)} m²`, detail: "Mosteller" });
    if (i.sex && !child) {
      body.push({ label: "Poids idéal", value: `${n(idealBodyWeight(i.sex, h), 0)} kg`, detail: "volume courant, dose des curares non dépolarisants" });
      body.push({ label: "Poids maigre", value: `${n(leanBodyWeight(i.sex, w, h), 0)} kg`, detail: "induction (propofol, opioïdes) chez l'obèse" });
      if (bmi(w, h) >= 30) body.push({ label: "Poids ajusté", value: `${n(adjustedBodyWeight(i.sex, w, h), 0)} kg`, detail: "antibiotiques, entretien" });
    }
  }

  const ebv = bloodVolume(i);
  const volumes: HaemoRow[] = [];
  if (ebv) {
    volumes.push({ label: "Volume sanguin estimé", value: ml(ebv.ml), detail: ebv.how });
    if (i.hb !== undefined) {
      const hct = Math.min(0.65, (i.hb * 3) / 100);
      volumes.push({ label: "Volume globulaire", value: ml(ebv.ml * hct), detail: `Ht ≈ ${n(hct * 100, 0)} % (≈ Hb × 3)` });
      volumes.push({ label: "Volume plasmatique", value: ml(ebv.ml * (1 - hct)) });
      // One red cell unit (≈ 55 g of Hb) spread in the blood volume.
      volumes.push({ label: "1 culot globulaire", value: `+ ${n(55 / (ebv.ml / 100), 1)} g/dL d'Hb`, detail: child ? "enfant : 10–15 mL/kg de CGR ≈ + 2–3 g/dL" : "≈ 55 g d'Hb par culot, répartis dans le volume sanguin" });
    }
    volumes.push({ label: "Liquide extracellulaire", value: w ? ml(w * (child && (i.age ?? 99) < 1 ? 400 : 200)) : "—", detail: child && (i.age ?? 99) < 1 ? "≈ 40 % du poids (nourrisson)" : "≈ 20 % du poids ; eau totale ≈ 60 %" });
  }

  const bleeding: HaemoRow[] = [];
  if (ebv) {
    if (i.hb !== undefined) {
      const thresholds = child ? [7, 8] : i.cardiac ? [8, 9, 10] : [7, 8, 9];
      for (const t of thresholds) {
        const loss = i.hb > t ? ((i.hb - t) / ((i.hb + t) / 2)) * ebv.ml : 0;
        bleeding.push({ label: `Pertes tolérées jusqu'à Hb ${t}`, value: loss > 0 ? ml(loss) : "déjà au seuil", detail: `(${n(i.hb)} − ${t}) / ${n((i.hb + t) / 2)} × VS, pertes compensées volume pour volume` });
      }
    }
    const classes: [string, number, number | null, string][] = [
      ["Classe I", 0, 0.15, "FC normale, PA normale"],
      ["Classe II", 0.15, 0.3, "tachycardie, pression pulsée pincée"],
      ["Classe III", 0.3, 0.4, "hypotension, oligurie, confusion : transfusion"],
      ["Classe IV", 0.4, null, "choc majeur : transfusion massive"],
    ];
    for (const [label, lo, hi, what] of classes) bleeding.push({ label: `Hémorragie ${label}`, value: !lo ? `< ${ml(ebv.ml * hi!)}` : hi ? `${ml(ebv.ml * lo)}–${ml(ebv.ml * hi)}` : `> ${ml(ebv.ml * lo)}`, detail: what });
    bleeding.push({ label: "Transfusion massive", value: `> ${ml(ebv.ml)} en 24 h ou > ${ml(ebv.ml / 2)} en 3 h`, detail: "1 volume sanguin en 24 h, ½ en 3 h : protocole, ratio CGR:PFC:plaquettes proche de 1:1:1, fibrinogène, calcium" });
  }

  const pump: HaemoRow[] = [];
  if (i.sbp && i.dbp) {
    const map = (i.sbp + 2 * i.dbp) / 3;
    pump.push({ label: "PAM de base", value: `${n(map, 0)} mmHg`, detail: `${i.sbp}/${i.dbp} en consultation` });
    pump.push({ label: "Cible de PAS", value: `${n(i.sbp * 0.9, 0)}–${n(i.sbp * 1.1, 0)} mmHg`, detail: "± 10 % de la valeur de base (INPRESS)" });
    pump.push({ label: "Seuil d'alerte", value: `PAM < ${n(Math.max(65, map * 0.8), 0)} mmHg`, detail: "< 65 mmHg ou < 80 % de la base : lésions rénales et myocardiques" });
    if (i.hr) pump.push({ label: "Index de choc de base", value: n(i.hr / i.sbp, 2), detail: "FC / PAS ; > 0,9–1 : hypovolémie ou choc" });
  } else pump.push({ label: "Cible de PAM", value: "≥ 65 mmHg", detail: "pression de base inconnue : la noter en consultation pour une cible individuelle" });
  if (bsa) {
    pump.push({ label: "Débit cardiaque attendu", value: `${n(2.5 * bsa)}–${n(4 * bsa)} L/min`, detail: "index cardiaque 2,5–4 L/min/m²" });
    pump.push({ label: "Volume d'éjection attendu", value: `${n(35 * bsa, 0)}–${n(65 * bsa, 0)} mL`, detail: "VES indexé 35–65 mL/m²" });
    if (i.hb !== undefined) {
      const cao2 = 1.34 * i.hb * 0.98 + 0.003 * 95;
      pump.push({ label: "Transport d'O₂ (DO₂) attendu", value: `${n(r(cao2 * 2.5 * bsa * 10, 10), 0)}–${n(r(cao2 * 4 * bsa * 10, 10), 0)} mL/min`, detail: `CaO₂ ≈ ${n(cao2)} mL/dL (1,34 × Hb × SaO₂) ; DO₂ indexée normale 400–600 mL/min/m²` });
    }
    pump.push({ label: "Consommation d'O₂ (VO₂)", value: `${n(r(110 * bsa, 10), 0)}–${n(r(160 * bsa, 10), 0)} mL/min`, detail: "110–160 mL/min/m², ≈ 3,5 mL/kg/min ; ↓ 30–40 % sous anesthésie générale" });
  }
  pump.push({ label: "Prédiction de la réponse au remplissage", value: "VPP > 12–13 %", detail: "ventilation contrôlée ≥ 8 mL/kg, rythme sinusal, thorax fermé ; zone grise 9–13 %" });

  const fluids: HaemoRow[] = [];
  if (w) {
    const ch = Math.min(w, 10) * 4 + Math.min(Math.max(w - 10, 0), 10) * 2 + Math.max(w - 20, 0);
    fluids.push({ label: "Entretien (4-2-1)", value: `${n(ch, 0)} mL/h`, detail: child ? "cristalloïde isotonique glucosé chez le petit enfant" : "adulte : souvent 1–2 mL/kg/h peropératoire suffisent (restrictif raisonné)" });
    fluids.push({ label: "Épreuve de remplissage", value: child ? `${n(w * 10, 0)}–${n(w * 20, 0)} mL` : `250 mL (≈ ${n(w * 3, 0)}–${n(w * 4, 0)} mL, 3–4 mL/kg)`, detail: "en 5–10 min ; répondeur si VES ou débit ↑ ≥ 10–15 %" });
    fluids.push({ label: "Diurèse cible", value: `≥ ${n(w * 0.5, 0)} mL/h`, detail: child && (i.age ?? 99) < 1 ? "nourrisson : ≥ 1–2 mL/kg/h" : "0,5 mL/kg/h" });
  }

  return { body, volumes, bleeding, pump, fluids, ebv: ebv?.ml, missing };
}
