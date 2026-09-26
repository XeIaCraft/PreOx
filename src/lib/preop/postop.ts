// The post-operative part of a plan, structured so it can be ticked rather
// than typed and computed for the patient (weight, age, renal function).
// Every dose comes from a source named next to it:
// - analgesia, PCA, epidural and perineural infusions: Manuel pratique
//   d'anesthésie 2020, chap. 25 (Analgésie) and chap. 7 (opioïdes);
//   children: chap. 37;
// - thromboprophylaxis: chap. 35 (tableau 35.4) ; timing around a neuraxial
//   catheter: ESAIC/ESRA 2022 (Kietaibl et al., PMID 34980845);
// - PONV rescue: chap. 23.
// A protocol keeps the choices; a dossier shows them computed for its patient.

export type PostopDestination = "ambulatory" | "ward" | "hdu" | "icu";

export const POSTOP_DESTINATIONS: { code: PostopDestination; label: string }[] = [
  { code: "ambulatory", label: "Ambulatoire" },
  { code: "ward", label: "Salle d'hospitalisation" },
  { code: "hdu", label: "Soins intermédiaires" },
  { code: "icu", label: "Soins intensifs" },
];

export type PostopAnalgesia = "paracetamol" | "nsaid" | "metamizole" | "opioid_titration" | "pca_morphine" | "pca_fentanyl" | "pcea" | "perineural" | "intrathecal_morphine" | "ketamine";

export type PostopThrombo = "lmwh" | "mechanical" | "lmwh_mechanical" | "none";

export type PostopWatch = "pain" | "sedation" | "block" | "glucose" | "urine" | "bleeding" | "temperature" | "delirium" | "hb" | "troponin" | "potassium" | "neuro";

export interface PostopInfusion {
  solution: string;
  rateMlH: number | null;
  bolusMl: number | null;
  lockoutMin: number | null;
}

export interface PostopPlan {
  destination?: PostopDestination;
  analgesia: PostopAnalgesia[];
  pcea?: PostopInfusion;
  perineural?: PostopInfusion;
  thrombo?: PostopThrombo;
  /** Duration of the thromboprophylaxis, days (free: depends on the surgery). */
  thromboDays?: number | null;
  ponvRescue?: boolean;
  watch: PostopWatch[];
}

export function emptyPostopPlan(): PostopPlan {
  return { analgesia: [], watch: [] };
}

export const DEFAULT_PCEA: PostopInfusion = { solution: "Bupivacaïne 0,1 % + fentanyl 2 µg/mL + adrénaline 2 µg/mL", rateMlH: 6, bolusMl: 4, lockoutMin: 40 };
export const DEFAULT_PERINEURAL: PostopInfusion = { solution: "Ropivacaïne 0,2 %", rateMlH: 6, bolusMl: 5, lockoutMin: 30 };

export const POSTOP_ANALGESIA: { code: PostopAnalgesia; label: string; group: "base" | "opioid" | "regional" | "adjuvant" }[] = [
  { code: "paracetamol", label: "Paracétamol", group: "base" },
  { code: "nsaid", label: "AINS", group: "base" },
  { code: "metamizole", label: "Métamizole", group: "base" },
  { code: "opioid_titration", label: "Titration morphine (SSPI)", group: "opioid" },
  { code: "pca_morphine", label: "PCA morphine", group: "opioid" },
  { code: "pca_fentanyl", label: "PCA fentanyl", group: "opioid" },
  { code: "pcea", label: "PCEA (péridurale)", group: "regional" },
  { code: "perineural", label: "Cathéter périnerveux", group: "regional" },
  { code: "intrathecal_morphine", label: "Morphine intrathécale reçue", group: "regional" },
  { code: "ketamine", label: "Kétamine analgésique", group: "adjuvant" },
];

export const POSTOP_THROMBO: { code: PostopThrombo; label: string }[] = [
  { code: "lmwh", label: "HBPM" },
  { code: "lmwh_mechanical", label: "HBPM + bas / compression" },
  { code: "mechanical", label: "Mécanique seule" },
  { code: "none", label: "Aucune (mobilisation précoce)" },
];

export const POSTOP_WATCH: { code: PostopWatch; label: string; line: string }[] = [
  { code: "pain", label: "Douleur", line: "Douleur au repos et à la mobilisation : objectif EVA ≤ 3" },
  { code: "sedation", label: "Sédation / FR", line: "Sédation et fréquence respiratoire (opioïdes) ; naloxone 40 µg IV si dépression respiratoire" },
  { code: "block", label: "Bloc sensitif / moteur", line: "Niveau sensitif et bloc moteur (ALR) : un bloc moteur inattendu fait rechercher un hématome ou une compression" },
  { code: "glucose", label: "Glycémie", line: "Glycémie capillaire" },
  { code: "urine", label: "Diurèse / globe", line: "Diurèse et globe vésical (rachianesthésie, opioïdes)" },
  { code: "bleeding", label: "Saignement / drains", line: "Saignement : pansements, drains, hémodynamique" },
  { code: "temperature", label: "Température", line: "Température : réchauffer si < 36 °C" },
  { code: "delirium", label: "Délirium", line: "Dépistage du délirium (CAM / 4AT) au moins 1 ×/j" },
  { code: "hb", label: "Hb J1", line: "Hémoglobine à J1" },
  { code: "troponin", label: "Troponine J1–J2", line: "Troponine hs à J1 et J2 (ESC 2022, chirurgie à risque intermédiaire ou élevé)" },
  { code: "potassium", label: "Ionogramme", line: "Ionogramme (kaliémie)" },
  { code: "neuro", label: "Neuro / pouls distaux", line: "Examen neurologique et pouls distaux du membre opéré" },
];

export const POSTOP_SOURCE = "Manuel pratique d'anesthésie 2020 (chap. 7, 23, 25, 35, 37) ; ESAIC/ESRA 2022 pour les délais autour d'un cathéter";

export interface PostopPatient {
  weightKg?: number;
  age?: number;
  /** Creatinine clearance, mL/min. */
  crcl?: number;
  /** Known CKD / dialysis / hepatic failure / GI bleeding history: warnings. */
  renalFailure?: boolean;
  liverFailure?: boolean;
}

export interface PostopLine {
  text: string;
  /** A warning attached to the line (renal function, age…). */
  warning?: string;
}

const n = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
const range = (a: number, b: number, unit: string) => (a === b ? `${n(a)} ${unit}` : `${n(a)}–${n(b)} ${unit}`);

function infusionText(f: PostopInfusion): string {
  return [f.solution, f.rateMlH !== null ? `${n(f.rateMlH)} mL/h` : "", f.bolusMl !== null ? `bolus ${n(f.bolusMl)} mL` : "", f.lockoutMin !== null ? `période réfractaire ${f.lockoutMin} min` : ""].filter(Boolean).join(", ");
}

/** The post-operative orders, computed for the patient (a protocol without patient gives the adult/generic form). */
export function postopLines(plan: PostopPlan | undefined, p: PostopPatient = {}): PostopLine[] {
  if (!plan) return [];
  const out: PostopLine[] = [];
  const w = p.weightKg;
  const child = p.age !== undefined && p.age < 16;
  const has = (c: PostopAnalgesia) => plan.analgesia.includes(c);
  const dest = POSTOP_DESTINATIONS.find((d) => d.code === plan.destination);
  if (dest) out.push({ text: `Destination : ${dest.label.toLowerCase()}` });

  // Analgesia: base, then opioids, then regional.
  if (has("paracetamol"))
    out.push({
      text: child && w ? `Paracétamol ${n(15 * w)} mg (15 mg/kg) 4 ×/j IV ou PO` : "Paracétamol 1 g 4 ×/j IV ou PO",
      warning: p.liverFailure ? "Insuffisance hépatique : contre-indiqué (chap. 25)." : undefined,
    });
  if (has("nsaid")) {
    const renal = p.renalFailure || (p.crcl !== undefined && p.crcl < 30);
    out.push({
      text: child ? `Acide méfénamique ${w ? `${n(10 * w)} mg (10 mg/kg)` : "10 mg/kg"} 3 ×/j PO` : "Ibuprofène 400–800 mg 3 ×/j PO, ou kétorolac 30 mg 3 ×/j IV (48 h au maximum)",
      warning: [renal ? "Insuffisance rénale : AINS contre-indiqués (chap. 25)." : "", child && ((w !== undefined && w < 10) || (p.age !== undefined && p.age < 0.5)) ? "Pas d'AINS avant 6 mois ou sous 10 kg (chap. 37)." : "", "IPP si risque de saignement digestif."]
        .filter(Boolean)
        .join(" "),
    });
  }
  if (has("metamizole")) out.push({ text: "Métamizole 500 mg–1 g 4 ×/j PO ou IV, 2 semaines au maximum (agranulocytose)" });
  if (has("opioid_titration")) out.push({ text: child && w ? `Morphine ${range(0.05 * w, 0.1 * w, "mg")} IV toutes les 10 min en SSPI (0,05–0,1 mg/kg)` : "Morphine en titration IV en SSPI (bolus de 1–2 mg toutes les 5–10 min selon l'EVA et la sédation)" });
  if (has("pca_morphine"))
    out.push({
      text: child && w ? `PCA morphine 1 mg/mL : bolus ${range(0.01 * w, 0.03 * w, "mg")} (10–30 µg/kg), période réfractaire 5–10 min, sans débit continu` : "PCA morphine : bolus 1–2 mg, période réfractaire 7–10 min, maximum 30 mg / 4 h, sans débit continu",
      warning: p.renalFailure || (p.crcl !== undefined && p.crcl < 30) ? "Insuffisance rénale : accumulation des métabolites de la morphine — préférer le fentanyl." : undefined,
    });
  if (has("pca_fentanyl")) out.push({ text: child && w ? `PCA fentanyl 10 µg/mL : bolus ${range(0.2 * w, 0.5 * w, "µg")} (0,2–0,5 µg/kg), période réfractaire 5–10 min` : "PCA fentanyl : bolus 10 µg, période réfractaire 5 min, maximum 400 µg / 4 h" });
  if (has("pcea")) out.push({ text: `PCEA : ${infusionText(plan.pcea ?? DEFAULT_PCEA)}` });
  if (has("perineural")) out.push({ text: `Cathéter périnerveux : ${infusionText(plan.perineural ?? DEFAULT_PERINEURAL)}` });
  if (has("intrathecal_morphine")) out.push({ text: "Morphine intrathécale reçue : pas d'autre opioïde systémique sans avis ; surveillance de la respiration 24 h (dépression respiratoire retardée)" });
  if (has("ketamine")) out.push({ text: `Kétamine ${w ? range(0.1 * w, 0.5 * w, "mg") : "0,1–0,5 mg/kg"} IV (0,1–0,5 mg/kg) si douleur mal contrôlée ou tolérance aux opioïdes` });
  if ((has("pca_morphine") || has("pca_fentanyl") || has("pcea") || has("intrathecal_morphine")) && !plan.watch.includes("sedation")) out.push({ text: "Opioïdes : surveiller sédation et fréquence respiratoire ; naloxone 40 µg IV à titrer si besoin" });

  // Thromboprophylaxis.
  if (plan.thrombo === "lmwh" || plan.thrombo === "lmwh_mechanical") {
    const mech = plan.thrombo === "lmwh_mechanical" ? " + compression mécanique" : "";
    const days = plan.thromboDays ? `, pendant ${plan.thromboDays} jours` : "";
    if (p.crcl !== undefined && p.crcl < 15)
      out.push({ text: `HNF 5 000 UI SC 2–3 ×/j${mech}${days}`, warning: `Clairance ${Math.round(p.crcl)} mL/min : HBPM contre-indiquées (< 15 mL/min, tableau 35.4).` });
    else if (p.crcl !== undefined && p.crcl < 30)
      out.push({
        text: `Énoxaparine ${w ? `${n(Math.round(0.5 * w))} mg (0,5 mg/kg)` : "0,5 mg/kg"} SC 1 ×/j, première dose 12 h après la chirurgie${mech}${days}`,
        warning: `Clairance ${Math.round(p.crcl)} mL/min : dose réduite (15–30 mL/min, tableau 35.4) ; activité anti-Xa si doute.`,
      });
    else out.push({ text: `Énoxaparine 40 mg SC 1 ×/j, première dose 12 h après la chirurgie${mech}${days}`, warning: p.crcl === undefined ? "Clairance inconnue : vérifier la fonction rénale avant la première dose." : undefined });
    if (has("pcea")) out.push({ text: "Cathéter péridural : 12 h entre une injection d'HBPM et le retrait ; injection suivante au moins 4 h après le retrait (ESAIC/ESRA 2022)" });
  } else if (plan.thrombo === "mechanical") out.push({ text: "Thromboprophylaxie mécanique (bas ou compression pneumatique) et mobilisation précoce" });
  else if (plan.thrombo === "none") out.push({ text: "Pas de thromboprophylaxie médicamenteuse : mobilisation précoce" });

  if (plan.ponvRescue) out.push({ text: "NVPO : ondansétron 4 mg IV 3 ×/j ; dropéridol 0,5–1,25 mg IV si PAS > 100 mmHg ; corriger d'abord hypotension, hypoxie, douleur, hypoglycémie" });
  for (const code of plan.watch) {
    const item = POSTOP_WATCH.find((x) => x.code === code);
    if (item) out.push({ text: `Surveillance : ${item.line.charAt(0).toLowerCase()}${item.line.slice(1)}` });
  }
  return out;
}

/** Opioids planned after surgery (Apfel): a PCA, titration or morphine intrathecal. */
export function postopHasOpioids(plan: PostopPlan | undefined): boolean {
  return !!plan?.analgesia.some((a) => a === "pca_morphine" || a === "pca_fentanyl" || a === "opioid_titration" || a === "intrathecal_morphine" || a === "pcea");
}
