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
    doses: [pk("Induction", 2, 5, "µg"), rt("Entretien", 0.5, 5, "µg", "/kg/h"), pk("Bolus", 0.5, 1.5, "µg"), fx("PCA : bolus toutes les 5–10 min", 10, 20, "µg", { note: "Maximum 400 µg / 4 h." })],
    cautions: [{ atc: ["J01FA", "J02AC", "J05A"], level: "adapt", text: "inhibiteur du CYP3A4 : effet prolongé" }],
  },
  {
    name: "Sufentanil",
    words: ["sufentanil", "sufenta"],
    chapter: "chap. 7",
    doses: [pk("Induction", 0.2, 0.6, "µg"), rt("Entretien", 0.5, 1.5, "µg", "/kg/h"), pk("Bolus", 0.1, 0.25, "µg")],
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
    doses: [fx("PCA : bolus toutes les 5–10 min", 1, 2, "mg", { note: "Maximum 30 mg / 4 h." })],
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
    chapter: "chap. 10",
    doses: [pk("Épargne anesthésique ou frissons (IV lent)", 2, 3, "µg"), pk("Adjuvant d'ALR (même voie que l'AL)", 1, 2, "µg"), rt("Agitation", 0.5, 2, "µg", "/kg/h")],
    cautions: [{ conditions: ["av_block"], level: "relative", text: "bradycardie, bloc auriculo-ventriculaire" }],
  },
  {
    name: "Dexmédétomidine",
    words: ["dexmedetomidine", "dexdor"],
    chapter: "chap. 10",
    doses: [pk("Charge en 10 min", 1, 1, "µg"), rt("Perfusion", 0.2, 0.7, "µg", "/kg/h")],
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
  { name: "Dexaméthasone", words: ["dexamethasone"], chapter: "chap. 7, tableau 7.5", doses: [pk("Début d'intervention", 0.1, 0.2)], cautions: [{ conditions: ["diabetes_insulin", "diabetes_oral"], level: "adapt", text: "diabète : élévation de la glycémie" }] },
  { name: "Kétorolac", words: ["ketorolac", "taradyl"], chapter: "chap. 7, tableau 7.5", doses: [fx("Fin d'intervention", 30, 60)], cautions: [{ conditions: ["ckd", "dialysis", "peptic_ulcer", "gi_bleeding"], level: "contraindicated", text: "insuffisance rénale, ulcère ou hémorragie digestive" }] },
  { name: "Magnésium", words: ["magnesium"], chapter: "chap. 7, tableau 7.5", doses: [pk("Sur 15 min en fin d'intervention", 40, 50)], cautions: [{ conditions: ["myasthenia", "neuromuscular"], level: "relative", text: "potentialise les curares" }] },
  { name: "Lidocaïne IV", words: ["lidocaine iv", "xylocaine iv", "lidocaine intraveineuse"], chapter: "chap. 7, tableau 7.5", doses: [pk("Bolus", 1.5, 1.5), rt("Perfusion", 2, 2, "mg", "/kg/h")], cautions: [{ conditions: ["av_block"], level: "relative", text: "troubles conductifs" }] },
  { name: "Paracétamol", words: ["paracetamol", "perfusalgan", "dafalgan"], chapter: "chap. 7, tableau 7.5", doses: [fx("Fin d'intervention, sur 15 min", 1, 1, "g")], cautions: [{ conditions: ["cirrhosis"], level: "adapt", text: "insuffisance hépatique : réduire" }] },
];

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** The reference for a plan drug's name (« Propofol 1 % » → propofol). */
export function drugReferenceFor(name: string): DrugReference | undefined {
  const f = fold(name);
  return DRUG_REFERENCES.find((r) => r.words.some((w) => f.includes(w)));
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
