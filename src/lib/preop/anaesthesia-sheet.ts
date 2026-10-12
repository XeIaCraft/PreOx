// « Protocole anesthésique » of a procedure sheet (Préop › Fiches): the
// anaesthesia of one procedure, without a patient, phase by phase —
// technique, airway, induction, maintenance, analgesia, antibiotic
// prophylaxis, PONV, monitoring and equipment, position, after surgery.
// Each phase shows what this procedure and its protocol plan, the recent
// guidelines that apply, what changes with the patient (elderly, obese,
// sleep apnoea, full stomach, kidney, liver…) and the contraindications of
// what is used (laryngeal mask → its contraindications, tourniquet → its own).
//
// Sources: guideline-refs.ts (each checked on PubMed), the reference textbook
// (chapter given), the drug reference (drug-reference.ts) and the dosing
// adaptations to the kidney and the liver (organ-dosing.ts). Patient notes
// coming from the plan's drugs are computed; the others are written here.

import { fold, type SurgeryItem } from "./catalog";
import { CI_CARDS, drugCiCard, type CiCard } from "./contraindications";
import { drugReferenceFor, formatReferenceDose, type DrugCaution, type DrugReference, type ReferenceDose } from "./drug-reference";
import { ERAS_COMMON, erasFor } from "./eras";
import { describeGases } from "./gases";
import type { GuidelineId } from "./guideline-refs";
import { organAdjustments } from "./organ-dosing";
import { POSITIONS } from "./plan-catalog";
import { POSTOP_ANALGESIA, POSTOP_DESTINATIONS, postopLines } from "./postop";
import { prospectFor, PROSPECT_RESCUE } from "./prospect";
import { WEIGHT_BASES, type DrugPhase, type Protocol, type ProtocolContent, type ProtocolDrug } from "./protocols";
import { TECHNIQUES, type Technique } from "./rules/types";
import { DRUG_ROUTES } from "../carnet/pharmaco";

// ---------------------------------------------------------------------------
// Phases and patient profiles
// ---------------------------------------------------------------------------

export type PhaseCode = "technique" | "airway" | "induction" | "maintenance" | "analgesia" | "antibio" | "ponv" | "monitoring" | "position" | "postop";

export const PHASES: { code: PhaseCode; title: string }[] = [
  { code: "technique", title: "Technique" },
  { code: "airway", title: "Voies aériennes" },
  { code: "induction", title: "Induction" },
  { code: "maintenance", title: "Entretien" },
  { code: "analgesia", title: "Analgésie et ALR" },
  { code: "antibio", title: "Antibioprophylaxie" },
  { code: "ponv", title: "NVPO" },
  { code: "monitoring", title: "Monitorage et équipement" },
  { code: "position", title: "Installation" },
  { code: "postop", title: "Après l'intervention" },
];

export type ProfileCode =
  | "elderly"
  | "obese"
  | "osa"
  | "full_stomach"
  | "difficult_airway"
  | "cardiac"
  | "respiratory"
  | "renal"
  | "hepatic"
  | "anticoagulated"
  | "diabetes"
  | "neuro"
  | "mh"
  | "allergy"
  | "chronic_opioids"
  | "pregnancy"
  | "child"
  | "cied";

/** The patients whose anaesthesia differs, with the antecedents (catalogue ids) that make them so. */
export const PATIENT_PROFILES: { code: ProfileCode; label: string; short: string; conditions: string[] }[] = [
  { code: "elderly", label: "Patient âgé, fragile", short: "Âgé", conditions: ["cognitive", "postop_delirium"] },
  { code: "obese", label: "Obésité", short: "Obèse", conditions: ["obesity", "obesity_hypoventilation"] },
  { code: "osa", label: "Apnées du sommeil (SAOS)", short: "SAOS", conditions: ["osa", "obesity_hypoventilation"] },
  { code: "full_stomach", label: "Estomac plein, agoniste du GLP-1", short: "Estomac plein", conditions: ["bowel_obstruction", "gastroparesis", "gerd", "achalasia"] },
  { code: "difficult_airway", label: "Voies aériennes difficiles", short: "VAS difficiles", conditions: ["difficult_airway", "difficult_mask", "head_neck_radiotherapy"] },
  {
    code: "cardiac",
    label: "Cardiopathie",
    short: "Cœur",
    conditions: ["coronary", "stable_angina", "recent_mi", "coronary_stent", "heart_failure", "dilated_cardiomyopathy", "aortic_stenosis", "hcm", "pulmonary_hypertension", "long_qt", "av_block", "wpw", "hypertension", "valve", "arrhythmia"],
  },
  { code: "respiratory", label: "Asthme, BPCO", short: "Asthme, BPCO", conditions: ["asthma", "copd", "restrictive"] },
  { code: "renal", label: "Insuffisance rénale", short: "Rein", conditions: ["ckd", "dialysis"] },
  { code: "hepatic", label: "Cirrhose, insuffisance hépatique", short: "Foie", conditions: ["cirrhosis", "chronic_liver"] },
  { code: "anticoagulated", label: "Sous antithrombotiques", short: "Antithrombotiques", conditions: [] },
  { code: "diabetes", label: "Diabète", short: "Diabète", conditions: ["diabetes_oral", "diabetes_insulin"] },
  { code: "neuro", label: "Neurologique (HTIC, Parkinson, myasthénie, épilepsie)", short: "Neuro", conditions: ["raised_icp", "intracranial_lesion", "parkinson", "myasthenia", "lambert_eaton", "epilepsy"] },
  {
    code: "mh",
    label: "Hyperthermie maligne, myopathie, risque d'hyperkaliémie",
    short: "HM, myopathie",
    conditions: ["malignant_hyperthermia", "duchenne", "myotonic_dystrophy", "neuromuscular", "sma", "als", "hemiplegia", "spinal_cord_injury", "burns", "bedridden"],
  },
  { code: "allergy", label: "Allergie", short: "Allergie", conditions: ["anaesthetic_allergy", "mastocytosis"] },
  { code: "chronic_opioids", label: "Opioïdes au long cours", short: "Opioïdes", conditions: ["chronic_opioids", "opioid_use_disorder"] },
  { code: "pregnancy", label: "Grossesse", short: "Grossesse", conditions: ["pregnancy", "preeclampsia"] },
  { code: "child", label: "Enfant", short: "Enfant", conditions: [] },
  { code: "cied", label: "Stimulateur, défibrillateur implanté", short: "Pacemaker, DAI", conditions: ["pacemaker"] },
];

const PROFILE_OF_CONDITION = new Map<string, ProfileCode>();
for (const p of PATIENT_PROFILES) for (const c of p.conditions) if (!PROFILE_OF_CONDITION.has(c)) PROFILE_OF_CONDITION.set(c, p.code);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SheetLine {
  text: string;
  refs?: GuidelineId[];
  chapter?: string;
}

export interface SheetDrug {
  name: string;
  /** « 2 mg/kg (poids réel), IVD ». */
  dose: string;
  note?: string;
  /** Alternatives share a choice key: one or the other. */
  choice?: string;
  /** Reference doses of the textbook for this phase (adult, the general case). */
  reference: string[];
}

export interface ProfileNote {
  profile: ProfileCode;
  text: string;
  refs: GuidelineId[];
  chapter?: string;
}

/** A guideline block of the procedure (PROSPECT, ERAS): title, points, reference. */
export interface SheetBlock {
  title: string;
  items: { label: string; points: string[] }[];
  source: string;
  pmid?: string;
}

export interface SheetPhase {
  code: PhaseCode;
  title: string;
  /** One line, shown when the phase is closed. */
  summary: string;
  lines: SheetLine[];
  drugs: SheetDrug[];
  blocks: SheetBlock[];
  recommendations: SheetLine[];
  patients: ProfileNote[];
  cards: CiCard[];
}

// ---------------------------------------------------------------------------
// The procedure and its plan, in words
// ---------------------------------------------------------------------------

export interface AirwayChoice {
  device: "ett" | "lma" | "lma_or_ett" | "spontaneous" | "none";
  rsi: boolean;
  nasal: boolean;
  oneLung: boolean;
  /** Why the device (« cœlioscopie », « séquence rapide »…). */
  why: string[];
}

interface Ctx {
  s: SurgeryItem;
  plan: ProtocolContent | undefined;
  name: string;
  /** Plan text: targets, material, notes, specifics (folded). */
  text: string;
  position: string;
  techniques: Set<Technique>;
  general: boolean;
  neuraxial: boolean;
  deepBlock: boolean;
  superficialBlock: boolean;
  sedation: boolean;
  laparoscopic: boolean;
  child: boolean;
  obstetric: boolean;
  maleOnly: boolean;
  ambulatory: boolean;
  shoulder: boolean;
  nmba: boolean;
  tiva: boolean;
  volatile: boolean;
  n2o: boolean;
  catheter: boolean;
  airway: AirwayChoice;
  /** No general anaesthesia planned but a regional technique or sedation: the patient may still want (or need) one. */
  gaFallback: boolean;
  /** The airway in that case. */
  fallbackAirway: AirwayChoice | null;
  /** General anaesthesia chosen in the sheet but none in the protocol: the manual's doses are given. */
  gaManual: boolean;
  /** Drug names of the plan and of the post-op orders (« PCA morphine » → morphine). */
  drugNames: string[];
}

const NMBA = /rocuronium|vecuronium|atracurium|cisatracurium|mivacurium|suxamethonium|succinylcholine|celocurine/;

/** `asGeneral`: the airway if the patient ends up under general anaesthesia (regional refused, failed or contraindicated). */
export function airwayChoice(s: SurgeryItem, plan: ProtocolContent | undefined, asGeneral = false): AirwayChoice {
  const techniques = new Set<Technique>([...(s.techniques ?? []), ...(plan?.techniques ?? [])]);
  if (asGeneral) techniques.add("general");
  const text = fold([...(plan?.targets ?? []), ...(plan?.material ?? []), plan?.notes ?? "", ...(s.specifics ?? [])].join(" | "));
  const name = fold(s.name);
  const position = fold(s.position ?? "");
  const why: string[] = [];
  if (!techniques.has("general")) return { device: techniques.has("sedation") ? "spontaneous" : "none", rsi: false, nasal: false, oneLung: false, why };

  const nasal = /nasotrach|sonde nasale|intubation nasale/.test(text) || (s.category === "E" && /dent|mandib|maxill|orthognath|le fort|genioplast/.test(name));
  const oneLung = /double lumiere|bloqueur bronchique|unipulmonaire|exclusion pulmonaire/.test(text) || s.approach === "thoracoscopic";
  const rsi = /sequence rapide/.test(text) || s.category === "B" || /occlusion|peritonite|hemorragie digestive|ulcere perfore|volvulus|hernie etranglee|perforation/.test(name);
  if (rsi) why.push("séquence rapide (estomac plein)");
  if (oneLung) why.push("ventilation unipulmonaire");
  if (nasal) why.push("intubation nasale (chirurgie buccale ou maxillo-faciale)");
  if (s.approach === "laparoscopic" || s.approach === "robotic") why.push("pneumopéritoine");
  if (/ventral|prone|genu-pectoral/.test(position)) why.push("décubitus ventral");
  if (s.incision === "upper_abdominal") why.push("chirurgie abdominale haute");
  if (s.incision === "intrathoracic") why.push("chirurgie intrathoracique");
  if (s.category === "C" || s.approach === "transoral") why.push("voies aériennes partagées avec le chirurgien");
  if (s.category === "D" || s.category === "F") why.push(s.category === "D" ? "neurochirurgie" : "chirurgie cardiaque");
  if (s.grade === "major") why.push("chirurgie majeure");
  if ((s.durationHours ?? 0) > 3) why.push("durée prévue > 3 h");
  const lmaMentioned = /masque laryng|supraglottique|i-gel/.test(text) && !/masque laryng(e|é)? pret/.test(text);
  if (why.length) return { device: lmaMentioned && !rsi && why.length === 1 && why[0] === "voies aériennes partagées avec le chirurgien" ? "lma_or_ett" : "ett", rsi, nasal, oneLung, why };
  if (lmaMentioned) return { device: "lma", rsi, nasal, oneLung, why: ["intervention courte, périphérique"] };
  return { device: "lma_or_ett", rsi, nasal, oneLung, why: ["intervention périphérique, sans pneumopéritoine ni estomac plein"] };
}

const POSTOP_DRUG_NAMES: Partial<Record<string, string>> = {
  paracetamol: "Paracétamol",
  nsaid: "Kétorolac (AINS)",
  pca_morphine: "Morphine (PCA)",
  pca_fentanyl: "Fentanyl (PCA)",
  intrathecal_morphine: "Morphine intrathécale",
  ketamine: "Kétamine",
};

function context(s: SurgeryItem, protocol: Protocol | null, chosen = false): Ctx {
  const plan = protocol?.content;
  const techniques = new Set<Technique>(s.techniques?.length ? s.techniques : (plan?.techniques ?? []));
  for (const t of plan?.techniques ?? []) techniques.add(t);
  const drugs = plan?.drugs ?? [];
  const drugText = fold(drugs.map((d) => d.name).join(" | "));
  const postopNames = (plan?.postopPlan?.analgesia ?? []).map((a) => POSTOP_DRUG_NAMES[a]).filter((x): x is string => !!x);
  const text = fold([...(plan?.targets ?? []), ...(plan?.material ?? []), plan?.notes ?? "", ...(s.specifics ?? [])].join(" | "));
  const gases = plan?.gases;
  const general = techniques.has("general");
  // With a technique chosen in the sheet, the other one is one tap away: no « Si AG » plan B.
  const gaFallback = !chosen && !general && techniques.size > 0;
  const gaManual = chosen && general && !drugs.some((d) => d.phase === "induction" && !/sedation|premedication/.test(fold(d.name)));
  return {
    s,
    plan,
    name: fold(s.name),
    text,
    position: fold(s.position ?? ""),
    techniques,
    general,
    neuraxial: techniques.has("neuraxial") || drugs.some((d) => d.route === "intrathecal" || d.route === "peridural"),
    deepBlock: techniques.has("deep_block"),
    superficialBlock: techniques.has("superficial_block") || drugs.some((d) => d.route === "perinerveux"),
    sedation: techniques.has("sedation"),
    laparoscopic: s.approach === "laparoscopic" || s.approach === "robotic" || /coelio|laparoscop/.test(fold(s.name)),
    child: s.population === "child" || s.population === "neonate",
    obstetric: s.category === "B",
    maleOnly: s.sex === "M",
    ambulatory: s.setting === "ambulatory" || plan?.postopPlan?.destination === "ambulatory",
    shoulder: /epaule|coiffe|acromio|clavicule|humer/.test(fold(s.name)),
    nmba: NMBA.test(drugText),
    tiva: gases?.agent === "tiva" || drugs.some((d) => d.route === "aivoc"),
    volatile: !!gases && gases.agent !== "tiva",
    n2o: gases?.carrier === "n2o",
    catheter: !!plan?.postopPlan?.analgesia.some((a) => a === "pcea" || a === "perineural") || drugs.some((d) => d.route === "peridural"),
    airway: airwayChoice(s, plan),
    gaFallback,
    fallbackAirway: gaFallback ? airwayChoice(s, plan, true) : gaManual ? airwayChoice(s, plan) : null,
    gaManual,
    drugNames: [...drugs.map((d) => d.name), ...postopNames],
  };
}

const num = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");

function doseText(d: ProtocolDrug): string {
  if (d.amount === null) return DRUG_ROUTES.find((r) => r.code === d.route)?.short ?? "";
  const basis = d.doseMode === "per_kg" ? ` (poids ${WEIGHT_BASES.find((w) => w.code === d.weightBasis)?.short ?? "réel"})` : "";
  const max = d.maxAmount !== null ? `, ${num(d.maxAmount)} ${d.unit} au maximum` : "";
  // Reference protocols imported before October 2026 may still carry the old "inhalation" code.
  const route = DRUG_ROUTES.find((r) => r.code === d.route)?.short ?? (d.route === "inhalation" ? "Inhalé" : d.route);
  return `${num(d.amount)} ${d.unit}${d.doseMode === "per_kg" ? "/kg" : ""}${basis}${max}${route ? ` · ${route}` : ""}`;
}

// ---------------------------------------------------------------------------
// Patient notes from the plan's drugs (textbook doses, cautions, kidney, liver)
// ---------------------------------------------------------------------------

/** A reference dose written for a population (« Induction (personne âgée) ») → that profile. */
function doseProfile(label: string): ProfileCode | undefined {
  const l = fold(label);
  if (/personne agee|sujet age|\bage\b/.test(l)) return "elderly";
  if (/obese/.test(l)) return "obese";
  if (/enfant|nouveau-ne|nourrisson/.test(l)) return "child";
  if (/sequence rapide/.test(l)) return "full_stomach";
  if (/eclampsie|post-partum|grossesse|cesarienne/.test(l)) return "pregnancy";
  return undefined;
}

const LEVEL_WORD: Record<DrugCaution["level"], string> = { contraindicated: "contre-indiqué", relative: "à éviter", adapt: "à adapter" };

function cautionProfiles(c: DrugCaution): ProfileCode[] {
  const out = new Set<ProfileCode>();
  for (const id of c.conditions ?? []) {
    const p = PROFILE_OF_CONDITION.get(id);
    if (p) out.add(p);
  }
  for (const atc of c.atc ?? []) {
    if (atc.startsWith("B01")) out.add("anticoagulated");
    if (atc.startsWith("C07") || atc.startsWith("C09") || atc.startsWith("C01")) out.add("cardiac");
    if (atc.startsWith("N02A") || atc.startsWith("N07BC")) out.add("chronic_opioids");
  }
  return [...out];
}

/** Doses phase by phase: which reference doses describe the general case of this phase. */
const PHASE_DOSE_WORDS: Record<PhaseCode, RegExp | null> = {
  technique: null,
  airway: null,
  induction: /induction|intubation|sequence|premedication|bolus/,
  maintenance: /entretien|aivoc|perfusion|sedation|fin d'intervention/,
  analgesia: /bolus|pca|intrathec|epargne|analgesie|fin d'intervention|par prise|perinerv|peridur|adulte/,
  antibio: null,
  ponv: /nvpo|induction|fin/,
  monitoring: null,
  position: null,
  postop: null,
};

const ROUTE_DOSE_WORDS: Partial<Record<string, RegExp>> = {
  intrathecal: /intrathec|rachi/,
  peridural: /peridur/,
  perinerveux: /perinerv|bloc|dose maximale/,
  infiltration: /infiltr|dose maximale/,
  aivoc: /aivoc/,
  pse: /entretien|perfusion|debit/,
};

function referenceDoses(ref: DrugReference, phase: PhaseCode, route?: string): string[] {
  const generic = ref.doses.filter((d) => !doseProfile(d.label));
  const byRoute = route ? ROUTE_DOSE_WORDS[route] : undefined;
  const routed = byRoute ? generic.filter((d) => byRoute.test(fold(d.label))) : [];
  if (routed.length) return routed.slice(0, 3).map((d) => `${d.label} : ${formatReferenceDose(d)}`);
  const words = PHASE_DOSE_WORDS[phase];
  const picked = words ? generic.filter((d) => words.test(fold(d.label))) : generic;
  return (picked.length ? picked : generic).slice(0, 3).map((d: ReferenceDose) => `${d.label} : ${formatReferenceDose(d)}`);
}

/** Same molecule: the first word of the two names (« Morphine (PCA) » and « Morphine »). */
const firstWord = (name: string) => fold(name).split(/[\s(,]/)[0];

function drugNotes(drugs: ProtocolDrug[], extraNames: string[]): ProfileNote[] {
  const out: ProfileNote[] = [];
  const seen = new Set<string>();
  const push = (n: ProfileNote) => {
    const key = `${n.profile}|${fold(n.text)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  const own = new Set(drugs.map((d) => firstWord(d.name)));
  const names = [...drugs.map((d) => d.name), ...extraNames.filter((n) => !own.has(firstWord(n)))];
  // Kidney and liver: organ-dosing.ts, for every drug of the phase.
  const organ = [...organAdjustments(names, { crcl: 25 }), ...organAdjustments(names, { liver: "severe" })];
  const covered = new Set(organ.flatMap((a) => a.drug.split(", ").map((d) => `${a.organ}|${firstWord(d)}`)));
  for (const a of organ)
    push({ profile: a.organ === "renal" ? "renal" : "hepatic", text: `${a.drug} — ${a.organ === "renal" ? "clairance < 30 ml/min" : "cirrhose Child B ou C"} : ${a.text}`, refs: ["manual", "rcp"], chapter: "chap. 6–10 et 31–32" });

  const refs = new Map<string, DrugReference>();
  for (const n of names) {
    const ref = drugReferenceFor(n);
    if (ref) refs.set(ref.name, ref);
  }
  for (const ref of refs.values()) {
    for (const d of ref.doses) {
      const p = doseProfile(d.label);
      if (p) push({ profile: p, text: `${ref.name} — ${d.label} : ${formatReferenceDose(d)}${d.note ? `. ${d.note}` : ""}`, refs: ["manual"], chapter: ref.chapter });
    }
    for (const c of ref.cautions)
      for (const p of cautionProfiles(c)) {
        if ((p === "renal" || p === "hepatic") && covered.has(`${p}|${firstWord(ref.name)}`)) continue;
        push({ profile: p, text: `${ref.name} : ${LEVEL_WORD[c.level]} — ${c.text}`, refs: ["manual"], chapter: ref.chapter });
      }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Written patient notes, phase by phase
// ---------------------------------------------------------------------------

interface WrittenNote extends ProfileNote {
  phase: PhaseCode;
  when?: (c: Ctx) => boolean;
}

const regional = (c: Ctx) => c.neuraxial || c.deepBlock || c.superficialBlock;
const notChild = (c: Ctx) => !c.child;
const pregnancyPossible = (c: Ctx) => !c.child && !c.maleOnly && !c.obstetric;

const NOTES: WrittenNote[] = [
  // --- Technique -------------------------------------------------------------------------------------
  { phase: "technique", profile: "elderly", when: notChild, text: "ALR ou AG : pas de différence d'incidence du délirium postopératoire ; ce qui compte : profondeur d'anesthésie guidée par l'EEG, stabilité hémodynamique, analgésie efficace, mesures non médicamenteuses.", refs: ["delirium2023"] },
  { phase: "technique", profile: "osa", text: "ALR préférable à l'AG quand elle est possible.", refs: ["osa2018", "manual"], chapter: "chap. 44" },
  { phase: "technique", profile: "obese", text: "ALR préférée quand elle est possible, avec un plan pour les voies aériennes ; échecs plus fréquents : en informer le patient.", refs: ["obesity2015"] },
  { phase: "technique", profile: "anticoagulated", when: regional, text: "Rachianesthésie, péridurale et blocs profonds : délais d'arrêt et de reprise selon la molécule, la dose et la fonction rénale (y compris autour du retrait d'un cathéter) ; blocs superficiels compressibles : pas de délai.", refs: ["alrEsaic2022", "alrAsra2025"] },
  { phase: "technique", profile: "cardiac", when: (c) => c.neuraxial, text: "Sténose aortique sévère, cardiomyopathie obstructive : pas de rachianesthésie en injection unique — rachianesthésie continue ou péridurale titrées, ou AG.", refs: ["manual"], chapter: "chap. 13" },
  { phase: "technique", profile: "pregnancy", when: pregnancyPossible, text: "Chirurgie non urgente : après l'accouchement ; si elle ne peut attendre, de préférence au 2e trimestre ; avis obstétrical avant toute intervention.", refs: ["pregnancy2019"] },
  { phase: "technique", profile: "mh", text: "ALR ou AG sans agent déclenchant (ni halogéné, ni succinylcholine) ; ambulatoire possible ; pas de dantrolène en prévention.", refs: ["mh2021"] },
  { phase: "technique", profile: "difficult_airway", when: (c) => regional(c) || c.sedation, text: "ALR possible, avec une stratégie de contrôle des voies aériennes prête en cas de conversion en AG.", refs: ["airwayAsa2022"] },
  { phase: "technique", profile: "respiratory", when: (c) => c.shoulder && regional(c), text: "Réserve respiratoire basse : la parésie phrénique du bloc interscalénique est mal tolérée — volume réduit, ou blocs suprascapulaire ± axillaire.", refs: ["phrenic2017"] },

  // --- Airway -------------------------------------------------------------------------------------------
  { phase: "airway", profile: "obese", text: "Position en rampe (ou semi-assise) pour l'induction et le réveil, préoxygénation avec PEP ; désaturation rapide : vidéolaryngoscope et matériel d'intubation difficile prêts.", refs: ["obesity2015", "manual"], chapter: "chap. 44" },
  { phase: "airway", profile: "osa", text: "Facteur de risque indépendant d'intubation et de ventilation au masque difficiles : précautions de voies aériennes difficiles ; extubation réveillé, décurarisé, en position semi-assise.", refs: ["osa2018", "obesity2015"] },
  { phase: "airway", profile: "full_stomach", text: "Séquence rapide, pas de masque laryngé ; échographie gastrique si doute (antre vide, liquide ou solide).", refs: ["manual"], chapter: "chap. 8, 14 et 17" },
  { phase: "airway", profile: "full_stomach", when: notChild, text: "Agoniste du GLP-1 : poursuivi le plus souvent ; diète liquide la veille si risque plus élevé (phase d'augmentation de dose, symptômes digestifs) ; symptômes ou estomac plein à l'échographie : séquence rapide.", refs: ["glp1_2024"] },
  { phase: "airway", profile: "pregnancy", when: pregnancyPossible, text: "Dès 15 SA : estomac plein (séquence rapide), pas de masque laryngé ; muqueuses œdématiées et Mallampati augmenté : sonde plus petite, désaturation rapide.", refs: ["manual"], chapter: "chap. 17 et 36" },
  { phase: "airway", profile: "child", when: (c) => c.child, text: "Réserve en oxygène faible : désaturation rapide. Infection récente des voies aériennes supérieures (hors simple rhinorrhée claire) : laryngospasme et bronchospasme — geste non urgent reporté de 3 à 4 semaines.", refs: ["manual"], chapter: "chap. 37" },
  { phase: "airway", profile: "respiratory", text: "Asthme : bronchodilatateur avant l'induction, anesthésie assez profonde avant l'intubation, masque laryngé si possible et si les pressions restent < 20 cmH₂O.", refs: ["manual"], chapter: "chap. 17 et 23" },
  { phase: "airway", profile: "difficult_airway", text: "Plan A–B–C–D annoncé à l'équipe : vidéolaryngoscope, dispositif supraglottique de 2e génération, oxygénation, cricothyroïdotomie au bistouri ; intubation vigile si la ventilation au masque est aussi difficile.", refs: ["das2015", "airwayAsa2022"] },
  { phase: "airway", profile: "elderly", when: notChild, text: "Réflexes laryngés et toux diminués : régurgitation et inhalation plus fréquentes.", refs: ["manual"], chapter: "chap. 43" },

  // --- Induction ------------------------------------------------------------------------------------------
  { phase: "induction", profile: "elderly", when: notChild, text: "Doses d'induction et d'entretien réduites, effet prolongé ; hypotension plus marquée à l'induction : titrer, vasopresseur prêt ; benzodiazépines : dose réduite, effet très prolongé.", refs: ["manual"], chapter: "chap. 43" },
  { phase: "induction", profile: "obese", when: notChild, text: "Poids maigre : propofol (induction), fentanyl, rocuronium, atracurium, morphine, paracétamol, anesthésiques locaux. Poids ajusté : propofol en perfusion, antibiotiques, HBPM, néostigmine, sugammadex. Poids réel : succinylcholine (150 mg au maximum).", refs: ["obesity2015", "manual"], chapter: "chap. 44" },
  { phase: "induction", profile: "osa", text: "Pas de benzodiazépine en prémédication (apnées) ; agents de courte durée d'action.", refs: ["manual", "osa2018"], chapter: "chap. 44" },
  { phase: "induction", profile: "cardiac", text: "Propofol titré par petits bolus (hypotension de 20–30 %) ; hypertension pulmonaire : étomidate préféré ; phényléphrine ou noradrénaline prête.", refs: ["manual"], chapter: "chap. 6, 23 et 27" },
  { phase: "induction", profile: "renal", text: "Succinylcholine contre-indiquée en insuffisance rénale terminale (hyperkaliémie) ; kaliémie préopératoire, dialyse la veille si besoin.", refs: ["manual"], chapter: "chap. 8 et 32" },
  { phase: "induction", profile: "hepatic", text: "Pas de prémédication sédative (encéphalopathie) ; doses titrées.", refs: ["manual"], chapter: "chap. 30" },
  { phase: "induction", profile: "child", when: (c) => c.child, text: "Induction inhalatoire au sévoflurane : technique de choix chez le petit enfant, voie veineuse posée endormi ; doses au poids.", refs: ["manual"], chapter: "chap. 37" },
  { phase: "induction", profile: "pregnancy", when: pregnancyPossible, text: "AG dès 15 SA : intubation en séquence rapide.", refs: ["manual"], chapter: "chap. 36" },
  { phase: "induction", profile: "mh", text: "Succinylcholine et halogénés contre-indiqués : induction intraveineuse, rocuronium.", refs: ["mh2021"] },
  { phase: "induction", profile: "allergy", text: "Allergie connue : éviction du produit (bilan allergologique) ; causes principales d'anaphylaxie peropératoire : curares, antibiotiques, latex, chlorhexidine.", refs: ["manual"], chapter: "chap. 23" },
  { phase: "induction", profile: "neuro", text: "Myasthénie : sensibilité aux curares non dépolarisants (doses réduites, monitorage, sugammadex), résistance relative à la succinylcholine.", refs: ["manual"], chapter: "chap. 8 et 29" },
  { phase: "induction", profile: "chronic_opioids", text: "Opioïde de fond poursuivi ; tolérance probable au-delà de 60 mg/j d'équivalent morphine oral : besoins augmentés ; pas de nalbuphine (sevrage).", refs: ["manual"], chapter: "chap. 7" },
  { phase: "induction", profile: "diabetes", text: "Diabète ancien : gastroparésie possible (échographie gastrique si doute) ; dysautonomie : hypotension à l'induction.", refs: ["manual"], chapter: "chap. 14 et 34" },

  // --- Maintenance -----------------------------------------------------------------------------------------
  { phase: "maintenance", profile: "elderly", when: notChild, text: "CAM et besoins diminués ; EEG (index et densité spectrale, éviter les bouffées-suppressions) pour réduire le délirium ; pas d'hypotension ni d'hypothermie.", refs: ["delirium2023", "manual"], chapter: "chap. 43" },
  { phase: "maintenance", profile: "obese", when: (c) => c.general, text: "Vt 6–8 ml/kg de poids idéal (le manuel 2020 indiquait 8–10), PEP 8–10 cmH₂O, recrutement après l'intubation et l'insufflation ; propofol en perfusion au poids ajusté ; EEG si AIVOC avec curare.", refs: ["ventilation2019", "obesity2015", "manual"], chapter: "chap. 44" },
  { phase: "maintenance", profile: "respiratory", when: (c) => c.general, text: "Sévoflurane (bronchodilatateur) ; expiration allongée (rapport I/E abaissé), surveiller l'auto-PEP ; éviter les histaminolibérateurs (atracurium).", refs: ["manual"], chapter: "chap. 8, 18 et 23" },
  { phase: "maintenance", profile: "mh", text: "AIVOC ; machine préparée (filtres à charbon actif ou purge selon le fabricant) ; monitorage habituel ; pas de dantrolène prophylactique.", refs: ["mh2021"] },
  { phase: "maintenance", profile: "cardiac", text: "PAM ≥ 65 mmHg et fréquence cardiaque stable ; pression artérielle invasive selon la cardiopathie et la chirurgie.", refs: ["bp2019", "manual"], chapter: "chap. 2" },
  { phase: "maintenance", profile: "neuro", text: "Hypertension intracrânienne : pas de N₂O ni de fortes concentrations d'halogéné (AIVOC) ; pneumopéritoine contre-indiqué.", refs: ["manual"], chapter: "chap. 4 et 30" },
  { phase: "maintenance", profile: "pregnancy", when: pregnancyPossible, text: "Monitorage fœtal selon le terme et la viabilité, décidé avec l'obstétricien ; compression aorto-cave dès 15 SA : décubitus latéral gauche ou cale sous la fesse droite.", refs: ["pregnancy2019", "manual"], chapter: "chap. 36" },
  { phase: "maintenance", profile: "child", when: (c) => c.child, text: "CAM plus élevée chez le nourrisson ; hypothermie rapide : réchauffement actif ; glycémie chez le nouveau-né.", refs: ["manual"], chapter: "chap. 23 et 37" },
  { phase: "maintenance", profile: "diabetes", text: "Glycémie capillaire répétée, objectif < 10 mmol/l (180 mg/dl) sans hypoglycémie ; insuline IV si chirurgie moyenne ou majeure chez le diabétique insulinotraité.", refs: ["manual"], chapter: "chap. 34" },

  // --- Analgesia ----------------------------------------------------------------------------------------------
  { phase: "analgesia", profile: "elderly", when: notChild, text: "Analgésie efficace (facteur modifiable du délirium) et épargne morphinique ; rachianesthésie et péridurale : dose par métamère réduite, effet prolongé, rétention urinaire.", refs: ["delirium2023", "manual"], chapter: "chap. 43" },
  { phase: "analgesia", profile: "osa", text: "Opioïdes au minimum (risque respiratoire accru) : paracétamol, AINS, ALR, infiltrations.", refs: ["osa2018", "manual"], chapter: "chap. 44" },
  { phase: "analgesia", profile: "obese", text: "Analgésie multimodale (paracétamol, AINS, ALR, infiltrations) ; prudence avec les opioïdes de longue durée et les sédatifs ; anesthésiques locaux au poids maigre.", refs: ["obesity2015", "manual"], chapter: "chap. 44" },
  { phase: "analgesia", profile: "anticoagulated", when: (c) => c.catheter, text: "Cathéter péridural : 12 h entre une HBPM prophylactique et le retrait, dose suivante au moins 4 h après le retrait.", refs: ["alrEsaic2022"] },
  { phase: "analgesia", profile: "chronic_opioids", text: "Besoins plus élevés : kétamine, ALR, opioïde de fond maintenu ; pas d'agoniste-antagoniste (nalbuphine : sevrage).", refs: ["manual"], chapter: "chap. 7" },
  { phase: "analgesia", profile: "child", when: (c) => c.child, text: "Paracétamol 15 mg/kg 4 ×/j ; AINS seulement à partir de 6 mois et 10 kg (ibuprofène 10 mg/kg 3 ×/j).", refs: ["manual"], chapter: "chap. 37" },

  // --- Antibiotic prophylaxis ------------------------------------------------------------------------------------
  { phase: "antibio", profile: "allergy", text: "Allergie à la pénicilline, même immédiate : la céfazoline reste utilisable (chaîne latérale différente) ; clindamycine seulement si allergie à la céfazoline ou toxidermie grave aux bêtalactamines.", refs: ["allergy2022", "antibio2024"] },
  { phase: "antibio", profile: "obese", when: notChild, text: "Céfazoline 3 g à partir de 120 kg ; autres antibiotiques au poids ajusté.", refs: ["antibio2024", "obesity2015"] },
  { phase: "antibio", profile: "child", when: (c) => c.child, text: "Céfazoline 30 mg/kg (2 g au maximum), réinjection 15 mg/kg toutes les 4 h.", refs: ["antibio2024"] },

  // --- PONV ---------------------------------------------------------------------------------------------------------
  { phase: "ponv", profile: "cardiac", text: "QT long : sétrons et dropéridol avec prudence (allongement du QT) ; dexaméthasone, AIVOC au propofol.", refs: ["manual"], chapter: "chap. 23" },
  { phase: "ponv", profile: "neuro", text: "Parkinson : ni métoclopramide ni dropéridol (antidopaminergiques).", refs: ["manual"], chapter: "chap. 23" },
  { phase: "ponv", profile: "diabetes", text: "Dexaméthasone en dose unique : pas plus d'infections du site opératoire, y compris chez le diabétique ; hausse transitoire de la glycémie à surveiller.", refs: ["ponv2025"] },
  { phase: "ponv", profile: "child", when: (c) => c.child, text: "Score VPOP (âge, durée d'anesthésie, chirurgie à risque, antécédent, opioïdes répétés) : risque de 5 à 52 % ; dexaméthasone 150 µg/kg ± ondansétron 100 µg/kg (4 mg au maximum).", refs: ["vpop2014", "manual"], chapter: "chap. 23" },
  { phase: "ponv", profile: "pregnancy", when: pregnancyPossible, text: "Pas de recommandation spécifique pendant la grossesse ; incidence comparable et prophylaxie souvent insuffisante.", refs: ["ponv2025"] },
  { phase: "ponv", profile: "obese", text: "L'obésité n'augmente pas le risque de NVPO (incidence même plus basse) ; la chirurgie bariatrique, si.", refs: ["ponv2025"] },

  // --- Monitoring and equipment ---------------------------------------------------------------------------------------
  {
    phase: "monitoring",
    profile: "cied",
    text: "Stimulateur ou défibrillateur : type, indication et dépendance connus ; défibrillateur externe prêt ; DAI : thérapies antitachycardiques suspendues si bistouri monopolaire au-dessus de l'ombilic ; patient dépendant : mode asynchrone ; bistouri bipolaire ou ultrasonique, plaque de retour loin du boîtier ; contrôle après l'intervention si reprogrammé.",
    refs: ["cied2011", "esc2022"],
  },
  { phase: "monitoring", profile: "obese", text: "Brassard adapté (pression invasive si la mesure non invasive est impossible) ; table et accessoires adaptés au poids.", refs: ["manual", "obesity2015"], chapter: "chap. 44" },
  { phase: "monitoring", profile: "renal", text: "Fistule artérioveineuse : ni brassard, ni perfusion, ni cathéter artériel sur ce bras.", refs: ["manual"], chapter: "chap. 31" },
  { phase: "monitoring", profile: "cardiac", text: "Pression artérielle invasive selon la cardiopathie (sténose aortique serrée, insuffisance cardiaque) ; troponine à J1 et J2 si risque cardiovasculaire et chirurgie à risque intermédiaire ou élevé.", refs: ["esc2022", "manual"], chapter: "chap. 2" },
  { phase: "monitoring", profile: "mh", text: "Monitorage habituel (EtCO₂, température) ; dantrolène disponible, pas en prévention.", refs: ["mh2021"] },
  { phase: "monitoring", profile: "elderly", when: notChild, text: "EEG traité (index ou densité spectrale) pour guider la profondeur d'anesthésie.", refs: ["delirium2023"] },
  { phase: "monitoring", profile: "diabetes", text: "Glycémie capillaire avant et pendant l'intervention.", refs: ["manual"], chapter: "chap. 34" },
  { phase: "monitoring", profile: "osa", text: "Capnographie si sédation ; SpO₂ continue au réveil.", refs: ["monitoring2021", "osa2018"] },
  { phase: "monitoring", profile: "child", when: (c) => c.child, text: "Matériel adapté au poids, température et réchauffement actif.", refs: ["manual"], chapter: "chap. 37" },
  { phase: "monitoring", profile: "allergy", text: "Allergie au latex : salle et matériel sans latex.", refs: ["manual"], chapter: "chap. 23" },

  // --- Position -----------------------------------------------------------------------------------------------------------
  { phase: "position", profile: "obese", text: "Points d'appui protégés (l'obésité favorise les lésions nerveuses), table et accessoires adaptés au poids ; rampe à l'induction.", refs: ["obesity2015", "manual"], chapter: "chap. 19 et 44" },
  { phase: "position", profile: "elderly", when: notChild, text: "Peau, articulations et nerfs fragiles (cachexie, neuropathie) : installation et points d'appui vérifiés.", refs: ["manual"], chapter: "chap. 19 et 43" },
  { phase: "position", profile: "pregnancy", when: pregnancyPossible, text: "Compression aorto-cave dès 15 SA : décubitus latéral gauche ou cale sous la fesse droite.", refs: ["manual"], chapter: "chap. 13 et 36" },

  // --- After surgery ------------------------------------------------------------------------------------------------------------
  { phase: "postop", profile: "osa", text: "SpO₂ continue si opioïdes ; CPAP habituelle dès la SSPI ; obstruction maximale la 3e nuit ; soins continus selon les antécédents, les besoins en opioïdes et la CPAP. Ambulatoire possible : premier du programme, surveillance de 5 à 8 h.", refs: ["manual", "osa2018"], chapter: "chap. 26 et 44" },
  { phase: "postop", profile: "obese", text: "Réveil semi-assis avec PEP ; mobilisation précoce et thromboprophylaxie (risque thromboembolique accru) ; ambulatoire possible si la prise en charge n'en serait pas modifiée.", refs: ["manual", "obesity2015"], chapter: "chap. 44" },
  { phase: "postop", profile: "elderly", when: notChild, text: "Dépistage du délirium avec un outil validé ; mesures non médicamenteuses (lunettes, appareils auditifs, orientation, sommeil, mobilisation) ; hypoxémie postopératoire plus fréquente.", refs: ["delirium2023", "manual"], chapter: "chap. 43" },
  { phase: "postop", profile: "cardiac", text: "Troponine à J1 et J2 si indiquée ; bêtabloquants, IEC et sartans repris sans tarder (l'arrêt prolongé est délétère).", refs: ["esc2022", "postopBp2019"] },
  { phase: "postop", profile: "renal", text: "Créatinine et kaliémie à J1 ; pas d'AINS, volémie maintenue.", refs: ["manual", "rcp"], chapter: "chap. 31–32" },
  { phase: "postop", profile: "anticoagulated", text: "Reprise des anticoagulants selon le risque hémorragique ; cathéter : délais autour du retrait.", refs: ["alrEsaic2022", "alrAsra2025"] },
  { phase: "postop", profile: "child", when: (c) => c.child, text: "Ancien prématuré de moins de 52 semaines d'âge postconceptionnel (48 si né à terme) : apnées jusqu'à 12 h — monitorage, pas d'ambulatoire ; caféine 10 mg/kg possible.", refs: ["manual"], chapter: "chap. 26 et 37" },
  { phase: "postop", profile: "mh", text: "Ambulatoire possible ; surveillance en SSPI habituelle.", refs: ["mh2021"] },
  { phase: "postop", profile: "diabetes", text: "Glycémie capillaire jusqu'à la reprise de l'alimentation et du traitement habituel.", refs: ["manual"], chapter: "chap. 34" },
];

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

const DRUG_PHASE_OF: Record<DrugPhase, PhaseCode> = {
  premed: "induction",
  induction: "induction",
  maintenance: "maintenance",
  haemodynamic: "maintenance",
  other: "maintenance",
  alr: "analgesia",
  analgesia: "analgesia",
  antibio: "antibio",
  ponv: "ponv",
  postop: "postop",
};

function sheetDrugs(drugs: ProtocolDrug[], phase: PhaseCode): SheetDrug[] {
  return drugs.map((d) => {
    const ref = drugReferenceFor(d.name);
    return { name: d.name, dose: doseText(d), note: d.note || undefined, choice: d.choice, reference: ref ? referenceDoses(ref, phase, d.route) : [] };
  });
}

function drugCards(drugs: ProtocolDrug[]): CiCard[] {
  const out: CiCard[] = [];
  const seen = new Set<string>();
  for (const d of drugs) {
    const ref = drugReferenceFor(d.name);
    if (!ref || seen.has(ref.name) || !ref.cautions.length) continue;
    seen.add(ref.name);
    const c = drugCiCard(ref);
    if (c.absolute.length || c.relative.length) out.push({ ...c, notes: c.adapt.length ? [`À adapter : ${c.adapt.join(" ; ")}`] : [] });
  }
  return out;
}

const techniqueLabel = (t: Technique) => TECHNIQUES.find((x) => x.code === t)?.label ?? t;
const TECHNIQUE_SHORT: Record<Technique, string> = { general: "AG", neuraxial: "Rachianesthésie ou péridurale", deep_block: "Bloc profond", superficial_block: "Bloc superficiel", sedation: "Sédation" };

/** The procedure is one the 5th PONV consensus (or the textbook) names as emetogenic. */
function emetogenic(c: Ctx): string | null {
  const n = c.name;
  if (/bariatri|sleeve|bypass gastrique|anneau gastrique/.test(n)) return "chirurgie bariatrique";
  if (/cholecystectomie/.test(n) && c.laparoscopic) return "cholécystectomie par cœlioscopie";
  if (/prothese totale de genou|\bptg\b|arthroplastie du genou/.test(n)) return "prothèse de genou";
  if (c.s.category === "J2") return "chirurgie urologique";
  if (c.s.category === "J1") return "chirurgie gynécologique";
  if (c.obstetric) return "chirurgie obstétricale";
  if (/sein|mastectomie|mammaire|tumorectomie/.test(n)) return "chirurgie du sein";
  if (/strabism|amygdal|tympan|oreille moyenne|stapes/.test(n)) return "strabisme, oreille ou amygdale";
  return null;
}

function phaseTechnique(c: Ctx): SheetPhase {
  const lines: SheetLine[] = [];
  const own = c.s.techniques ?? [];
  const planned = c.plan?.techniques ?? [];
  if (own.length) lines.push({ text: `Technique habituelle : ${own.map(techniqueLabel).join(", ").toLowerCase()}` });
  const extra = planned.filter((t) => !own.includes(t));
  if (extra.length) lines.push({ text: `Le protocole prévoit aussi : ${extra.map(techniqueLabel).join(", ").toLowerCase()}` });
  if (!own.length && planned.length) lines.push({ text: `Technique du protocole : ${planned.map(techniqueLabel).join(", ").toLowerCase()}` });
  if (!lines.length) lines.push({ text: "Technique à choisir selon le patient (pas de technique habituelle renseignée)" });
  if (c.gaFallback && hasRegional(c))
    lines.push({
      text: "Une ALR se propose, elle ne s'impose pas : expliquer ses bénéfices pour cette chirurgie, puis respecter le choix du patient. Refus, échec ou contre-indication : anesthésie générale, détaillée dans les phases suivantes (« Si AG »).",
      refs: ["manual"],
      chapter: "chap. 13",
    });
  const cards: CiCard[] = [];
  if (c.neuraxial) cards.push(CI_CARDS.neuraxial);
  if (c.deepBlock) cards.push(CI_CARDS.deepBlock);
  if (c.superficialBlock && !c.deepBlock) cards.push(CI_CARDS.superficialBlock);
  if (c.shoulder && (c.deepBlock || c.superficialBlock || /interscalen|supraclavic/.test(fold((c.plan?.drugs ?? []).map((d) => d.name).join(" "))))) cards.push(CI_CARDS.interscalene);
  if (c.plan?.drugs.some((d) => d.route === "iv_regional")) cards.push(CI_CARDS.ivra);
  if (c.sedation) cards.push(CI_CARDS.sedation);
  const recommendations: SheetLine[] = [];
  if (regional(c)) recommendations.push({ text: "Antithrombotiques et ALR : les blocs profonds suivent les délais neuraxiaux, pas les blocs superficiels compressibles ; délais selon la dose (« faible » ou « élevée ») et la fonction rénale.", refs: ["alrEsaic2022", "alrAsra2025"] });
  const shown = own.length ? own : planned;
  return phase("technique", shown.map((t) => TECHNIQUE_SHORT[t]).join(" ou ") || "Selon le patient", { lines, cards, recommendations });
}

function phaseAirway(c: Ctx): SheetPhase | null {
  const fallback = c.airway.device === "none" || (c.gaFallback && c.airway.device === "spontaneous");
  const a = fallback ? c.fallbackAirway : c.airway;
  if (!a || a.device === "none") return null;
  const lines: SheetLine[] = [];
  const cards: CiCard[] = [];
  if (fallback && c.airway.device === "spontaneous") lines.push({ text: "Sédation : ventilation spontanée (oxygène, capnographie)" });
  const device =
    a.device === "ett"
      ? `Intubation${a.rsi ? " en séquence rapide" : ""}${a.nasal ? " nasotrachéale" : ""}${a.oneLung ? " (sonde double lumière ou bloqueur)" : ""}`
      : a.device === "lma"
        ? "Masque laryngé (2e génération)"
        : a.device === "lma_or_ett"
          ? "Masque laryngé possible, sinon intubation"
          : "Ventilation spontanée (oxygène, capnographie)";
  const label = fallback ? `Si AG : ${device.charAt(0).toLowerCase()}${device.slice(1)}` : device;
  lines.push({ text: `${label}${a.why.length ? ` — ${a.why.join(", ")}` : ""}` });
  if (a.device === "lma" || a.device === "lma_or_ett") cards.push(CI_CARDS.lma);
  if (a.rsi) cards.push(CI_CARDS.rsi);
  if (a.nasal) cards.push(CI_CARDS.nasalIntubation);
  if (/vigile/.test(c.text)) cards.push(CI_CARDS.awakeIntubation);
  const recommendations: SheetLine[] = [];
  if (a.device !== "spontaneous") {
    recommendations.push({ text: "Plan A–B–C–D prêt pour chaque patient : vidéolaryngoscope ; échec d'intubation : dispositif supraglottique de 2e génération pour oxygéner ; réveil par défaut ; « ni intubation ni oxygénation » : cricothyroïdotomie au bistouri.", refs: ["das2015"] });
    recommendations.push({ text: "Curare pour l'intubation (meilleures conditions, moins de lésions pharyngolaryngées).", refs: ["nmbEsaic2023"] });
  } else recommendations.push({ text: "Sédation : capnographie, matériel de contrôle des voies aériennes et de conversion en AG prêt.", refs: ["monitoring2021"] });
  if (fallback && c.airway.device === "spontaneous") recommendations.push({ text: "Sédation : capnographie, matériel de contrôle des voies aériennes et de conversion en AG prêt.", refs: ["monitoring2021"] });
  return phase("airway", label, { lines, cards, recommendations });
}

const hasRegional = (c: Ctx) => c.neuraxial || c.deepBlock || c.superficialBlock;
const fallbackWhen = (c: Ctx) => (hasRegional(c) ? "AG si refus ou échec de l'ALR" : "AG si la sédation ne suffit pas");

/** Induction if general anaesthesia replaces the planned regional technique (manual doses). */
function fallbackInduction(c: Ctx): SheetLine {
  const a = c.fallbackAirway;
  const curare = a?.rsi
    ? "succinylcholine 1 mg/kg ou rocuronium 1,2 mg/kg (séquence rapide)"
    : a?.device === "ett"
      ? `rocuronium ${c.child ? "0,6 mg/kg" : "0,6 mg/kg (poids idéal)"}`
      : "pas de curare pour un masque laryngé";
  const text = c.child
    ? `Si AG : sévoflurane au masque ou propofol 2,5–5 mg/kg, sufentanil 0,1–0,3 µg/kg, ${curare}.`
    : `Si AG : propofol 2–3 mg/kg (1–2 mg/kg chez la personne âgée, titré chez le patient fragile), sufentanil 0,2–0,6 µg/kg, ${curare}.`;
  return { text, refs: ["manual"], chapter: c.child ? "chap. 37" : "chap. 6, 7 et 8" };
}

function phaseInduction(c: Ctx, drugs: ProtocolDrug[]): SheetPhase | null {
  if (!c.general && !c.sedation && !drugs.length && !c.gaFallback) return null;
  const lines: SheetLine[] = c.gaFallback ? [fallbackInduction(c)] : c.gaManual ? [{ ...fallbackInduction(c), text: fallbackInduction(c).text.replace(/^Si AG : /, "Pas d'AG dans le protocole, doses du manuel : ") }] : [];
  const recommendations: SheetLine[] = [
    c.child
      ? { text: "Jeûne de l'enfant : liquides clairs jusqu'à 1 h, lait maternel 3 h (ESAIC 2022) ; lait artificiel, autres laits et solides 6 h (manuel) ; un petit-déjeuner léger bien encadré semble bien toléré.", refs: ["fastingChildren2022", "manual"], chapter: "chap. 37" }
      : { text: "Jeûne : solides et laits 6 h (repas gras abondant : 8 h ou plus) ; liquides clairs (thé, café avec un peu de lait, jus sans pulpe) encouragés jusqu'à 2 h, moins si le protocole du service le permet — aussi chez l'obèse, le diabétique, en cas de reflux et chez la femme enceinte hors travail ; chewing-gum ou bonbon jusqu'au transfert : pas de report.", refs: ["fasting2026", "fasting2011"] },
    { text: "Pas de prémédication sédative systématique ; information et jeûne court (programmes de récupération améliorée).", refs: ["eras2025"] },
  ];
  if (c.general || c.gaFallback) recommendations.push({ text: `${(c.general ? c.airway : c.fallbackAirway)?.rsi ? "Séquence rapide" : "Si séquence rapide"} : succinylcholine 1 mg/kg ou rocuronium 0,9–1,2 mg/kg ; préoxygénation jusqu'à FeO₂ ≥ 0,9.`, refs: ["nmbEsaic2023", "das2015"] });
  const named = drugs.filter((d) => d.phase === "induction").map((d) => d.name).slice(0, 3).join(", ");
  const summary = [named || (c.sedation && !c.general ? "Sédation" : c.gaFallback ? "" : "Selon le protocole"), c.gaFallback ? fallbackWhen(c) : ""].filter(Boolean).join(" · ");
  return phase("induction", summary, { lines, drugs: sheetDrugs(drugs, "induction"), recommendations, cards: drugCards(drugs) });
}

function phaseMaintenance(c: Ctx, drugs: ProtocolDrug[]): SheetPhase | null {
  if (!c.general && !c.sedation && !drugs.length && !c.gaFallback) return null;
  const lines: SheetLine[] = [];
  if (c.gaManual) lines.push({ text: "Sévoflurane autour de 1 CAM corrigée pour l'âge ou AIVOC propofol–rémifentanil.", refs: ["manual"], chapter: "chap. 4 et 22" });
  if (c.gaFallback)
    lines.push({ text: "Si AG : sévoflurane autour de 1 CAM corrigée pour l'âge ou AIVOC propofol–rémifentanil ; mêmes cibles hémodynamiques ; sans ALR, prévoir l'épargne morphinique (ou un bloc périphérique).", refs: ["manual"], chapter: "chap. 4 et 22" });
  const gases = c.plan?.gases;
  if (gases) for (const l of describeGases(gases, c.child ? (c.s.population === "neonate" ? 0.1 : 5) : undefined)) lines.push({ text: l });
  for (const t of c.plan?.targets ?? []) lines.push({ text: t });
  const recommendations: SheetLine[] = [];
  if (c.general || c.gaFallback) {
    recommendations.push({ text: "Ventilation protectrice : Vt 6–8 ml/kg de poids idéal, PEP 5 cmH₂O puis individualisée, recrutement à la pression et la durée minimales efficaces.", refs: ["ventilation2019"] });
    recommendations.push({ text: "Curarisation : approfondir le bloc seulement si les conditions chirurgicales l'exigent ; monitorage quantitatif à l'adducteur du pouce ; sugammadex pour un bloc au rocuronium profond, modéré ou superficiel ; néostigmine seulement si TOF-ratio > 0,2, monitorage jusqu'à > 0,9.", refs: ["nmbEsaic2023", "nmbAsa2023"] });
  }
  recommendations.push({ text: "PAM ≥ 65 mmHg : une PAM < 60–70 mmHg, même brève, est associée à des lésions myocardiques et rénales et à la mortalité.", refs: ["bp2019"] });
  if (c.tiva) recommendations.push({ text: "AIVOC avec curare : EEG traité recommandé (risque de mémorisation) ; voie dédiée, perfusion visible.", refs: ["tiva2019", "monitoring2021"] });
  if (c.volatile || c.gaFallback) recommendations.push({ text: "Bas débit de gaz frais ; pas de desflurane ni de N₂O en routine.", refs: ["glasgow2023"] });
  const cards: CiCard[] = [];
  if (c.volatile || c.gaFallback) cards.push(CI_CARDS.volatile);
  if (c.n2o) cards.push(CI_CARDS.n2o);
  cards.push(...drugCards(drugs));
  const awake = drugs.map((d) => d.name).slice(0, 2).join(", ") || "Patient éveillé";
  const base = gases ? (gases.agent === "tiva" ? "AIVOC" : "Sévoflurane") : c.sedation && !c.general ? "Sédation titrée" : c.gaFallback ? "" : !c.general ? awake : "Selon le protocole";
  const summary = [base, c.gaFallback ? fallbackWhen(c) : ""].filter(Boolean).join(" · ");
  return phase("maintenance", summary, { lines, drugs: sheetDrugs(drugs, "maintenance"), recommendations, cards });
}

function phaseAnalgesia(c: Ctx, drugs: ProtocolDrug[]): SheetPhase {
  const lines: SheetLine[] = [];
  const pp = c.plan?.postopPlan;
  if (pp?.analgesia.length) lines.push({ text: `Après l'intervention : ${pp.analgesia.map((a) => POSTOP_ANALGESIA.find((x) => x.code === a)?.label ?? a).join(", ")}` });
  const blocks: SheetBlock[] = [];
  const prospect = prospectFor(c.s);
  if (prospect)
    blocks.push({
      title: `PROSPECT : ${prospect.title} (${prospect.year})`,
      items: [
        { label: "Analgésie de base", points: prospect.basic },
        { label: "ALR recommandée", points: prospect.regional },
        ...(prospect.adjuncts?.length ? [{ label: "Autres", points: prospect.adjuncts }] : []),
        ...(prospect.surgical?.length ? [{ label: "Côté chirurgien", points: prospect.surgical }] : []),
        ...(prospect.notRecommended?.length ? [{ label: "Non recommandé", points: prospect.notRecommended }] : []),
      ],
      source: `PROSPECT (ESRA) ${prospect.year} — ${PROSPECT_RESCUE}`,
      pmid: prospect.pmid,
    });
  const recommendations: SheetLine[] = [{ text: "Analgésie multimodale épargnant les opioïdes ; ALR quand elle est indiquée.", refs: ["eras2025"] }];
  if (regional(c) || drugs.some((d) => /caine/.test(fold(d.name)))) recommendations.push({ text: "Anesthésiques locaux : doses additives entre produits et sites ; toxicité systémique : émulsion lipidique 20 % disponible (aide-mémoire de crise).", refs: ["last2020", "manual"], chapter: "chap. 12" });
  const summary = prospect ? `PROSPECT ${prospect.year}` : drugs.map((d) => d.name).slice(0, 2).join(", ") || "Multimodale";
  return phase("analgesia", summary, { lines, drugs: sheetDrugs(drugs, "analgesia"), blocks, recommendations, cards: drugCards(drugs) });
}

function phaseAntibio(c: Ctx, drugs: ProtocolDrug[]): SheetPhase {
  const lines: SheetLine[] = [];
  if (!drugs.length) lines.push({ text: c.plan ? "Pas d'antibioprophylaxie dans le protocole" : "Selon le protocole du service (aucun protocole lié)" });
  if (c.s.tourniquet) lines.push({ text: "Garrot : antibiotique au moins 5 à 15 min avant le gonflage.", refs: ["manual"], chapter: "chap. 40" });
  const recommendations: SheetLine[] = [{ text: "Dans les 30–60 min avant l'incision ; réinjection selon la durée (céfazoline toutes les 4 h) ou si saignement important ; pas de prolongation après la fermeture.", refs: ["antibio2024"] }];
  const summary = drugs.map((d) => d.name).join(" ou ") || "Aucune";
  return phase("antibio", summary, { lines, drugs: sheetDrugs(drugs, "antibio"), recommendations, cards: drugCards(drugs) });
}

function phasePonv(c: Ctx, drugs: ProtocolDrug[]): SheetPhase {
  const lines: SheetLine[] = [];
  const risky = emetogenic(c);
  if (risky) lines.push({ text: `Intervention à risque de NVPO : ${risky}`, refs: risky.startsWith("strabisme") ? ["manual"] : ["ponv2025"], chapter: risky.startsWith("strabisme") ? "chap. 23" : undefined });
  if (!drugs.length) lines.push({ text: c.plan ? "Pas d'antiémétique dans le protocole : prophylaxie selon le risque du patient" : "Selon le risque du patient" });
  const recommendations: SheetLine[] = [
    { text: "Risque d'Apfel : femme, non-fumeur, antécédent de NVPO ou mal des transports, opioïdes postopératoires — 0 : faible, 1–2 : moyen, ≥ 3 : élevé (environ 10, 20, 40, 60, 80 %).", refs: ["ponv2025"] },
    { text: "Prophylaxie multimodale large chez l'adulte : associations d'antiémétiques de classes différentes (plus efficaces qu'un seul) et réduction du risque de base — AIVOC au propofol, épargne morphinique (paracétamol, AINS, kétamine), ALR, pas d'hypotension.", refs: ["ponv2025"] },
    { text: "Secours : un antiémétique d'une autre classe que celui de la prophylaxie.", refs: ["ponv2025"] },
  ];
  if (c.ambulatory) recommendations.push({ text: "Ambulatoire, NVPO après la sortie : femme, moins de 50 ans, antécédent de NVPO, opioïdes ou nausées en SSPI.", refs: ["ponv2025"] });
  const summary = drugs.map((d) => d.name).slice(0, 3).join(" + ") || (risky ? "Risque élevé" : "Selon le risque");
  return phase("ponv", summary, { lines, drugs: sheetDrugs(drugs, "ponv"), recommendations, cards: drugCards(drugs) });
}

function phaseMonitoring(c: Ctx): SheetPhase {
  const lines: SheetLine[] = [];
  const material = c.plan?.material ?? [];
  if (material.length) lines.push({ text: material.join(" · ") });
  else lines.push({ text: "ECG, SpO₂, PNI, EtCO₂, température ; curarimètre si curare" });
  const has = (re: RegExp) => material.some((m) => re.test(fold(m)));
  if ((c.s.bleedingRisk === "high" || c.s.cardiacRisk === "high") && !has(/arteriel/)) lines.push({ text: "Cathéter artériel selon la cardiopathie et le saignement attendu ; deux voies veineuses de bon calibre" });
  const cards: CiCard[] = [];
  if (c.s.tourniquet || (c.plan?.tourniquetAlertMin ?? 0) > 0 || has(/garrot pneumatique|^garrot$/)) cards.push(CI_CARDS.tourniquet);
  if (has(/arteriel/)) cards.push(CI_CARDS.arterialLine);
  if (has(/voie veineuse centrale|catheter central/)) cards.push(CI_CARDS.centralLine);
  if (/laser|tracheotomie|tracheostomie/.test(c.name) || /laser/.test(c.text)) cards.push(CI_CARDS.airwayLaser);
  const recommendations: SheetLine[] = [
    { text: "Minimum : ECG, SpO₂, PNI, EtCO₂ (capnographie aussi pendant une sédation), température si l'intervention dépasse 30 min ; curarimètre quantitatif si curare ; EEG traité en AIVOC avec curare.", refs: ["monitoring2021", "nmbEsaic2023"] },
  ];
  const summary = material.length ? material.filter((m) => !/^(ECG|PNI|SpO₂|EtCO₂|Température)$/.test(m)).slice(0, 3).join(", ") || "Monitorage standard" : "Monitorage standard";
  return phase("monitoring", summary, { lines, recommendations, cards });
}

function phasePosition(c: Ctx): SheetPhase | null {
  const p = c.position;
  const cards: CiCard[] = [];
  const lines: SheetLine[] = [];
  if (c.s.position) {
    const matched = POSITIONS.filter((pos) => p.includes(fold(pos.label).split(" (")[0]));
    // The position as written, unless it is just one of the known positions (its hint says more).
    if (!matched.some((pos) => fold(pos.label).split(" (")[0] === p.trim())) lines.push({ text: c.s.position });
    for (const pos of matched) lines.push({ text: `${pos.label} : ${pos.hint}` });
  }
  if (c.laparoscopic) cards.push(CI_CARDS.laparoscopy);
  if (/trendelenburg/.test(p) && !/anti-trendelenburg|proclive/.test(p)) cards.push(CI_CARDS.trendelenburg);
  else if (c.s.approach === "robotic" && /prostat|cystect|hysterect|rectum|pelv/.test(c.name)) cards.push(CI_CARDS.trendelenburg);
  if (/ventral|prone|genu-pectoral/.test(p)) cards.push(CI_CARDS.prone);
  if (/(?<!semi-)assis/.test(p) || /position assise/.test(c.name)) cards.push(CI_CARDS.sitting);
  if (/semi-assis|beach/.test(p)) cards.push(CI_CARDS.beachChair);
  if (/lithotom|gynecolog|jambiere|etrier/.test(p)) cards.push(CI_CARDS.lithotomy);
  if (/decubitus lateral|lombotomie/.test(p)) cards.push(CI_CARDS.lateral);
  if (!lines.length && !cards.length) return null;
  return phase("position", c.s.position ?? (c.laparoscopic ? "Cœlioscopie" : ""), { lines, cards });
}

function phasePostop(c: Ctx): SheetPhase {
  const lines: SheetLine[] = [];
  const pp = c.plan?.postopPlan;
  const destination = c.s.setting
    ? { ambulatory: "Ambulatoire", inpatient: "Hospitalisation", hdu: "Soins intermédiaires", icu: "Soins intensifs" }[c.s.setting]
    : pp?.destination
      ? POSTOP_DESTINATIONS.find((d) => d.code === pp.destination)?.label
      : undefined;
  if (destination) lines.push({ text: `Destination : ${destination.toLowerCase()}` });
  for (const l of postopLines(pp ? { ...pp, destination: undefined } : undefined, c.child ? { age: 8 } : {})) lines.push({ text: l.text + (l.warning ? ` (${l.warning})` : "") });
  for (const l of c.plan?.postop ?? []) lines.push({ text: l });
  if (c.ambulatory)
    lines.push({
      text: "Sortie : constantes et pression artérielle comme avant, pas de saignement, voies aériennes libres, orienté, sans NVPO, miction (après rachianesthésie ou urologie), normothermie, bloc levé et marche sûre ; accompagnant adulte la première nuit, pas de conduite pendant 24 h.",
      refs: ["manual"],
      chapter: "chap. 26",
    });
  const blocks: SheetBlock[] = erasFor(c.s).map((g) => ({ title: `ERAS® : ${g.title} (${g.year})`, items: [{ label: "Propre à cette chirurgie", points: g.points }], source: `ERAS® Society ${g.year}`, pmid: g.pmid }));
  if (blocks.length) blocks.push({ title: "ERAS® : éléments communs", items: [{ label: "Pour toutes les chirurgies", points: ERAS_COMMON }], source: "Grant & Engelman 2025", pmid: "41168801" });
  const recommendations: SheetLine[] = [
    { text: "Curarisation résiduelle exclue avant l'extubation : TOF-ratio ≥ 0,9 au monitorage quantitatif.", refs: ["nmbEsaic2023", "nmbAsa2023"] },
    { text: "Pression artérielle : une PAS < 90 mmHg est associée à des complications (seuil plus haut chez l'hypertendu) ; mesures plus fréquentes chez le patient à risque.", refs: ["postopBp2019"] },
  ];
  const summary = destination ?? "Selon le patient";
  return phase("postop", summary, { lines, blocks, recommendations });
}

function phase(code: PhaseCode, summary: string, parts: Partial<Omit<SheetPhase, "code" | "title" | "summary">>): SheetPhase {
  return {
    code,
    title: PHASES.find((p) => p.code === code)!.title,
    summary,
    lines: parts.lines ?? [],
    drugs: parts.drugs ?? [],
    blocks: parts.blocks ?? [],
    recommendations: parts.recommendations ?? [],
    patients: parts.patients ?? [],
    cards: parts.cards ?? [],
  };
}

const OBSTETRIC_DOSE = /eclampsie|post-partum|cesarienne/;

/** A child's sheet has no elderly or pregnancy notes, an adult's no child doses; an obstetric one keeps only obstetric doses for pregnancy. */
function relevant(n: ProfileNote, c: Ctx): boolean {
  if (c.child) return n.profile !== "elderly" && n.profile !== "pregnancy";
  if (n.profile === "child") return false;
  if (n.profile === "pregnancy" && c.maleOnly) return false;
  if (n.profile === "pregnancy") return c.obstetric ? OBSTETRIC_DOSE.test(fold(n.text)) : !OBSTETRIC_DOSE.test(fold(n.text));
  return true;
}

/** The anaesthesia of a procedure, phase by phase — with its protocol when one applies. */
// ---------------------------------------------------------------------------
// Technique chosen in the sheet: the whole sheet for that one technique
// ---------------------------------------------------------------------------

export type SheetMode = "general" | "neuraxial" | "regional" | "sedation";
export const SHEET_MODES: { code: SheetMode; label: string }[] = [
  { code: "general", label: "AG" },
  { code: "neuraxial", label: "Rachi / péridurale" },
  { code: "regional", label: "ALR périphérique" },
  { code: "sedation", label: "Sédation" },
];

const BLOCKS: Technique[] = ["deep_block", "superficial_block"];
const allTechniques = (s: SurgeryItem, plan: ProtocolContent | undefined) => new Set<Technique>([...(s.techniques ?? []), ...(plan?.techniques ?? [])]);
const spinalDrug = (d: ProtocolDrug) => d.route === "intrathecal" && d.phase === "alr";
/** A neuraxial technique that is an anaesthesia of its own — not an epidural or intrathecal morphine added to a general anaesthesia. */
function neuraxialAlone(s: SurgeryItem, plan: ProtocolContent | undefined): boolean {
  if (plan?.drugs.some(spinalDrug)) return true;
  if (plan?.drugs.some((d) => d.route === "peridural")) return false;
  return s.incision === "peripheral";
}

/** The techniques this procedure can be done under, general anaesthesia always among them (the patient may want it). */
export function sheetModes(s: SurgeryItem, protocol: Protocol | null): SheetMode[] {
  const plan = protocol?.content;
  const t = allTechniques(s, plan);
  const out = new Set<SheetMode>(["general"]);
  if (t.has("neuraxial") && neuraxialAlone(s, plan)) out.add("neuraxial");
  if (BLOCKS.some((b) => t.has(b)) && (!t.has("general") || BLOCKS.includes((s.techniques ?? [])[0]))) out.add("regional");
  if (t.has("sedation")) out.add("sedation");
  return SHEET_MODES.map((m) => m.code).filter((m) => out.has(m));
}

/** The usual technique of the procedure, as a mode. */
export function defaultSheetMode(s: SurgeryItem, protocol: Protocol | null): SheetMode {
  const modes = sheetModes(s, protocol);
  const first = (s.techniques?.length ? s.techniques : (protocol?.content.techniques ?? []))[0];
  const m: SheetMode | undefined = first === "general" ? "general" : first === "neuraxial" ? "neuraxial" : first === "sedation" ? "sedation" : first ? "regional" : undefined;
  return m && modes.includes(m) ? m : modes[0];
}

/** The procedure and its protocol reduced to the chosen technique. */
function forMode(s: SurgeryItem, protocol: Protocol | null, mode: SheetMode): { s: SurgeryItem; protocol: Protocol | null } {
  const plan = protocol?.content;
  const t = allTechniques(s, plan);
  const blocks = BLOCKS.filter((b) => t.has(b));
  const techniques: Technique[] =
    mode === "general"
      ? ["general", ...blocks, ...(t.has("neuraxial") && !neuraxialAlone(s, plan) ? (["neuraxial"] as Technique[]) : [])]
      : mode === "neuraxial"
        ? ["neuraxial", ...(t.has("sedation") ? (["sedation"] as Technique[]) : [])]
        : mode === "regional"
          ? [...blocks, ...(t.has("sedation") ? (["sedation"] as Technique[]) : [])]
          : ["sedation", ...blocks];
  const sedationDrug = (d: ProtocolDrug) => /sedation|premedication/.test(fold(d.name));
  const gaDrug = (d: ProtocolDrug) => ((d.phase === "induction" || d.phase === "maintenance") && !sedationDrug(d)) || /sugammadex|neostigmine/.test(fold(d.name));
  const keep = (d: ProtocolDrug) =>
    mode === "general" ? !spinalDrug(d) && !sedationDrug(d) : !gaDrug(d) && (mode === "neuraxial" || !(d.route === "intrathecal" || d.route === "peridural"));
  const nextPlan = plan && { ...plan, techniques, drugs: plan.drugs.filter(keep), gases: mode === "general" ? plan.gases : undefined };
  return { s: { ...s, techniques }, protocol: protocol && nextPlan ? { ...protocol, content: nextPlan } : protocol };
}

export function anaesthesiaSheet(s0: SurgeryItem, protocol0: Protocol | null, mode?: SheetMode): SheetPhase[] {
  const { s, protocol } = mode ? forMode(s0, protocol0, mode) : { s: s0, protocol: protocol0 };
  const c = context(s, protocol, !!mode);
  const drugs = c.plan?.drugs ?? [];
  const byPhase = (p: PhaseCode) => drugs.filter((d) => DRUG_PHASE_OF[d.phase] === p);
  const postopNames = c.drugNames.slice(drugs.length);
  const phases = [
    phaseTechnique(c),
    phaseAirway(c),
    phaseInduction(c, byPhase("induction")),
    phaseMaintenance(c, byPhase("maintenance")),
    phaseAnalgesia(c, byPhase("analgesia")),
    phaseAntibio(c, byPhase("antibio")),
    phasePonv(c, byPhase("ponv")),
    phaseMonitoring(c),
    phasePosition(c),
    phasePostop(c),
  ].filter((p): p is SheetPhase => p !== null);

  for (const p of phases) {
    const written = NOTES.filter((n) => n.phase === p.code && (!n.when || n.when(c))).map(({ profile, text, refs, chapter }) => ({ profile, text, refs, chapter }));
    const fromDrugs = p.code === "analgesia" ? drugNotes(byPhase("analgesia"), postopNames) : ["induction", "maintenance", "antibio", "ponv"].includes(p.code) ? drugNotes(byPhase(p.code), []) : [];
    const order = (n: ProfileNote) => PATIENT_PROFILES.findIndex((x) => x.code === n.profile);
    p.patients = [...written, ...fromDrugs].filter((n) => relevant(n, c)).sort((a, b) => order(a) - order(b));
  }
  return phases;
}

/** Every guideline the sheet cites — for the list of sources. */
export function sheetRefs(phases: SheetPhase[]): GuidelineId[] {
  const out = new Set<GuidelineId>();
  for (const p of phases) {
    for (const l of [...p.lines, ...p.recommendations]) for (const r of l.refs ?? []) out.add(r);
    for (const n of p.patients) for (const r of n.refs) out.add(r);
    for (const c of p.cards) for (const r of c.refs) out.add(r);
  }
  return [...out];
}

/** The profiles some note of the sheet is about, in the order of PATIENT_PROFILES. */
export function sheetProfiles(phases: SheetPhase[]): ProfileCode[] {
  const used = new Set(phases.flatMap((p) => p.patients.map((n) => n.profile)));
  return PATIENT_PROFILES.map((p) => p.code).filter((c) => used.has(c));
}
