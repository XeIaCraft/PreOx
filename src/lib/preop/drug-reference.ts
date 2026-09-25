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
  /** « ng » only for a rate (AIVOC target), never taken into the plan. */
  unit: DoseUnit | "ng";
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
const rt = (label: string, min: number, max: number, unit: DoseUnit | "ng", per: string, extra: Partial<ReferenceDose> = {}): ReferenceDose => ({ label, min, max, unit, mode: "rate", per, ...extra });

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
      rt("AIVOC : cible d'induction (chap. 22)", 3, 6, "µg", "/ml", { note: "Intubation sans curare 4–8 µg/ml ; entretien 2–8 µg/ml ; réveil vers 1,2–1,5 µg/ml (0,8–1 chez la personne âgée). Tableau 22.1." }),
    ],
    cautions: [
      { conditions: ["heart_failure", "dilated_cardiomyopathy", "aortic_stenosis"], level: "adapt", text: "cardiopathie : hypotension de 20–30 % à l'induction — bolus de 30–40 mg toutes les 10 s jusqu'à la perte de conscience" },
      { conditions: ["pulmonary_hypertension"], level: "relative", text: "hypertension pulmonaire : baisse de la précharge du VD, étomidate préféré (chap. 27)" },
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
      { conditions: ["coronary", "stable_angina", "recent_mi"], level: "contraindicated", text: "cardiopathie ischémique : augmente la consommation d'O₂ du myocarde (chap. 27)" },
      { conditions: ["heart_failure", "dilated_cardiomyopathy"], level: "relative", text: "insuffisance cardiaque : cardiomyodépression importante (chap. 27)" },
      { conditions: ["carcinoid"], level: "relative", text: "tumeur carcinoïde : histaminolibération (chap. 34)" },
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
      { conditions: ["myotonic_dystrophy"], level: "contraindicated", text: "dystrophie myotonique : les myoclonies précipitent des contractures (chap. 29)" },
      { atc: ["H02AB"], level: "relative", text: "corticothérapie au long cours : aggrave l'inhibition surrénalienne (chap. 34)" },
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
      { conditions: ["pulmonary_hypertension"], level: "contraindicated", text: "hypertension pulmonaire : élève les résistances vasculaires pulmonaires (chap. 27)" },
      { conditions: ["pheochromocytoma"], level: "contraindicated", text: "phéochromocytome : sympathomimétique (chap. 34)" },
      { conditions: ["hyperthyroidism"], level: "relative", text: "hyperthyroïdie : stimulation sympathique (chap. 34)" },
    ],
  },
  {
    name: "Midazolam",
    words: ["midazolam", "dormicum", "hypnovel"],
    chapter: "chap. 6",
    doses: [pk("Prémédication, per os", 0.05, 0.1), pk("Prémédication de l'enfant, per os (chap. 37)", 0.3, 0.5), pk("Sédation IV", 0.1, 0.2, "mg", { note: "Titrer par petites doses." }), pk("Induction IV", 0.2, 0.3)],
    cautions: [
      { conditions: ["osa", "copd", "obesity_hypoventilation", "raised_icp"], level: "relative", text: "prémédication sédative contre-indiquée : SAOS, BPCO sévère, obstruction des voies aériennes, baisse de la vigilance (chap. 15)" },
      { conditions: ["ckd", "dialysis"], level: "adapt", text: "insuffisance rénale : l'hydroxymidazolam s'accumule" },
      { atc: ["J01FA", "J02AC", "J05A"], level: "adapt", text: "inhibiteur du CYP3A4 : effet prolongé" },
      { conditions: ["cognitive"], level: "relative", text: "démence : confusion postopératoire (chap. 29)" },
      { conditions: ["cirrhosis"], level: "relative", text: "cirrhose : pas de prémédication sédative (encéphalopathie, chap. 30)" },
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
    doses: [pk("Induction", 2, 5, "µg"), rt("Entretien", 0.5, 5, "µg", "/kg/h"), pk("Bolus", 0.5, 1.5, "µg"), fx("PCA : bolus toutes les 5–10 min", 10, 20, "µg", { note: "Maximum 400 µg / 4 h." }), fx("Intrathécal (tableau 13.5)", 10, 25, "µg"), rt("AIVOC : cible (chap. 22)", 1, 5, "ng", "/ml", { note: "Induction 1–2 ng/ml ; intubation et entretien 2–5 ng/ml." })],
    cautions: [{ atc: ["J01FA", "J02AC", "J05A"], level: "adapt", text: "inhibiteur du CYP3A4 : effet prolongé" }],
  },
  {
    name: "Sufentanil",
    words: ["sufentanil", "sufenta"],
    chapter: "chap. 7",
    doses: [pk("Induction", 0.2, 0.6, "µg"), rt("Entretien", 0.5, 1.5, "µg", "/kg/h"), pk("Bolus", 0.1, 0.25, "µg"), fx("Intrathécal (tableau 13.5)", 5, 10, "µg"), rt("AIVOC : cible (chap. 22)", 0.1, 0.6, "ng", "/ml", { note: "Induction 0,1–0,2 ng/ml ; intubation sans curare 0,4–0,6 ; entretien 0,2–0,6." })],
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
    doses: [pk("Induction", 0.2, 1, "µg"), rt("Entretien", 0.1, 0.5, "µg", "/kg/min"), rt("Ventilation spontanée", 0.03, 0.05, "µg", "/kg/min"), rt("AIVOC : cible (chap. 22)", 0.5, 8, "ng", "/ml", { note: "Induction 0,5–1,5 ng/ml ; intubation sans curare 3–6 ; entretien 4–8, voire 15 en chirurgie cardiaque. Voie dédiée avec valve antireflux." })],
    cautions: [],
  },
  {
    name: "Morphine",
    words: ["morphine"],
    chapter: "chap. 7",
    doses: [fx("PCA : bolus toutes les 5–10 min", 1, 2, "mg", { note: "Maximum 30 mg / 4 h." }), fx("Intrathécale (tableau 13.5)", 0.1, 0.3, "mg", { note: "Analgésie jusqu'à 24 h ; dépression respiratoire retardée possible : surveillance." })],
    cautions: [{ conditions: ["ckd", "dialysis"], level: "adapt", text: "insuffisance rénale : la morphine-6-glucuronide (active) s'accumule — dépression respiratoire retardée ; préférer un autre opioïde ou réduire" }, { conditions: ["pheochromocytoma", "carcinoid"], level: "relative", text: "phéochromocytome ou carcinoïde : histaminolibération (chap. 34)" }],
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
      { conditions: ["porphyria"], level: "relative", text: "porphyrie : médicament porphyrinogène (chap. 35)" },
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
    doses: [pk("Intubation", 1, 1.5), pk("Intubation de l'enfant (chap. 37)", 1.5, 2), pk("Laryngospasme de l'enfant qui désature (chap. 37)", 0.3, 0.3)],
    cautions: [
      { conditions: ["malignant_hyperthermia"], level: "contraindicated", text: "hyperthermie maligne" },
      { conditions: ["osteogenesis_imperfecta"], level: "relative", text: "ostéogenèse imparfaite : les fasciculations peuvent provoquer des fractures (chap. 40)" },
      { atc: ["S01EB03"], level: "adapt", text: "échothiophate (collyre) : bloc prolongé jusqu'à 4–6 semaines après l'arrêt (chap. 38)" },
      { conditions: HYPERKALAEMIA_RISK, level: "contraindicated", text: "risque d'hyperkaliémie : brûlures étendues après 24 h, hémiplégie, paraplégie, myopathie, myotonie, alitement prolongé, insuffisance rénale terminale" },
      { conditions: ["pseudocholinesterase"], level: "contraindicated", text: "déficit en pseudocholinestérases : paralysie prolongée" },
      { conditions: ["raised_icp", "intracranial_lesion"], level: "relative", text: "hypertension intracrânienne" },
      { surgery: /globe|oculaire/i, level: "relative", text: "plaie oculaire avec ouverture du globe" },
      { conditions: ["pregnancy", "cirrhosis", "malnutrition"], level: "adapt", text: "grossesse, cachexie, insuffisance hépatique : bloc prolongé" },
      { conditions: ["myasthenia"], level: "adapt", text: "myasthénie : résistance relative (chap. 29)" },
      { conditions: ["lambert_eaton"], level: "relative", text: "Lambert-Eaton : sensibilité augmentée (chap. 29)" },
      { conditions: ["pheochromocytoma"], level: "relative", text: "phéochromocytome : les fasciculations libèrent des catécholamines (chap. 34)" },
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
    cautions: [{ conditions: ["mastocytosis", "asthma"], level: "relative", text: "histaminolibération" }, { conditions: ["pheochromocytoma", "carcinoid"], level: "relative", text: "phéochromocytome ou carcinoïde : histaminolibération (chap. 34)" }],
  },
  {
    name: "Mivacurium",
    words: ["mivacurium", "mivacron"],
    chapter: "chap. 8",
    doses: [pk("Intubation", 0.2, 0.25)],
    cautions: [{ conditions: ["pseudocholinesterase"], level: "contraindicated", text: "déficit en pseudocholinestérases" }, { atc: ["S01EB03"], level: "adapt", text: "échothiophate (collyre) : bloc prolongé jusqu'à 4–6 semaines après l'arrêt (chap. 38)" }, { conditions: ["pheochromocytoma", "carcinoid"], level: "relative", text: "phéochromocytome ou carcinoïde : histaminolibération (chap. 34)" }],
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
      { conditions: ["myotonic_dystrophy"], level: "relative", text: "dystrophie myotonique : la décurarisation peut précipiter des contractures (chap. 29)" },
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
      { conditions: ["pheochromocytoma"], level: "contraindicated", text: "phéochromocytome : sympathomimétique (chap. 34)" },
      { conditions: ["pregnancy"], level: "adapt", text: "grossesse : acidose fœtale et atonie utérine — préférer la phényléphrine (chap. 36)" },
    ],
  },
  {
    name: "Phényléphrine",
    words: ["phenylephrine", "neosynephrine"],
    chapter: "chap. 10",
    doses: [pk("Hypotension : bolus", 0.5, 2, "µg", { note: "En général 50–200 µg." }), rt("Perfusion", 1, 10, "µg", "/kg/min"), rt("Césarienne sous rachianesthésie (débit continu, chap. 36)", 3, 5, "mg", "/h")],
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
    doses: [fx("Bradycardie (à répéter 2 fois)", 0.5, 0.5), fx("Réflexe oculocardiaque (après l'arrêt des tractions, chap. 38)", 0.5, 1), pk("Sécrétions oropharyngées", 0.02, 0.02, "mg", { note: "Maximum 0,6 mg." }), pk("Avec la néostigmine", 20, 20, "µg")],
    cautions: [
      { conditions: ["glaucoma"], level: "relative", text: "glaucome à angle fermé" },
      { conditions: ["urinary_retention"], level: "relative", text: "hypertrophie prostatique, obstacle du col vésical" },
      { conditions: ["heart_transplant"], level: "adapt", text: "cœur dénervé : sans effet" },
      { conditions: ["parkinson", "cognitive"], level: "relative", text: "Parkinson ou démence : confusion — préférer le glycopyrrolate (chap. 29)" },
      { conditions: ["pheochromocytoma", "hyperthyroidism"], level: "relative", text: "phéochromocytome ou hyperthyroïdie : tachycardie (chap. 34)" },
    ],
  },
  {
    name: "Clonidine",
    words: ["clonidine", "catapressan"],
    chapter: "chap. 10 et 12",
    doses: [pk("Épargne anesthésique ou frissons (IV lent)", 2, 3, "µg"), fx("Bloc périphérique (chap. 12)", 150, 150, "µg", { note: "Prolonge le bloc d'environ 2 h." }), pk("Bloc central (chap. 12)", 0.5, 1, "µg"), rt("Agitation", 0.5, 2, "µg", "/kg/h"), pk("Prémédication de l'enfant, per os (chap. 37)", 4, 4, "µg"), pk("Caudale de l'enfant > 6 mois, avec l'AL (chap. 37)", 1, 1, "µg")],
    cautions: [{ conditions: ["av_block"], level: "relative", text: "bradycardie, bloc auriculo-ventriculaire" }, { conditions: ["porphyria"], level: "relative", text: "porphyrie : médicament porphyrinogène (chap. 35)" }],
  },
  {
    name: "Dexmédétomidine",
    words: ["dexmedetomidine", "dexdor"],
    chapter: "chap. 10 et 12",
    doses: [pk("Charge en 10 min", 1, 1, "µg"), rt("Perfusion", 0.2, 0.7, "µg", "/kg/h"), fx("Périnerveuse (chap. 12)", 50, 60, "µg", { note: "Prolonge le bloc d'environ 6 h ; hors AMM." }), pk("Prémédication de l'enfant, intranasale (chap. 37)", 1, 2, "µg")],
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
  { name: "Dexaméthasone", words: ["dexamethasone"], chapter: "chap. 7, 12 et 23", doses: [pk("Début d'intervention (IV lent)", 0.1, 0.2, "mg", { note: "Prolonge aussi un bloc périphérique d'environ 8 h (chap. 12)." }), fx("Prévention des NVPO, à l'induction", 4, 8), fx("Périnerveuse (dose plafond)", 4, 4)], cautions: [{ conditions: ["diabetes_insulin", "diabetes_oral"], level: "adapt", text: "diabète : élévation de la glycémie" }] },
  { name: "Kétorolac", words: ["ketorolac", "taradyl"], chapter: "chap. 7, tableau 7.5", doses: [fx("Fin d'intervention", 30, 60)], cautions: [{ conditions: ["ckd", "dialysis", "peptic_ulcer", "gi_bleeding"], level: "contraindicated", text: "insuffisance rénale, ulcère ou hémorragie digestive" }, { conditions: ["porphyria"], level: "relative", text: "porphyrie : médicament porphyrinogène (chap. 35)" }] },
  { name: "Magnésium", words: ["magnesium"], chapter: "chap. 7 et 28", doses: [pk("Sur 15 min en fin d'intervention", 40, 50), fx("Crise d'asthme (en 15–20 min)", 2, 2, "g"), fx("Prééclampsie sévère, éclampsie : bolus IV (chap. 36)", 4, 4, "g", { note: "Puis 1–2 g/h ; magnésémie 2,5–3,5 mmol/l ; surveiller réflexes ostéotendineux, fréquence respiratoire, ECG." }), rt("Prééclampsie : entretien", 1, 2, "g", "/h")], cautions: [{ conditions: ["myasthenia", "neuromuscular"], level: "relative", text: "potentialise les curares" }] },
  { name: "Lidocaïne IV", words: ["lidocaine iv", "xylocaine iv", "lidocaine intraveineuse"], chapter: "chap. 7, tableau 7.5", doses: [pk("Bolus", 1.5, 1.5), rt("Perfusion", 2, 2, "mg", "/kg/h")], cautions: [{ conditions: ["av_block"], level: "relative", text: "troubles conductifs" }] },
  { name: "Paracétamol", words: ["paracetamol", "perfusalgan", "dafalgan"], chapter: "chap. 7, tableau 7.5", doses: [fx("Fin d'intervention, sur 15 min", 1, 1, "g"), pk("Enfant, IV ou per os, 4×/j (chap. 37)", 15, 15, "mg", { note: "Voie rectale : charge 30 mg/kg puis 20 mg/kg 4×/j. Nouveau-né < 32 SA : 10 mg/kg 2×/j ; 32–37 SA : 15 mg/kg 3×/j." })], cautions: [{ conditions: ["cirrhosis"], level: "adapt", text: "insuffisance hépatique : réduire (contre-indiqué si sévère, chap. 25)" }] },

  // --- Chapitres 27 à 29 : chirurgie cardiaque, vasculaire et neurochirurgie ------------------------
  {
    name: "Acide tranexamique",
    onlyInPlan: true,
    words: ["tranexamique", "exacyl", "cyklokapron"],
    chapter: "chap. 27, 36 et 40",
    doses: [
      pk("Avant l'ouverture du péricarde (CEC), puis après la protamine", 15, 15, "mg", { note: "3e dose possible puis 10 mg/kg/h, total ≤ 100 mg/kg." }),
      rt("Entretien", 10, 10, "mg", "/kg/h"),
      pk("Prothèse de hanche ou de genou, en début d'intervention (chap. 40)", 10, 15),
      fx("Hémorragie du post-partum (chap. 36)", 1, 2, "g", { note: "Manuel : 2 g dès 500 ml (voie basse) ou 1 000 ml (césarienne) ; essai WOMAN : 1 g en 10 min dans les 3 h, répétable une fois." }),
    ],
    cautions: [{ conditions: ["vte", "thrombophilia", "antiphospholipid"], level: "relative", text: "antécédent thromboembolique ou thrombophilie" }, { conditions: ["epilepsy"], level: "relative", text: "épilepsie : convulsions aux fortes doses" }],
  },
  { name: "Héparine (CEC)", onlyInPlan: true, words: ["heparine sodique", "heparine non fractionnee", "heparine cec"], chapter: "chap. 27", doses: [pk("Avant la CEC (ACT 400–480 s)", 300, 400, "UI", { note: "ACT normal 70–160 s ; pontage à cœur battant : ACT 250 s." })], cautions: [{ conditions: ["hit_history"], level: "contraindicated", text: "antécédent de TIH" }] },
  { name: "Protamine", onlyInPlan: true, words: ["protamine"], chapter: "chap. 27", doses: [fx("Neutralisation : 1 mg pour 100 UI d'héparine, lentement", 1, 1, "mg", { note: "Puis 25–50 mg si le saignement persiste (ACT)." })], cautions: [{ conditions: ["pulmonary_hypertension"], level: "relative", text: "hypertension pulmonaire aiguë possible : injection lente" }] },
  { name: "Milrinone", onlyInPlan: true, words: ["milrinone", "corotrope"], chapter: "chap. 27", doses: [rt("Perfusion", 0.5, 0.5, "µg", "/kg/min")], cautions: [{ conditions: ["ckd", "dialysis"], level: "adapt", text: "insuffisance rénale : réduire" }] },
  { name: "Mannitol", onlyInPlan: true, words: ["mannitol"], chapter: "chap. 29", doses: [pk("Osmothérapie 20 % (en 10–20 min, après l'ouverture de la dure-mère)", 0.25, 1, "g", { note: "Osmolarité plasmatique < 320 mOsm/l." })], cautions: [{ conditions: ["heart_failure"], level: "relative", text: "insuffisance cardiaque : expansion volémique" }] },

  // --- Chapitres 34 et 35 : endocrinologie, hémostase ----------------------------------------------
  { name: "Hydrocortisone", words: ["hydrocortisone", "solucortef", "solu-cortef"], chapter: "chap. 34", doses: [fx("Couverture périopératoire (corticothérapie ≥ 5 mg/j de prednisone)", 100, 100, "mg", { note: "Manuel : 100 mg/j pendant une semaine (toutes les 8 h en cas d'insuffisance surrénale). Équivalences : hydrocortisone 20 = prednisolone 5 = méthylprednisolone 4 = dexaméthasone 0,75 mg." })], cautions: [] },
  { name: "Octréotide", words: ["octreotide", "sandostatine"], chapter: "chap. 34", doses: [fx("Tumeur carcinoïde : avant l'intervention (SC, 2×/j)", 50, 500, "µg", { note: "Crise peropératoire : somatostatine 150–200 µg/h." })], cautions: [] },
  { name: "Desmopressine", onlyInPlan: true, words: ["desmopressine", "minirin", "octostim"], chapter: "chap. 35", doses: [pk("Willebrand type I, hémophilie A légère (dans 250 ml NaCl en 20 min, 1 h avant)", 0.3, 0.3, "µg")], cautions: [{ conditions: ["hyponatremia"], level: "relative", text: "hyponatrémie (effet antidiurétique)" }] },
  { name: "Complexe prothrombinique", onlyInPlan: true, words: ["ppsb", "prothromplex", "octaplex", "confidex", "kanokad", "beriplex", "complexe prothrombinique"], chapter: "chap. 35", doses: [pk("Antagonisation d'un AVK en urgence", 20, 20, "UI", { note: "Objectif TP ≥ 50 % ; AOD en hémorragie : 25–50 UI/kg." })], cautions: [{ conditions: ["hit_history"], level: "relative", text: "certaines préparations contiennent de l'héparine" }] },
  { name: "Fibrinogène", onlyInPlan: true, words: ["fibrinogene", "riastap", "clottafact", "haemocomplettan"], chapter: "chap. 27 et 35", doses: [fx("Saignement avec fibrinogène < 1–1,5 g/l", 2, 2, "g"), fx("Hémorragie du post-partum : dès 500 ml (voie basse) ou 1 000 ml (césarienne), chap. 36", 2, 2, "g", { note: "Objectif fibrinogène > 2 g/l." })], cautions: [] },
  { name: "Vitamine K", onlyInPlan: true, words: ["vitamine k", "phytomenadione", "konakion"], chapter: "chap. 35", doses: [fx("Chirurgie différée sous AVK (PO, INR 8–12 h après)", 1, 10, "mg", { note: "Voie IV réservée à l'urgence (réactions allergiques)." })], cautions: [] },
  { name: "Idarucizumab", onlyInPlan: true, words: ["idarucizumab", "praxbind"], chapter: "chap. 35", doses: [fx("Antidote du dabigatran (2 × 2,5 g)", 5, 5, "g", { note: "Seconde dose possible après 24 h si récidive." })], cautions: [] },
  { name: "Bleu de méthylène", onlyInPlan: true, words: ["bleu de methylene", "methylthioninium", "proveblue"], chapter: "chap. 35", doses: [pk("Méthémoglobinémie (solution 1 %, en 3–5 min)", 1, 2, "mg", { note: "Total ≤ 5–7 mg/kg ; fait baisser transitoirement la SpO₂." })], cautions: [{ conditions: ["g6pd"], level: "contraindicated", text: "déficit en G6PD : hémolyse" }, { atc: ["N06AB", "N06AX"], level: "relative", text: "antidépresseur sérotoninergique : syndrome sérotoninergique" }] },
  { name: "Calcium", onlyInPlan: true, words: ["chlorure de calcium", "gluconate de calcium"], chapter: "chap. 32", doses: [fx("Hyperkaliémie, hypocalcémie, hypermagnésémie (10 %, en 3–5 min)", 10, 20, "mL", { note: "Chlorure 10 % = 27 mg/ml de Ca²⁺ ; gluconate 10 % = 9 mg/ml. Jamais sous digoxine." })], cautions: [{ atc: ["C01AA"], level: "contraindicated", text: "digoxine : arythmie maligne" }] },

  // --- Chapitres 23 et 25 : NVPO, analgésie, hyperthermie maligne -------------------------------
  { name: "Ondansétron", words: ["ondansetron", "zofran", "zophren"], chapter: "chap. 23", doses: [fx("Prévention des NVPO, 30 min avant la fin", 4, 4, "mg", { note: "50–150 µg/kg, maximum 8 mg ; traitement : 4 mg 3×/j." })], cautions: [{ conditions: ["long_qt"], level: "relative", text: "allongement du QT" }] },
  {
    name: "Dropéridol",
    words: ["droperidol", "droleptan", "dehydrobenzperidol"],
    chapter: "chap. 23",
    doses: [fx("Prévention des NVPO, 30 min avant la fin (si PAS > 100 mmHg)", 0.5, 1.25, "mg", { note: "10–15 µg/kg ; effets extrapyramidaux à partir de 50–75 µg/kg." })],
    cautions: [
      { conditions: ["long_qt"], level: "relative", text: "allongement du QT" },
      { conditions: ["parkinson"], level: "contraindicated", text: "maladie de Parkinson : antidopaminergique" },
    ],
  },
  {
    name: "Métamizole",
    words: ["metamizole", "novalgine", "minalgine", "dipyrone"],
    chapter: "chap. 25",
    doses: [fx("Analgésie, jusqu'à 4×/j", 0.5, 1, "g", { note: "Pas plus de 2 semaines (agranulocytose)." })],
    cautions: [
      { conditions: ["porphyria", "g6pd"], level: "contraindicated", text: "porphyrie, déficit en G6PD" },
      { conditions: ["chemotherapy", "leukemia_lymphoma"], level: "relative", text: "leucopénie possible (agranulocytose)" },
    ],
  },
  {
    name: "Dantrolène",
    words: ["dantrolene", "dantrium", "ryanodex"],
    chapter: "chap. 23",
    doses: [pk("Crise d'hyperthermie maligne, bolus répétés", 2.5, 2.5, "mg", { note: "Jusqu'à 10 mg/kg, puis 1 mg/kg toutes les 6 h pendant 24–48 h. Flacon de 20 mg à diluer dans 60 ml d'eau stérile (compter 10 min)." })],
    cautions: [{ atc: ["C08DA", "C08DB"], level: "contraindicated", text: "inhibiteur calcique (vérapamil, diltiazem) : hyperkaliémie aggravée avec le dantrolène" }],
  },

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
    doses: [fx("Bolus IV (1 mg/min)", 1, 10), rt("Perfusion", 2, 4, "mg", "/h", { note: "Paliers de 0,5 mg/h, maximum 10–15 mg/h." }), rt("Prééclampsie : 30 min, puis 2–4 mg/h (chap. 36)", 8, 15, "mg", "/h")],
    cautions: [],
  },
  {
    name: "Urapidil",
    words: ["urapidil", "uradipil", "eupressyl", "ebrantil"],
    chapter: "chap. 11",
    doses: [fx("Bolus en 30 s", 10, 50), rt("Entretien", 5, 20, "mg", "/h")],
    cautions: [{ conditions: ["porphyria"], level: "relative", text: "porphyrie : médicament porphyrinogène (chap. 35)" }],
  },
  {
    name: "Dihydralazine",
    words: ["dihydralazine", "nepressol"],
    chapter: "chap. 11",
    doses: [fx("Bolus IV", 2.5, 20, "mg", { note: "Action en 15 min pendant 2–4 h." }), fx("Prééclampsie : toutes les 20 min (chap. 36)", 5, 5, "mg", { note: "Maximum 20 mg ; surveillance fœtale (chute de pression fœtale)." })],
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
    cautions: [{ conditions: ["porphyria"], level: "relative", text: "porphyrie : médicament porphyrinogène (chap. 35)" }],
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
    doses: [pk("Dose maximale sans adrénaline", 3, 3, "mg", { note: "Total 150 mg ; avec adrénaline 4 mg/kg (225 mg). Proscrite pour un bloc de Bier." }), fx("Rachianesthésie, hyperbare (tableau 13.3)", 7.5, 15, "mg", { note: "Durée 90–120 min ; réduire chez la personne âgée." }), fx("Rachianesthésie, isobare", 10, 15, "mg", { note: "Durée 150–300 min." }), fx("Rachianesthésie pour césarienne, hyperbare 0,5 % (chap. 36)", 10, 10, "mg", { note: "+ fentanyl 20 µg + morphine 100 µg." }), pk("Caudale de l'enfant, 0,25 % à 1 ml/kg (chap. 37)", 2.5, 2.5, "mg", { note: "Jusqu'à 6 ans (20 kg), au plus 8 ans (30 kg). 1,25 ml/kg (haut abdomen) dépasse 3 mg/kg : ropivacaïne 0,2 % alors." })],
    cautions: [],
    maxDose: { perKg: 3, totalMg: 150, withAdrenalinePerKg: 4, withAdrenalineTotalMg: 225 },
  },
  {
    name: "Ropivacaïne",
    words: ["ropivacaine", "naropeine", "naropin"],
    chapter: "chap. 12",
    doses: [pk("Dose maximale sans adrénaline", 3, 3, "mg", { note: "Total 175 mg ; avec adrénaline 4 mg/kg (250 mg). Moins de bloc moteur." }), fx("Césarienne par le cathéter péridural (0,75 %, bolus de 5 ml)", 90, 150, "mg", { note: "12–20 ml au total ; lidocaïne 2 % adrénalinée en alternative, chloroprocaïne 3 % en cas de souffrance fœtale (chap. 36)." })],
    cautions: [],
    maxDose: { perKg: 3, totalMg: 175, withAdrenalinePerKg: 4, withAdrenalineTotalMg: 250 },
  },
  {
    name: "Prilocaïne",
    words: ["prilocaine", "citanest", "baritekal"],
    chapter: "chap. 12 et 13",
    doses: [pk("Dose maximale", 8, 8, "mg", { note: "Total 400 mg (600 mg avec adrénaline) ; au-delà de 600 mg : méthémoglobinémie (bleu de méthylène 1–2 mg/kg)." }), fx("Rachianesthésie (Baritekal, tableau 13.3)", 40, 80)],
    cautions: [{ conditions: ["g6pd"], level: "contraindicated", text: "déficit en G6PD : méthémoglobinémie, bleu de méthylène contre-indiqué" }, { conditions: ["porphyria"], level: "relative", text: "porphyrie : médicament porphyrinogène (chap. 35)" }],
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

  // --- Chapitres 36 à 40 : obstétrique, pédiatrie, ophtalmologie, ORL, orthopédie ---------------------
  {
    name: "Ocytocine",
    onlyInPlan: true,
    words: ["ocytocine", "oxytocine", "syntocinon"],
    chapter: "chap. 36",
    doses: [fx("Après la naissance, bolus lent (5 min)", 5, 5, "UI"), rt("Perfusion (10–20 UI en 2 h)", 5, 10, "UI", "/h")],
    cautions: [{ conditions: ["long_qt"], level: "relative", text: "bolus rapide : hypotension, tachycardie, allongement du QT" }],
  },
  {
    name: "Sulprostone",
    onlyInPlan: true,
    words: ["sulprostone", "nalador"],
    chapter: "chap. 36",
    doses: [rt("Atonie utérine, sur 60 min", 100, 500, "µg", "/h", { note: "Pas en même temps que l'ocytocine." })],
    cautions: [{ conditions: ["asthma", "coronary", "stable_angina", "recent_mi", "heart_failure"], level: "contraindicated", text: "asthme ou cardiopathie (RCP) : bronchospasme, spasme coronaire" }],
  },
  {
    name: "Labétalol",
    onlyInPlan: true,
    words: ["labetalol", "trandate"],
    chapter: "chap. 36",
    doses: [rt("Prééclampsie (IV)", 20, 160, "mg", "/h", { note: "Passe le placenta : légère bradycardie fœtale." })],
    cautions: [{ conditions: ["asthma"], level: "relative", text: "asthme : bêtabloquant non sélectif" }, { conditions: ["av_block"], level: "relative", text: "bloc auriculo-ventriculaire" }],
  },
  { name: "Immunoglobulines anti-D", onlyInPlan: true, words: ["anti-d", "anti d", "rhophylac"], chapter: "chap. 36", doses: [fx("Mère Rhésus négatif, dans les 72 h", 200, 200, "µg", { note: "200 µg = 1 000 UI ; systématique à 28 SA puis à l'accouchement si l'enfant est Rhésus positif." })], cautions: [] },
  { name: "Citrate de sodium", onlyInPlan: true, words: ["citrate de sodium"], chapter: "chap. 36", doses: [fx("Avant une césarienne (per os, 0,3 M)", 30, 30, "mL")], cautions: [] },
  { name: "Caféine (citrate)", onlyInPlan: true, words: ["cafeine", "citrate de cafeine", "peyona"], chapter: "chap. 37", doses: [pk("Ancien prématuré : fin d'intervention (citrate de caféine)", 20, 20, "mg", { note: "= 10 mg/kg de caféine base ; diminue les désaturations postopératoires." })], cautions: [] },
  { name: "Glycopyrronium", words: ["glycopyrr", "robinul"], chapter: "chap. 37 et 39", doses: [fx("Antisialagogue (endoscopie ORL)", 0.2, 0.3), pk("Enfant", 0.01, 0.01)], cautions: [{ conditions: ["glaucoma"], level: "relative", text: "glaucome à angle fermé" }] },

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
