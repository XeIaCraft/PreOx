// Default antecedents: those with an anaesthetic implication, grouped by
// system. ASA classes follow the examples of the ASA classification
// (2020 update); points of attention are general precautions — delays and
// doses belong to rules. Editable in Paramètres.

import type { ConditionItem } from "./catalog";

const c = (item: ConditionItem): ConditionItem => item;

export const DEFAULT_CONDITIONS: ConditionItem[] = [
  // --- Cardiovasculaire ---------------------------------------------------------
  c({ id: "hypertension", label: "HTA", system: "cardio", keywords: ["hypertension artérielle"], qualifiers: { poorlyControlled: "mal contrôlée" }, asa: 2, asaIf: { poorlyControlled: 3 } }),
  c({ id: "dyslipidemia", label: "Dyslipidémie", system: "cardio", keywords: ["cholestérol", "hypercholestérolémie"] }),
  c({
    id: "coronary",
    label: "Coronaropathie",
    system: "cardio",
    keywords: ["infarctus", "IDM", "angor", "angine de poitrine", "stent", "SCA", "cardiopathie ischémique"],
    qualifiers: { recent: "< 3 mois", severe: "ischémie active" },
    asa: 3,
    asaIf: { recent: 4, severe: 4 },
    attentionIf: {
      recent: { level: "high", text: "Événement coronarien récent : avis cardiologique sur le délai de la chirurgie et la gestion des antiagrégants ; ne pas interrompre une double antiagrégation sans cet avis." },
      severe: { level: "high", text: "Ischémie active : avis cardiologique avant toute chirurgie non urgente." },
    },
  }),
  c({ id: "cabg", label: "Pontage coronarien", system: "cardio", keywords: ["PAC", "pontages"], asa: 3 }),
  c({
    id: "heart_failure",
    label: "Insuffisance cardiaque",
    system: "cardio",
    keywords: ["IC", "FEVG", "cardiopathie dilatée", "décompensation cardiaque"],
    qualifiers: { severe: "FEVG sévèrement ↓" },
    asa: 3,
    asaIf: { severe: 4 },
    attentionIf: { severe: { level: "high", text: "Cardiopathie sévère : échocardiographie récente, avis cardiologique, monitorage hémodynamique adapté.", material: ["Pression artérielle invasive (à discuter)"] } },
  }),
  c({
    id: "valve",
    label: "Valvulopathie",
    system: "cardio",
    keywords: ["insuffisance mitrale", "insuffisance aortique", "valve"],
    qualifiers: { severe: "sévère" },
    asa: 2,
    asaIf: { severe: 4 },
    attentionIf: { severe: { level: "high", text: "Valvulopathie sévère : échocardiographie récente et avis cardiologique." } },
  }),
  c({
    id: "aortic_stenosis",
    label: "Rétrécissement aortique",
    system: "cardio",
    keywords: ["RA", "sténose aortique"],
    qualifiers: { severe: "serré" },
    asa: 3,
    asaIf: { severe: 4 },
    attention: { level: "high", text: "Éviter hypotension, tachycardie et baisse des résistances vasculaires ; échocardiographie récente ; prudence avec un bloc sympathique étendu (neuraxial)." },
  }),
  c({ id: "mechanical_valve", label: "Prothèse valvulaire mécanique", system: "cardio", keywords: ["valve mécanique"], asa: 3, needsRule: true, attention: { level: "high", text: "Anticoagulation : arrêt et relais à organiser selon vos règles." } }),
  c({ id: "hcm", label: "Cardiomyopathie hypertrophique", system: "cardio", keywords: ["CMH", "obstructive"], asa: 3, attention: { level: "high", text: "Éviter hypovolémie, tachycardie et vasodilatation ; bêtabloquant poursuivi." } }),
  c({
    id: "pulmonary_hypertension",
    label: "Hypertension pulmonaire",
    system: "cardio",
    keywords: ["HTAP"],
    qualifiers: { severe: "sévère" },
    asa: 3,
    asaIf: { severe: 4 },
    attention: { level: "high", text: "Risque de défaillance ventriculaire droite : avis spécialisé ; éviter hypoxie, hypercapnie, acidose et hypotension." },
  }),
  c({ id: "murmur", label: "Souffle non exploré", system: "cardio", attention: { level: "medium", text: "Échocardiographie avant une chirurgie à risque." } }),
  c({ id: "arrhythmia", label: "FA / trouble du rythme", system: "cardio", keywords: ["fibrillation auriculaire", "flutter", "arythmie", "ACFA"], asa: 2 }),
  c({ id: "long_qt", label: "QT long / Brugada", system: "cardio", keywords: ["Brugada", "QT"], asa: 2, attention: { level: "high", text: "Éviter les médicaments qui allongent le QT (dropéridol, ondansétron à discuter…) ; défibrillateur en salle.", material: ["Défibrillateur"] } }),
  c({ id: "av_block", label: "Bradycardie / bloc auriculo-ventriculaire", system: "cardio", keywords: ["BAV", "maladie du sinus"], asa: 2, attention: { level: "medium", text: "Stimulation transcutanée disponible ; avis rythmologique si symptomatique.", material: ["Électrodes de stimulation transcutanée"] } }),
  c({
    id: "pacemaker",
    label: "Pacemaker / DAI",
    system: "cardio",
    keywords: ["défibrillateur implantable", "stimulateur cardiaque", "PM"],
    asa: 3,
    needsRule: true,
    attention: {
      level: "high",
      text: "Date du dernier contrôle, dépendance au stimulateur ; programmation périopératoire (thérapies du DAI) selon la procédure du service ; bistouri bipolaire si possible.",
      material: ["Aimant", "Défibrillateur avec électrodes"],
    },
  }),
  c({ id: "pad", label: "Artériopathie (AOMI, carotide)", system: "cardio", keywords: ["AOMI", "artérite", "sténose carotidienne", "anévrisme"], asa: 3 }),
  c({ id: "congenital_heart", label: "Cardiopathie congénitale", system: "cardio", asa: 3, attention: { level: "medium", text: "Avis spécialisé ; comprendre la physiologie (shunt, Fontan…)." } }),
  c({ id: "vte", label: "Antécédent de MTEV", system: "cardio", keywords: ["phlébite", "TVP", "embolie pulmonaire", "EP", "thrombose veineuse"], attention: { level: "medium", text: "Thromboprophylaxie à adapter au risque." } }),

  // --- Respiratoire ---------------------------------------------------------------
  c({
    id: "asthma",
    label: "Asthme",
    system: "resp",
    qualifiers: { poorlyControlled: "mal contrôlé" },
    asa: 2,
    asaIf: { poorlyControlled: 3 },
    attentionIf: { poorlyControlled: { level: "high", text: "Asthme mal contrôlé : optimiser le traitement avant une chirurgie programmée ; bronchodilatateur disponible." } },
  }),
  c({ id: "copd", label: "BPCO", system: "resp", keywords: ["bronchite chronique", "emphysème"], qualifiers: { severe: "sévère" }, asa: 3, attention: { level: "medium", text: "Ventilation protectrice, traitement inhalé poursuivi, kinésithérapie respiratoire." } }),
  c({
    id: "osa",
    label: "SAOS",
    system: "resp",
    keywords: ["apnées du sommeil", "SAS", "CPAP", "PPC"],
    qualifiers: { poorlyControlled: "non appareillé" },
    asa: 2,
    attention: { level: "medium", text: "Épargne morphinique, ALR si possible, surveillance de la SpO₂ au réveil ; PPC du patient à apporter.", material: ["PPC du patient"] },
    attentionIf: { poorlyControlled: { level: "medium", text: "SAOS non appareillé : épargne morphinique, ALR si possible, surveillance prolongée de la SpO₂." } },
  }),
  c({ id: "home_o2", label: "Oxygénothérapie à domicile", system: "resp", keywords: ["O2", "insuffisance respiratoire chronique"], asa: 3, attention: { level: "high", text: "Insuffisance respiratoire chronique : avis pneumologique, gazométrie, surveillance postopératoire adaptée." } }),
  c({ id: "restrictive", label: "Fibrose / syndrome restrictif", system: "resp", keywords: ["fibrose pulmonaire", "pneumopathie interstitielle"], asa: 3, attention: { level: "medium", text: "Épreuves fonctionnelles récentes ; FiO₂ la plus basse possible si bléomycine." } }),
  c({ id: "recent_uri", label: "Infection respiratoire < 1 mois", system: "resp", keywords: ["bronchite", "rhume", "pneumonie récente"], attention: { level: "medium", text: "Hyperréactivité bronchique : discuter le report d'une chirurgie programmée si infection récente symptomatique." } }),

  // --- Endocrinien et métabolique ---------------------------------------------------
  c({ id: "diabetes_oral", label: "Diabète (sans insuline)", system: "endo", keywords: ["DT2", "diabète de type 2", "diabète", "diabétique"], qualifiers: { poorlyControlled: "mal contrôlé" }, asa: 2, asaIf: { poorlyControlled: 3 }, attention: { level: "info", text: "Glycémies périopératoires ; antidiabétiques gérés selon vos règles." } }),
  c({
    id: "diabetes_insulin",
    label: "Diabète insulinotraité",
    system: "endo",
    keywords: ["DT1", "diabète de type 1", "insuline", "insulinodépendant", "insulinotraité"],
    qualifiers: { poorlyControlled: "mal contrôlé" },
    asa: 2,
    asaIf: { poorlyControlled: 3 },
    needsRule: true,
    attention: { level: "medium", text: "Protocole de gestion de l'insuline et glycémies capillaires périopératoires ; en début de programme si possible.", material: ["Glycémies capillaires"] },
  }),
  c({ id: "thyroid", label: "Dysthyroïdie", system: "endo", keywords: ["hypothyroïdie", "hyperthyroïdie", "Basedow", "goitre"], qualifiers: { poorlyControlled: "non équilibrée" }, asa: 2, asaIf: { poorlyControlled: 3 }, attentionIf: { poorlyControlled: { level: "high", text: "Dysthyroïdie non équilibrée : reporter une chirurgie programmée ; goitre : voies aériennes." } } }),
  c({ id: "adrenal_insufficiency", label: "Insuffisance surrénale", system: "endo", keywords: ["Addison"], asa: 3, needsRule: true, attention: { level: "high", text: "Supplémentation en hydrocortisone périopératoire (selon vos règles)." } }),
  c({ id: "pheochromocytoma", label: "Phéochromocytome", system: "endo", asa: 3, attention: { level: "high", text: "Préparation préopératoire spécialisée (alpha-bloquant) ; avis endocrinologique." } }),
  c({ id: "porphyria", label: "Porphyrie", system: "endo", asa: 2, attention: { level: "high", text: "Médicaments porphyrinogènes à éviter : vérifier chaque produit sur une liste de sécurité." } }),

  // --- Rénal ------------------------------------------------------------------------
  c({ id: "ckd", label: "Insuffisance rénale chronique", system: "renal", keywords: ["IRC", "MRC", "néphropathie"], qualifiers: { severe: "terminale, non dialysée" }, asa: 2, asaIf: { severe: 4 }, attention: { level: "medium", text: "Adapter les posologies à la clairance ; éviter les néphrotoxiques." } }),
  c({ id: "dialysis", label: "Dialyse", system: "renal", keywords: ["hémodialyse", "dialyse péritonéale", "FAV"], asa: 3, attention: { level: "medium", text: "Séance la veille, kaliémie du jour, bras de la fistule protégé (ni brassard ni perfusion).", material: ["Protéger le bras de la fistule"] } }),
  c({ id: "kidney_transplant", label: "Greffe rénale", system: "renal", asa: 3, attention: { level: "medium", text: "Immunosuppresseurs poursuivis ; protéger le greffon (volémie, néphrotoxiques)." } }),

  // --- Hépatique et digestif -----------------------------------------------------------
  c({ id: "cirrhosis", label: "Cirrhose / hépatopathie", system: "digest", keywords: ["hépatopathie", "hépatite chronique", "insuffisance hépatique"], qualifiers: { severe: "décompensée" }, asa: 3, asaIf: { severe: 4 }, attention: { level: "medium", text: "Hémostase, albumine, encéphalopathie ; adapter les posologies." } }),
  c({ id: "gerd", label: "RGO / hernie hiatale", system: "digest", keywords: ["reflux", "hernie hiatale", "pyrosis"], attention: { level: "medium", text: "Risque d'inhalation : discuter une induction en séquence rapide." } }),
  c({ id: "gastroparesis", label: "Gastroparésie", system: "digest", keywords: ["vidange gastrique"], asa: 2, attention: { level: "medium", text: "Estomac plein malgré le jeûne : discuter une séquence rapide, échographie gastrique si disponible." } }),
  c({ id: "ibd", label: "Maladie inflammatoire de l'intestin", system: "digest", keywords: ["Crohn", "RCH", "rectocolite"], asa: 2 }),
  c({ id: "viral_hepatitis", label: "Hépatite virale B ou C", system: "digest", keywords: ["VHB", "VHC"], asa: 2 }),

  // --- Neurologique ------------------------------------------------------------------
  c({
    id: "stroke",
    label: "AVC / AIT",
    system: "neuro",
    keywords: ["accident vasculaire cérébral", "ischémie cérébrale"],
    qualifiers: { recent: "< 3 mois" },
    asa: 3,
    asaIf: { recent: 4 },
    attentionIf: { recent: { level: "high", text: "AVC / AIT de moins de 3 mois : discuter le report d'une chirurgie non urgente ; maintenir la pression de perfusion." } },
  }),
  c({ id: "epilepsy", label: "Épilepsie", system: "neuro", keywords: ["convulsions", "crises"], asa: 2, attention: { level: "info", text: "Antiépileptiques poursuivis, y compris le matin de l'intervention." } }),
  c({ id: "parkinson", label: "Maladie de Parkinson", system: "neuro", asa: 2, attention: { level: "medium", text: "Antiparkinsoniens sans interruption (prise le matin, reprise précoce) ; éviter dropéridol et métoclopramide." } }),
  c({ id: "myasthenia", label: "Myasthénie", system: "neuro", asa: 3, attention: { level: "high", text: "Sensibilité aux curares non dépolarisants, résistance à la succinylcholine ; monitorage de la curarisation ; anticholinestérasiques poursuivis.", material: ["Curarimètre"] } }),
  c({ id: "neuromuscular", label: "Myopathie / maladie neuromusculaire", system: "neuro", keywords: ["myopathie", "dystrophie musculaire", "SLA", "Steinert"], asa: 3, attention: { level: "high", text: "Succinylcholine contre-indiquée dans les myopathies ; curares avec monitorage ; risque respiratoire postopératoire.", material: ["Curarimètre"] } }),
  c({ id: "multiple_sclerosis", label: "Sclérose en plaques", system: "neuro", keywords: ["SEP"], asa: 2, attention: { level: "medium", text: "Poussée possible en postopératoire (hyperthermie, stress) ; documenter le déficit avant une ALR." } }),
  c({ id: "spinal_cord_injury", label: "Lésion médullaire", system: "neuro", keywords: ["paraplégie", "tétraplégie", "blessé médullaire"], asa: 3, attention: { level: "high", text: "Succinylcholine contre-indiquée (hyperkaliémie) ; hyperréflexie autonome si lésion au-dessus de T6." } }),
  c({ id: "neuropathy", label: "Neuropathie périphérique", system: "neuro", keywords: ["polyneuropathie"], attention: { level: "info", text: "Documenter le déficit avant une ALR." } }),
  c({ id: "cognitive", label: "Troubles cognitifs / démence", system: "neuro", keywords: ["démence", "Alzheimer", "troubles de la mémoire"], asa: 2 }),

  // --- Psychiatrique ------------------------------------------------------------------
  c({ id: "depression", label: "Dépression", system: "psy", keywords: ["syndrome dépressif"], asa: 2, attention: { level: "info", text: "Traitement poursuivi ; interactions à vérifier (ISRS, IMAO)." } }),
  c({ id: "bipolar", label: "Trouble bipolaire", system: "psy", asa: 2, attention: { level: "info", text: "Lithium : natrémie et fonction rénale." } }),
  c({ id: "psychosis", label: "Schizophrénie / psychose", system: "psy", keywords: ["schizophrénie"], asa: 2, attention: { level: "info", text: "Antipsychotiques poursuivis ; QT." } }),
  c({ id: "anxiety", label: "Anxiété importante", system: "psy", keywords: ["phobie", "angoisse"], attention: { level: "info", text: "Prémédication et information à discuter." } }),

  // --- Hématologie ------------------------------------------------------------------
  c({ id: "anemia", label: "Anémie connue", system: "hemato", asa: 2, attention: { level: "medium", text: "À rechercher et traiter avant une chirurgie programmée (bilan martial, fer si carence)." } }),
  c({ id: "bleeding_disorder", label: "Trouble de l'hémostase", system: "hemato", keywords: ["Willebrand", "hémophilie", "saignements"], asa: 2, needsRule: true, attention: { level: "high", text: "Avis hématologique ; substitution et bilan selon le trouble." } }),
  c({ id: "thrombocytopenia", label: "Thrombopénie", system: "hemato", keywords: ["plaquettes basses"], asa: 2, needsRule: true, attention: { level: "medium", text: "Seuils plaquettaires selon le geste (neuraxial, chirurgie) : voir vos règles." } }),
  c({ id: "thrombophilia", label: "Thrombophilie", system: "hemato", keywords: ["facteur V Leiden", "SAPL"], asa: 2, attention: { level: "medium", text: "Thromboprophylaxie renforcée à discuter." } }),
  c({ id: "sickle_cell", label: "Drépanocytose", system: "hemato", keywords: ["drépanocytaire"], asa: 3, attention: { level: "high", text: "Éviter hypoxie, hypothermie, déshydratation et acidose ; avis hématologique (transfusion à discuter)." } }),

  // --- Autres -------------------------------------------------------------------------
  c({ id: "cancer", label: "Cancer évolutif", system: "other", keywords: ["néoplasie", "tumeur"], asa: 2 }),
  c({ id: "chemotherapy", label: "Chimiothérapie récente", system: "other", keywords: ["anthracycline", "bléomycine"], asa: 3, attention: { level: "medium", text: "Toxicités : anthracyclines (cardiaque), bléomycine (pulmonaire, FiO₂ basse) ; neutropénie, thrombopénie." } }),
  c({ id: "transplant", label: "Greffe d'organe", system: "other", keywords: ["transplantation", "greffe hépatique", "greffe cardiaque"], asa: 3, attention: { level: "medium", text: "Immunosuppresseurs poursuivis ; asepsie renforcée." } }),
  c({ id: "rheumatoid", label: "Polyarthrite rhumatoïde", system: "other", keywords: ["PR"], asa: 2, attention: { level: "medium", text: "Instabilité cervicale C1-C2 possible (imagerie si symptômes) ; ouverture de bouche." } }),
  c({ id: "ankylosing", label: "Spondylarthrite ankylosante", system: "other", keywords: ["Bechterew", "SPA"], asa: 2, attention: { level: "high", text: "Intubation et ALR neuraxiale potentiellement difficiles (rachis cervical et lombaire rigides)." } }),
  c({ id: "down_syndrome", label: "Trisomie 21", system: "other", asa: 2, attention: { level: "medium", text: "Instabilité atlanto-axiale, voies aériennes, cardiopathie associée." } }),
  c({ id: "hiv", label: "VIH", system: "other", asa: 2, attention: { level: "info", text: "Interactions des antirétroviraux à vérifier." } }),
  c({ id: "chronic_pain", label: "Douleur chronique", system: "other", keywords: ["fibromyalgie", "lombalgie chronique"], asa: 2, attention: { level: "medium", text: "Plan analgésique multimodal ; tolérance aux opioïdes possible." } }),
  c({ id: "pregnancy", label: "Grossesse", system: "other", female: true, asa: 2, attention: { level: "high", text: "Avis obstétrical ; décubitus latéral gauche après 20 SA ; risque d'inhalation." } }),
  c({ id: "breastfeeding", label: "Allaitement", system: "other", female: true, attention: { level: "info", text: "Compatibilité des produits à vérifier au cas par cas." } }),

  // --- Antécédents anesthésiques ------------------------------------------------------
  c({ id: "ponv", label: "NVPO / mal des transports", system: "anaes", keywords: ["nausées", "vomissements postopératoires"] }),
  c({
    id: "difficult_airway",
    label: "Intubation difficile",
    system: "anaes",
    keywords: ["ID", "intubation difficile", "fibroscopie"],
    attention: { level: "high", text: "Stratégie décidée à l'avance selon l'algorithme du service ; matériel en salle.", material: ["Vidéolaryngoscope", "Chariot d'intubation difficile"] },
  }),
  c({
    id: "malignant_hyperthermia",
    label: "Hyperthermie maligne (patient ou famille)",
    system: "anaes",
    keywords: ["HM"],
    attention: { level: "high", text: "Anesthésie sans halogénés ni succinylcholine ; machine préparée (purge ou filtres à charbon actif) ; dantrolène disponible.", material: ["Dantrolène disponible en salle", "Machine purgée / filtres à charbon actif"] },
  }),
  c({ id: "anaesthetic_allergy", label: "Réaction allergique per-anesthésique", system: "anaes", keywords: ["anaphylaxie", "choc anaphylactique"], attention: { level: "high", text: "Récupérer le bilan allergologique ; éviter les produits en cause ; sans bilan, le demander avant une chirurgie programmée." } }),
  c({ id: "pseudocholinesterase", label: "Déficit en pseudocholinestérase", system: "anaes", keywords: ["butyrylcholinestérase", "curarisation prolongée"], attention: { level: "high", text: "Éviter la succinylcholine et le mivacurium ; monitorer la curarisation.", material: ["Curarimètre"] } }),
  c({ id: "awareness", label: "Mémorisation peropératoire", system: "anaes", keywords: ["réveil peropératoire"], attention: { level: "medium", text: "Monitorage de la profondeur d'anesthésie.", material: ["BIS / profondeur d'anesthésie"] } }),
  c({ id: "difficult_iv", label: "Abord veineux difficile", system: "anaes", keywords: ["capital veineux"], attention: { level: "info", text: "Prévoir l'abord échoguidé.", material: ["Échographe pour l'abord veineux"] } }),
  c({ id: "postop_delirium", label: "Delirium postopératoire antérieur", system: "anaes", keywords: ["confusion postopératoire"], attention: { level: "medium", text: "Prévention du delirium : limiter benzodiazépines et anticholinergiques, repères, mobilisation précoce." } }),
];

const LABELS = new Map(DEFAULT_CONDITIONS.map((x) => [x.id, x.label]));

/** Label of a built-in antecedent (custom ones carry their own label where they are used). */
export function defaultConditionLabel(id: string): string | undefined {
  return LABELS.get(id);
}
