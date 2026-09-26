// Doses of the plan's drugs to adapt to the kidney (creatinine clearance,
// Cockcroft-Gault) and to the liver (cirrhosis, Child-Pugh class). Only the
// drugs of the plan are looked at; the text says what to do.
//
// Sources: Manuel pratique d'anesthésie (2020), chap. 6–10 et 31–32 ; RCP
// belges (CBIP) : morphine, tramadol, gabapentinoïdes, métoclopramide,
// énoxaparine, sugammadex, ondansétron, paracétamol.

import { fold } from "./catalog";

export interface OrganRule {
  name: string;
  /** Words matched in a plan drug's name (folded). */
  words: string[];
  /** From the lowest threshold up: the first one below which the clearance falls applies. */
  renal?: { below: number; text: string }[];
  /** Cirrhosis (any class), and a stronger text for Child B or C. */
  hepatic?: { any?: string; severe?: string };
}

export const ORGAN_RULES: OrganRule[] = [
  {
    name: "Morphine",
    words: ["morphine"],
    renal: [
      { below: 30, text: "à éviter (accumulation de la morphine-6-glucuronide : sédation, dépression respiratoire retardée) — fentanyl, ou oxycodone ou hydromorphone à dose réduite" },
      { below: 60, text: "doses réduites et intervalles allongés, surveillance de la sédation" },
    ],
    hepatic: { any: "doses réduites et intervalles allongés (biodisponibilité orale augmentée)", severe: "à éviter si possible ; sinon doses très réduites — risque d'encéphalopathie" },
  },
  {
    name: "Oxycodone",
    words: ["oxycodone"],
    renal: [{ below: 30, text: "dose initiale réduite de moitié, titration prudente" }],
    hepatic: { any: "dose initiale réduite (⅓ à ½), titration prudente", severe: "dose initiale réduite (⅓ à ½), intervalles allongés — risque d'encéphalopathie" },
  },
  {
    name: "Tramadol",
    words: ["tramadol"],
    renal: [{ below: 30, text: "intervalle de 12 h, 200 mg/j au maximum" }],
    hepatic: { any: "intervalle de 12 h", severe: "à éviter (Child C)" },
  },
  {
    name: "Paracétamol",
    words: ["paracetamol", "perfusalgan", "dafalgan"],
    renal: [{ below: 30, text: "intervalle d'au moins 6 h, 3 g/j au maximum" }],
    hepatic: { any: "3 g/j au maximum", severe: "2 g/j au maximum" },
  },
  {
    name: "AINS",
    words: ["ketorolac", "ibuprofene", "diclofenac", "ketoprofene", "naproxene", "parecoxib", "celecoxib"],
    renal: [
      { below: 30, text: "contre-indiqué" },
      { below: 60, text: "à éviter ; sinon dose unique, patient normovolémique, créatinine à J1" },
    ],
    hepatic: { any: "prudence : saignement, rétention hydrosodée, syndrome hépatorénal", severe: "contre-indiqué" },
  },
  {
    name: "Gabapentinoïdes",
    words: ["gabapentine", "pregabaline"],
    renal: [
      { below: 30, text: "dose réduite d'environ 75 %" },
      { below: 60, text: "dose réduite de moitié" },
    ],
  },
  {
    name: "Rocuronium",
    words: ["rocuronium", "esmeron"],
    renal: [{ below: 30, text: "durée d'action allongée : monitorage de la curarisation (TOF) ; cisatracurium (élimination de Hofmann) en alternative" }],
    hepatic: { any: "volume de distribution augmenté, durée d'action allongée : monitorage de la curarisation", severe: "durée d'action nettement allongée : monitorage, cisatracurium en alternative" },
  },
  {
    name: "Sugammadex",
    words: ["sugammadex", "bridion"],
    renal: [{ below: 30, text: "non recommandé (complexe éliminé par le rein) ; si indispensable, monitorage prolongé — ou néostigmine sur un bloc peu profond" }],
  },
  {
    name: "Midazolam",
    words: ["midazolam", "dormicum"],
    renal: [{ below: 30, text: "métabolite actif (α-hydroxymidazolam glucuronide) qui s'accumule : doses réduites, pas de réinjections rapprochées" }],
    hepatic: { any: "clairance diminuée : doses réduites", severe: "à éviter (encéphalopathie) ; si nécessaire, petites doses titrées" },
  },
  {
    name: "Métoclopramide",
    words: ["metoclopramide", "primperan"],
    renal: [
      { below: 15, text: "dose réduite de 75 %" },
      { below: 60, text: "dose réduite de moitié (5 mg)" },
    ],
    hepatic: { severe: "dose réduite de moitié" },
  },
  {
    name: "Ondansétron",
    words: ["ondansetron", "zofran"],
    hepatic: { severe: "8 mg/j au maximum" },
  },
  {
    name: "Énoxaparine",
    words: ["enoxaparine", "clexane", "hbpm"],
    renal: [{ below: 30, text: "20 mg/j en prophylaxie, 1 mg/kg une fois par jour en curatif — ou héparine non fractionnée ; anti-Xa si doute" }],
  },
  {
    name: "Magnésium",
    words: ["magnesium"],
    renal: [{ below: 30, text: "dose réduite, magnésémie et réflexes ostéotendineux surveillés" }],
  },
  {
    name: "Lidocaïne IV",
    words: ["lidocaine iv"],
    hepatic: { any: "clairance hépatique diminuée : perfusion réduite de moitié ou évitée", severe: "perfusion IV à éviter (toxicité)" },
  },
  {
    name: "Dexmédétomidine",
    words: ["dexmedetomidine", "dexdor"],
    hepatic: { any: "métabolisme hépatique : doses réduites" },
  },
  {
    name: "Céfazoline",
    words: ["cefazoline"],
    renal: [{ below: 35, text: "dose unique inchangée ; réinjection peropératoire espacée (demi-vie allongée)" }],
  },
];

export interface OrganAdjustment {
  drug: string;
  organ: "renal" | "hepatic";
  text: string;
}

const matches = (rule: OrganRule, name: string) => {
  const f = fold(name);
  return rule.words.some((w) => f.includes(w));
};

/**
 * What to adapt among the plan's drugs. `crcl`: Cockcroft-Gault, mL/min (a
 * patient on dialysis counts as < 15). `liver`: none, cirrhosis, or Child B/C
 * (« severe »).
 */
export function organAdjustments(drugNames: string[], patient: { crcl?: number; dialysis?: boolean; liver?: "any" | "severe" }): OrganAdjustment[] {
  const out: OrganAdjustment[] = [];
  const crcl = patient.dialysis ? 10 : patient.crcl;
  for (const rule of ORGAN_RULES) {
    const names = [...new Set(drugNames.filter((n) => matches(rule, n)))];
    if (!names.length) continue;
    const label = rule.name === "AINS" || rule.name === "Gabapentinoïdes" ? names.join(", ") : rule.name;
    if (crcl !== undefined && rule.renal) {
      const r = [...rule.renal].sort((a, b) => a.below - b.below).find((x) => crcl < x.below);
      if (r) out.push({ drug: label, organ: "renal", text: r.text });
    }
    if (patient.liver && rule.hepatic) {
      const text = patient.liver === "severe" ? (rule.hepatic.severe ?? rule.hepatic.any) : rule.hepatic.any;
      if (text) out.push({ drug: label, organ: "hepatic", text });
    }
  }
  return out;
}

export const ORGAN_SOURCE = "Manuel pratique d'anesthésie 2020, chap. 6–10, 31–32 ; RCP (CBIP)";
