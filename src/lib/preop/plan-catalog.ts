// What a plan is made of, to tick rather than type: targets, monitoring and
// equipment by category, positions, and a library of frequent risks with
// why, how to prevent and what to do — each linked to the crisis procedure
// of the theatre screen (crises.ts). The lines ticked are stored as text in
// the plan (targets, material), so a protocol stays readable and editable.
// Values come from the sources named; the rest is equipment, not advice.

import type { ProtocolRisk } from "./protocols";

export interface CatalogGroup {
  id: string;
  label: string;
  items: { label: string; hint?: string }[];
}

export const TARGET_GROUPS: CatalogGroup[] = [
  {
    id: "haemodynamic",
    label: "Hémodynamique",
    items: [
      { label: "PAM ≥ 65 mmHg", hint: "Hypotension : PAS < 90 mmHg, PAM < 60 mmHg ou baisse de 20–30 % (Manuel 2020, chap. 23)" },
      { label: "PAM ≥ 75 mmHg", hint: "HTA mal équilibrée, sténose carotidienne, insuffisance rénale : plus haut que 65" },
      { label: "PA à ± 20 % de la valeur de base", hint: "Manuel 2020, chap. 23" },
      { label: "PAS < 140 mmHg", hint: "Neurochirurgie vasculaire, anévrisme non traité, chirurgie à risque d'hématome" },
      { label: "FC 50–100/min" },
      { label: "FC < 80/min (coronarien)", hint: "« Lent, mou, normotendu »" },
      { label: "Rythme sinusal à préserver", hint: "Rétrécissement aortique, cardiomyopathie hypertrophique, dysfonction diastolique" },
    ],
  },
  {
    id: "advanced",
    label: "Hémodynamique avancée (débit, Swan-Ganz)",
    items: [
      { label: "IC ≥ 2,2 L/min/m²", hint: "Index cardiaque ; bas débit en dessous" },
      { label: "VPP < 12 % (sinon tester le remplissage)", hint: "Valable en ventilation contrôlée, Vt ≥ 8 mL/kg, rythme sinusal, thorax fermé" },
      { label: "Hausse du VES > 10 % après 250 mL = répondeur", hint: "Remplissage guidé (Doppler, contour de pouls)" },
      { label: "PAPO 6–12 mmHg" },
      { label: "PAP moyenne < 25 mmHg", hint: "Hypertension pulmonaire : > 20 mmHg (ESC/ERS 2022) ; cible selon la base du patient" },
      { label: "PAS > PAP systolique", hint: "Hypertension pulmonaire : ne jamais laisser la PA systémique passer sous la PAP" },
      { label: "PVC : suivre la tendance", hint: "Pas une cible de remplissage" },
      { label: "RVS 800–1 200 dyn·s·cm⁻⁵" },
    ],
  },
  {
    id: "perfusion",
    label: "Perfusion et oxygénation tissulaire",
    items: [
      { label: "SvO₂ ≥ 65 %" },
      { label: "ScvO₂ ≥ 70 %" },
      { label: "Lactate < 2 mmol/L" },
      { label: "ΔPCO₂ veino-artérielle < 6 mmHg" },
      { label: "Diurèse ≥ 0,5 mL/kg/h" },
      { label: "NIRS : baisse < 20 % de la valeur de base", hint: "Oxymétrie cérébrale ; valeur de base avant l'induction" },
    ],
  },
  {
    id: "ventilation",
    label: "Ventilation",
    items: [
      { label: "Vt 6–8 mL/kg de poids idéal", hint: "Ventilation protectrice : poids idéal (prédit), pas le poids réel" },
      { label: "PEP 5 cmH₂O" },
      { label: "PEP 8–10 cmH₂O (obèse, cœlioscopie)" },
      { label: "Pression de plateau < 30 cmH₂O" },
      { label: "Pression motrice < 15 cmH₂O", hint: "Plateau − PEP" },
      { label: "EtCO₂ 35–45 mmHg" },
      { label: "SpO₂ ≥ 90 %", hint: "Hypoxémie : SpO₂ < 90 % ou baisse de 5 % (Manuel 2020, chap. 23)" },
      { label: "SpO₂ 94–98 %" },
      { label: "FiO₂ < 30 % (laser, voies aériennes)", hint: "Risque de feu" },
      { label: "Ventilation unipulmonaire : Vt 4–6 mL/kg, PEP 5, FiO₂ pour SpO₂ ≥ 92 %" },
    ],
  },
  {
    id: "neuro",
    label: "Neurologie",
    items: [
      { label: "PPC 60–70 mmHg", hint: "PPC = PAM − PIC ; PAM mesurée au tragus" },
      { label: "PIC < 22 mmHg", hint: "Brain Trauma Foundation 2016" },
      { label: "PaCO₂ 35–40 mmHg (normocapnie)" },
      { label: "Natrémie 140–145 mmol/L" },
    ],
  },
  {
    id: "temperature",
    label: "Température",
    items: [{ label: "Normothermie ≥ 36 °C", hint: "Hypothermie : < 36 °C (Manuel 2020, chap. 23)" }, { label: "Hypothermie contrôlée (selon la chirurgie)" }],
  },
  {
    id: "depth",
    label: "Profondeur et curarisation",
    items: [{ label: "BIS 40–60" }, { label: "TOF ≥ 0,9 avant l'extubation" }, { label: "Curarisation profonde (PTC 1–2)", hint: "Cœlioscopie à basse pression, neurochirurgie, microchirurgie laryngée" }],
  },
  {
    id: "metabolic",
    label: "Métabolique et sang",
    items: [
      { label: "Glycémie < 180 mg/dL" },
      { label: "Hb ≥ 7 g/dL (seuil transfusionnel à adapter au terrain)" },
      { label: "Hb ≥ 8 g/dL (âgé, coronarien stable)" },
      { label: "Kaliémie à contrôler" },
      { label: "Ca²⁺ ionisé > 1,1 mmol/L (transfusion massive)" },
      { label: "Fibrinogène > 1,5–2 g/L (hémorragie)" },
      { label: "FIBTEM A5 ≥ 8–10 mm (hémorragie)" },
      { label: "ACT > 480 s (CEC)" },
      { label: "ACT 200–300 s (clampage vasculaire)" },
    ],
  },
  {
    id: "analgesia",
    label: "Réveil",
    items: [{ label: "EVA ≤ 3 au réveil", hint: "Manuel 2020, chap. 25" }, { label: "Extubation éveillée" }, { label: "Extubation en anesthésie profonde" }, { label: "Extubation au bloc, sur table" }, { label: "Ventilation postopératoire prévue" }],
  },
];

export const MATERIAL_GROUPS: CatalogGroup[] = [
  {
    id: "standard",
    label: "Monitorage de base",
    items: [{ label: "ECG" }, { label: "ECG 5 dérivations avec analyse du ST" }, { label: "SpO₂" }, { label: "PNI" }, { label: "EtCO₂" }, { label: "Température centrale" }, { label: "Curarimètre (TOF)" }, { label: "BIS / profondeur d'anesthésie" }],
  },
  {
    id: "invasive",
    label: "Monitorage avancé",
    items: [
      { label: "Cathéter artériel" },
      { label: "Voie veineuse centrale" },
      { label: "Monitorage du débit cardiaque" },
      { label: "Contour de pouls (FloTrac, ProAQT)" },
      { label: "Thermodilution transpulmonaire (PiCCO)" },
      { label: "Cathéter artériel pulmonaire (Swan-Ganz)" },
      { label: "Doppler œsophagien" },
      { label: "ETO" },
      { label: "ScvO₂ (gaz veineux central)" },
      { label: "NIRS cérébrale" },
      { label: "Pression intracrânienne" },
      { label: "Potentiels évoqués (moteurs, somesthésiques)" },
      { label: "Sonde urinaire" },
      { label: "Sonde gastrique" },
    ],
  },
  {
    id: "access",
    label: "Abords",
    items: [{ label: "1 VVP 18G" }, { label: "2 VVP de gros calibre (16–14G)" }, { label: "Cathéter d'hémodialyse / désilet de remplissage" }, { label: "Aiguille intra-osseuse à disposition" }, { label: "Échographe pour l'abord vasculaire" }],
  },
  {
    id: "airway",
    label: "Voies aériennes",
    items: [
      { label: "Vidéolaryngoscope" },
      { label: "Mandrin / bougie" },
      { label: "Masque laryngé de 2e génération" },
      { label: "Fibroscope" },
      { label: "Sonde double lumière" },
      { label: "Bloqueur bronchique" },
      { label: "Sonde armée" },
      { label: "Sonde préformée (RAE)" },
      { label: "Sonde laser" },
      { label: "Manomètre de ballonnet" },
      { label: "Oxygénation nasale à haut débit" },
      { label: "Kit de cricothyroïdotomie" },
    ],
  },
  {
    id: "protection",
    label: "Protection et confort",
    items: [{ label: "Réchauffeur à air pulsé" }, { label: "Réchauffeur de solutés" }, { label: "Protection des points d'appui" }, { label: "Protection oculaire" }, { label: "Compression pneumatique intermittente" }, { label: "Garrot" }, { label: "Matelas coquille / appui de position" }],
  },
  {
    id: "blood",
    label: "Sang et hémostase",
    items: [{ label: "Groupe et RAI" }, { label: "CGR réservés" }, { label: "Cell saver" }, { label: "Accélérateur-réchauffeur de perfusion" }, { label: "Test viscoélastique (ROTEM/TEG)" }, { label: "ACT au bloc" }, { label: "Fibrinogène et CCP à disposition" }],
  },
  {
    id: "drugs",
    label: "Médicaments à préparer",
    items: [{ label: "Noradrénaline en seringue" }, { label: "Adrénaline diluée (10 µg/mL)" }, { label: "Phényléphrine diluée" }, { label: "Sugammadex à disposition" }, { label: "Dantrolène à disposition" }, { label: "Intralipide 20 % à portée" }, { label: "Aimant (pacemaker, défibrillateur)" }],
  },
  {
    id: "regional",
    label: "ALR",
    items: [{ label: "Échographe" }, { label: "Neurostimulateur" }, { label: "Intralipide 20 % à portée" }],
  },
];

/** Positions of the patient, in the order they are usually used. */
export const POSITIONS: { label: string; hint: string }[] = [
  { label: "Décubitus dorsal", hint: "Bras < 90°, points d'appui (coudes, talons, occiput)" },
  { label: "Décubitus latéral droit", hint: "Billot axillaire, bras, œil et oreille inférieurs" },
  { label: "Décubitus latéral gauche", hint: "Billot axillaire, bras, œil et oreille inférieurs" },
  { label: "Décubitus ventral", hint: "Yeux (cécité), visage, seins, organes génitaux, abdomen libre" },
  { label: "Lithotomie (position gynécologique)", hint: "Nerf fibulaire, syndrome des loges si prolongée" },
  { label: "Trendelenburg", hint: "Œdème facial et cérébral, pression intraoculaire, ventilation" },
  { label: "Proclive (anti-Trendelenburg)", hint: "Hypotension (retour veineux)" },
  { label: "Semi-assis (beach chair)", hint: "Hypoperfusion cérébrale : PA mesurée au niveau du cerveau" },
  { label: "Assis", hint: "Embolie gazeuse (foramen ovale perméable)" },
  { label: "Table orthopédique", hint: "Périnée, membre controlatéral" },
  { label: "Genu-pectoral", hint: "Comme le ventral : yeux, abdomen libre" },
];

/** A frequent risk with what to know about it, ready to add to a plan. */
export interface RiskTemplate extends ProtocolRisk {
  id: string;
  /** Words it is proposed by (plan techniques, antecedents, surgery). */
  words: string[];
}

export const RISK_LIBRARY: RiskTemplate[] = [
  {
    id: "spinal_hypotension",
    title: "Hypotension après rachianesthésie",
    words: ["rachi", "neuraxial", "cesarienne", "peridurale"],
    why: "Bloc sympathique : vasodilatation et baisse du retour veineux ; bradycardie si le bloc monte au-dessus de T4.",
    prevention: "Remplissage pendant la ponction, vasopresseur préparé, décubitus latéral gauche chez la femme enceinte.",
    conduct: "Phényléphrine 50–100 µg ou éphédrine 5–10 mg en bolus, remplissage, Trendelenburg ; atropine si bradycardie.",
    source: "Manuel 2020, chap. 13 et 23",
    crisis: "hypotension",
  },
  {
    id: "induction_hypotension",
    title: "Hypotension à l'induction",
    words: ["general", "age", "iec", "ara", "hypovolemie"],
    why: "Hypnotiques vasodilatateurs, sujet âgé, IEC/ARA II le matin, hypovolémie ou jeûne prolongé.",
    prevention: "Doses titrées (poids maigre chez l'obèse), vasopresseur prêt, remplissage si jeûne prolongé.",
    conduct: "Éphédrine 5–10 mg ou phényléphrine 50–100 µg ; noradrénaline si persistante.",
    source: "Manuel 2020, chap. 23",
    crisis: "hypotension",
  },
  {
    id: "ponv",
    title: "Nausées et vomissements postopératoires",
    words: ["apfel", "nvpo", "strabisme", "amygdale", "coelioscopie"],
    why: "Facteurs d'Apfel (femme, non-fumeur, antécédent, opioïdes) ; chirurgie du strabisme, de l'oreille, de l'amygdale ; halogénés, N₂O.",
    prevention: "Propofol plutôt qu'halogénés, pas de N₂O ; dexaméthasone 4–8 mg à l'induction, ondansétron 4 mg 30 min avant la fin.",
    conduct: "Corriger hypotension, hypoxie, douleur ; ondansétron 4 mg, dropéridol 0,5–1,25 mg si PAS > 100 mmHg.",
    source: "Manuel 2020, chap. 23",
  },
  {
    id: "hypothermia",
    title: "Hypothermie",
    words: ["long", "abdomen", "age", "enfant", "brule"],
    why: "Redistribution de 1–2 °C la première heure d'anesthésie générale, puis pertes (radiation, convection) ; plus rapide chez l'enfant et le sujet âgé.",
    prevention: "Réchauffer avant l'induction, air pulsé, solutés réchauffés, patient couvert, température monitorée.",
    conduct: "Augmenter le réchauffement ; surveiller saignement, réveil retardé et frissons.",
    source: "Manuel 2020, chap. 23",
    crisis: "hypothermia",
  },
  {
    id: "bronchospasm",
    title: "Bronchospasme",
    words: ["asthme", "bpco", "tabac", "bronch"],
    why: "Voies aériennes réactives (asthme, BPCO, infection récente) irritées par l'intubation, une anesthésie trop légère, des sécrétions.",
    prevention: "Bronchodilatateur avant l'induction, anesthésie assez profonde avant l'intubation, masque laryngé si possible, sévoflurane.",
    conduct: "FiO₂ 100 %, approfondir, salbutamol, adrénaline si sévère (fiche de crise).",
    source: "Manuel 2020, chap. 23",
    crisis: "bronchospasm",
  },
  {
    id: "laryngospasm",
    title: "Laryngospasme",
    words: ["enfant", "orl", "amygdale", "infection", "vas"],
    why: "Irritation glottique sous anesthésie légère : enfant, infection des voies aériennes, chirurgie endobuccale ou endonasale.",
    prevention: "Anesthésie assez profonde, aspiration avant l'extubation, extubation profonde ou complètement réveillé.",
    conduct: "FiO₂ 100 %, subluxation, pression positive douce, propofol, suxaméthonium à petite dose (fiche de crise).",
    source: "Manuel 2020, chap. 23",
    crisis: "laryngospasm",
  },
  {
    id: "difficult_airway",
    title: "Intubation difficile",
    words: ["intubation difficile", "mallampati", "el-ganzouri", "obese", "orl"],
    why: "Critères prédictifs (El-Ganzouri ≥ 4, Mallampati III–IV, ouverture de bouche réduite) ou antécédent connu.",
    prevention: "Préoxygénation, vidéolaryngoscope et dispositif supraglottique prêts, plan A-B-C-D annoncé à l'équipe ; intubation vigile si ventilation au masque aussi difficile.",
    conduct: "Plans DAS : 3 + 1 laryngoscopies, supraglottique, masque, cricothyroïdotomie (fiche de crise).",
    source: "DAS 2015 (PMID 26556848)",
    crisis: "cant_intubate",
  },
  {
    id: "aspiration",
    title: "Inhalation (estomac plein)",
    words: ["urgence", "estomac plein", "occlusion", "glp", "grossesse", "reflux"],
    why: "Jeûne insuffisant, occlusion, grossesse, gastroparésie, agoniste du GLP-1 : régurgitation à l'induction.",
    prevention: "Induction à séquence rapide, aspiration prête, tête surélevée ; échographie gastrique si doute.",
    conduct: "Tête basse et aspiration, intubation, FiO₂ 100 %, aspiration trachéale avant de ventiler ; surveiller l'hypoxémie.",
    source: "Manuel 2020, chap. 23 (hypoxémie : inhalation)",
    crisis: "hypoxaemia",
  },
  {
    id: "bleeding",
    title: "Saignement important",
    words: ["hemorragique", "saignement", "prothese", "rachis", "foie", "vasculaire"],
    why: "Chirurgie à risque hémorragique élevé, anticoagulant ou antiagrégant, coagulopathie.",
    prevention: "Groupe et RAI, CGR réservés, 2 voies de gros calibre, acide tranexamique si indiqué, réchauffeur, cell saver.",
    conduct: "Prévenir le chirurgien, protocole de transfusion massive, fibrinogène, calcium, normothermie (fiche de crise).",
    source: "Manuel 2020, chap. 35",
    crisis: "haemorrhage",
  },
  {
    id: "last",
    title: "Toxicité des anesthésiques locaux",
    words: ["alr", "bloc", "peridurale", "anesthesique local", "infiltration"],
    why: "Dose totale élevée (doses toxiques additives), injection intravasculaire, site très vascularisé.",
    prevention: "Respecter la dose maximale, échoguidage, aspiration et injection fractionnée, dose test adrénalinée pour un cathéter, intralipide à portée.",
    conduct: "Arrêter l'injection, oxygène, benzodiazépine si convulsions, intralipide 20 % (fiche de crise).",
    source: "Manuel 2020, chap. 12",
    crisis: "last",
  },
  {
    id: "anaphylaxis",
    title: "Anaphylaxie",
    words: ["allergie", "curare", "antibiotique", "latex", "chlorhexidine"],
    why: "Curares (50–70 %), antibiotiques, latex, chlorhexidine, colloïdes, bleu patenté, sugammadex.",
    prevention: "Allergie connue : éviction du produit (et du latex), antibiotique injecté lentement, patient éveillé si possible.",
    conduct: "Arrêter le produit, adrénaline 100–200 µg IV, remplissage, tryptase (fiche de crise).",
    source: "Manuel 2020, chap. 23",
    crisis: "anaphylaxis",
  },
  {
    id: "hyperkalaemia",
    title: "Hyperkaliémie",
    words: ["dialyse", "insuffisance renale", "suxamethonium", "transfusion", "garrot"],
    why: "Insuffisance rénale, suxaméthonium (+ 0,5 mmol/L), transfusion massive, rhabdomyolyse, levée de garrot.",
    prevention: "Kaliémie préopératoire, éviter le suxaméthonium si K⁺ élevé, dialyse la veille si besoin.",
    conduct: "Calcium 10 % 10–20 mL, insuline 20 UI + glucose 20 % (fiche de crise).",
    source: "Manuel 2020, chap. 32",
    crisis: "hyperkalaemia",
  },
  {
    id: "gas_embolism",
    title: "Embolie gazeuse",
    words: ["assis", "coelioscopie", "neurochirurgie", "fosse posterieure"],
    why: "Site opératoire au-dessus du cœur (position assise), insufflation de CO₂, sinus veineux ouverts.",
    prevention: "Recherche d'un foramen ovale perméable avant la position assise, capnographie, pas de N₂O.",
    conduct: "Inonder le champ, exsuffler, FiO₂ 100 %, décubitus latéral gauche (fiche de crise).",
    source: "Manuel 2020, chap. 19 et 27",
    crisis: "gas_embolism",
  },
  {
    id: "mh",
    title: "Hyperthermie maligne",
    words: ["hyperthermie maligne", "myopathie", "central core", "ryr1"],
    why: "Susceptibilité génétique (RYR1, certaines myopathies) : crise sous halogénés ou suxaméthonium.",
    prevention: "Patient susceptible : pas d'halogénés ni de suxaméthonium, circuit rincé (20 min à 10 L/min), vaporisateurs retirés, dantrolène disponible.",
    conduct: "Arrêter l'halogéné, hyperventiler, dantrolène 2,5 mg/kg (fiche de crise).",
    source: "Manuel 2020, chap. 23",
    crisis: "mh",
  },
  {
    id: "delayed_awakening",
    title: "Réveil retardé",
    words: ["age", "insuffisance renale", "insuffisance hepatique", "reveil retarde"],
    why: "Surdosage ou accumulation (insuffisance rénale ou hépatique, âge), curarisation résiduelle, hypothermie, troubles métaboliques, AVC.",
    prevention: "Doses adaptées, curares monitorés, normothermie, glycémie.",
    conduct: "TOF, ventilation, température, glycémie, naloxone, flumazénil, scanner si rien (fiche de crise).",
    source: "Manuel 2020, chap. 23",
    crisis: "delayed_awakening",
  },
];

/** Risks of the library that look relevant to a plan (by its words). */
export function suggestedRisks(context: string, already: ProtocolRisk[]): RiskTemplate[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const text = fold(context);
  const have = new Set(already.map((r) => fold(r.title)));
  return RISK_LIBRARY.filter((r) => !have.has(fold(r.title)) && r.words.some((w) => text.includes(fold(w))));
}
