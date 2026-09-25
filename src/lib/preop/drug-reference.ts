// Doses and contraindications of the anaesthesia drugs, as given by the
// reference textbook the user supplied — Manuel pratique d'anesthésie,
// 4e édition (Elsevier Masson, 2020), chapters 6 to 10. Shown next to a
// drug of the plan (with « use as dose », never applied on its own) and
// checked against the patient: a drug to avoid, or to adapt. The book
// dates from 2020 and a hospital protocol prevails: these are reference
// values, not orders.

import type { DoseUnit, WeightBasis } from "./protocols";
import { treatmentMatches } from "./medications";
import type { PatientTreatment } from "./rules/types";

export const DRUG_REFERENCE_SOURCE = "Manuel pratique d'anesthésie, 4e éd. 2020";

export interface ReferenceDose {
  /** « Induction (adulte) ». */
  label: string;
  min: number;
  max: number;
  unit: DoseUnit;
  /** per_kg: per kilo (of `basis`), fixed: total dose; rate: shown as it is (perfusion). */
  mode: "per_kg" | "fixed" | "rate";
  /** For a rate: « /kg/h », « /kg/min », « /h »… */
  per?: string;
  basis?: WeightBasis;
  note?: string;
}

/** A condition, a treatment class or a value that makes the drug contraindicated or to adapt. */
export interface DrugCaution {
  /** Antecedents (catalogue ids), any of them. */
  conditions?: string[];
  /** Treatments (ATC prefix), any of them. */
  atc?: string[];
  /** Words of the planned surgery's name. */
  surgery?: RegExp;
  level: "contraindicated" | "relative" | "adapt";
  text: string;
}

export interface DrugReference {
  name: string;
  /** Words matched in a plan drug's name (folded). */
  words: string[];
  chapter: string;
  doses: ReferenceDose[];
  cautions: DrugCaution[];
  /** Local anaesthetic: maximum dose (mg/kg and total mg), without and with adrenaline (tableau 12.1). Doses add up across local anaesthetics. */
  maxDose?: { perKg: number; totalMg: number; withAdrenalinePerKg?: number; withAdrenalineTotalMg?: number };
  /** Its cautions are raised only when it is in the plan (antibiotics: not an anaesthesia drug to avoid in general). */
  onlyInPlan?: boolean;
}

const pk = (label: string, min: number, max: number, unit: DoseUnit = "mg", extra: Partial<ReferenceDose> = {}): ReferenceDose => ({ label, min, max, unit, mode: "per_kg", ...extra });
const fx = (label: string, min: number, max: number, unit: DoseUnit = "mg", extra: Partial<ReferenceDose> = {}): ReferenceDose => ({ label, min, max, unit, mode: "fixed", ...extra });
const rt = (label: string, min: number, max: number, unit: DoseUnit, per: string, extra: Partial<ReferenceDose> = {}): ReferenceDose => ({ label, min, max, unit, mode: "rate", per, ...extra });

const HYPERKALAEMIA_RISK = ["hemiplegia", "spinal_cord_injury", "neuromuscular", "myotonic_dystrophy", "duchenne", "als", "sma", "burns", "bedridden", "dialysis"];
const MAOI = ["N06AF", "N06AG", "N04BD"];

export const DRUG_REFERENCES: DrugReference[] = [
  // --- Chapitre 6 : agents intraveineux -------------------------------------------------
  {
    name: "Propofol",
    words: ["propofol", "diprivan"],
    chapter: "chap. 6",
    doses: [
      pk("Induction (adulte)", 2, 3),
      pk("Induction (personne âgée)", 1, 2),
      pk("Induction (enfant)", 2.5, 5),
      rt("Entretien", 3, 12, "mg", "/kg/h"),
      rt("Sédation", 2, 6, "mg", "/kg/h", { note: "Ne pas dépasser 4 mg/kg/h plus de 48 h (syndrome de perfusion du propofol)." }),
    ],
    cautions: [
      { conditions: ["heart_failure", "dilated_cardiomyopathy", "aortic_stenosis"], level: "adapt", text: "cardiopathie : hypotension de 20–30 % à l'induction — bolus de 30–40 mg toutes les 10 s jusqu'à la perte de conscience" },
    ],
  },
  {
    name: "Thiopental",
    words: ["thiopental", "pentothal", "nesdonal"],
    chapter: "chap. 6",
    doses: [pk("Induction (adulte)", 3, 5, "mg", { basis: "ideal", note: "Obèse : poids idéal (redistribution musculaire limitée)." }), pk("Induction (enfant)", 5, 7)],
    cautions: [
      { conditions: ["porphyria"], level: "contraindicated", text: "porphyrie (surtout porphyrie aiguë intermittente)" },
      { conditions: ["malnutrition", "nephrotic"], level: "adapt", text: "hypoalbuminémie : fraction libre augmentée, réduire la dose" },
    ],
  },
  {
    name: "Étomidate",
    words: ["etomidate", "hypnomidate", "amidate"],
    chapter: "chap. 6",
    doses: [pk("Induction (adulte)", 0.2, 0.4)],
    cautions: [
      { conditions: ["porphyria"], level: "contraindicated", text: "porphyrie" },
      { conditions: ["adrenal_insufficiency"], level: "relative", text: "insuffisance surrénalienne : inhibe la synthèse du cortisol pendant 24 h" },
    ],
  },
  {
    name: "Kétamine",
    words: ["ketamine", "ketalar"],
    chapter: "chap. 6",
    doses: [
      pk("Induction (choc hypovolémique), IV", 1, 2),
      pk("Induction, IM", 3, 5),
      pk("Analgésie peropératoire : bolus", 0.5, 1),
      rt("Analgésie peropératoire : perfusion", 0.25, 0.25, "mg", "/kg/h"),
      pk("Épargne morphinique (sur 15 min en début d'intervention)", 0.1, 0.5),
    ],
    cautions: [
      { conditions: ["raised_icp", "intracranial_lesion"], level: "contraindicated", text: "hypertension intracrânienne" },
      { conditions: ["hypertension"], level: "contraindicated", text: "HTA" },
      { conditions: ["preeclampsia"], level: "contraindicated", text: "prééclampsie, éclampsie" },
      { conditions: ["coronary", "stable_angina", "recent_mi", "coronary_stent"], level: "contraindicated", text: "maladie coronarienne" },
      { conditions: ["porphyria"], level: "contraindicated", text: "porphyrie" },
      { conditions: ["psychosis", "bipolar"], level: "contraindicated", text: "maladie psychiatrique" },
      { atc: ["C07"], level: "adapt", text: "sous bêtabloquant, les effets sympathomimétiques disparaissent (cardiomyodépression)" },
    ],
  },
  {
    name: "Midazolam",
    words: ["midazolam", "dormicum", "hypnovel"],
    chapter: "chap. 6",
    doses: [pk("Prémédication, per os", 0.05, 0.1), pk("Sédation IV", 0.1, 0.2, "mg", { note: "Titrer par petites doses." }), pk("Induction IV", 0.2, 0.3)],
    cautions: [
      { conditions: ["osa", "copd", "obesity_hypoventilation", "raised_icp"], level: "relative", text: "prémédication sédative contre-indiquée : SAOS, BPCO sévère, obstruction des voies aériennes, baisse de la vigilance (chap. 15)" },
      { conditions: ["ckd", "dialysis"], level: "adapt", text: "insuffisance rénale : l'hydroxymidazolam s'accumule" },
      { atc: ["J01FA", "J02AC", "J05A"], level: "adapt", text: "inhibiteur du CYP3A4 : effet prolongé" },
    ],
  },
  {
    name: "Flumazénil",
    words: ["flumazenil", "anexate"],
    chapter: "chap. 6",
    doses: [fx("Surdosage en benzodiazépines : doses de 0,2 mg", 0.2, 1, "mg", { note: "Jusqu'à 1 mg ; demi-vie 1 h : resédation possible." })],
    cautions: [{ atc: ["N06AA"], level: "contraindicated", text: "antidépresseur tricyclique : proépileptogène" }],
  },

  // --- Chapitre 7 : opioïdes ---------------------------------------------------------------
  {
    name: "Fentanyl",
    words: ["fentanyl", "sintenyl", "durogesic"],
    chapter: "chap. 7",
    doses: [pk("Induction", 2, 5, "µg"), rt("Entretien", 0.5, 5, "µg", "/kg/h"), pk("Bolus", 0.5, 1.5, "µg"), fx("PCA : bolus toutes les 5–10 min", 10, 20, "µg", { note: "Maximum 400 µg / 4 h." }), fx("Intrathécal (tableau 13.5)", 10, 25, "µg")],
    cautions: [{ atc: ["J01FA", "J02AC", "J05A"], level: "adapt", text: "inhibiteur du CYP3A4 : effet prolongé" }],
  },
  {
    name: "Sufentanil",
    words: ["sufentanil", "sufenta"],
    chapter: "chap. 7",
    doses: [pk("Induction", 0.2, 0.6, "µg"), rt("Entretien", 0.5, 1.5, "µg", "/kg/h"), pk("Bolus", 0.1, 0.25, "µg"), fx("Intrathécal (tableau 13.5)", 5, 10, "µg")],
    cautions: [{ atc: ["J01FA", "J02AC", "J05A"], level: "adapt", text: "inhibiteur du CYP3A4 : effet prolongé" }],
  },
  {
    name: "Alfentanil",
    words: ["alfentanil", "rapifen"],
    chapter: "chap. 7",
    doses: [pk("Induction", 10, 40, "µg"), rt("Entretien", 0.5, 2, "µg", "/kg/min"), pk("Bolus", 5, 10, "µg")],
    cautions: [{ atc: ["J01FA", "J02AC", "J05A"], level: "adapt", text: "inhibiteur du CYP3A4 : effet prolongé" }],
  },
  {
    name: "Rémifentanil",
    words: ["remifentanil", "ultiva"],
    chapter: "chap. 7",
    doses: [pk("Induction", 0.2, 1, "µg"), rt("Entretien", 0.1, 0.5, "µg", "/kg/min"), rt("Ventilation spontanée", 0.03, 0.05, "µg", "/kg/min")],
    cautions: [],
  },
  {
    name: "Morphine",
    words: ["morphine"],
    chapter: "chap. 7",
    doses: [fx("PCA : bolus toutes les 5–10 min", 1, 2, "mg", { note: "Maximum 30 mg / 4 h." }), fx("Intrathécale (tableau 13.5)", 0.1, 0.3, "mg", { note: "Analgésie jusqu'à 24 h ; dépression respiratoire retardée possible : surveillance." })],
    cautions: [{ conditions: ["ckd", "dialysis"], level: "adapt", text: "insuffisance rénale : la morphine-6-glucuronide (active) s'accumule — dépression respiratoire retardée ; préférer un autre opioïde ou réduire" }],
  },
  {
    name: "Péthidine",
    words: ["pethidine", "meperidine", "dolantine"],
    chapter: "chap. 7",
    doses: [fx("Frissons postopératoires", 10, 25)],
    cautions: [
      { atc: MAOI, level: "contraindicated", text: "IMAO : syndrome sérotoninergique" },
      { conditions: ["ckd", "dialysis", "epilepsy"], level: "contraindicated", text: "insuffisance rénale ou épilepsie : la norpéthidine s'accumule (convulsions)" },
    ],
  },
  {
    name: "Tramadol",
    words: ["tramadol", "contramal", "tradonal", "topalgic"],
    chapter: "chap. 7",
    doses: [fx("Par prise (3–4 × / jour)", 50, 100, "mg", { note: "Maximum 400 mg / 24 h." }), pk("Frissons postopératoires", 0.5, 0.5)],
    cautions: [
      { atc: MAOI, level: "contraindicated", text: "IMAO non sélectif : syndrome sérotoninergique" },
      { atc: ["N06AB", "N06AX", "N06AA", "N05A"], level: "relative", text: "ISRS, tricyclique ou neuroleptique : syndrome sérotoninergique, seuil épileptogène abaissé" },
      { conditions: ["epilepsy"], level: "relative", text: "épilepsie : abaisse le seuil épileptogène" },
    ],
  },
  {
    name: "Oxycodone",
    words: ["oxycodone", "oxynorm", "oxycontin"],
    chapter: "chap. 7",
    doses: [fx("Forme retard (2–3 × / 24 h)", 10, 10), fx("Forme rapide, réserve", 5, 5)],
    cautions: [{ conditions: ["ckd", "dialysis"], level: "adapt", text: "clairance < 30 mL/min : la noroxycodone s'accumule, réduire la posologie" }],
  },
  {
    name: "Nalbuphine",
    words: ["nalbuphine", "nubain"],
    chapter: "chap. 7",
    doses: [fx("Adulte, IV, IM ou SC", 10, 20), pk("Enfant", 0.1, 0.2, "mg", { note: "Maximum 10 mg." })],
    cautions: [{ conditions: ["opioid_use_disorder", "chronic_opioids"], level: "contraindicated", text: "traitement par agoniste µ : sevrage précipité" }],
  },
  {
    name: "Naloxone",
    words: ["naloxone", "narcan"],
    chapter: "chap. 7",
    doses: [pk("Toutes les 2 min jusqu'à l'effet", 0.5, 1, "µg", { note: "Habituellement 40 µg toutes les 2 min ; demi-vie 1 h. Doses plus fortes sous buprénorphine." })],
    cautions: [{ conditions: ["opioid_use_disorder", "chronic_opioids"], level: "adapt", text: "patient dépendant : syndrome de sevrage — titrer" }],
  },

  // --- Chapitre 8 : curares ------------------------------------------------------------------
  {
    name: "Suxaméthonium (succinylcholine)",
    words: ["suxamethonium", "succinylcholine", "celocurine", "lysthenon"],
    chapter: "chap. 8",
    doses: [pk("Intubation", 1, 1.5)],
    cautions: [
      { conditions: ["malignant_hyperthermia"], level: "contraindicated", text: "hyperthermie maligne" },
      { conditions: HYPERKALAEMIA_RISK, level: "contraindicated", text: "risque d'hyperkaliémie : brûlures étendues après 24 h, hémiplégie, paraplégie, myopathie, myotonie, alitement prolongé, insuffisance rénale terminale" },
      { conditions: ["pseudocholinesterase"], level: "contraindicated", text: "déficit en pseudocholinestérases : paralysie prolongée" },
      { conditions: ["raised_icp", "intracranial_lesion"], level: "relative", text: "hypertension intracrânienne" },
      { surgery: /globe|oculaire/i, level: "relative", text: "plaie oculaire avec ouverture du globe" },
      { conditions: ["pregnancy", "cirrhosis", "malnutrition"], level: "adapt", text: "grossesse, cachexie, insuffisance hépatique : bloc prolongé" },
    ],
  },
  {
    name: "Rocuronium",
    words: ["rocuronium", "esmeron"],
    chapter: "chap. 8",
    doses: [pk("Intubation", 0.6, 1.2), pk("Séquence rapide (contre-indication à la succinylcholine)", 0.9, 1.2)],
    cautions: [
      { conditions: ["myasthenia", "hyperthyroidism", "hypothyroidism", "hyperparathyroidism", "hyperaldosteronism", "adrenal_insufficiency", "lambert_eaton"], level: "adapt", text: "réduire les doses (myasthénie, dysthyroïdie, dysparathyroïdie, hyperaldostéronisme, insuffisance surrénalienne) ; monitorage" },
      { atc: ["N03AB", "N03AF", "R03DA"], level: "adapt", text: "phénytoïne, carbamazépine ou théophylline au long cours : bloc moins intense" },
      { atc: ["N05AN"], level: "adapt", text: "lithium : potentialisation" },
    ],
  },
  {
    name: "Vécuronium",
    words: ["vecuronium", "norcuron"],
    chapter: "chap. 8",
    doses: [pk("Intubation", 0.1, 0.2)],
    cautions: [{ conditions: ["myasthenia", "hyperthyroidism", "hypothyroidism", "hyperparathyroidism"], level: "adapt", text: "réduire les doses ; monitorage" }],
  },
  {
    name: "Cisatracurium",
    words: ["cisatracurium", "nimbex"],
    chapter: "chap. 8",
    doses: [pk("Intubation", 0.15, 0.2)],
    cautions: [],
  },
  {
    name: "Atracurium",
    words: ["atracurium", "tracrium"],
    chapter: "chap. 8",
    doses: [pk("Intubation", 0.5, 0.6)],
    cautions: [{ conditions: ["mastocytosis", "asthma"], level: "relative", text: "histaminolibération" }],
  },
  {
    name: "Mivacurium",
    words: ["mivacurium", "mivacron"],
    chapter: "chap. 8",
    doses: [pk("Intubation", 0.2, 0.25)],
    cautions: [{ conditions: ["pseudocholinesterase"], level: "contraindicated", text: "déficit en pseudocholinestérases" }],
  },

  // --- Chapitre 9 : décurarisation ------------------------------------------------------------
  {
    name: "Néostigmine",
    words: ["neostigmine", "prostigmine"],
    chapter: "chap. 9",
    doses: [pk("Décurarisation (dès 2 réponses au TOF)", 0.04, 0.08, "mg", { note: "Avec atropine ou glycopyrrolate 0,02 mg/kg (max 1 mg)." })],
    cautions: [
      { conditions: ["asthma", "copd"], level: "relative", text: "asthme ou BPCO spastique : bronchoconstriction" },
      { conditions: ["parkinson"], level: "relative", text: "maladie de Parkinson" },
    ],
  },
  {
    name: "Sugammadex",
    words: ["sugammadex", "bridion"],
    chapter: "chap. 9",
    doses: [pk("Décurarisation (rocuronium, vécuronium)", 2, 4), pk("Urgence : 3 min après 1,2 mg/kg de rocuronium", 16, 16)],
    cautions: [
      { atc: ["G03A"], level: "adapt", text: "contraception hormonale : efficacité diminuée — contraception complémentaire 7 jours (RCP)" },
      { conditions: ["dialysis"], level: "relative", text: "excrété inchangé par le rein : insuffisance rénale sévère" },
    ],
  },

  // --- Chapitre 10 : système nerveux autonome ---------------------------------------------------
  {
    name: "Éphédrine",
    words: ["ephedrine"],
    chapter: "chap. 10",
    doses: [pk("Hypotension peropératoire (bolus)", 0.1, 0.5, "mg", { note: "En général 2,5–10 mg par bolus." })],
    cautions: [
      { atc: ["C07"], level: "adapt", text: "bêtabloquant au long cours : effet indirect diminué" },
      { atc: MAOI, level: "contraindicated", text: "IMAO : sympathomimétique indirect, crise hypertensive" },
    ],
  },
  {
    name: "Phényléphrine",
    words: ["phenylephrine", "neosynephrine"],
    chapter: "chap. 10",
    doses: [pk("Hypotension : bolus", 0.5, 2, "µg", { note: "En général 50–200 µg." }), rt("Perfusion", 1, 10, "µg", "/kg/min")],
    cautions: [],
  },
  {
    name: "Noradrénaline",
    words: ["noradrenaline", "norepinephrine", "levophed"],
    chapter: "chap. 10",
    doses: [rt("État de choc", 0.05, 1, "µg", "/kg/min", { note: "Voie veineuse centrale de préférence (nécrose en cas d'extravasation)." })],
    cautions: [],
  },
  {
    name: "Adrénaline",
    words: ["adrenaline", "epinephrine"],
    chapter: "chap. 10",
    doses: [rt("État de choc", 0.01, 0.1, "µg", "/kg/min"), fx("Réanimation cardiopulmonaire", 1, 1)],
    cautions: [],
  },
  {
    name: "Atropine",
    words: ["atropine"],
    chapter: "chap. 10",
    doses: [fx("Bradycardie (à répéter 2 fois)", 0.5, 0.5), pk("Sécrétions oropharyngées", 0.02, 0.02, "mg", { note: "Maximum 0,6 mg." }), pk("Avec la néostigmine", 20, 20, "µg")],
    cautions: [
      { conditions: ["glaucoma"], level: "relative", text: "glaucome à angle fermé" },
      { conditions: ["urinary_retention"], level: "relative", text: "hypertrophie prostatique, obstacle du col vésical" },
      { conditions: ["heart_transplant"], level: "adapt", text: "cœur dénervé : sans effet" },
    ],
  },
  {
    name: "Clonidine",
    words: ["clonidine", "catapressan"],
    chapter: "chap. 10 et 12",
    doses: [pk("Épargne anesthésique ou frissons (IV lent)", 2, 3, "µg"), fx("Bloc périphérique (chap. 12)", 150, 150, "µg", { note: "Prolonge le bloc d'environ 2 h." }), pk("Bloc central (chap. 12)", 0.5, 1, "µg"), rt("Agitation", 0.5, 2, "µg", "/kg/h")],
    cautions: [{ conditions: ["av_block"], level: "relative", text: "bradycardie, bloc auriculo-ventriculaire" }],
  },
  {
    name: "Dexmédétomidine",
    words: ["dexmedetomidine", "dexdor"],
    chapter: "chap. 10 et 12",
    doses: [pk("Charge en 10 min", 1, 1, "µg"), rt("Perfusion", 0.2, 0.7, "µg", "/kg/h"), fx("Périnerveuse (chap. 12)", 50, 60, "µg", { note: "Prolonge le bloc d'environ 6 h ; hors AMM." })],
    cautions: [{ conditions: ["av_block"], level: "relative", text: "bradycardie, bloc auriculo-ventriculaire : hypotension et bradycardie en perfusion" }],
  },
  {
    name: "Esmolol",
    words: ["esmolol", "brevibloc"],
    chapter: "chap. 10",
    doses: [pk("Bolus", 0.5, 1), rt("Perfusion", 10, 50, "µg", "/kg/min", { note: "Le chapitre 10 cite jusqu'à 500 µg/kg/min." })],
    cautions: [
      { conditions: ["asthma", "copd"], level: "relative", text: "bronchospasme" },
      { conditions: ["av_block"], level: "contraindicated", text: "bradycardie, bloc auriculo-ventriculaire" },
      { conditions: ["heart_failure"], level: "relative", text: "insuffisance cardiaque décompensée" },
    ],
  },
  {
    name: "Métoprolol",
    words: ["metoprolol", "lopressor", "seloken"],
    chapter: "chap. 10",
    doses: [fx("Bolus toutes les 2–5 min", 2, 5)],
    cautions: [
      { conditions: ["asthma"], level: "relative", text: "bronchospasme" },
      { conditions: ["av_block"], level: "contraindicated", text: "bradycardie, bloc auriculo-ventriculaire" },
    ],
  },

  // --- Adjuvants d'épargne morphinique (tableau 7.5) ------------------------------------------------
  { name: "Dexaméthasone", words: ["dexamethasone"], chapter: "chap. 7 et 12", doses: [pk("Début d'intervention (IV lent)", 0.1, 0.2, "mg", { note: "Prolonge aussi un bloc périphérique d'environ 8 h (chap. 12)." }), fx("Périnerveuse (dose plafond)", 4, 4)], cautions: [{ conditions: ["diabetes_insulin", "diabetes_oral"], level: "adapt", text: "diabète : élévation de la glycémie" }] },
  { name: "Kétorolac", words: ["ketorolac", "taradyl"], chapter: "chap. 7, tableau 7.5", doses: [fx("Fin d'intervention", 30, 60)], cautions: [{ conditions: ["ckd", "dialysis", "peptic_ulcer", "gi_bleeding"], level: "contraindicated", text: "insuffisance rénale, ulcère ou hémorragie digestive" }] },
  { name: "Magnésium", words: ["magnesium"], chapter: "chap. 7, tableau 7.5", doses: [pk("Sur 15 min en fin d'intervention", 40, 50)], cautions: [{ conditions: ["myasthenia", "neuromuscular"], level: "relative", text: "potentialise les curares" }] },
  { name: "Lidocaïne IV", words: ["lidocaine iv", "xylocaine iv", "lidocaine intraveineuse"], chapter: "chap. 7, tableau 7.5", doses: [pk("Bolus", 1.5, 1.5), rt("Perfusion", 2, 2, "mg", "/kg/h")], cautions: [{ conditions: ["av_block"], level: "relative", text: "troubles conductifs" }] },
  { name: "Paracétamol", words: ["paracetamol", "perfusalgan", "dafalgan"], chapter: "chap. 7, tableau 7.5", doses: [fx("Fin d'intervention, sur 15 min", 1, 1, "g")], cautions: [{ conditions: ["cirrhosis"], level: "adapt", text: "insuffisance hépatique : réduire" }] },

  // --- Chapitre 11 : hypotenseurs ---------------------------------------------------------------
  {
    name: "Nitroglycérine",
    words: ["nitroglycerine", "trinitrine", "nitronal"],
    chapter: "chap. 11",
    doses: [rt("Perfusion", 0.5, 10, "µg", "/kg/min", { note: "Débuter à 5–10 µg/min, +5 µg toutes les 5 min, maximum 500 µg/min ; tubulure en polyéthylène." })],
    cautions: [
      { conditions: ["raised_icp", "intracranial_lesion"], level: "relative", text: "hypertension intracrânienne" },
      { conditions: ["aortic_stenosis"], level: "relative", text: "sténose aortique" },
      { conditions: ["hcm"], level: "relative", text: "cardiomyopathie obstructive (baisse de précharge)" },
    ],
  },
  {
    name: "Nitroprussiate",
    words: ["nitroprussiate", "nitroprusside", "nipride"],
    chapter: "chap. 11",
    doses: [rt("Perfusion", 0.5, 3, "µg", "/kg/min", { note: "Deuxième choix ; tachyphylaxie, acidose ou SvO₂ élevée : intoxication au cyanure." })],
    cautions: [
      { conditions: ["raised_icp", "intracranial_lesion"], level: "relative", text: "hypertension intracrânienne" },
      { conditions: ["aortic_stenosis"], level: "relative", text: "sténose aortique" },
      { conditions: ["recent_mi"], level: "relative", text: "syndrome coronarien aigu" },
    ],
  },
  {
    name: "Nicardipine",
    words: ["nicardipine", "loxen"],
    chapter: "chap. 11",
    doses: [fx("Bolus IV (1 mg/min)", 1, 10), rt("Perfusion", 2, 4, "mg", "/h", { note: "Paliers de 0,5 mg/h, maximum 10–15 mg/h." })],
    cautions: [],
  },
  {
    name: "Urapidil",
    words: ["urapidil", "uradipil", "eupressyl", "ebrantil"],
    chapter: "chap. 11",
    doses: [fx("Bolus en 30 s", 10, 50), rt("Entretien", 5, 20, "mg", "/h")],
    cautions: [],
  },
  {
    name: "Dihydralazine",
    words: ["dihydralazine", "nepressol"],
    chapter: "chap. 11",
    doses: [fx("Bolus IV", 2.5, 20, "mg", { note: "Action en 15 min pendant 2–4 h." })],
    cautions: [{ conditions: ["coronary", "stable_angina", "recent_mi"], level: "adapt", text: "coronarien : tachycardie réflexe (associer un bêtabloquant)" }, { conditions: ["raised_icp"], level: "relative", text: "hypertension intracrânienne" }],
  },
  {
    name: "Diltiazem",
    words: ["diltiazem", "tildiem"],
    chapter: "chap. 11",
    doses: [rt("Perfusion", 5, 15, "mg", "/h")],
    cautions: [{ conditions: ["av_block"], level: "relative", text: "bloc auriculo-ventriculaire" }],
  },

  // --- Chapitres 12 et 13 : anesthésiques locaux ----------------------------------------------------------
  {
    name: "Lidocaïne",
    words: ["lidocaine", "xylocaine", "linisol"],
    chapter: "chap. 12",
    doses: [pk("Dose maximale sans adrénaline", 4, 4, "mg", { note: "Total 400 mg ; avec adrénaline 7 mg/kg (500 mg). Doses additives avec les autres anesthésiques locaux." }), pk("Bloc de Bier (bras, lidocaïne 0,5 %)", 3, 4)],
    cautions: [{ conditions: ["av_block"], level: "relative", text: "troubles conductifs (voie IV)" }],
    maxDose: { perKg: 4, totalMg: 400, withAdrenalinePerKg: 7, withAdrenalineTotalMg: 500 },
  },
  {
    name: "Mépivacaïne",
    words: ["mepivacaine", "carbocaine", "scandicaine"],
    chapter: "chap. 12",
    doses: [pk("Dose maximale sans adrénaline", 4, 4, "mg", { note: "Total 400 mg ; avec adrénaline 7 mg/kg (500 mg)." })],
    cautions: [],
    maxDose: { perKg: 4, totalMg: 400, withAdrenalinePerKg: 7, withAdrenalineTotalMg: 500 },
  },
  {
    name: "Lévobupivacaïne",
    words: ["levobupivacaine", "chirocaine"],
    chapter: "chap. 12 et 13",
    doses: [pk("Dose maximale sans adrénaline", 3, 3, "mg", { note: "Total 150 mg ; avec adrénaline 4 mg/kg (225 mg)." }), fx("Rachianesthésie, hyperbare (tableau 13.3)", 7.5, 15), fx("Rachianesthésie, isobare", 10, 15)],
    cautions: [],
    maxDose: { perKg: 3, totalMg: 150, withAdrenalinePerKg: 4, withAdrenalineTotalMg: 225 },
  },
  {
    name: "Bupivacaïne",
    words: ["bupivacaine", "marcaine"],
    chapter: "chap. 12 et 13",
    doses: [pk("Dose maximale sans adrénaline", 3, 3, "mg", { note: "Total 150 mg ; avec adrénaline 4 mg/kg (225 mg). Proscrite pour un bloc de Bier." }), fx("Rachianesthésie, hyperbare (tableau 13.3)", 7.5, 15, "mg", { note: "Durée 90–120 min ; réduire chez la personne âgée." }), fx("Rachianesthésie, isobare", 10, 15, "mg", { note: "Durée 150–300 min." })],
    cautions: [],
    maxDose: { perKg: 3, totalMg: 150, withAdrenalinePerKg: 4, withAdrenalineTotalMg: 225 },
  },
  {
    name: "Ropivacaïne",
    words: ["ropivacaine", "naropeine", "naropin"],
    chapter: "chap. 12",
    doses: [pk("Dose maximale sans adrénaline", 3, 3, "mg", { note: "Total 175 mg ; avec adrénaline 4 mg/kg (250 mg). Moins de bloc moteur." })],
    cautions: [],
    maxDose: { perKg: 3, totalMg: 175, withAdrenalinePerKg: 4, withAdrenalineTotalMg: 250 },
  },
  {
    name: "Prilocaïne",
    words: ["prilocaine", "citanest", "baritekal"],
    chapter: "chap. 12 et 13",
    doses: [pk("Dose maximale", 8, 8, "mg", { note: "Total 400 mg (600 mg avec adrénaline) ; au-delà de 600 mg : méthémoglobinémie (bleu de méthylène 1–2 mg/kg)." }), fx("Rachianesthésie (Baritekal, tableau 13.3)", 40, 80)],
    cautions: [{ conditions: ["g6pd"], level: "contraindicated", text: "déficit en G6PD : méthémoglobinémie, bleu de méthylène contre-indiqué" }],
    maxDose: { perKg: 8, totalMg: 400, withAdrenalineTotalMg: 600 },
  },
  {
    name: "Chloroprocaïne",
    words: ["chloroprocaine", "clorotekal", "nesacaine", "ivracaine"],
    chapter: "chap. 12 et 13",
    doses: [pk("Dose maximale", 12, 12, "mg", { note: "Total 600 mg." }), fx("Rachianesthésie (Clorotekal, tableau 13.3)", 30, 45, "mg", { note: "Durée 40–80 min : ambulatoire." })],
    cautions: [{ conditions: ["pseudocholinesterase"], level: "relative", text: "ester métabolisé par les pseudocholinestérases : toxicité accrue" }],
    maxDose: { perKg: 12, totalMg: 600, withAdrenalineTotalMg: 650 },
  },

  // --- Chapitre 20 : antibioprophylaxie et prophylaxie de l'endocardite -------------------------------
  {
    name: "Céfazoline",
    words: ["cefazoline", "cefacidal", "kefzol"],
    chapter: "chap. 20",
    doses: [fx("Antibioprophylaxie (IV lent, dans l'heure avant l'incision)", 2, 2, "g", { note: "3 g au-delà de 120 kg. Seconde dose si > 90 min entre l'injection et l'incision, 3–4 h après la 1re si l'intervention dure, ou si pertes sanguines > 1 500 ml." })],
    cautions: [],
  },
  {
    name: "Céfuroxime",
    words: ["cefuroxime", "zinacef", "zinnat", "zinat"],
    chapter: "chap. 20",
    doses: [fx("Antibioprophylaxie (IV lent, dans l'heure avant l'incision)", 1.5, 1.5, "g", { note: "Mêmes règles de réinjection que la céfazoline." }), fx("Endocardite, allergie non immédiate à l'amoxicilline (PO 1 h avant)", 1, 1, "g")],
    cautions: [],
  },
  {
    name: "Métronidazole",
    words: ["metronidazole", "flagyl"],
    chapter: "chap. 20",
    doses: [fx("Chirurgie du côlon, du rectum ou de l'appendice (en 20 min)", 500, 500, "mg", { note: "Ajouté à la céfazoline ou au céfuroxime ; 2e dose 8 h après si l'intervention dure." })],
    cautions: [],
  },
  {
    name: "Vancomycine",
    onlyInPlan: true,
    words: ["vancomycine", "vancocin"],
    chapter: "chap. 20",
    doses: [pk("Antibioprophylaxie, allergie immédiate aux bêtalactamines", 15, 30, "mg", { note: "Maximum 2 500 mg ; perfusion lente (≥ 1 000 mg en 60 min : hypotension par histaminolibération) ; 2e dose 8 h après." })],
    cautions: [{ conditions: ["ckd", "dialysis"], level: "adapt", text: "insuffisance rénale : seconde dose à discuter (élimination rénale)" }],
  },
  {
    name: "Clindamycine",
    words: ["clindamycine", "dalacin"],
    chapter: "chap. 20",
    doses: [fx("Antibioprophylaxie, allergie immédiate aux bêtalactamines (en 30 min)", 600, 600, "mg", { note: "2e dose 6 h après si l'intervention dure ; côlon/rectum/appendice : + gentamicine + métronidazole." }), fx("Endocardite, allergie immédiate (PO 1 h avant)", 600, 600)],
    cautions: [],
  },
  {
    name: "Gentamicine",
    onlyInPlan: true,
    words: ["gentamicine", "geomycine"],
    chapter: "chap. 20",
    doses: [pk("Avec la clindamycine, allergie aux bêtalactamines (en 30 min)", 5, 5)],
    cautions: [
      { conditions: ["ckd", "dialysis"], level: "relative", text: "insuffisance rénale : néphrotoxicité" },
      { conditions: ["myasthenia", "neuromuscular", "lambert_eaton"], level: "relative", text: "potentialise le bloc neuromusculaire" },
    ],
  },
  {
    name: "Amoxicilline",
    words: ["amoxicilline", "clamoxyl"],
    chapter: "chap. 20",
    doses: [fx("Prophylaxie de l'endocardite (PO 1 h avant, dose unique)", 2, 2, "g", { note: "Enfant : 50 mg/kg, maximum 2 g." })],
    cautions: [],
  },
];

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** The reference for a plan drug's name (« Propofol 1 % » → propofol). */
export function drugReferenceFor(name: string): DrugReference | undefined {
  const f = fold(name);
  // The word that comes first in the name decides: « Lidocaïne adrénalinée » is lidocaine, not adrenaline.
  let best: { ref: DrugReference; at: number } | undefined;
  for (const ref of DRUG_REFERENCES)
    for (const w of ref.words) {
      const at = f.indexOf(w);
      if (at >= 0 && (!best || at < best.at)) best = { ref, at };
    }
  return best?.ref;
}

export function formatReferenceDose(d: ReferenceDose): string {
  const n = (v: number) => String(v).replace(".", ",");
  const range = d.min === d.max ? n(d.min) : `${n(d.min)}–${n(d.max)}`;
  const per = d.mode === "per_kg" ? "/kg" : d.mode === "rate" ? d.per ?? "" : "";
  return `${range} ${d.unit}${per}`;
}

export interface CautionFinding {
  drug: DrugReference;
  caution: DrugCaution;
  /** What in the patient triggers it (« HTA », « bêtabloquant : Bisoprolol »). */
  because: string[];
}

/** The cautions of a drug that apply to this patient. */
export function cautionsFor(
  ref: DrugReference,
  patient: { conditions: Record<string, { present: boolean } | undefined>; treatments: PatientTreatment[]; surgeryName?: string; conditionLabel: (id: string) => string }
): CautionFinding[] {
  const out: CautionFinding[] = [];
  for (const caution of ref.cautions) {
    const because: string[] = [];
    for (const id of caution.conditions ?? []) if (patient.conditions[id]?.present) because.push(patient.conditionLabel(id));
    for (const atc of caution.atc ?? []) for (const t of patient.treatments) if (treatmentMatches(t, atc) && !because.includes(t.name)) because.push(t.name);
    if (caution.surgery && patient.surgeryName && caution.surgery.test(patient.surgeryName)) because.push(patient.surgeryName);
    if (because.length) out.push({ drug: ref, caution, because });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Morphine equivalents of the usual treatment (tableau 7.4)
// ---------------------------------------------------------------------------

/** Oral morphine mg per mg of the drug, from table 7.4 (10 mg IV/SC = 30 mg oral morphine). */
const ORAL_MORPHINE_PER_MG: { atc: string; name: string; factor: number }[] = [
  { atc: "N02AA01", name: "morphine orale", factor: 1 },
  { atc: "N02AA05", name: "oxycodone orale", factor: 1.5 },
  { atc: "N02AA03", name: "hydromorphone orale", factor: 6 },
  { atc: "N02AX02", name: "tramadol oral", factor: 0.15 },
  { atc: "N02AE01", name: "buprénorphine sublinguale", factor: 37.5 },
];

/**
 * Daily oral morphine equivalents of the opioids taken, when their daily dose
 * is known — tolerance is likely above 60 mg/day (chap. 7). Methadone and
 * patches aren't converted (non-linear or in µg/h): listed as unknown.
 */
export function morphineEquivalents(treatments: PatientTreatment[]): { total: number; parts: string[]; unknown: string[] } {
  let total = 0;
  const parts: string[] = [];
  const unknown: string[] = [];
  for (const t of treatments) {
    if (!treatmentMatches(t, "N02A") && !treatmentMatches(t, "N07BC")) continue;
    const conv = ORAL_MORPHINE_PER_MG.find((c) => treatmentMatches(t, c.atc));
    if (!conv || t.dailyDoseMg === undefined) {
      unknown.push(t.name);
      continue;
    }
    const mEq = Math.round(t.dailyDoseMg * conv.factor);
    total += mEq;
    parts.push(`${t.name} ${t.dailyDoseMg} mg/j ≈ ${mEq} mg de morphine orale`);
  }
  return { total, parts, unknown };
}

// ---------------------------------------------------------------------------
// Local anaesthetic load of a plan (tableau 12.1: toxic doses add up)
// ---------------------------------------------------------------------------

export interface LocalAnaestheticLoad {
  /** Share of the toxic dose, per product and summed (1 = 100 %), without adrenaline — the conservative case. */
  total: number;
  parts: { name: string; mg: number; maxMg: number; share: number }[];
  /** Products whose dose isn't computable yet (weight or dose missing). */
  unknown: string[];
}

/** The plan's local anaesthetics as a share of their toxic dose — without adrenaline unless the drug's name says so. */
export function localAnaestheticLoad(drugs: { name: string; amount: number | null; unit: string; doseMode: "fixed" | "per_kg"; weightBasis: string }[], weightKg: number | undefined, doseOf: (d: (typeof drugs)[number]) => { value: number; unit: string } | null): LocalAnaestheticLoad {
  const parts: LocalAnaestheticLoad["parts"] = [];
  const unknown: string[] = [];
  let total = 0;
  for (const d of drugs) {
    const ref = drugReferenceFor(d.name);
    if (!ref?.maxDose) continue;
    const dose = doseOf(d);
    const mg = dose ? (dose.unit === "g" ? dose.value * 1000 : dose.unit === "µg" ? dose.value / 1000 : dose.unit === "mg" ? dose.value : NaN) : NaN;
    if (!weightKg || !Number.isFinite(mg)) {
      unknown.push(d.name);
      continue;
    }
    const withAdrenaline = /adr[eé]nalin|epinephrin/i.test(d.name);
    const perKg = withAdrenaline ? ref.maxDose.withAdrenalinePerKg ?? ref.maxDose.perKg : ref.maxDose.perKg;
    const cap = withAdrenaline ? ref.maxDose.withAdrenalineTotalMg ?? ref.maxDose.totalMg : ref.maxDose.totalMg;
    const maxMg = Math.min(perKg * weightKg, cap);
    const share = mg / maxMg;
    total += share;
    parts.push({ name: d.name, mg: Math.round(mg * 10) / 10, maxMg: Math.round(maxMg), share });
  }
  return { total, parts, unknown };
}
