// What to know about each monitoring and each value: normal range, usual
// targets, what it is for, how it works, and the traps — from the basic
// monitoring to the Swan-Ganz, calibrated pulse contour, tissue oxygenation,
// intracranial pressure and viscoelastic tests. Adult values unless stated;
// always read with the patient's baseline and the service protocol.
//
// Sources: ESC/ERS 2022 pulmonary hypertension (PMID 36017548: PAPm > 20 mmHg,
// RVP > 2 UW); Surviving Sepsis Campaign 2021 (PAM 65 mmHg, lactate);
// Brain Trauma Foundation 2016 (PIC > 22 mmHg, PPC 60–70 mmHg); ESAIC 2022
// severe perioperative bleeding (viscoelastic-guided therapy); Monnet &
// Teboul (variations respiratoires, lever de jambes passif); consensus on
// perioperative protective ventilation (Young et al., Br J Anaesth 2019).

export type MonitoringGroup = "base" | "pressure" | "output" | "preload" | "oxygenation" | "ventilation" | "neuro" | "coagulation" | "metabolic";

export const MONITORING_GROUPS: { code: MonitoringGroup; label: string }[] = [
  { code: "base", label: "Monitorage de base" },
  { code: "pressure", label: "Pressions invasives" },
  { code: "output", label: "Débit cardiaque (Swan-Ganz, PiCCO, contour de pouls, Doppler, ETO)" },
  { code: "preload", label: "Précharge et réponse au remplissage" },
  { code: "oxygenation", label: "Oxygénation tissulaire" },
  { code: "ventilation", label: "Ventilation" },
  { code: "neuro", label: "Neuromonitorage" },
  { code: "coagulation", label: "Hémostase au lit du patient" },
  { code: "metabolic", label: "Biologie délocalisée" },
];

export interface MonitoringValue {
  label: string;
  /** Normal range, with its unit. */
  normal: string;
  /** Usual perioperative target or threshold, when there is one. */
  target?: string;
}

export interface MonitoringItem {
  id: string;
  label: string;
  group: MonitoringGroup;
  /** Words it is recognised by in the plan (targets, monitoring and material lines). */
  words: string[];
  values: MonitoringValue[];
  /** What it is for. */
  what: string;
  /** How it works, how to set it up. */
  how: string;
  /** Traps and limits. */
  pitfalls?: string;
  /** Formulas worth knowing. */
  formulas?: string[];
  source?: string;
}

export const MONITORING: MonitoringItem[] = [
  // --- Base ---------------------------------------------------------------------------------------
  {
    id: "ecg",
    label: "ECG",
    group: "base",
    words: ["ecg", " st "],
    values: [{ label: "FC", normal: "60–100/min", target: "50–100/min, pas de tachycardie chez le coronarien" }],
    what: "Rythme, fréquence, ischémie (segment ST), troubles de conduction.",
    how: "5 électrodes : DII (rythme, onde P) et V5 (ischémie du territoire antérolatéral) ; analyse automatique du ST activée chez le coronarien.",
    pitfalls: "Bistouri électrique et frissons parasitent le tracé ; un sus-décalage peut venir du filtre (mode monitorage vs diagnostic).",
  },
  {
    id: "spo2",
    label: "SpO₂",
    group: "base",
    words: ["spo2", "saturation arterielle"],
    values: [{ label: "SpO₂", normal: "95–100 %", target: "94–98 % (88–92 % si hypercapnie chronique)" }],
    what: "Saturation artérielle en O₂ par spectrophotométrie pulsée.",
    how: "Capteur au doigt ou à l'oreille ; courbe de pléthysmographie de bonne qualité avant de croire le chiffre.",
    pitfalls: "Retard de 30–60 s sur l'hypoxémie ; faussée par vasoconstriction, bleu de méthylène, carboxyhémoglobine (surestime), vernis ; une SpO₂ normale sous FiO₂ élevée masque une hypoventilation.",
  },
  {
    id: "nibp",
    label: "Pression artérielle non invasive",
    group: "base",
    words: ["pni", "pression arterielle non invasive", " pam ", "pa a ", " pa "],
    values: [
      { label: "PAM", normal: "70–105 mmHg", target: "≥ 65 mmHg et à ± 20 % de la valeur de base (plus haut si HTA, sténose carotidienne, HTIC)" },
      { label: "PAS", normal: "100–140 mmHg" },
    ],
    what: "Pression de perfusion des organes ; l'hypotension peropératoire (PAM < 65 mmHg ou baisse > 20 %) est liée aux lésions rénales et myocardiques.",
    how: "Brassard de largeur 40 % de la circonférence du bras ; mesure toutes les 3–5 min (1–2 min à l'induction).",
    pitfalls: "Brassard trop petit : surestimation ; arythmie et obésité rendent la mesure imprécise ; pas sur le bras d'une FAV ou d'un curage.",
    formulas: ["PAM ≈ PAD + (PAS − PAD) / 3"],
  },
  {
    id: "etco2",
    label: "Capnographie (EtCO₂)",
    group: "base",
    words: ["etco2", "capno"],
    values: [
      { label: "EtCO₂", normal: "35–45 mmHg (4,7–6 kPa)", target: "35–45 mmHg ; 30–35 si HTIC aiguë (transitoire)" },
      { label: "Gradient PaCO₂ − EtCO₂", normal: "2–5 mmHg" },
    ],
    what: "Ventilation, position de la sonde (seule preuve d'intubation trachéale), débit cardiaque (chute brutale : embolie, arrêt).",
    how: "Mesure infrarouge sur le circuit ; lire la courbe (plateau, pente, retour à zéro).",
    pitfalls: "Le gradient augmente avec l'espace mort (BPCO, bas débit, embolie, position latérale) ; une EtCO₂ basse n'est pas toujours une hyperventilation.",
  },
  {
    id: "temperature",
    label: "Température centrale",
    group: "base",
    words: ["temperature", "normothermie"],
    values: [{ label: "T° centrale", normal: "36,5–37,5 °C", target: "≥ 36 °C" }],
    what: "Hypothermie (saignement, infection, frissons, réveil retardé) et hyperthermie maligne.",
    how: "Œsophagienne, nasopharyngée, vésicale ou tympanique ; dès que l'AG dure > 30 min.",
    pitfalls: "La baisse de 1–2 °C de la première heure vient de la redistribution : réchauffer dès l'induction (voire avant).",
  },
  {
    id: "tof",
    label: "Curarisation (TOF)",
    group: "base",
    words: ["tof", "curarimetre", "curarisation"],
    values: [{ label: "Rapport T4/T1", normal: "1", target: "≥ 0,9 avant l'extubation" }],
    what: "Profondeur du bloc neuromusculaire et décurarisation complète.",
    how: "Stimulation du nerf ulnaire (adducteur du pouce) ; accéléromyographie ou électromyographie quantitative ; compte post-tétanique si bloc profond.",
    pitfalls: "Le « visuel » ou le tactile ne détectent pas un TOF entre 0,4 et 0,9 ; pouce froid ou mal fixé : mesure fausse ; l'orbiculaire de l'œil récupère avant l'adducteur.",
  },
  {
    id: "bis",
    label: "Profondeur d'anesthésie (BIS, entropie)",
    group: "base",
    words: [" bis ", "profondeur d'anesthesie", "entropie"],
    values: [{ label: "BIS", normal: "90–100 éveillé", target: "40–60 en anesthésie générale" }],
    what: "Éviter surdosage (hypotension, delirium du sujet âgé) et mémorisation (AIVOC, curarisation).",
    how: "Électroencéphalogramme frontal traité ; regarder aussi le taux de suppression et l'EEG brut.",
    pitfalls: "Faussé par la kétamine, le N₂O, l'EMG, le bistouri ; moins fiable chez le jeune enfant.",
  },
  {
    id: "urine",
    label: "Diurèse",
    group: "base",
    words: ["diurese", "sonde urinaire"],
    values: [{ label: "Diurèse", normal: "≥ 0,5 mL/kg/h", target: "≥ 0,5 mL/kg/h (enfant ≥ 1 mL/kg/h)" }],
    what: "Perfusion rénale ; signe tardif et peu spécifique d'hypovolémie.",
    how: "Sonde vésicale avec urinomètre.",
    pitfalls: "Oligurie physiologique au stress chirurgical (ADH) et au pneumopéritoine : ne pas remplir sur la seule diurèse.",
  },

  // --- Invasive pressures --------------------------------------------------------------------------
  {
    id: "arterial",
    label: "Pression artérielle invasive",
    group: "pressure",
    words: ["catheter arteriel", "pa invasive", "ligne arterielle", "pression arterielle invasive"],
    values: [{ label: "PAM", normal: "70–105 mmHg", target: "≥ 65 mmHg ou ± 20 % de la base ; selon la pathologie" }],
    what: "Pression battement par battement (induction à risque, vasopresseurs, chirurgie hémorragique), gaz du sang répétés, variations respiratoires (VPP).",
    how: "Cathéter radial (Allen non obligatoire) ou fémoral ; capteur à zéro à l'axe phlébostatique (4e espace intercostal, ligne axillaire moyenne) ; test de rinçage rapide (« square wave ») : 1–2 oscillations = amortissement correct.",
    pitfalls: "Capteur trop bas : surestimation (≈ 7,5 mmHg par 10 cm) ; sur-amortissement (bulle, caillot) : PAS sous-estimée ; sous-amortissement : PAS surestimée.",
  },
  {
    id: "cvp",
    label: "Pression veineuse centrale (PVC)",
    group: "pressure",
    words: [" pvc", "veineuse centrale"],
    values: [{ label: "PVC", normal: "2–8 mmHg", target: "suivre la tendance ; pas une cible de remplissage" }],
    what: "Pression de l'oreillette droite : dysfonction ventriculaire droite, tamponnade, surcharge ; accès pour les amines et la ScvO₂.",
    how: "Jugulaire interne droite échoguidée ; zéro à l'axe phlébostatique ; lire en fin d'expiration.",
    pitfalls: "Mauvais indice de précharge et de réponse au remplissage ; augmentée par la PEP, la ventilation, la position.",
  },

  // --- Cardiac output --------------------------------------------------------------------------------
  {
    id: "swan",
    label: "Cathéter artériel pulmonaire (Swan-Ganz)",
    group: "output",
    words: ["swan", "arteriel pulmonaire", "papo", " pap ", "pression arterielle pulmonaire"],
    values: [
      { label: "PAP systolique / diastolique", normal: "15–30 / 8–15 mmHg" },
      { label: "PAP moyenne", normal: "10–20 mmHg", target: "hypertension pulmonaire si > 20 mmHg" },
      { label: "PAPO (pression d'occlusion)", normal: "6–12 mmHg", target: "> 18 mmHg : pression de remplissage gauche élevée" },
      { label: "Débit cardiaque", normal: "4–8 L/min" },
      { label: "Index cardiaque", normal: "2,5–4 L/min/m²", target: "≥ 2,2 L/min/m² (bas débit en dessous)" },
      { label: "RVS", normal: "800–1 200 dyn·s·cm⁻⁵" },
      { label: "RVP", normal: "< 2 UW (< 160 dyn·s·cm⁻⁵)" },
      { label: "SvO₂", normal: "65–75 %", target: "≥ 65 %" },
    ],
    what: "Chirurgie cardiaque à haut risque, hypertension pulmonaire, défaillance droite, transplantation : pressions droites et pulmonaires, débit (thermodilution), SvO₂, résistances.",
    how: "Introduit par la jugulaire, ballonnet gonflé : courbes successives OD → VD → AP → occlusion (PAPO). Débit par thermodilution (bolus froid ou continu). Ballonnet dégonflé en dehors de la mesure.",
    pitfalls: "Arythmies au passage du VD, rupture de l'artère pulmonaire (ballonnet gonflé trop longtemps ou en distal), infection. La PAPO surestime la pression télédiastolique du VG si PEP élevée, sténose mitrale ou HTAP. Thermodilution faussée par une fuite tricuspide.",
    formulas: [
      "RVS = 80 × (PAM − PVC) / DC",
      "RVP = 80 × (PAPm − PAPO) / DC ; en unités Wood : (PAPm − PAPO) / DC",
      "IC = DC / surface corporelle",
      "CaO₂ = 1,34 × Hb × SaO₂ + 0,003 × PaO₂ (mL/dL) ; DO₂ = CaO₂ × DC × 10 (normal 900–1 100 mL/min, DO₂i 500–600)",
    ],
    source: "ESC/ERS 2022 (hypertension pulmonaire)",
  },
  {
    id: "picco",
    label: "Thermodilution transpulmonaire (PiCCO, VolumeView)",
    group: "output",
    words: ["picco", "transpulmonaire", "volumeview", "evlw", "gedi"],
    values: [
      { label: "Index cardiaque", normal: "3–5 L/min/m²" },
      { label: "VTDGi (volume télédiastolique global)", normal: "680–800 mL/m²", target: "< 680 : précharge basse ; > 800 : haute" },
      { label: "EVLWi (eau pulmonaire extravasculaire)", normal: "3–7 mL/kg", target: "> 10 mL/kg : œdème pulmonaire" },
      { label: "IPVP (perméabilité vasculaire pulmonaire)", normal: "1–3", target: "> 3 : œdème lésionnel" },
      { label: "VVE (variation du volume d'éjection)", normal: "< 10 %" },
    ],
    what: "Débit, précharge volumétrique et eau pulmonaire : choc complexe, SDRA, chirurgie majeure du patient fragile.",
    how: "Cathéter artériel fémoral (ou brachial) à thermistance + voie veineuse centrale ; bolus froid de 15–20 mL (3 injections) pour calibrer, puis contour de pouls continu. Recalibrer toutes les 8 h ou après un changement hémodynamique.",
    pitfalls: "Calibration faussée par shunt, anévrisme aortique, ECMO, résection pulmonaire.",
  },
  {
    id: "pulse_contour",
    label: "Contour de l'onde de pouls non calibré (FloTrac, ProAQT, LiDCO)",
    group: "output",
    words: ["flotrac", "contour de pouls", "proaqt", "lidco", "debit cardiaque", "index cardiaque", " ic "],
    values: [
      { label: "Index cardiaque", normal: "2,5–4 L/min/m²" },
      { label: "VVE (SVV)", normal: "< 10 %", target: "> 12–13 % : réponse probable au remplissage" },
    ],
    what: "Tendance du débit et du volume d'éjection, variations respiratoires, sur la ligne artérielle : remplissage guidé (goal-directed therapy) en chirurgie majeure.",
    how: "Capteur dédié sur le cathéter radial ; les valeurs absolues comptent moins que les variations après un bolus.",
    pitfalls: "Peu fiable si résistances très basses (sepsis, cirrhose), arythmie, ballon de contre-pulsion, courbe amortie.",
  },
  {
    id: "doppler",
    label: "Doppler œsophagien",
    group: "output",
    words: ["doppler oesophagien", "cardioq", "ftc"],
    values: [
      { label: "FTc (temps d'éjection corrigé)", normal: "330–360 ms", target: "< 330 ms : précharge basse (ou postcharge haute)" },
      { label: "Volume d'éjection", normal: "60–100 mL", target: "Hausse > 10 % après 250 mL : répondeur" },
    ],
    what: "Débit aortique descendant battement par battement ; remplissage guidé en chirurgie colorectale.",
    how: "Sonde œsophagienne à 35–40 cm des arcades, orientée vers le signal aortique le plus net ; algorithme : bolus de 250 mL tant que le volume d'éjection augmente de plus de 10 %.",
    pitfalls: "Déplacements de la sonde ; contre-indiqué si varices œsophagiennes, chirurgie œsophagienne ; patient éveillé : mal toléré.",
  },
  {
    id: "tee",
    label: "Échographie transœsophagienne (ETO)",
    group: "output",
    words: [" eto ", "eto per", "transoesophag", "echocardiograph"],
    values: [
      { label: "FEVG", normal: "≥ 50 %" },
      { label: "TAPSE", normal: "≥ 17 mm", target: "< 17 mm : dysfonction VD" },
      { label: "ITV sous-aortique", normal: "18–22 cm", target: "hausse > 10–15 % après remplissage ou lever de jambes : répondeur" },
      { label: "Rapport VD/VG", normal: "< 0,6", target: "> 1 : cœur pulmonaire aigu (embolie)" },
    ],
    what: "Instabilité inexpliquée (hypovolémie, dysfonction VG ou VD, tamponnade, embolie), chirurgie cardiaque et valvulaire, TAVI.",
    how: "Coupes mi-œsophagiennes 4 cavités et 2 cavités, transgastrique petit axe (volémie, contractilité), coupe profonde transgastrique (ITV).",
    pitfalls: "Opérateur-dépendant ; contre-indications œsophagiennes (sténose, varices, chirurgie récente).",
  },

  // --- Preload -----------------------------------------------------------------------------------------
  {
    id: "ppv",
    label: "Variation de la pression pulsée (VPP) et du volume d'éjection (VVE)",
    group: "preload",
    words: ["vpp", "vve", "variation de la pression pulsee", "precharge"],
    values: [{ label: "VPP", normal: "< 10 %", target: "> 12–13 % : réponse probable au remplissage ; zone grise 9–13 %" }],
    what: "Prédire si un remplissage augmentera le débit, avant de le donner.",
    how: "Sur la ligne artérielle (ou le moniteur) : (PP max − PP min) / moyenne sur un cycle ventilatoire.",
    pitfalls: "Valable seulement en ventilation contrôlée, Vt ≥ 8 mL/kg, rythme sinusal, thorax fermé, sans respiration spontanée ; faux positifs en cas de dysfonction VD. Sinon : mini-remplissage ou lever de jambes passif.",
    source: "Monnet & Teboul",
  },
  {
    id: "fluid_challenge",
    label: "Épreuve de remplissage et lever de jambes passif",
    group: "preload",
    words: ["epreuve de remplissage", "lever de jambes", "fluid challenge", "mini-remplissage"],
    values: [
      { label: "Mini-remplissage", normal: "100–250 mL en 1–2 min", target: "hausse du VES ou de l'ITV > 10 % : répondeur" },
      { label: "Lever de jambes passif", normal: "45° pendant 1 min", target: "hausse du débit > 10 % : répondeur" },
    ],
    what: "Tester la réponse au remplissage quand la VPP n'est pas utilisable.",
    how: "Mesurer le débit (ou l'ITV) avant et pendant ; le lever de jambes se fait depuis la position semi-assise.",
    pitfalls: "Il faut une mesure du débit en continu ; la PA seule est trop peu sensible.",
  },

  // --- Tissue oxygenation -----------------------------------------------------------------------------------
  {
    id: "scvo2",
    label: "Saturation veineuse centrale (ScvO₂) et mêlée (SvO₂)",
    group: "oxygenation",
    words: ["svo2", "scvo2", "saturation veineuse"],
    values: [
      { label: "SvO₂ (artère pulmonaire)", normal: "65–75 %", target: "≥ 65 %" },
      { label: "ScvO₂ (veine cave supérieure)", normal: "70–80 %", target: "≥ 70 %" },
      { label: "ΔPCO₂ veino-artérielle", normal: "< 6 mmHg", target: "> 6 mmHg : débit insuffisant" },
    ],
    what: "Équilibre entre apport (débit, Hb, SaO₂) et consommation d'O₂.",
    how: "Gaz du sang sur la voie centrale (ScvO₂) ou l'artère pulmonaire (SvO₂) ; à lire avec le lactate.",
    pitfalls: "Une ScvO₂ normale ou haute n'exclut pas une hypoperfusion (sepsis, shunts) ; elle est 5 % au-dessus de la SvO₂ chez le sujet sain, en dessous en cas de choc.",
    formulas: ["SvO₂ ≈ SaO₂ − VO₂ / (1,34 × Hb × DC × 10)"],
  },
  {
    id: "lactate",
    label: "Lactate",
    group: "oxygenation",
    words: ["lactate"],
    values: [{ label: "Lactate", normal: "< 2 mmol/L", target: "baisse ≥ 10–20 % toutes les 2 h si élevé" }],
    what: "Hypoperfusion tissulaire, gravité et réponse au traitement.",
    how: "Gaz du sang artériel ou veineux.",
    pitfalls: "Aussi élevé par l'adrénaline, l'insuffisance hépatique, le Ringer lactate en grande quantité, l'ischémie mésentérique, la metformine.",
    source: "Surviving Sepsis Campaign 2021",
  },
  {
    id: "nirs",
    label: "Oxymétrie cérébrale (NIRS)",
    group: "oxygenation",
    words: ["nirs", "oxymetrie cerebrale", "rso2"],
    values: [{ label: "rSO₂", normal: "60–75 % (valeur de base propre à chacun)", target: "pas de baisse > 20 % de la valeur de base, ni < 50 %" }],
    what: "Oxygénation cérébrale régionale : chirurgie cardiaque, carotidienne, position assise (beach chair), sujet âgé à risque.",
    how: "Capteurs frontaux avant l'induction pour la valeur de base ; en cas de baisse : PAM, PaCO₂, Hb, FiO₂, débit, position de la tête.",
    pitfalls: "Mesure régionale et superficielle ; contamination extracrânienne.",
  },

  // --- Ventilation -------------------------------------------------------------------------------------------
  {
    id: "lung_protective",
    label: "Ventilation protectrice",
    group: "ventilation",
    words: [" vt ", "volume courant", "plateau", "pression motrice", "driving", " pep ", "peep"],
    values: [
      { label: "Volume courant", normal: "6–8 mL/kg de poids idéal" },
      { label: "PEP", normal: "5 cmH₂O", target: "individualisée ; 8–10 chez l'obèse ou en cœlioscopie" },
      { label: "Pression de plateau", normal: "< 30 cmH₂O", target: "< 25–27 cmH₂O" },
      { label: "Pression motrice (plateau − PEP)", normal: "< 15 cmH₂O", target: "< 13–15 cmH₂O" },
      { label: "Compliance statique", normal: "≈ 50–80 mL/cmH₂O sous AG" },
    ],
    what: "Limiter les complications pulmonaires postopératoires (atélectasies, lésions induites par la ventilation).",
    how: "Vt calculé sur le poids idéal (taille et sexe) ; manœuvres de recrutement après l'intubation et les déconnexions ; FiO₂ la plus basse pour SpO₂ ≥ 94 %.",
    pitfalls: "Le poids réel surestime le Vt de l'obèse ; une pression motrice qui monte signale atélectasie, bronchospasme, sonde sélective ou pneumothorax.",
    formulas: ["Poids idéal ♂ = 50 + 0,91 × (taille cm − 152,4) ; ♀ = 45,5 + 0,91 × (taille − 152,4)", "Compliance = Vt / (plateau − PEP)"],
    source: "Young et al., Br J Anaesth 2019",
  },

  // --- Neuro ---------------------------------------------------------------------------------------------------
  {
    id: "icp",
    label: "Pression intracrânienne (PIC) et de perfusion cérébrale (PPC)",
    group: "neuro",
    words: [" pic ", "pression intracranienne", " ppc", "perfusion cerebrale"],
    values: [
      { label: "PIC", normal: "5–15 mmHg", target: "< 22 mmHg" },
      { label: "PPC = PAM − PIC", normal: "60–70 mmHg", target: "60–70 mmHg" },
    ],
    what: "Traumatisme crânien grave, hémorragie méningée, chirurgie à risque d'HTIC.",
    how: "Capteur intraparenchymateux ou dérivation ventriculaire externe ; PAM mesurée au tragus (niveau du trou de Monro) pour la PPC.",
    pitfalls: "PAM au niveau du cœur : PPC surestimée en tête surélevée ; dérivation ouverte : la PIC lue n'est pas fiable.",
    source: "Brain Trauma Foundation 2016",
  },
  {
    id: "sjo2",
    label: "Saturation jugulaire (SjO₂)",
    group: "neuro",
    words: ["sjo2", "saturation jugulaire"],
    values: [{ label: "SjO₂", normal: "55–75 %", target: "< 50 % : ischémie ; > 75 % : hyperhémie ou infarctus" }],
    what: "Équilibre global apport/consommation d'O₂ cérébral.",
    how: "Cathéter rétrograde dans le golfe jugulaire (position vérifiée par radiographie).",
    pitfalls: "Interpréter la PvjO₂ seule si hypothermie ; contamination par le sang extracrânien si mal positionné.",
  },

  // --- Coagulation -----------------------------------------------------------------------------------------------
  {
    id: "viscoelastic",
    label: "Tests viscoélastiques (ROTEM, TEG)",
    group: "coagulation",
    words: ["rotem", "teg", "viscoelast", "fibtem", "extem"],
    values: [
      { label: "EXTEM CT", normal: "38–79 s", target: "> 80 s : facteurs (CCP ou plasma)" },
      { label: "EXTEM A5", normal: "34–55 mm", target: "< 35 mm avec FIBTEM normal : plaquettes" },
      { label: "FIBTEM A5 / A10", normal: "9–24 mm", target: "< 8–10 mm : fibrinogène" },
      { label: "INTEM CT / HEPTEM CT", normal: "100–240 s", target: "INTEM ≫ HEPTEM : héparine résiduelle (protamine)" },
      { label: "ML (lyse maximale)", normal: "< 15 %", target: "> 15 % : hyperfibrinolyse (acide tranexamique)" },
    ],
    what: "Guider la transfusion et les facteurs en 10–15 min dans l'hémorragie (chirurgie cardiaque, hépatique, obstétrique, trauma).",
    how: "Sang citraté ; lire d'abord FIBTEM (fibrinogène), puis EXTEM (plaquettes et facteurs), INTEM/HEPTEM (héparine).",
    pitfalls: "Insensible aux antiplaquettaires et aux AOD à faible dose ; seuils à adapter à l'appareil et à l'algorithme du service.",
    source: "ESAIC 2022 (hémorragie périopératoire sévère) ; algorithmes de Görlinger",
  },
  {
    id: "act",
    label: "Temps de coagulation activé (ACT)",
    group: "coagulation",
    words: [" act ", "temps de coagulation active"],
    values: [
      { label: "ACT", normal: "80–130 s", target: "CEC : > 480 s ; chirurgie vasculaire et endovasculaire : 200–300 s" },
    ],
    what: "Surveiller l'héparine à forte dose (CEC, clampage, ECMO).",
    how: "Automate au lit ; mesure 3–5 min après le bolus d'héparine, puis toutes les 30 min.",
    pitfalls: "Allongé aussi par hypothermie, hémodilution, thrombopénie, aprotinine.",
  },

  // --- Metabolic -----------------------------------------------------------------------------------------------------
  {
    id: "blood_gas",
    label: "Gaz du sang et ionogramme délocalisés",
    group: "metabolic",
    words: ["glycemie", "kaliemie", "calcium ionise", "ca2+", "gaz du sang", " hb "],
    values: [
      { label: "pH / PaCO₂ / PaO₂", normal: "7,35–7,45 / 35–45 mmHg / 80–100 mmHg" },
      { label: "Bicarbonates / excès de base", normal: "22–26 mmol/L / −2 à +2" },
      { label: "K⁺", normal: "3,5–5 mmol/L" },
      { label: "Ca²⁺ ionisé", normal: "1,1–1,3 mmol/L", target: "> 1,1 mmol/L en transfusion massive" },
      { label: "Glycémie", normal: "70–140 mg/dL", target: "< 180 mg/dL en périopératoire" },
      { label: "Hb", normal: "12–16 g/dL", target: "transfuser sous 7 g/dL (8 si âgé ou coronarien stable)" },
    ],
    what: "Ventilation, acidose, électrolytes, glycémie et hémoglobine au bloc.",
    how: "Artère ou veine ; seringue héparinée sans bulle, analyse rapide.",
    pitfalls: "Hémolyse : K⁺ faussement élevé ; prélèvement sur la voie de perfusion : dilution.",
  },
];

/** The reference cards a plan's targets and monitoring lines refer to. */
export function monitoringFor(lines: string[], items: MonitoringItem[] = MONITORING): MonitoringItem[] {
  // NFKD turns « SpO₂ » into « spo2 »; lines are padded so that « pic » does not match « picco ».
  const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const text = lines.map((l) => ` ${fold(l).replace(/[^a-z0-9+%]+/g, " ")} `).join("|");
  return items.filter((m) => m.words.some((w) => text.includes(fold(w).replace(/[^a-z0-9+% ]+/g, " "))));
}

export interface HaemodynamicInput {
  map?: number;
  cvp?: number;
  mpap?: number;
  pawp?: number;
  co?: number;
  /** Body surface area, m². */
  bsa?: number;
}

/** Derived values of a Swan-Ganz set: RVS, RVP (dyn·s·cm⁻⁵ and Wood units), cardiac index. */
export function haemodynamics(v: HaemodynamicInput): { svr?: number; pvr?: number; pvrWood?: number; ci?: number } {
  const out: { svr?: number; pvr?: number; pvrWood?: number; ci?: number } = {};
  if (v.co && v.co > 0) {
    if (v.map !== undefined && v.cvp !== undefined) out.svr = Math.round((80 * (v.map - v.cvp)) / v.co);
    if (v.mpap !== undefined && v.pawp !== undefined) {
      out.pvrWood = Math.round(((v.mpap - v.pawp) / v.co) * 10) / 10;
      out.pvr = Math.round((80 * (v.mpap - v.pawp)) / v.co);
    }
    if (v.bsa && v.bsa > 0) out.ci = Math.round((v.co / v.bsa) * 10) / 10;
  }
  return out;
}

/** Body surface area, Mosteller (m²). */
export function bodySurface(weightKg: number, heightCm: number): number {
  return Math.round(Math.sqrt((weightKg * heightCm) / 3600) * 100) / 100;
}
