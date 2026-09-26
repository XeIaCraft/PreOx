// Past operations and past anaesthetics that change today's anaesthesia.
// General precautions only (what to look for, what to prepare); delays and
// doses belong to rules. Editable in Paramètres › Listes.

import type { ConditionItem } from "./catalog";

const c = (item: ConditionItem): ConditionItem => item;

export const SURGICAL_CONDITIONS: ConditionItem[] = [
  // --- Antécédents chirurgicaux ------------------------------------------------------------------------------
  c({
    id: "oesophagectomy",
    label: "Œsophagectomie / gastrectomie totale",
    system: "surgical",
    keywords: ["œsophagectomie", "oesophagectomie", "Lewis-Santy", "gastrectomie totale", "plastie gastrique", "tubulisation gastrique"],
    attention: {
      level: "high",
      text: "Plus de sphincter inférieur de l'œsophage : régurgitation et inhalation possibles malgré le jeûne (position proclive, induction en séquence rapide à discuter) ; dénutrition et absorption des médicaments oraux à vérifier.",
    },
  }),
  c({
    id: "thyroid_surgery_history",
    label: "Thyroïdectomie / parathyroïdectomie",
    system: "surgical",
    keywords: ["thyroïdectomie", "lobectomie thyroïdienne", "parathyroïdectomie"],
    attention: {
      level: "info",
      text: "Paralysie récurrentielle possible : demander une dysphonie (avis ORL si une chirurgie du cou ou des voies aériennes est prévue) ; hormonothérapie substitutive poursuivie ; calcémie si hypoparathyroïdie.",
    },
  }),
  c({
    id: "lung_resection",
    label: "Pneumonectomie / lobectomie",
    system: "surgical",
    keywords: ["pneumonectomie", "lobectomie pulmonaire", "segmentectomie", "résection pulmonaire"],
    attention: {
      level: "medium",
      text: "Réserve respiratoire réduite : dyspnée d'effort et EFR récentes ; après une pneumonectomie, la surcharge hydrique est mal tolérée (œdème pulmonaire) et une ventilation sélective est impossible du côté opéré.",
    },
  }),
  c({
    id: "axillary_dissection",
    label: "Curage axillaire / mastectomie",
    system: "surgical",
    keywords: ["curage axillaire", "mastectomie", "tumorectomie mammaire", "ganglion sentinelle", "lymphœdème du bras"],
    attention: { level: "info", text: "Bras du côté du curage : éviter brassard, garrot et perfusion si un autre accès est possible (lymphœdème)." },
  }),
  c({
    id: "av_fistula",
    label: "Fistule artérioveineuse (dialyse)",
    system: "surgical",
    keywords: ["fistule artérioveineuse", "fistule de dialyse", "fistule au bras"],
    attention: { level: "medium", text: "Aucun brassard, garrot ni ponction sur le bras de la fistule ; la protéger à l'installation et vérifier le thrill après l'intervention." },
  }),
  c({
    id: "carotid_surgery_history",
    label: "Endartériectomie ou stent carotidien",
    system: "surgical",
    keywords: ["endartériectomie carotidienne", "stent carotidien", "chirurgie carotidienne"],
    attention: { level: "info", text: "Pression artérielle plus labile (barorécepteurs) ; atteinte bilatérale : réponse ventilatoire à l'hypoxie diminuée — prudence avec les opioïdes." },
  }),
  c({
    id: "amputation",
    label: "Amputation de membre",
    system: "surgical",
    keywords: ["amputé", "amputation", "membre fantôme", "moignon"],
    attention: { level: "info", text: "Douleur de membre fantôme : analgésie multimodale et ALR ; brassard et voies veineuses selon les membres restants ; installation adaptée." },
  }),
  c({
    id: "abdominal_adhesions",
    label: "Laparotomies multiples / adhérences",
    system: "surgical",
    keywords: ["laparotomies itératives", "adhérences", "abdomen multiopéré", "éventration"],
    attention: { level: "info", text: "Intervention plus longue et plus hémorragique, conversion en laparotomie possible : groupe sanguin et voies adaptées." },
  }),
  c({
    id: "prior_caesarean",
    label: "Césarienne(s) antérieure(s) / utérus cicatriciel",
    system: "surgical",
    female: true,
    keywords: ["césarienne antérieure", "césarienne", "césariennes", "utérus cicatriciel", "myomectomie"],
    attention: { level: "medium", text: "Nouvelle grossesse : rechercher un placenta prævia ou accreta (hémorragie majeure) ; plan transfusionnel si suspicion." },
  }),
  c({
    id: "craniotomy_history",
    label: "Craniotomie / neurochirurgie antérieure",
    system: "surgical",
    keywords: ["craniotomie", "neurochirurgie", "volet crânien", "exérèse de tumeur cérébrale"],
    attention: { level: "info", text: "Épilepsie séquellaire (antiépileptiques poursuivis) ; déficit neurologique à documenter avant l'anesthésie." },
  }),
  c({
    id: "joint_prosthesis",
    label: "Prothèse articulaire",
    system: "surgical",
    keywords: ["prothèse de hanche", "prothèse de genou", "PTH", "PTG", "prothèse d'épaule"],
    attention: { level: "info", text: "Installation adaptée à la mobilité (luxation de hanche) ; pas d'antibioprophylaxie spécifique pour une autre chirurgie propre." },
  }),
  c({
    id: "liver_resection",
    label: "Hépatectomie",
    system: "surgical",
    keywords: ["hépatectomie", "résection hépatique"],
    attention: { level: "info", text: "Fonction hépatique et hémostase à contrôler si la résection est récente ou étendue." },
  }),

  // --- Antécédents anesthésiques -----------------------------------------------------------------------------
  c({
    id: "delayed_emergence",
    label: "Réveil prolongé ou retardé",
    system: "anaes",
    keywords: ["réveil long", "réveil retardé", "réveil tardif", "réveil prolongé", "long à se réveiller", "réveil difficile"],
    attention: {
      level: "medium",
      text: "Rechercher la cause : curarisation résiduelle (déficit en pseudocholinestérase), sensibilité aux opioïdes ou aux benzodiazépines, hypothermie, hypoglycémie, hypercapnie (SAOS), hyponatrémie, insuffisance hépatique ou rénale. Agents de courte durée, monitorage de la curarisation et de la profondeur d'anesthésie, glycémie et température.",
      material: ["Moniteur de curarisation", "BIS / profondeur d'anesthésie"],
    },
    details: [{ id: "cause", label: "Cause retrouvée", kind: "text", hint: "Compte rendu d'anesthésie, curare, dosage de la cholinestérase…" }],
  }),
  c({
    id: "unplanned_icu",
    label: "Admission imprévue en soins intensifs",
    system: "anaes",
    keywords: ["soins intensifs après l'opération", "réanimation postopératoire", "USI imprévue"],
    attention: { level: "medium", text: "Récupérer le compte rendu (cause) ; prévoir une surveillance continue si la cause persiste." },
  }),
  c({
    id: "perop_bronchospasm",
    label: "Bronchospasme per-anesthésique",
    system: "anaes",
    keywords: ["bronchospasme", "spasme bronchique"],
    attention: { level: "medium", text: "Bronchodilatateur avant l'induction, propofol ou halogéné, éviter les histaminolibérateurs ; exclure une anaphylaxie (bilan allergologique)." },
  }),
  c({
    id: "laryngospasm_history",
    label: "Laryngospasme",
    system: "anaes",
    keywords: ["laryngospasme", "spasme laryngé"],
    attention: { level: "info", text: "Profondeur suffisante avant toute stimulation ; extubation en anesthésie profonde ou patient complètement réveillé." },
  }),
  c({
    id: "severe_postop_pain",
    label: "Douleur postopératoire difficile à contrôler",
    system: "anaes",
    keywords: ["douleur mal contrôlée", "douleur postopératoire sévère", "hyperalgésie"],
    attention: { level: "medium", text: "Analgésie multimodale planifiée (ALR, kétamine, lidocaïne IV), opioïdes adaptés ; rechercher une tolérance ou une douleur chronique." },
  }),
  c({
    id: "postop_urinary_retention",
    label: "Rétention urinaire postopératoire",
    system: "anaes",
    keywords: ["rétention après l'opération", "sondage après l'opération"],
    attention: { level: "info", text: "Éviter la morphine intrathécale et les anticholinergiques ; échographie vésicale avant la sortie." },
  }),
  c({
    id: "perop_cardiac_arrest",
    label: "Arrêt cardiaque ou collapsus lors d'une anesthésie",
    system: "anaes",
    keywords: ["arrêt cardiaque au bloc", "collapsus à l'induction", "réanimation au bloc"],
    attention: { level: "high", text: "Récupérer le compte rendu : cause (anaphylaxie, hypovolémie, arythmie, embolie) à éclaircir avant une nouvelle anesthésie programmée." },
  }),
  c({
    id: "nerve_injury_block",
    label: "Lésion nerveuse après ALR ou installation",
    system: "anaes",
    keywords: ["paralysie après bloc", "lésion nerveuse", "neuropathie postopératoire"],
    attention: { level: "info", text: "Déficit préexistant à documenter ; balance bénéfice/risque d'un nouveau bloc dans le même territoire." },
  }),
];
