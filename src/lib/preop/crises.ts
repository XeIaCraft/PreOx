// The general perioperative crises, each as a procedure to follow — how to
// recognise it, what to do in order, with every dose already computed for
// the patient — not just a list of doses. Complications proper to a
// procedure belong to the intervention; these are the ones any anaesthesia
// can meet. Sources, named on each crisis:
// - Manuel pratique d'anesthésie 2020 (chap. 12 toxicité des anesthésiques
//   locaux, 13 rachianesthésie, 23 complications anesthésiques, 27 embolie
//   gazeuse, 32 hyperkaliémie, 35 transfusion) — doses copied as printed;
// - ERC 2021 Adult advanced life support (Soar et al., PMID 33773825);
// - DAS 2015 unanticipated difficult intubation (Frerk et al., PMID 26556848).
// Children: only the doses a source gives per kilo are computed; the others
// say so.

export type CrisisCategory = "cardio" | "airway" | "allergy" | "toxic" | "metabolic" | "bleeding" | "neuro";

export const CRISIS_CATEGORIES: { code: CrisisCategory; label: string }[] = [
  { code: "cardio", label: "Circulation" },
  { code: "airway", label: "Voies aériennes et ventilation" },
  { code: "allergy", label: "Allergie" },
  { code: "toxic", label: "Toxique et pharmacogénétique" },
  { code: "metabolic", label: "Métabolique et température" },
  { code: "bleeding", label: "Hémorragie" },
  { code: "neuro", label: "Réveil et neurologie" },
];

export interface CrisisDose {
  /** Name logged in the anaesthesia events when « Donné » is tapped. */
  drug: string;
  /** Computed for the patient: « 70 mg », « 175–263 mg ». */
  dose: string | null;
  /** How it was computed or the fixed dose: « 1–1,5 mg/kg × 70 kg ». */
  how: string;
  route?: string;
}

export interface CrisisStep {
  text: string;
  dose?: CrisisDose;
  /** Step to do at once (bold). */
  urgent?: boolean;
}

export interface Crisis {
  id: string;
  title: string;
  category: CrisisCategory;
  /** Words it is searched by. */
  words: string[];
  recognise: string[];
  steps: CrisisStep[];
  /** After the acute phase: tests, transfer, follow-up. */
  after?: string[];
  source: string;
}

export interface CrisisPatient {
  weightKg?: number;
  age?: number;
}

const f = (v: number) => {
  const r = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 2) / 2 : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return String(r).replace(".", ",");
};
const rng = (a: number, b: number) => (a === b ? f(a) : `${f(a)}–${f(b)}`);

/** A per-kilo dose, computed when the weight is known. */
function perKg(drug: string, min: number, max: number, unit: string, w: number | undefined, route?: string, per = ""): CrisisDose {
  return w
    ? { drug, dose: `${rng(min * w, max * w)} ${unit}${per}`, how: `${rng(min, max)} ${unit}/kg${per} × ${f(w)} kg`, route }
    : { drug, dose: null, how: `${rng(min, max)} ${unit}/kg${per} · poids requis`, route };
}
const fixed = (drug: string, dose: string, route?: string): CrisisDose => ({ drug, dose, how: "dose fixe", route });
/** A rate per kilo per minute shown as a per-kilo rate and per hour for the patient. */
function ratePerKgMin(drug: string, min: number, max: number, unit: string, w: number | undefined): CrisisDose {
  return w
    ? { drug, dose: `${rng(min * w, max * w)} ${unit}/min`, how: `${rng(min, max)} ${unit}/kg/min × ${f(w)} kg`, route: "IV continu" }
    : { drug, dose: null, how: `${rng(min, max)} ${unit}/kg/min · poids requis`, route: "IV continu" };
}

const MANUAL = "Manuel pratique d'anesthésie 2020";
const ERC = "ERC 2021, réanimation avancée de l'adulte (Soar et al., PMID 33773825)";

export function crises(p: CrisisPatient = {}): Crisis[] {
  const w = p.weightKg;
  const child = p.age !== undefined && p.age < 16;
  const dantroleneVials = w ? Math.ceil((2.5 * w) / 20) : null;

  const list: Crisis[] = [
    {
      id: "arrest",
      title: "Arrêt cardiaque",
      category: "cardio",
      words: ["arret", "acr", "fv", "tv", "asystolie", "rcp", "massage", "choc electrique"],
      recognise: ["Pas de pouls central, EtCO₂ qui s'effondre, rythme de FV/TV sans pouls, asystolie ou activité électrique sans pouls."],
      steps: [
        { text: "Appeler à l'aide, noter l'heure, informer le chirurgien ; massage cardiaque 100–120/min, interruptions < 5 s", urgent: true },
        { text: "Ventiler FiO₂ 100 % (patient intubé : 10/min, massage continu) ; arrêter halogénés et perfusions suspectes" },
        { text: "Rythme choquable (FV/TV sans pouls) : choc sans délai, puis 2 min de RCP avant d'analyser à nouveau", urgent: true },
        child
          ? { text: "Adrénaline IV/IO toutes les 3–5 min (non choquable : dès que possible ; choquable : après le 3e choc)", dose: perKg("Adrénaline", 0.01, 0.01, "mg", w, "IV/IO") }
          : { text: "Adrénaline IV toutes les 3–5 min (non choquable : dès que possible ; choquable : après le 3e choc)", dose: fixed("Adrénaline", "1 mg", "IV") },
        child
          ? { text: "Après le 3e choc : amiodarone (jusqu'à 2 fois)", dose: perKg("Amiodarone", 5, 5, "mg", w, "IV/IO") }
          : { text: "Après le 3e choc : amiodarone 300 mg, puis 150 mg après le 5e choc", dose: fixed("Amiodarone", "300 mg", "IV") },
        { text: "Causes réversibles (4 H – 4 T) : hypoxie, hypovolémie (hémorragie), hypo/hyperkaliémie, hypothermie ; thrombose (coronaire, embolie), tamponnade, pneumothorax suffocant, toxiques" },
        { text: "Au bloc, penser aussi : anaphylaxie, toxicité des anesthésiques locaux (intralipide), rachianesthésie haute, réflexe vagal, embolie gazeuse" },
      ],
      after: ["Reprise d'activité circulatoire : PAM ≥ 65 mmHg, SpO₂ 94–98 %, normocapnie, ECG 12 dérivations ; transfert en soins intensifs."],
      source: `${ERC} ; enfant : doses du ${MANUAL} (chap. 41)`,
    },
    {
      id: "anaphylaxis",
      title: "Anaphylaxie",
      category: "allergy",
      words: ["anaphylaxie", "allergie", "choc anaphylactique", "urticaire", "oedeme de quincke", "erytheme"],
      recognise: [
        "Grade 1 : signes cutanéomuqueux (érythème, urticaire). Grade 2 : + atteinte multiviscérale modérée (tachycardie, hypotension, toux, sibilances). Grade 3 : atteinte menaçant la vie. Grade 4 : arrêt cardiaque.",
        "Suspects : curares (50–70 %), antibiotiques, latex, chlorhexidine, colloïdes, bleu patenté, sugammadex, produits sanguins.",
      ],
      steps: [
        { text: "Arrêter le produit suspect, les colloïdes et les produits sanguins ; appeler à l'aide ; prévenir le chirurgien (arrêter ou accélérer)", urgent: true },
        { text: "O₂ 100 %, ausculter (bronchospasme), intuber si œdème des voies aériennes supérieures" },
        { text: "Jambes surélevées, Trendelenburg, remplissage par cristalloïdes" },
        { text: "Adrénaline IV en bolus, à répéter selon la réponse", dose: fixed("Adrénaline", "100–200 µg", "IV"), urgent: true },
        { text: "Sans voie veineuse : adrénaline intramusculaire", dose: fixed("Adrénaline", "300–500 µg", "IM") },
        { text: "Souvent nécessaire : perfusion continue d'adrénaline", dose: ratePerKgMin("Adrénaline", 0.05, 0.3, "µg", w) },
        { text: "Bronchospasme : salbutamol en chambre d'inhalation ; aérosol d'adrénaline 0,5–1 mg dans 3 mL de NaCl 0,9 %" },
        { text: "Choc réfractaire à l'adrénaline : vasopressine (prudence : peu de données)", dose: perKg("Vasopressine", 0.06, 0.06, "UI", w, "IV") },
        { text: "Arrêt cardiaque : RCP, adrénaline 1 mg en bolus répétés" },
        { text: "Ensuite : méthylprednisolone 125 mg IV et clémastine 2 mg IV", dose: fixed("Méthylprednisolone", "125 mg", "IV") },
      ],
      after: [
        "Dosages immédiats : tryptase (tube sec ou EDTA), IgE (tube sec), histamine (EDTA) ; tryptase à répéter.",
        "Surveillance 24 h en soins intensifs (récidive possible).",
        "Consultation d'allergologie 4 à 6 semaines après, avec le protocole d'anesthésie ; lettre au patient.",
      ],
      source: `${MANUAL}, chap. 23${child ? " — doses adultes : chez l'enfant, suivre le protocole pédiatrique local" : ""}`,
    },
    {
      id: "bronchospasm",
      title: "Bronchospasme",
      category: "airway",
      words: ["bronchospasme", "sibilances", "asthme", "pressions elevees", "wheezing"],
      recognise: ["Sibilances, pressions d'insufflation qui montent (volume contrôlé) ou volume courant qui baisse (pression contrôlée), capnogramme en « aileron de requin » sans plateau, hypoxémie, hypercapnie."],
      steps: [
        { text: "Ventilation manuelle FiO₂ 100 % ; allonger l'expiration", urgent: true },
        { text: "Approfondir l'anesthésie (sévoflurane)" },
        { text: "Vérifier la sonde (position, coudure, sécrétions) et aspirer" },
        { text: "β2-mimétique : salbutamol inhalé (chambre d'inhalation) ou IV" },
        { text: "Sévère avec hypoxémie : adrénaline en aérosol 0,5–1 mg dans 3 mL, ou IV", dose: fixed("Adrénaline", "100–200 µg", "IV") },
        { text: "Hydrocortisone", dose: perKg("Hydrocortisone", 2, 2, "mg", w, "IV") },
        { text: "Réfractaire : aminophylline en 20 min (arythmies), puis 0,5 mg/kg/h", dose: perKg("Aminophylline", 6, 6, "mg", w, "IV") },
        { text: "Penser anaphylaxie si signes cutanés ou hypotension" },
      ],
      after: ["Décurarisation : néostigmine peut aggraver (atropine plus forte) ; sugammadex en alternative. Envisager l'extubation en anesthésie profonde."],
      source: `${MANUAL}, chap. 23`,
    },
    {
      id: "laryngospasm",
      title: "Laryngospasme",
      category: "airway",
      words: ["laryngospasme", "stridor", "spasme laryngé"],
      recognise: ["Stridor, tirage, absence de flux malgré des efforts respiratoires, désaturation — surtout enfant, infection des voies aériennes, chirurgie ORL, anesthésie trop légère."],
      steps: [
        { text: "FiO₂ 100 %, arrêter toute stimulation, appeler à l'aide", urgent: true },
        { text: "Aspirer sécrétions et sang ; canule de Guedel ou de Wendel" },
        { text: "Subluxation de la mâchoire, tête en extension ; ventilation manuelle douce en pression positive" },
        { text: "Approfondir : propofol", dose: perKg("Propofol", 0.25, 0.5, "mg", w, "IV") },
        { text: "Ou lidocaïne", dose: perKg("Lidocaïne", 1, 1.5, "mg", w, "IV") },
        { text: "Persistance avec hypoxémie : suxaméthonium à petite dose", dose: perKg("Suxaméthonium", 0.1, 0.3, "mg", w, "IV"), urgent: true },
        { text: "Sans voie veineuse : suxaméthonium intramusculaire (ou IO 1–1,5 mg/kg)", dose: perKg("Suxaméthonium", 3, 4, "mg", w, "IM") },
        { text: "Pas d'amélioration : induction à séquence rapide et intubation" },
      ],
      after: ["Surveiller un œdème pulmonaire à pression négative (effort inspiratoire contre glotte fermée)."],
      source: `${MANUAL}, chap. 23`,
    },
    {
      id: "hypoxaemia",
      title: "Hypoxémie",
      category: "airway",
      words: ["hypoxemie", "desaturation", "spo2 basse", "hypoxie"],
      recognise: ["SpO₂ < 90 % ou baisse de 5 % par rapport à la valeur de départ."],
      steps: [
        { text: "FiO₂ 100 %, ventilation manuelle", urgent: true },
        { text: "Vérifier la mesure (capteur, pouls, colorant, bistouri) et le circuit (fuite, déconnexion, ballonnet)" },
        { text: "Ausculter, vérifier la sonde (sélective, œsophagienne), la symétrie thoracique (pneumothorax)" },
        { text: "Aspirer dans la sonde ; manœuvre de recrutement ; PEP" },
        { text: "Gazométrie ; bronchofibroscopie si besoin" },
        { text: "Rechercher : bronchospasme, inhalation, atélectasie, œdème pulmonaire, embolie, bas débit, pneumopéritoine" },
        { text: "En SSPI : hypoventilation (opioïdes : naloxone par 40 µg ; curarisation résiduelle), obstruction, laryngospasme, hématome cervical" },
      ],
      after: ["Hypoxémie persistante malgré ces mesures : prévenir le chirurgien et terminer au plus vite."],
      source: `${MANUAL}, chap. 23`,
    },
    {
      id: "cant_intubate",
      title: "Intubation difficile imprévue",
      category: "airway",
      words: ["intubation difficile", "cico", "ventilation impossible", "cricothyroidotomie", "das"],
      recognise: ["Échec de laryngoscopie ; ventilation au masque difficile ; désaturation."],
      steps: [
        { text: "Plan A — oxygéner (masque, oxygénation nasale), curarisation complète, 3 tentatives de laryngoscopie au maximum (+ 1 par un plus expérimenté), vidéolaryngoscope, mandrin", urgent: true },
        { text: "Déclarer l'échec, appeler à l'aide" },
        { text: "Plan B — dispositif supraglottique de 2e génération, 3 essais au maximum ; oxygénation obtenue : s'arrêter et réfléchir (réveiller, intuber via le dispositif, poursuivre, trachéotomie)" },
        { text: "Plan C — ventilation au masque (à deux, canule) ; réveiller le patient si possible (sugammadex si rocuronium)" },
        { text: "Plan D — « ni intuber ni oxygéner » (CICO) : cricothyroïdotomie scalpel–bougie–sonde", urgent: true },
        { text: "Sugammadex en urgence après rocuronium", dose: perKg("Sugammadex", 16, 16, "mg", w, "IV") },
      ],
      after: ["Noter la difficulté (grade, matériel qui a réussi), l'expliquer au patient, lettre d'intubation difficile."],
      source: "DAS 2015 (Frerk et al., PMID 26556848) ; sugammadex : Manuel 2020, chap. 9",
    },
    {
      id: "hypotension",
      title: "Hypotension",
      category: "cardio",
      words: ["hypotension", "pression basse", "pam basse", "choc"],
      recognise: ["Baisse de 20–30 % de la PA de base, PAS < 90 mmHg ou PAM < 60 mmHg."],
      steps: [
        { text: "Trendelenburg, FiO₂ 100 %, réduire l'anesthésie si possible", urgent: true },
        { text: "Remplissage (cristalloïdes)" },
        { text: "Éphédrine en bolus", dose: fixed("Éphédrine", "5–10 mg", "IV") },
        { text: "Ou phényléphrine en bolus", dose: fixed("Phényléphrine", "50–100 µg", "IV") },
        { text: "Noradrénaline en perfusion", dose: ratePerKgMin("Noradrénaline", 0.05, 0.5, "µg", w) },
        { text: "Adrénaline en perfusion si besoin", dose: ratePerKgMin("Adrénaline", 0.01, 0.1, "µg", w) },
        { text: "Cause : hypovolémie ou saignement, vasodilatation (hypnotiques, rachianesthésie), compression cave, pneumopéritoine, pneumothorax, tamponnade, embolie, arythmie, ischémie, anaphylaxie, sepsis" },
      ],
      source: `${MANUAL}, chap. 23`,
    },
    {
      id: "hypertension",
      title: "Hypertension peropératoire",
      category: "cardio",
      words: ["hypertension", "hta", "pression haute", "poussee hypertensive"],
      recognise: ["Hausse de 20–30 % de la PA habituelle, ou PA ≥ 140/90 mmHg."],
      steps: [
        { text: "Chercher la cause : anesthésie ou analgésie insuffisante, garrot prolongé, globe vésical, hypoxémie, hypercapnie, hypothermie, frissons, vasopresseur" },
        { text: "Approfondir (halogéné), analgésie, lâcher le garrot, sonde vésicale, réchauffer" },
        { text: "Nicardipine par bolus de 1 mg/min", dose: fixed("Nicardipine", "1 mg (jusqu'à 10 mg)", "IV") },
        { text: "Ou urapidil, à renouveler 1–2 fois", dose: fixed("Urapidil", "25 mg", "IV") },
        { text: "Ou esmolol (tachycardie associée)", dose: perKg("Esmolol", 0.5, 1, "mg", w, "IV") },
        { text: "Ou clonidine, à répéter une fois", dose: perKg("Clonidine", 1, 3, "µg", w, "IV") },
        { text: "Rare : hypertension intracrânienne, hyperthermie maligne, hyperthyroïdie, phéochromocytome" },
      ],
      source: `${MANUAL}, chap. 23 (esmolol : chap. 10)`,
    },
    {
      id: "bradycardia",
      title: "Bradycardie",
      category: "cardio",
      words: ["bradycardie", "bav", "bloc auriculo", "vagal", "reflexe oculocardiaque"],
      recognise: ["FC basse avec retentissement (hypotension, ischémie, troubles de conscience) ; au bloc souvent vagale : traction, pneumopéritoine, laryngoscopie, rachianesthésie haute."],
      steps: [
        { text: "Arrêter la stimulation (traction, insufflation) ; vérifier oxygénation et ventilation", urgent: true },
        { text: "Atropine, à répéter (maximum 3 mg)", dose: child ? perKg("Atropine", 0.02, 0.02, "mg", w, "IV") : fixed("Atropine", "0,5 mg", "IV") },
        { text: "Réfractaire : isoprénaline 5 µg/min ou adrénaline 2–10 µg/min" },
        { text: "Rachianesthésie haute ou hypotension associée : éphédrine, adrénaline" },
        { text: "Bloc de haut degré ou asystolie menaçante : stimulation (transcutanée puis endocavitaire)" },
      ],
      source: `${ERC} ; atropine enfant : Manuel 2020, chap. 10`,
    },
    {
      id: "tachyarrhythmia",
      title: "Tachycardie",
      category: "cardio",
      words: ["tachycardie", "tachyarythmie", "fa rapide", "flutter", "tsv", "tv"],
      recognise: ["Signes de gravité : choc, syncope, ischémie myocardique, insuffisance cardiaque."],
      steps: [
        { text: "Instable : choc électrique synchronisé (jusqu'à 3), puis amiodarone 300 mg en 10–20 min", urgent: true, dose: fixed("Amiodarone", "300 mg", "IV") },
        { text: "Corriger : anesthésie légère, douleur, hypovolémie, hypercapnie, hypokaliémie, hypomagnésémie" },
        { text: "Stable, QRS fins réguliers : manœuvre vagale puis adénosine en bolus rapide (6, puis 12, puis 18 mg)", dose: fixed("Adénosine", "6 mg", "IV") },
        { text: "Stable, QRS fins irréguliers (FA) : contrôle de la fréquence — esmolol", dose: perKg("Esmolol", 0.5, 1, "mg", w, "IV") },
        { text: "Stable, QRS larges : amiodarone 300 mg en 20–60 min ; avis cardiologique" },
      ],
      source: `${ERC} ; doses : Manuel 2020, chap. 10 et 51`,
    },
    {
      id: "last",
      title: "Toxicité des anesthésiques locaux",
      category: "toxic",
      words: ["toxicite", "anesthesique local", "intralipide", "last", "convulsions", "gout metallique"],
      recognise: ["Goût métallique, paresthésies péribuccales, acouphènes, vertiges, confusion, convulsions, coma ; extrasystoles ou hypotension annonçant la cardiotoxicité, arythmies ventriculaires, arrêt."],
      steps: [
        { text: "Arrêter l'injection, appeler à l'aide, O₂ 100 %, contrôler les voies aériennes (hyperventiler)", urgent: true },
        { text: "Premiers signes neurologiques : midazolam", dose: perKg("Midazolam", 0.1, 0.1, "mg", w, "IV") },
        { text: "Convulsions : clonazépam, à répéter une fois ; intubation si besoin", dose: fixed("Clonazépam", "1 mg", "IV") },
        { text: "Intralipide 20 % en 1 min, à répéter 3 fois toutes les 5 min", dose: perKg("Intralipide 20 %", 1, 1.5, "mL", w, "IV"), urgent: true },
        { text: "Puis perfusion d'intralipide (500 mL suffisent généralement pour 80 kg)" },
        { text: "Arrêt cardiaque : RCP selon l'ERC et intralipide ; réanimation prolongée (arythmies réfractaires aux antiarythmiques habituels)" },
      ],
      after: ["Surveillance prolongée (récidive possible) ; noter le produit, la dose et le site."],
      source: `${MANUAL}, chap. 12`,
    },
    {
      id: "mh",
      title: "Hyperthermie maligne",
      category: "toxic",
      words: ["hyperthermie maligne", "dantrolene", "etco2 eleve", "rigidite", "trismus"],
      recognise: ["EtCO₂ qui monte malgré la ventilation, tachycardie, arythmies, rigidité ou trismus, hyperthermie rapide (1–2 °C / 5–10 min), hyperkaliémie, acidose — de l'induction jusqu'à 24 h après, avec halogénés ou suxaméthonium."],
      steps: [
        { text: "Arrêter l'halogéné (propofol ou midazolam à la place), appeler à l'aide", urgent: true },
        { text: "Hyperventiler FiO₂ 100 % à 10 L/min de gaz frais (inutile de changer le circuit)" },
        {
          text: `Dantrolène, à répéter jusqu'à 10 mg/kg — flacons de 20 mg à diluer dans 60 mL d'eau stérile (10 min)${dantroleneVials ? ` : ${dantroleneVials} flacons pour la première dose` : ""}`,
          dose: perKg("Dantrolène", 2.5, 2.5, "mg", w, "IV"),
          urgent: true,
        },
        { text: "Acidose : bicarbonate de sodium, puis selon l'excès de base", dose: perKg("Bicarbonate de sodium", 1, 2, "mmol", w, "IV") },
        { text: "Hyperkaliémie : insuline 10 UI dans 50 mL de glucose 30 %, chlorure de calcium 2–5 mg/kg ; pas d'anticalcique avec le dantrolène" },
        { text: "Refroidir jusqu'à 38 °C : glace, perfusions froides, lavages au NaCl 4 °C (15 mL/kg, 3 fois à 15 min)" },
        { text: "Diurèse > 2 mL/kg/h ; terminer l'intervention" },
      ],
      after: ["Soins intensifs ≥ 24 h, dantrolène 1 mg/kg toutes les 6 h pendant 24–48 h ; gaz, ionogramme, CK, myoglobine.", "Informer le patient et sa famille ; tests diagnostiques (EMHG)."],
      source: `${MANUAL}, chap. 23`,
    },
    {
      id: "hyperkalaemia",
      title: "Hyperkaliémie",
      category: "metabolic",
      words: ["hyperkaliemie", "potassium", "ondes t pointues", "qrs larges"],
      recognise: ["K⁺ > 5,5 mmol/L (sévère > 6) ; ondes T pointues, PR court, QRS larges, bradycardie, BAV, asystolie — insuffisance rénale, suxaméthonium, transfusion massive, rhabdomyolyse, garrot."],
      steps: [
        { text: "Arrêter l'apport ou la cause (suxaméthonium, perfusion de K⁺) ; éviter l'hypoventilation", urgent: true },
        { text: "Gluconate ou chlorure de calcium 10 % en 3–5 min (lentement sous digoxine)", dose: fixed("Calcium", "10–20 mL", "IV"), urgent: true },
        { text: "Insuline rapide 20 UI dans 200 mL de glucose 20 % en 20 min", dose: fixed("Insuline rapide", "20 UI", "IV") },
        { text: "Furosémide si diurèse conservée ; hémodialyse si réfractaire ou insuffisance rénale" },
      ],
      after: ["Contrôler kaliémie et glycémie ; ECG."],
      source: `${MANUAL}, chap. 32`,
    },
    {
      id: "haemorrhage",
      title: "Hémorragie massive",
      category: "bleeding",
      words: ["hemorragie", "saignement", "transfusion massive", "choc hemorragique"],
      recognise: ["Pertes rapides avec instabilité ; transfusion massive : par exemple 5 CGR en 3 h ou 8 CGR en 6 h."],
      steps: [
        { text: "Prévenir le chirurgien (contrôle du saignement), appeler à l'aide, déclencher le protocole de transfusion massive de l'hôpital", urgent: true },
        { text: "Deux voies de gros calibre, accélérateur-réchauffeur ; pas de groupe : CGR O Rhésus négatif" },
        { text: "Réchauffer produits et patient (l'hypothermie aggrave la coagulopathie)" },
        { text: "Fibrinogène si < 1–1,5 g/L", dose: fixed("Fibrinogène", "2 g", "IV") },
        { text: "Calcium (citrate des produits sanguins)", dose: fixed("Calcium", "10–20 mL", "IV") },
        { text: "Tests : Hb, plaquettes, fibrinogène, TP/TCA, gaz et lactates, calcium ionisé, K⁺ ; test viscoélastique (ROTEM/TEG) si disponible" },
        { text: "Anticoagulant connu : antidote (idarucizumab pour le dabigatran, protamine pour l'héparine)" },
      ],
      after: ["Complications : hypothermie, hypocalcémie, hyperkaliémie, acidose, coagulopathie de dilution, TRALI, surcharge."],
      source: `${MANUAL}, chap. 35 (fibrinogène : chap. 27 et 35) — suivre aussi le protocole de transfusion massive de l'hôpital`,
    },
    {
      id: "gas_embolism",
      title: "Embolie gazeuse",
      category: "cardio",
      words: ["embolie gazeuse", "embolie d'air", "co2", "position assise", "coelioscopie"],
      recognise: ["Chute brutale de l'EtCO₂, désaturation, hypotension, arythmie — position assise, site opératoire au-dessus du cœur, cœlioscopie, voie veineuse centrale."],
      steps: [
        { text: "Prévenir le chirurgien : inonder le champ et tamponner la brèche ; cœlioscopie : exsuffler", urgent: true },
        { text: "Arrêter le N₂O, FiO₂ 100 %" },
        { text: "Décubitus latéral gauche ou table basculée à gauche, tête basse" },
        { text: "Compression jugulaire (neurochirurgie) ; aspiration par voie veineuse centrale si en place" },
        { text: "Soutien hémodynamique ; RCP si arrêt" },
      ],
      source: `${MANUAL}, chap. 27`,
    },
    {
      id: "high_spinal",
      title: "Rachianesthésie haute ou totale",
      category: "neuro",
      words: ["rachianesthesie haute", "rachi totale", "bloc haut", "apnee"],
      recognise: ["Dyspnée, mains engourdies, hypotension et bradycardie profondes, perte de conscience, apnée — après rachianesthésie ou injection péridurale sous-durale ou intrathécale."],
      steps: [
        { text: "Appeler à l'aide, O₂ 100 %, ventiler au masque", urgent: true },
        { text: "Apnée ou perte de conscience : intubation et ventilation jusqu'à récupération complète du bloc" },
        { text: "Hypotension, bradycardie : remplissage, éphédrine, atropine, adrénaline si besoin (voir Hypotension et Bradycardie)" },
        { text: "Sédation après l'intubation (le patient peut être conscient et paralysé)" },
      ],
      source: `${MANUAL}, chap. 13`,
    },
    {
      id: "hypothermia",
      title: "Hypothermie",
      category: "metabolic",
      words: ["hypothermie", "temperature basse", "frissons"],
      recognise: ["Température centrale < 36 °C (baisse de 1–2 °C la première heure d'une anesthésie générale par redistribution)."],
      steps: [
        { text: "Réchauffement à air pulsé, réchauffeur de solutés, patient couvert, salle plus chaude" },
        { text: "Circuit fermé, bas débit de gaz frais, gaz humidifiés" },
        { text: "Monitorer la température centrale (œsophage, nasopharynx, tympan)" },
      ],
      after: ["Conséquences : saignement, infection, réveil retardé, frissons (consommation d'O₂ × 4)."],
      source: `${MANUAL}, chap. 23`,
    },
    {
      id: "delayed_awakening",
      title: "Réveil retardé",
      category: "neuro",
      words: ["reveil retarde", "ne se reveille pas", "coma", "curarisation residuelle"],
      recognise: ["Pas de réponse à l'appel de son nom 10 min après l'arrêt de tous les anesthésiques."],
      steps: [
        { text: "Vérifier la décurarisation (TOF) ; pseudocholinestérases atypiques après suxaméthonium ou mivacurium", urgent: true },
        { text: "Corriger ventilation (hypercapnie, hypoxémie), température, glycémie et électrolytes ; améliorer le débit cardiaque" },
        { text: "Naloxone par bolus de 40 µg", dose: fixed("Naloxone", "40 µg", "IV") },
        { text: "Flumazénil par bolus de 0,1 mg", dose: fixed("Flumazénil", "0,1 mg", "IV") },
        { text: "Pas de cause trouvée : scanner cérébral (AVC, embolie, hématome)" },
      ],
      source: `${MANUAL}, chap. 23`,
    },
  ];
  return list;
}

/** Crises matching a search (title and words, accents ignored). */
export function searchCrises(list: Crisis[], q: string): Crisis[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const t = fold(q.trim());
  if (!t) return list;
  return list.filter((c) => fold(c.title).includes(t) || c.words.some((w) => w.includes(t) || t.includes(w)));
}
