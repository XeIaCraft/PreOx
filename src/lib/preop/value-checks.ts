// Values to flag at the consultation — vitals, biology, body measures —
// with what they mean. Editable in Paramètres › Valeurs à signaler. The
// thresholds are definitions or cut-offs from guidelines (named in
// `source`); what to *do* for a given gesture (platelet count for a
// neuraxial block…) stays in your rules.

import type { ValueCheckItem, WatchedValue } from "./catalog";
import type { ConsultationPatient } from "./dossier";
import { compare } from "./rules/engine";

const v = (item: ValueCheckItem): ValueCheckItem => item;

export const WATCHED_VALUES: { code: WatchedValue; label: string; unit: string; decimals?: number }[] = [
  { code: "sbp", label: "PA systolique", unit: "mmHg" },
  { code: "dbp", label: "PA diastolique", unit: "mmHg" },
  { code: "hr", label: "Fréquence cardiaque", unit: "/min" },
  { code: "spo2", label: "SpO₂", unit: "%" },
  { code: "hb", label: "Hémoglobine", unit: "g/dL", decimals: 1 },
  { code: "platelets", label: "Plaquettes", unit: "G/L" },
  { code: "inr", label: "INR", unit: "", decimals: 1 },
  { code: "hba1c", label: "HbA1c", unit: "%", decimals: 1 },
  { code: "potassium", label: "Kaliémie", unit: "mmol/L", decimals: 1 },
  { code: "sodium", label: "Natrémie", unit: "mmol/L" },
  { code: "glucose", label: "Glycémie", unit: "mg/dL" },
  { code: "albumin", label: "Albumine", unit: "g/L" },
  { code: "ntprobnp", label: "NT-proBNP", unit: "ng/L" },
  { code: "troponin", label: "Troponine hs", unit: "ng/L" },
  { code: "ferritin", label: "Ferritine", unit: "µg/L" },
  { code: "egfr", label: "DFGe (CKD-EPI)", unit: "mL/min/1,73 m²" },
  { code: "crcl", label: "Clairance (Cockcroft)", unit: "mL/min" },
  { code: "bmi", label: "IMC", unit: "kg/m²", decimals: 1 },
  { code: "age", label: "Âge", unit: "ans" },
];

export const DEFAULT_VALUE_CHECKS: ValueCheckItem[] = [
  // --- Pression artérielle ------------------------------------------------------------
  v({
    id: "sbp_180",
    label: "PA ≥ 180/110 mmHg",
    value: "sbp",
    op: ">=",
    threshold: 180,
    group: "bp",
    implies: "hypertension",
    qualifier: "poorlyControlled",
    attention: { level: "high", text: "Recontrôler au calme, brassard adapté. À partir de 180/110, discuter l'optimisation, voire le report d'une chirurgie programmée ; en dessous, l'HTA seule ne justifie pas de report." },
    source: "ESC 2022, chirurgie non cardiaque",
  }),
  v({ id: "dbp_110", label: "PAD ≥ 110 mmHg", value: "dbp", op: ">=", threshold: 110, group: "bp", implies: "hypertension", qualifier: "poorlyControlled", attention: { level: "high", text: "Recontrôler au calme. À partir de 180/110, discuter l'optimisation, voire le report d'une chirurgie programmée." }, source: "ESC 2022, chirurgie non cardiaque" }),
  v({
    id: "sbp_140",
    label: "PA ≥ 140/90 mmHg",
    value: "sbp",
    op: ">=",
    threshold: 140,
    group: "bp",
    attention: { level: "info", text: "PA élevée à la consultation (HTA grade 1–2 si confirmée) : à recontrôler et à signaler au médecin traitant ; ne justifie pas à elle seule un report." },
    source: "ESC 2022 ; ESH 2023 (grades)",
  }),
  v({ id: "dbp_90", label: "PAD ≥ 90 mmHg", value: "dbp", op: ">=", threshold: 90, group: "bp", attention: { level: "info", text: "PA élevée à la consultation : à recontrôler et à signaler au médecin traitant ; ne justifie pas à elle seule un report." }, source: "ESC 2022 ; ESH 2023 (grades)" }),
  v({ id: "sbp_90", label: "PAS < 90 mmHg", value: "sbp", op: "<", threshold: 90, group: "bp_low", attention: { level: "medium", text: "Hypotension de repos : recontrôler ; rechercher une cause (déshydratation, traitement antihypertenseur, cardiopathie)." } }),
  // --- Fréquence cardiaque -------------------------------------------------------------
  v({ id: "hr_100", label: "FC > 100 /min", value: "hr", op: ">", threshold: 100, group: "hr_high", attention: { level: "medium", text: "Tachycardie de repos : ECG ; rechercher une cause (FA, anémie, hypovolémie, hyperthyroïdie, infection, douleur, anxiété)." }, source: "Définition (tachycardie > 100 /min)" }),
  v({ id: "hr_50", label: "FC < 50 /min", value: "hr", op: "<", threshold: 50, group: "hr_low", attention: { level: "medium", text: "Bradycardie : ECG (bloc, maladie du sinus) ; bêtabloquant ou autre bradycardisant ? Symptômes (syncope) ?" }, source: "Définition (bradycardie < 50 /min)" }),
  // --- SpO2 ------------------------------------------------------------------------------
  v({ id: "spo2_90", label: "SpO₂ ≤ 90 %", value: "spo2", op: "<=", threshold: 90, group: "spo2", attention: { level: "high", text: "Hypoxémie de repos : cause à rechercher (gazométrie, pathologie respiratoire ou cardiaque) avant une chirurgie programmée ; risque pulmonaire fortement majoré (ARISCAT)." }, source: "ARISCAT (Canet, Anesthesiology 2010)" }),
  v({ id: "spo2_95", label: "SpO₂ 91–95 %", value: "spo2", op: "<=", threshold: 95, group: "spo2", attention: { level: "medium", text: "SpO₂ abaissée : majore le risque de complications pulmonaires (ARISCAT) ; rechercher une pathologie respiratoire ou cardiaque." }, source: "ARISCAT (Canet, Anesthesiology 2010)" }),
  // --- Hémoglobine -------------------------------------------------------------------------
  v({ id: "hb_m_13", label: "Hb < 13 g/dL (homme)", value: "hb", op: "<", threshold: 13, sex: "M", group: "hb_low", implies: "anemia", source: "OMS (seuils d'anémie)" }),
  v({ id: "hb_f_12", label: "Hb < 12 g/dL (femme)", value: "hb", op: "<", threshold: 12, sex: "F", group: "hb_low", implies: "anemia", source: "OMS (seuils d'anémie)" }),
  v({ id: "hb_10", label: "Hb < 10 g/dL", value: "hb", op: "<", threshold: 10, group: "hb_low", implies: "anemia", attention: { level: "high", text: "Anémie modérée à sévère : cause à rechercher et à traiter avant une chirurgie programmée (Patient Blood Management) ; groupe et RAI." }, source: "OMS ; Patient Blood Management" }),
  v({ id: "hb_m_165", label: "Hb > 16,5 g/dL (homme)", value: "hb", op: ">", threshold: 16.5, sex: "M", group: "hb_high", attention: { level: "info", text: "Hb élevée : polyglobulie ? (tabac, SAOS, BPCO, maladie de Vaquez) ; risque thrombotique." }, source: "OMS 2016 (critère de polyglobulie)" }),
  v({ id: "hb_f_16", label: "Hb > 16 g/dL (femme)", value: "hb", op: ">", threshold: 16, sex: "F", group: "hb_high", attention: { level: "info", text: "Hb élevée : polyglobulie ? (tabac, SAOS, BPCO, maladie de Vaquez) ; risque thrombotique." }, source: "OMS 2016 (critère de polyglobulie)" }),
  // --- Plaquettes ----------------------------------------------------------------------------
  v({ id: "plt_50", label: "Plaquettes < 50 G/L", value: "platelets", op: "<", threshold: 50, group: "plt_low", implies: "thrombocytopenia", qualifier: "severe", attention: { level: "high", text: "Thrombopénie sévère : cause à rechercher, avis hématologique ; ponction neuraxiale et chirurgie selon vos règles (seuils par geste)." } }),
  v({ id: "plt_100", label: "Plaquettes < 100 G/L", value: "platelets", op: "<", threshold: 100, group: "plt_low", implies: "thrombocytopenia", attention: { level: "medium", text: "Thrombopénie : cause à rechercher ; les seuils pour la ponction neuraxiale, les blocs profonds et la chirurgie viennent de vos règles." } }),
  v({ id: "plt_150", label: "Plaquettes < 150 G/L", value: "platelets", op: "<", threshold: 150, group: "plt_low", implies: "thrombocytopenia", attention: { level: "info", text: "Thrombopénie légère : contrôler et rechercher une cause (médicament, hépatopathie, hémodilution)." }, source: "Définition (< 150 G/L)" }),
  v({ id: "plt_450", label: "Plaquettes > 450 G/L", value: "platelets", op: ">", threshold: 450, group: "plt_high", attention: { level: "info", text: "Thrombocytose : cause (inflammation, carence martiale, syndrome myéloprolifératif) ; risque thrombotique." }, source: "Définition (> 450 G/L)" }),
  // --- INR --------------------------------------------------------------------------------------
  v({ id: "inr_15", label: "INR > 1,5", value: "inr", op: ">", threshold: 1.5, group: "inr", attention: { level: "medium", text: "INR allongé : sous AVK, conduite selon vos règles ; sans AVK, bilan (hépatopathie, carence en vitamine K, déficit en facteur)." } }),
  // --- HbA1c -------------------------------------------------------------------------------------
  v({
    id: "hba1c_85",
    label: "HbA1c > 8,5 %",
    value: "hba1c",
    op: ">",
    threshold: 8.5,
    group: "hba1c",
    implies: "diabetes_oral",
    qualifier: "poorlyControlled",
    attention: { level: "medium", text: "Diabète mal équilibré (> 8,5 % = 69 mmol/mol) : optimiser avant une chirurgie programmée si le délai le permet (médecin traitant, diabétologue) ; glycémies périopératoires rapprochées." },
    source: "CPOC / JBDS 2021 (Royaume-Uni) — pas de seuil belge publié",
  }),
  v({ id: "hba1c_65", label: "HbA1c ≥ 6,5 %", value: "hba1c", op: ">=", threshold: 6.5, group: "hba1c", implies: "diabetes_oral", attention: { level: "info", text: "HbA1c ≥ 6,5 % : critère diagnostique du diabète — diabète connu ? Sinon à confirmer et à signaler au médecin traitant." }, source: "OMS 2011 ; ADA" }),
  // --- Fonction rénale ------------------------------------------------------------------------------
  v({ id: "egfr_60", label: "DFGe < 60", value: "egfr", op: "<", threshold: 60, group: "egfr", implies: "ckd", source: "KDIGO 2024 (stade G3a et au-delà)" }),
  v({ id: "egfr_30", label: "DFGe < 30", value: "egfr", op: "<", threshold: 30, group: "egfr", implies: "ckd", qualifier: "severe", attention: { level: "high", text: "Insuffisance rénale sévère (G4–G5) : adapter chaque posologie, éviter AINS et produits de contraste, kaliémie ; avis néphrologique si non suivie." }, source: "KDIGO 2024" }),
  // --- IMC -------------------------------------------------------------------------------------------
  v({
    id: "bmi_40",
    label: "IMC ≥ 40",
    value: "bmi",
    op: ">=",
    threshold: 40,
    group: "bmi",
    attention: { level: "medium", text: "Obésité classe III : préoxygénation en proclive, matériel de voies aériennes, installation (appuis, table adaptée), doses selon le poids adapté à chaque produit (idéal, maigre ou ajusté), SAOS à rechercher.", material: ["Table et matériel adaptés au poids", "Vidéolaryngoscope"] },
    source: "OMS (classes d'obésité)",
  }),
  v({ id: "bmi_30", label: "IMC ≥ 30", value: "bmi", op: ">=", threshold: 30, group: "bmi", attention: { level: "info", text: "Obésité : doses selon le poids adapté à chaque produit, SAOS à rechercher (STOP-BANG), thromboprophylaxie adaptée." }, source: "OMS (classes d'obésité)" }),
  // --- Biologie complémentaire ------------------------------------------------------------
  v({ id: "k_30", label: "K⁺ < 3,0 mmol/L", value: "potassium", op: "<", threshold: 3, group: "k_low", attention: { level: "high", text: "Hypokaliémie marquée : troubles du rythme, potentialisation des curares ; corriger avant une chirurgie programmée (diurétique ?)." }, source: "Valeurs de référence du laboratoire ; seuil à adapter" }),
  v({ id: "k_35", label: "K⁺ < 3,5 mmol/L", value: "potassium", op: "<", threshold: 3.5, group: "k_low", attention: { level: "info", text: "Hypokaliémie : cause (diurétique, digestif) et correction ; ECG si digoxine." }, source: "Valeurs de référence du laboratoire" }),
  v({ id: "k_55", label: "K⁺ > 5,5 mmol/L", value: "potassium", op: ">", threshold: 5.5, group: "k_high", attention: { level: "high", text: "Hyperkaliémie : ECG, cause (IEC, antialdostérone, insuffisance rénale, dialyse) ; succinylcholine à éviter ; contrôle avant l'intervention." }, source: "Valeurs de référence du laboratoire ; seuil à adapter" }),
  v({ id: "na_130", label: "Na⁺ < 130 mmol/L", value: "sodium", op: "<", threshold: 130, group: "na_low", implies: "hyponatremia", attention: { level: "medium", text: "Hyponatrémie : cause (diurétique, SIADH, desmopressine) ; diminue la CAM des halogénés (manuel, tableau 4.2) ; correction lente." }, source: "Valeurs de référence du laboratoire ; manuel 2020 (chap. 4)" }),
  v({ id: "na_150", label: "Na⁺ > 150 mmol/L", value: "sodium", op: ">", threshold: 150, group: "na_high", attention: { level: "medium", text: "Hypernatrémie : déshydratation ; augmente la CAM des halogénés (manuel, tableau 4.2)." }, source: "Valeurs de référence du laboratoire ; manuel 2020 (chap. 4)" }),
  v({ id: "glu_180", label: "Glycémie > 180 mg/dL", value: "glucose", op: ">", threshold: 180, group: "glu_high", attention: { level: "medium", text: "Hyperglycémie au-delà de la cible périopératoire (108–180 mg/dL, 6–10 mmol/L) : protocole insuline." }, source: "CPOC/JBDS 2021, diabète en périopératoire" }),
  v({ id: "glu_70", label: "Glycémie < 70 mg/dL", value: "glucose", op: "<", threshold: 70, group: "glu_low", attention: { level: "high", text: "Hypoglycémie : resucrer, revoir les antidiabétiques (sulfamides, insuline) avant le jeûne." }, source: "ADA ; CPOC/JBDS 2021" }),
  v({ id: "alb_30", label: "Albumine < 30 g/L", value: "albumin", op: "<", threshold: 30, implies: "malnutrition", attention: { level: "medium", text: "Hypoalbuminémie : dénutrition sévère probable (critère ESPEN) — prise en charge nutritionnelle avant une chirurgie majeure ; fraction libre des médicaments acides augmentée (manuel, chap. 5)." }, source: "ESPEN 2017 (chirurgie) ; manuel 2020 (chap. 5)" }),
  v({ id: "ntprobnp_300", label: "NT-proBNP > 300 ng/L", value: "ntprobnp", op: ">", threshold: 300, attention: { level: "medium", text: "NT-proBNP élevé : risque de complications cardiaques postopératoires augmenté (× 4 selon le manuel) — échocardiographie si non faite, suivi de la troponine." }, source: "ESC 2022 ; manuel 2020 (chap. 15)" }),
  v({ id: "trop_14", label: "Troponine hs > 14 ng/L", value: "troponin", op: ">", threshold: 14, attention: { level: "medium", text: "Troponine T hs > 14 ng/L : risque d'infarctus postopératoire plus de 3 fois supérieur ; valeur de référence pour le suivi à J1–J2 ; avis cardiologique si élévation aiguë." }, source: "ESC 2022 ; manuel 2020 (chap. 15)" }),
  v({ id: "ferritin_30", label: "Ferritine < 30 µg/L", value: "ferritin", op: "<", threshold: 30, group: "ferritin", attention: { level: "medium", text: "Carence martiale absolue : fer (IV si délai court) avant une chirurgie hémorragique programmée." }, source: "Consensus international 2017 (Muñoz et al.)" }),
  v({ id: "ferritin_100", label: "Ferritine < 100 µg/L", value: "ferritin", op: "<", threshold: 100, group: "ferritin", attention: { level: "info", text: "Réserves en fer insuffisantes pour une chirurgie avec perte sanguine attendue > 500 mL : envisager une supplémentation." }, source: "Consensus international 2017 (Muñoz et al.)" }),
  v({ id: "bmi_185", label: "IMC < 18,5", value: "bmi", op: "<", threshold: 18.5, group: "bmi_low", attention: { level: "medium", text: "Maigreur : dénutrition à rechercher (perte de poids, albumine) ; prise en charge nutritionnelle avant une chirurgie majeure." }, source: "OMS ; ESPEN" }),
];

/** Values outside what a human can have: a typing error, not a finding. */
const PLAUSIBLE: Partial<Record<WatchedValue | "weight" | "height" | "creatinine", [number, number]>> = {
  sbp: [50, 280],
  dbp: [20, 180],
  hr: [20, 250],
  spo2: [50, 100],
  hb: [3, 25],
  platelets: [1, 2000],
  inr: [0.7, 15],
  hba1c: [3, 20],
  potassium: [1.5, 9],
  sodium: [100, 180],
  glucose: [15, 1500],
  albumin: [5, 60],
  ntprobnp: [1, 100000],
  troponin: [0, 100000],
  ferritin: [1, 20000],
  age: [0, 120],
  weight: [1, 350],
  height: [40, 250],
  creatinine: [0.1, 20],
};

export interface PatientValues {
  bmi?: number;
  egfr?: number;
  crcl?: number;
}

export function watchedValue(p: ConsultationPatient, derived: PatientValues, value: WatchedValue): number | undefined {
  switch (value) {
    case "sbp":
      return p.sbp;
    case "dbp":
      return p.dbp;
    case "hr":
      return p.hr;
    case "spo2":
      return p.spo2;
    case "hb":
      return p.hb;
    case "platelets":
      return p.platelets;
    case "inr":
      return p.inr;
    case "hba1c":
      return p.hba1c;
    case "potassium":
    case "sodium":
    case "glucose":
    case "albumin":
    case "ntprobnp":
    case "troponin":
    case "ferritin":
      return p[value];
    case "age":
      return p.age;
    default:
      return derived[value];
  }
}

export function formatValue(value: WatchedValue, n: number): string {
  const def = WATCHED_VALUES.find((w) => w.code === value);
  const rounded = def?.decimals ? Math.round(n * 10 ** def.decimals) / 10 ** def.decimals : Math.round(n);
  return `${def?.label ?? value} ${String(rounded).replace(".", ",")}${def?.unit ? ` ${def.unit}` : ""}`;
}

export interface ValueFinding {
  check: ValueCheckItem;
  /** « FC 107 /min ». */
  measured: string;
  /** The most severe check met in its group: the one whose point of attention is shown. */
  primary: boolean;
}

const LEVEL_RANK = { high: 0, medium: 1, info: 2 } as const;

/**
 * The checks met by this patient. In each group only the most severe one
 * (attention level first, then list order) is `primary` — its point of
 * attention is shown; every met check still counts for its implication.
 * Implausible values are left out (see implausibleValues).
 */
const ADULT_ONLY = new Set<string>(["bmi", "sbp", "dbp", "hr"]);

export function valueFindings(p: ConsultationPatient, derived: PatientValues, checks: ValueCheckItem[]): ValueFinding[] {
  const bad = new Set<string>(implausibleValues(p).map((x) => x.value));
  const met = checks.filter((c) => {
    if (c.sex && p.sex !== c.sex) return false;
    if (bad.has(c.value)) return false;
    // Adult thresholds: a child's BMI, blood pressure and heart rate are read against age norms (chap. 37).
    if (p.age !== undefined && p.age < 16 && ADULT_ONLY.has(c.value)) return false;
    const n = watchedValue(p, derived, c.value);
    return n !== undefined && compare(n, c.op, c.threshold);
  });
  const ranked = met.map((c, i) => ({ c, i })).sort((a, b) => LEVEL_RANK[a.c.attention?.level ?? "info"] - LEVEL_RANK[b.c.attention?.level ?? "info"] || a.i - b.i);
  const seen = new Set<string>();
  return ranked.map(({ c }) => {
    const g = c.group ?? c.id;
    const primary = !seen.has(g) && !!c.attention;
    if (primary) seen.add(g);
    const measured = c.value === "sbp" || c.value === "dbp" ? bpText(p) : formatValue(c.value, watchedValue(p, derived, c.value)!);
    return { check: c, measured, primary };
  });
}

function bpText(p: ConsultationPatient): string {
  if (p.sbp !== undefined && p.dbp !== undefined) return `PA ${p.sbp}/${p.dbp} mmHg`;
  return p.sbp !== undefined ? `PAS ${p.sbp} mmHg` : `PAD ${p.dbp} mmHg`;
}

/** Values typed outside what is physiologically possible (INR 0,1…). */
export function implausibleValues(p: ConsultationPatient): { value: WatchedValue | "weight" | "height" | "creatinine"; label: string }[] {
  const raw: [WatchedValue | "weight" | "height" | "creatinine", number | undefined, string][] = [
    ["sbp", p.sbp, `PAS ${p.sbp}`],
    ["dbp", p.dbp, `PAD ${p.dbp}`],
    ["hr", p.hr, `FC ${p.hr}`],
    ["spo2", p.spo2, `SpO₂ ${p.spo2} %`],
    ["hb", p.hb, `Hb ${p.hb} g/dL`],
    ["platelets", p.platelets, `plaquettes ${p.platelets} G/L`],
    ["inr", p.inr, `INR ${p.inr}`],
    ["hba1c", p.hba1c, `HbA1c ${p.hba1c} %`],
    ["potassium", p.potassium, `K⁺ ${p.potassium} mmol/L`],
    ["sodium", p.sodium, `Na⁺ ${p.sodium} mmol/L`],
    ["glucose", p.glucose, `glycémie ${p.glucose} mg/dL`],
    ["albumin", p.albumin, `albumine ${p.albumin} g/L`],
    ["ntprobnp", p.ntprobnp, `NT-proBNP ${p.ntprobnp} ng/L`],
    ["troponin", p.troponin, `troponine ${p.troponin} ng/L`],
    ["ferritin", p.ferritin, `ferritine ${p.ferritin} µg/L`],
    ["age", p.age, `âge ${p.age}`],
    ["weight", p.weightKg, `poids ${p.weightKg} kg`],
    ["height", p.heightCm, `taille ${p.heightCm} cm`],
    ["creatinine", p.creatinineMgDl, `créatinine ${p.creatinineMgDl} mg/dL`],
  ];
  return raw
    .filter(([k, n]) => {
      const range = PLAUSIBLE[k];
      return n !== undefined && range && (n < range[0] || n > range[1]);
    })
    .map(([k, , label]) => ({ value: k, label: label.replace(".", ",") }));
}
