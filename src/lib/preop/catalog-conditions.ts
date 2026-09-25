// Default antecedents: those with an anaesthetic implication, grouped by
// system. ASA classes follow the examples of the ASA classification
// (2020 update); points of attention are general precautions — delays and
// doses belong to rules. Editable in Paramètres.

import type { ConditionItem } from "./catalog";
import { DEFAULT_CONDITION_DETAILS } from "./catalog-condition-details";
import { EXTRA_CONDITIONS } from "./catalog-conditions-extra";

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
  c({ id: "arrhythmia", label: "FA / trouble du rythme", system: "cardio", keywords: ["FA", "fibrillation auriculaire", "flutter", "arythmie", "ACFA"], asa: 2 }),
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
  c({ id: "pad", label: "Artériopathie (AOMI, carotide)", system: "cardio", keywords: ["AOMI", "artérite", "sténose carotidienne"], asa: 3 }),
  c({ id: "congenital_heart", label: "Cardiopathie congénitale", system: "cardio", asa: 3, attention: { level: "medium", text: "Avis spécialisé ; comprendre la physiologie (shunt, Fontan…)." } }),
  c({ id: "bioprosthetic_valve", label: "Valve biologique / TAVI", system: "cardio", keywords: ["bioprothèse", "TAVI", "TAVR", "remplacement valvulaire"], attention: { level: "info", text: "Date et type de la valve ; traitement antithrombotique associé à gérer selon vos règles." } }),
  c({ id: "endocarditis", label: "Antécédent d'endocardite", system: "cardio", keywords: ["endocardite"], needsRule: true, attention: { level: "medium", text: "Patient à haut risque d'endocardite : prophylaxie selon le geste (vos règles)." } }),
  c({ id: "syncope", label: "Syncope inexpliquée", system: "cardio", keywords: ["perte de connaissance", "syncopes"], attention: { level: "medium", text: "Syncope non expliquée : ECG et avis cardiologique avant une chirurgie programmée." } }),
  c({ id: "wpw", label: "Wolff-Parkinson-White", system: "cardio", keywords: ["WPW", "pré-excitation", "préexcitation"], asa: 2, attention: { level: "medium", text: "Pré-excitation : défibrillateur disponible ; éviter les bloqueurs du nœud AV en cas de FA pré-excitée.", material: ["Défibrillateur"] } }),
  c({ id: "aortic_aneurysm", label: "Anévrisme de l'aorte", system: "cardio", keywords: ["AAA", "anévrisme aortique", "anévrisme de l'aorte"], asa: 3, attention: { level: "medium", text: "Éviter les poussées hypertensives (laryngoscopie, douleur)." } }),
  c({ id: "lvad", label: "Assistance ventriculaire (LVAD)", system: "cardio", keywords: ["LVAD", "assistance circulatoire", "HeartMate"], asa: 4, needsRule: true, attention: { level: "high", text: "Prise en charge avec l'équipe d'assistance : anticoagulation, précharge, pas de compressions thoraciques sans avis." } }),
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
  c({ id: "obesity_hypoventilation", label: "Syndrome obésité-hypoventilation", system: "resp", keywords: ["SOH", "hypoventilation", "Pickwick"], asa: 3, attention: { level: "high", text: "Hypercapnie chronique : gazométrie, ventilation non invasive du patient, épargne morphinique, surveillance postopératoire rapprochée.", material: ["VNI du patient"] } }),
  c({ id: "cystic_fibrosis", label: "Mucoviscidose", system: "resp", keywords: ["mucoviscidose"], asa: 3, attention: { level: "high", text: "Avis du centre de référence ; kinésithérapie avant et après ; fonction respiratoire et hépatique." } }),
  c({ id: "bronchiectasis", label: "Dilatation des bronches", system: "resp", keywords: ["DDB", "bronchectasies"], asa: 2, attention: { level: "info", text: "Kinésithérapie de drainage avant l'intervention ; pas d'intervention programmée en surinfection." } }),
  c({ id: "pneumothorax", label: "Antécédent de pneumothorax", system: "resp", keywords: ["pneumothorax", "bulles d'emphysème"], attention: { level: "medium", text: "Récidive possible sous ventilation en pression positive ; éviter le protoxyde d'azote." } }),
  c({ id: "covid_recent", label: "COVID-19 récent", system: "resp", keywords: ["covid", "SARS-CoV-2"], needsRule: true, attention: { level: "medium", text: "Délai avant une chirurgie programmée selon la sévérité et l'ancienneté (vos règles)." } }),
  c({ id: "tracheostomy", label: "Trachéotomie / laryngectomie", system: "resp", keywords: ["trachéotomie", "trachéostomie", "laryngectomie", "canule"], asa: 3, attention: { level: "high", text: "Voies aériennes : laryngectomie = ventilation par la trachéostomie uniquement ; canules de rechange.", material: ["Canules de trachéotomie de rechange"] } }),
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
  c({ id: "thyroid", label: "Dysthyroïdie", system: "endo", keywords: ["goitre"], qualifiers: { poorlyControlled: "non équilibrée" }, asa: 2, asaIf: { poorlyControlled: 3 }, attentionIf: { poorlyControlled: { level: "high", text: "Dysthyroïdie non équilibrée : reporter une chirurgie programmée ; goitre : voies aériennes." } } }),
  c({ id: "adrenal_insufficiency", label: "Insuffisance surrénale", system: "endo", keywords: ["Addison"], asa: 3, needsRule: true, attention: { level: "high", text: "Supplémentation en hydrocortisone périopératoire (selon vos règles)." } }),
  c({ id: "pheochromocytoma", label: "Phéochromocytome", system: "endo", asa: 3, attention: { level: "high", text: "Préparation préopératoire spécialisée (alpha-bloquant) ; avis endocrinologique." } }),
  c({ id: "porphyria", label: "Porphyrie", system: "endo", asa: 2, attention: { level: "high", text: "Médicaments porphyrinogènes à éviter : vérifier chaque produit sur une liste de sécurité." } }),

  c({ id: "cushing", label: "Syndrome de Cushing", system: "endo", keywords: ["hypercorticisme", "Cushing"], asa: 2, attention: { level: "medium", text: "HTA, diabète, fragilité cutanée et osseuse ; installation prudente." } }),
  c({ id: "acromegaly", label: "Acromégalie", system: "endo", keywords: ["acromégalie"], asa: 3, attention: { level: "high", text: "Intubation et ventilation au masque potentiellement difficiles ; SAOS et cardiopathie associés.", material: ["Vidéolaryngoscope"] } }),
  c({ id: "hyperparathyroidism", label: "Hyperparathyroïdie", system: "endo", keywords: ["parathyroïde", "hypercalcémie"], asa: 2, attention: { level: "info", text: "Calcémie préopératoire." } }),
  c({ id: "diabetes_insipidus", label: "Diabète insipide", system: "endo", keywords: ["insipide"], asa: 2, attention: { level: "medium", text: "Desmopressine poursuivie ; natrémie et bilan entrées-sorties." } }),
  c({ id: "carcinoid", label: "Tumeur carcinoïde / neuroendocrine", system: "endo", keywords: ["carcinoïde", "TNE", "neuroendocrine"], asa: 3, attention: { level: "high", text: "Risque de crise carcinoïde : avis endocrinologique (octréotide périopératoire) ; éviter les libérateurs d'histamine." } }),
  c({ id: "malnutrition", label: "Dénutrition", system: "endo", keywords: ["dénutri", "amaigrissement", "perte de poids", "cachexie"], asa: 2, attention: { level: "medium", text: "Prise en charge nutritionnelle préopératoire (ESPEN) ; risque de syndrome de renutrition." } }),

  // --- Rénal ------------------------------------------------------------------------
  c({ id: "ckd", label: "Insuffisance rénale chronique", system: "renal", keywords: ["IRC", "MRC", "néphropathie"], qualifiers: { severe: "terminale, non dialysée" }, asa: 2, asaIf: { severe: 4 }, attention: { level: "medium", text: "Adapter les posologies à la clairance ; éviter les néphrotoxiques." } }),
  c({ id: "dialysis", label: "Dialyse", system: "renal", keywords: ["hémodialyse", "dialyse péritonéale", "FAV"], asa: 3, attention: { level: "medium", text: "Séance la veille, kaliémie du jour, bras de la fistule protégé (ni brassard ni perfusion).", material: ["Protéger le bras de la fistule"] } }),
  c({ id: "kidney_transplant", label: "Greffe rénale", system: "renal", asa: 3, attention: { level: "medium", text: "Immunosuppresseurs poursuivis ; protéger le greffon (volémie, néphrotoxiques)." } }),

  c({ id: "single_kidney", label: "Rein unique", system: "renal", keywords: ["rein unique", "néphrectomie totale"], attention: { level: "info", text: "Protéger la fonction rénale (volémie, néphrotoxiques, AINS)." } }),

  // --- Hépatique et digestif -----------------------------------------------------------
  c({ id: "cirrhosis", label: "Cirrhose / hépatopathie", system: "digest", keywords: ["hépatopathie", "hépatite chronique", "insuffisance hépatique"], qualifiers: { severe: "décompensée" }, asa: 3, asaIf: { severe: 4 }, attention: { level: "medium", text: "Hémostase, albumine, encéphalopathie ; adapter les posologies." } }),
  c({ id: "gerd", label: "RGO / hernie hiatale", system: "digest", keywords: ["reflux", "hernie hiatale", "pyrosis"], attention: { level: "medium", text: "Risque d'inhalation : discuter une induction en séquence rapide." } }),
  c({ id: "gastroparesis", label: "Gastroparésie", system: "digest", keywords: ["vidange gastrique"], asa: 2, attention: { level: "medium", text: "Estomac plein malgré le jeûne : discuter une séquence rapide, échographie gastrique si disponible." } }),
  c({ id: "ibd", label: "Maladie inflammatoire de l'intestin", system: "digest", keywords: ["Crohn", "RCH", "rectocolite"], asa: 2 }),
  c({ id: "viral_hepatitis", label: "Hépatite virale B ou C", system: "digest", keywords: ["VHB", "VHC"], asa: 2 }),

  c({ id: "bariatric_history", label: "Antécédent de chirurgie bariatrique", system: "digest", keywords: ["bypass gastrique", "sleeve", "anneau gastrique", "gastroplastie"], attention: { level: "medium", text: "Absorption modifiée des médicaments oraux ; carences (fer, B12, vitamines) ; éviter les AINS (ulcère anastomotique)." } }),
  c({ id: "achalasia", label: "Achalasie / diverticule de Zenker", system: "digest", keywords: ["achalasie", "Zenker", "mégaœsophage"], asa: 2, attention: { level: "high", text: "Risque d'inhalation élevé malgré le jeûne : séquence rapide, vidange de l'œsophage à discuter." } }),
  c({ id: "peptic_ulcer", label: "Ulcère gastroduodénal", system: "digest", keywords: ["ulcère gastrique", "ulcère duodénal", "UGD"], attention: { level: "info", text: "Éviter les AINS ; IPP poursuivi." } }),
  c({ id: "gi_bleeding", label: "Hémorragie digestive récente", system: "digest", keywords: ["méléna", "hématémèse", "rectorragie"], asa: 3, attention: { level: "medium", text: "Hémoglobine récente ; antithrombotiques à discuter avec le prescripteur." } }),
  c({ id: "pancreatitis", label: "Pancréatite chronique", system: "digest", keywords: ["pancréatite"], asa: 2, attention: { level: "info", text: "Douleur chronique (tolérance aux opioïdes), diabète, alcool à rechercher." } }),
  c({ id: "stoma", label: "Stomie", system: "digest", keywords: ["colostomie", "iléostomie", "stomie"], attention: { level: "info", text: "Iléostomie à haut débit : volémie et électrolytes." } }),

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
  c({ id: "neuromuscular", label: "Myopathie / maladie neuromusculaire", system: "neuro", keywords: ["myopathie", "Charcot-Marie-Tooth"], asa: 3, attention: { level: "high", text: "Succinylcholine contre-indiquée dans les myopathies ; curares avec monitorage ; risque respiratoire postopératoire.", material: ["Curarimètre"] } }),
  c({ id: "multiple_sclerosis", label: "Sclérose en plaques", system: "neuro", keywords: ["SEP"], asa: 2, attention: { level: "medium", text: "Poussée possible en postopératoire (hyperthermie, stress) ; documenter le déficit avant une ALR." } }),
  c({ id: "spinal_cord_injury", label: "Lésion médullaire", system: "neuro", keywords: ["paraplégie", "tétraplégie", "blessé médullaire"], asa: 3, attention: { level: "high", text: "Succinylcholine contre-indiquée (hyperkaliémie) ; hyperréflexie autonome si lésion au-dessus de T6." } }),
  c({ id: "neuropathy", label: "Neuropathie périphérique", system: "neuro", keywords: ["polyneuropathie"], attention: { level: "info", text: "Documenter le déficit avant une ALR." } }),
  c({ id: "cognitive", label: "Troubles cognitifs / démence", system: "neuro", keywords: ["démence", "Alzheimer", "troubles de la mémoire"], asa: 2 }),

  c({ id: "intracranial_lesion", label: "Tumeur ou lésion cérébrale", system: "neuro", keywords: ["tumeur cérébrale", "méningiome", "glioblastome"], asa: 3, attention: { level: "high", text: "Éviter hypercapnie, hypoxie et hypotension ; ponction neuraxiale contre-indiquée si HTIC." } }),
  c({ id: "cerebral_aneurysm", label: "Anévrisme intracrânien / MAV", system: "neuro", keywords: ["anévrisme cérébral", "malformation artério-veineuse", "MAV", "hémorragie méningée"], asa: 3, attention: { level: "high", text: "Éviter les poussées hypertensives (laryngoscopie, réveil)." } }),
  c({ id: "vp_shunt", label: "Dérivation ventriculaire", system: "neuro", keywords: ["DVP", "valve de dérivation", "hydrocéphalie"], attention: { level: "info", text: "Signes d'hypertension intracrânienne à rechercher ; valve programmable à revérifier après une IRM." } }),
  c({ id: "guillain_barre", label: "Syndrome de Guillain-Barré", system: "neuro", keywords: ["Guillain-Barré", "polyradiculonévrite"], asa: 3, attention: { level: "high", text: "Succinylcholine contre-indiquée (hyperkaliémie) ; dysautonomie ; fonction respiratoire." } }),
  c({ id: "lambert_eaton", label: "Syndrome de Lambert-Eaton", system: "neuro", keywords: ["Lambert-Eaton"], asa: 3, attention: { level: "high", text: "Sensibilité accrue à tous les curares : doses réduites et monitorage.", material: ["Curarimètre"] } }),
  c({ id: "cerebral_palsy", label: "Infirmité motrice cérébrale", system: "neuro", keywords: ["paralysie cérébrale", "polyhandicap"], asa: 3, attention: { level: "medium", text: "Reflux et inhalation, spasticité et installation, hypothermie ; communication avec les proches." } }),
  c({ id: "mitochondrial", label: "Maladie mitochondriale", system: "neuro", keywords: ["mitochondriale", "MELAS"], asa: 3, attention: { level: "high", text: "Éviter le jeûne prolongé et les solutés lactés ; prudence avec le propofol en perfusion prolongée ; avis spécialisé." } }),

  // --- Psychiatrique ------------------------------------------------------------------
  c({ id: "depression", label: "Dépression", system: "psy", keywords: ["syndrome dépressif"], asa: 2, attention: { level: "info", text: "Traitement poursuivi ; interactions à vérifier (ISRS, IMAO)." } }),
  c({ id: "bipolar", label: "Trouble bipolaire", system: "psy", asa: 2, attention: { level: "info", text: "Lithium : natrémie et fonction rénale." } }),
  c({ id: "psychosis", label: "Schizophrénie / psychose", system: "psy", keywords: ["schizophrénie"], asa: 2, attention: { level: "info", text: "Antipsychotiques poursuivis ; QT." } }),
  c({ id: "anxiety", label: "Anxiété importante", system: "psy", keywords: ["phobie", "angoisse"], attention: { level: "info", text: "Prémédication et information à discuter." } }),

  c({ id: "eating_disorder", label: "Anorexie mentale / trouble alimentaire", system: "psy", keywords: ["anorexie", "boulimie", "TCA"], asa: 2, attention: { level: "medium", text: "Électrolytes (K, Mg, P), QT, hypoglycémie, risque de renutrition ; hypothermie." } }),
  c({ id: "autism", label: "Autisme / handicap mental", system: "psy", keywords: ["TSA", "autiste", "déficience intellectuelle", "handicap mental"], attention: { level: "medium", text: "Prémédication et accueil adaptés (premier du programme, accompagnant, environnement calme) ; plan avec les proches." } }),
  c({ id: "adhd", label: "TDAH", system: "psy", keywords: ["hyperactivité", "déficit d'attention"], attention: { level: "info", text: "Psychostimulant : à gérer selon le prescripteur." } }),

  // --- Hématologie ------------------------------------------------------------------
  c({ id: "anemia", label: "Anémie connue", system: "hemato", asa: 2, attention: { level: "medium", text: "À rechercher et traiter avant une chirurgie programmée (bilan martial, fer si carence)." } }),
  c({ id: "bleeding_disorder", label: "Trouble de l'hémostase", system: "hemato", keywords: ["saignements"], asa: 2, needsRule: true, attention: { level: "high", text: "Avis hématologique ; substitution et bilan selon le trouble." } }),
  c({ id: "thrombocytopenia", label: "Thrombopénie", system: "hemato", keywords: ["plaquettes basses"], asa: 2, needsRule: true, attention: { level: "medium", text: "Seuils plaquettaires selon le geste (neuraxial, chirurgie) : voir vos règles." } }),
  c({ id: "thrombophilia", label: "Thrombophilie", system: "hemato", keywords: ["facteur V Leiden"], asa: 2, attention: { level: "medium", text: "Thromboprophylaxie renforcée à discuter." } }),
  c({ id: "sickle_cell", label: "Drépanocytose", system: "hemato", keywords: ["drépanocytaire"], asa: 3, attention: { level: "high", text: "Éviter hypoxie, hypothermie, déshydratation et acidose ; avis hématologique (transfusion à discuter)." } }),

  c({ id: "hit_history", label: "Antécédent de TIH", system: "hemato", keywords: ["TIH", "thrombopénie induite par l'héparine", "HIT"], needsRule: true, attention: { level: "high", text: "Pas d'héparine (y compris rinçages et cathéters héparinés) ; anticoagulation alternative selon vos règles." } }),
  c({ id: "g6pd", label: "Déficit en G6PD", system: "hemato", keywords: ["G6PD", "favisme"], attention: { level: "medium", text: "Éviter les oxydants (bleu de méthylène, prilocaïne, rasburicase, certains antibiotiques) : vérifier chaque produit." } }),
  c({ id: "myeloproliferative", label: "Polyglobulie / syndrome myéloprolifératif", system: "hemato", keywords: ["Vaquez", "thrombocytémie", "myéloprolifératif"], asa: 2, attention: { level: "medium", text: "Risque thrombotique et hémorragique ; hématocrite et plaquettes contrôlés avant une chirurgie programmée." } }),
  c({ id: "asplenia", label: "Splénectomie / asplénie", system: "hemato", keywords: ["splénectomie", "asplénie"], attention: { level: "info", text: "Vaccinations à jour ; risque infectieux." } }),
  c({ id: "transfusion_refusal", label: "Refus de transfusion", system: "hemato", keywords: ["Témoin de Jéhovah", "Jéhovah", "refus de transfusion"], attention: { level: "high", text: "Discuter et documenter les produits acceptés (dérivés, récupération peropératoire) ; optimiser l'hémoglobine (fer, EPO) et l'épargne sanguine." } }),

  // --- Autres -------------------------------------------------------------------------
  c({ id: "cancer", label: "Cancer évolutif", system: "other", keywords: ["néoplasie", "tumeur"], asa: 2 }),
  c({ id: "chemotherapy", label: "Chimiothérapie récente", system: "other", keywords: ["anthracycline", "bléomycine"], asa: 3, attention: { level: "medium", text: "Toxicités : anthracyclines (cardiaque), bléomycine (pulmonaire, FiO₂ basse) ; neutropénie, thrombopénie." } }),
  c({ id: "transplant", label: "Greffe d'organe", system: "other", keywords: ["transplantation"], asa: 3, attention: { level: "medium", text: "Immunosuppresseurs poursuivis ; asepsie renforcée." } }),
  c({ id: "rheumatoid", label: "Polyarthrite rhumatoïde", system: "other", keywords: ["PR"], asa: 2, attention: { level: "medium", text: "Instabilité cervicale C1-C2 possible (imagerie si symptômes) ; ouverture de bouche." } }),
  c({ id: "ankylosing", label: "Spondylarthrite ankylosante", system: "other", keywords: ["Bechterew", "SPA"], asa: 2, attention: { level: "high", text: "Intubation et ALR neuraxiale potentiellement difficiles (rachis cervical et lombaire rigides)." } }),
  c({ id: "down_syndrome", label: "Trisomie 21", system: "other", asa: 2, attention: { level: "medium", text: "Instabilité atlanto-axiale, voies aériennes, cardiopathie associée." } }),
  c({ id: "hiv", label: "VIH", system: "other", asa: 2, attention: { level: "info", text: "Interactions des antirétroviraux à vérifier." } }),
  c({ id: "chronic_pain", label: "Douleur chronique", system: "other", keywords: ["fibromyalgie", "lombalgie chronique"], asa: 2, attention: { level: "medium", text: "Plan analgésique multimodal ; tolérance aux opioïdes possible." } }),
  c({ id: "pregnancy", label: "Grossesse", system: "other", female: true, asa: 2, attention: { level: "high", text: "Avis obstétrical ; décubitus latéral gauche après 20 SA ; risque d'inhalation." } }),
  c({ id: "breastfeeding", label: "Allaitement", system: "other", female: true, attention: { level: "info", text: "Compatibilité des produits à vérifier au cas par cas." } }),

  c({ id: "lupus", label: "Lupus / connectivite", system: "other", keywords: ["lupus", "LED", "Sjögren", "vascularite"], asa: 2, attention: { level: "info", text: "Atteintes d'organes (rein, cœur, poumon) à rechercher ; corticothérapie." } }),
  c({ id: "scleroderma", label: "Sclérodermie", system: "other", keywords: ["sclérodermie", "sclérose systémique"], asa: 3, attention: { level: "high", text: "Ouverture de bouche limitée, abord veineux difficile, reflux ; HTAP et atteinte rénale à rechercher." } }),
  c({ id: "ehlers_danlos", label: "Ehlers-Danlos / hyperlaxité", system: "other", keywords: ["Ehlers-Danlos", "hyperlaxité"], asa: 2, attention: { level: "medium", text: "Fragilité tissulaire et vasculaire, hématomes, luxations : installation prudente." } }),
  c({ id: "marfan", label: "Syndrome de Marfan", system: "other", keywords: ["Marfan"], asa: 3, attention: { level: "high", text: "Dilatation aortique : échocardiographie récente ; éviter les poussées hypertensives." } }),
  c({ id: "mdro", label: "Portage de BMR / BHRe", system: "other", keywords: ["SARM", "MRSA", "BLSE", "BMR", "EPC", "BHRe"], needsRule: true, attention: { level: "medium", text: "Précautions contact ; antibioprophylaxie à adapter (vos règles)." } }),
  c({ id: "glaucoma", label: "Glaucome", system: "other", keywords: ["glaucome"], attention: { level: "info", text: "Traitement poursuivi ; angle fermé : prudence avec les anticholinergiques ; éviter la pression sur les yeux (décubitus ventral)." } }),
  c({ id: "scoliosis", label: "Scoliose / rachis opéré", system: "other", keywords: ["scoliose", "arthrodèse lombaire", "matériel rachidien", "cyphose"], attention: { level: "medium", text: "Ponction neuraxiale plus difficile : repérage échographique ; scoliose sévère : syndrome restrictif.", material: ["Échographe pour le repérage"] } }),
  c({ id: "cervical_spine", label: "Rachis cervical instable ou fixé", system: "other", keywords: ["arthrodèse cervicale", "canal cervical étroit", "myélopathie cervicale", "instabilité cervicale"], attention: { level: "high", text: "Intubation en rectitude (vidéolaryngoscope, fibroscope) ; installation avec contrôle de la tête.", material: ["Vidéolaryngoscope", "Fibroscope"] } }),
  c({ id: "head_neck_radiotherapy", label: "Radiothérapie / chirurgie cervico-faciale", system: "other", keywords: ["radiothérapie cervicale", "radiothérapie ORL", "cancer ORL"], attention: { level: "high", text: "Voies aériennes potentiellement difficiles (fibrose, trismus) : examen soigneux, stratégie décidée à l'avance.", material: ["Vidéolaryngoscope", "Fibroscope"] } }),
  c({ id: "interpreter", label: "Barrière linguistique", system: "other", keywords: ["interprète", "ne parle pas français"], attention: { level: "info", text: "Interprète (professionnel si possible) pour l'information et le consentement." } }),
  c({ id: "advance_directive", label: "Directives anticipées / limitation", system: "other", keywords: ["DNR", "directives anticipées", "non-réanimation", "limitation thérapeutique"], attention: { level: "medium", text: "Discuter et documenter ce qui s'applique en périopératoire (suspension ou maintien)." } }),

  // --- Antécédents anesthésiques ------------------------------------------------------
  c({ id: "ponv", label: "NVPO / mal des transports", system: "anaes", keywords: ["NVPO", "PONV", "nausées postopératoires", "vomissements postopératoires", "mal des transports"] }),
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
    keywords: ["HM", "hyperthermie maligne"],
    attention: { level: "high", text: "Anesthésie sans halogénés ni succinylcholine ; machine préparée (purge ou filtres à charbon actif) ; dantrolène disponible.", material: ["Dantrolène disponible en salle", "Machine purgée / filtres à charbon actif"] },
  }),
  c({ id: "anaesthetic_allergy", label: "Réaction allergique per-anesthésique", system: "anaes", keywords: ["anaphylaxie", "choc anaphylactique"], attention: { level: "high", text: "Récupérer le bilan allergologique ; éviter les produits en cause ; sans bilan, le demander avant une chirurgie programmée." } }),
  c({ id: "pseudocholinesterase", label: "Déficit en pseudocholinestérase", system: "anaes", keywords: ["butyrylcholinestérase", "curarisation prolongée"], attention: { level: "high", text: "Éviter la succinylcholine et le mivacurium ; monitorer la curarisation.", material: ["Curarimètre"] } }),
  c({ id: "awareness", label: "Mémorisation peropératoire", system: "anaes", keywords: ["réveil peropératoire"], attention: { level: "medium", text: "Monitorage de la profondeur d'anesthésie.", material: ["BIS / profondeur d'anesthésie"] } }),
  c({ id: "difficult_iv", label: "Abord veineux difficile", system: "anaes", keywords: ["capital veineux"], attention: { level: "info", text: "Prévoir l'abord échoguidé.", material: ["Échographe pour l'abord veineux"] } }),
  c({ id: "postop_delirium", label: "Delirium postopératoire antérieur", system: "anaes", keywords: ["confusion postopératoire"], attention: { level: "medium", text: "Prévention du delirium : limiter benzodiazépines et anticholinergiques, repères, mobilisation précoce." } }),
  c({ id: "difficult_mask", label: "Ventilation au masque difficile", system: "anaes", keywords: ["ventilation difficile"], attention: { level: "high", text: "Stratégie décidée à l'avance ; oxygénation apnéique, dispositif supraglottique prêt.", material: ["Dispositifs supraglottiques", "Vidéolaryngoscope"] } }),
  c({ id: "pdph", label: "Céphalée post-ponction durale", system: "anaes", keywords: ["brèche", "blood patch", "céphalée post-rachi"], attention: { level: "info", text: "Aiguille pointe-crayon de petit calibre si ponction neuraxiale." } }),
  c({ id: "las_toxicity", label: "Toxicité des anesthésiques locaux", system: "anaes", keywords: ["toxicité des anesthésiques locaux", "LAST"], attention: { level: "high", text: "Doses réduites, échoguidage ; intralipide disponible.", material: ["Intralipide 20 %"] } }),
  c({ id: "dental_fragile", label: "Dents fragiles / appareil dentaire", system: "anaes", keywords: ["dentier", "bridge", "implants dentaires", "dents mobiles", "couronne"], attention: { level: "info", text: "Signaler au patient le risque dentaire ; protège-dents et laryngoscopie douce." } }),
];

// More antecedents (catalog-conditions-extra.ts), after the first ones.
DEFAULT_CONDITIONS.push(...EXTRA_CONDITIONS.filter((x) => !DEFAULT_CONDITIONS.some((d) => d.id === x.id)));

for (const item of DEFAULT_CONDITIONS) if (DEFAULT_CONDITION_DETAILS[item.id]) item.details = DEFAULT_CONDITION_DETAILS[item.id];

const LABELS = new Map(DEFAULT_CONDITIONS.map((x) => [x.id, x.label]));

/** Label of a built-in antecedent (custom ones carry their own label where they are used). */
export function defaultConditionLabel(id: string): string | undefined {
  return LABELS.get(id);
}
