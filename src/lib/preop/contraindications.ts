// Contraindications of what an anaesthesia plan uses — techniques, airway
// devices, gases, positions and equipment — recalled on the procedure sheet
// next to the phase that uses them (« masque laryngé » → its
// contraindications). The drugs' own come from drug-reference.ts (cautions).
// Each card names its sources: the reference textbook supplied by the user
// (Manuel pratique d'anesthésie 2020, chapter given) and the guidelines of
// guideline-refs.ts, checked on PubMed.

import type { GuidelineId } from "./guideline-refs";
import type { DrugReference } from "./drug-reference";

export type CiKind = "technique" | "airway" | "drug" | "gas" | "position" | "equipment";

export interface CiCard {
  id: string;
  title: string;
  kind: CiKind;
  /** Contraindications (absolute when the source says so). */
  absolute: string[];
  /** Relative contraindications, or situations calling for caution. */
  relative: string[];
  /** Heading of the relative list (« Contre-indications relatives » by default). */
  relativeLabel?: string;
  /** Limits and settings to use it safely. */
  notes: string[];
  refs: GuidelineId[];
  /** Chapter of the manual, when it is one of the refs. */
  chapter?: string;
}

const card = (c: Omit<CiCard, "relative" | "notes"> & Partial<Pick<CiCard, "relative" | "notes">>): CiCard => ({ relative: [], notes: [], ...c });

export const CI_CARDS = {
  // --- Techniques -------------------------------------------------------------------------------------
  neuraxial: card({
    id: "neuraxial",
    title: "Rachianesthésie, péridurale",
    kind: "technique",
    absolute: [
      "Refus du patient",
      "Coagulopathie : TP < 50 % ou INR > 1,5, TCA > 40 s, plaquettes < 50 G/L",
      "Anticoagulant ou antiagrégant puissant récent : délais d'arrêt et de reprise à respecter (ponction et retrait du cathéter)",
      "Infection au point de ponction",
      "Sepsis",
    ],
    relative: [
      "TP 50–75 % ou INR 1,3–1,5, TCA 35–40 s, plaquettes 50–100 G/L : à nuancer selon le bénéfice, le terrain et la chirurgie",
      "Rachianesthésie en injection unique : hypertension intracrânienne, sténose aortique sévère, cardiomyopathie hypertrophique obstructive — une rachianesthésie continue (installation lente) peut remplacer l'AG",
    ],
    notes: [
      "Bloc sympathique : hypotension, bradycardie si le niveau dépasse T4 — remplissage et vasopresseur prêts",
      "Obstétrique : risque d'hématome très faible si plaquettes ≥ 70 G/L (thrombopénie gestationnelle, PTI, HTA gravidique) sans autre facteur de risque",
      "Antithrombotiques : délais selon la molécule, la dose (« faible » ou « élevée ») et la fonction rénale ; un dosage spécifique peut guider certains délais",
    ],
    refs: ["manual", "alrEsaic2022", "alrAsra2025", "platelets2021"],
    chapter: "chap. 13",
  }),
  deepBlock: card({
    id: "deepBlock",
    title: "Bloc périphérique profond (non compressible)",
    kind: "technique",
    absolute: ["Refus du patient", "Infection au point de ponction", "Coagulopathie sévère ou antithrombotique récent : mêmes délais qu'une ponction neuraxiale (plexus lombaire, paravertébral, infraclaviculaire…)"],
    relative: ["Neuropathie préexistante : la documenter avant", "Troubles modérés de l'hémostase : rapport bénéfice/risque"],
    notes: [
      "Doses d'anesthésiques locaux : elles s'additionnent entre produits et sites ; échoguidage, aspirations répétées, injection fractionnée",
      "Toxicité systémique : arrêter l'injection, oxygène, benzodiazépine si convulsions, émulsion lipidique 20 % (aide-mémoire de crise)",
    ],
    refs: ["manual", "alrEsaic2022", "last2020"],
    chapter: "chap. 12 et 13",
  }),
  superficialBlock: card({
    id: "superficialBlock",
    title: "Bloc périphérique superficiel (compressible)",
    kind: "technique",
    absolute: ["Refus du patient", "Infection au point de ponction"],
    relative: ["Neuropathie préexistante : la documenter avant"],
    notes: [
      "Antithrombotiques : les délais d'arrêt ne s'appliquent pas aux blocs superficiels compressibles (fémoral, axillaire, poplité, TAP, gaine des droits)",
      "Doses d'anesthésiques locaux cumulées (infiltration comprise) ; émulsion lipidique 20 % disponible",
    ],
    refs: ["alrEsaic2022", "last2020"],
  }),
  interscalene: card({
    id: "interscalene",
    title: "Bloc interscalénique ou supraclaviculaire",
    kind: "technique",
    absolute: [],
    relative: ["Réserve respiratoire basse (BPCO sévère, obésité morbide, insuffisance respiratoire)", "Paralysie phrénique ou récurrentielle controlatérale, pneumonectomie controlatérale"],
    notes: [
      "Parésie hémidiaphragmatique fréquente : volume et dose réduits, injection plus à distance des racines C5–C6",
      "Alternatives épargnant le nerf phrénique : bloc suprascapulaire ± nerf axillaire",
    ],
    refs: ["phrenic2017"],
  }),
  ivra: card({
    id: "ivra",
    title: "Anesthésie locorégionale intraveineuse (Bier)",
    kind: "technique",
    absolute: ["Fistule artérioveineuse", "Artériopathie ou chirurgie vasculaire du membre", "Drépanocytose", "Sepsis, infection du membre (efficacité diminuée)"],
    notes: ["Garrot double vérifié, jamais lâché trop tôt : fuite d'anesthésique local dans la circulation (toxicité)"],
    refs: ["manual"],
    chapter: "chap. 13",
  }),
  sedation: card({
    id: "sedation",
    title: "Sédation en ventilation spontanée",
    kind: "technique",
    absolute: [],
    relative: ["Estomac plein : voies aériennes non protégées", "SAOS : risque respiratoire accru sous propofol ; benzodiazépines IV avec prudence", "Voies aériennes difficiles prévisibles, patient non coopérant, geste long ou douloureux"],
    notes: ["Capnographie obligatoire pendant une sédation", "Plan de conversion en anesthésie générale et matériel des voies aériennes prêts"],
    refs: ["monitoring2021", "osa2018"],
  }),

  // --- Airway ---------------------------------------------------------------------------------------
  lma: card({
    id: "lma",
    title: "Masque laryngé (dispositif supraglottique)",
    kind: "airway",
    absolute: [
      "Pathologie pharyngée (abcès amygdalien, tumeur)",
      "Obstruction des voies aériennes supérieures (corps étranger)",
      "Estomac plein : grossesse au-delà du 1er trimestre, hernie hiatale, reflux gastro-œsophagien, pathologie abdominale aiguë, urgence",
    ],
    relative: ["Résistances des voies aériennes augmentées (asthme mal contrôlé, bronchospasme)", "Compliance pulmonaire diminuée (obésité)"],
    relativeLabel: "À éviter si les pressions d'insufflation dépassent 20 cmH₂O",
    notes: [
      "Ne protège pas contre la régurgitation ni l'inhalation ; ventilation contrôlée possible tant que les pressions restent < 20 cmH₂O (au-delà : insufflation gastrique)",
      "Préférer un dispositif de 2e génération (canal gastrique, meilleure étanchéité)",
      "Taille selon le poids : 3 (30–50 kg), 4 (50–70 kg), 5 (70–100 kg), 6 (> 100 kg)",
    ],
    refs: ["manual", "das2015"],
    chapter: "chap. 17",
  }),
  rsi: card({
    id: "rsi",
    title: "Induction en séquence rapide",
    kind: "airway",
    absolute: [],
    relative: [],
    notes: [
      "Indications : estomac plein (urgence, douleur importante, occlusion), hernie hiatale ou reflux symptomatique, grossesse au-delà de 12–15 semaines, anneau gastrique mal placé",
      "Curare d'action rapide : succinylcholine 1 mg/kg ou rocuronium 0,9–1,2 mg/kg (sugammadex 16 mg/kg prêt)",
      "Préoxygénation jusqu'à FeO₂ ≥ 0,9, pas de ventilation au masque sauf désaturation (douce), aspiration prête ; manœuvre de Sellick relâchée si elle gêne",
    ],
    refs: ["manual", "nmbEsaic2023", "das2015"],
    chapter: "chap. 8, 17 et 44",
  }),
  nasalIntubation: card({
    id: "nasalIntubation",
    title: "Intubation nasotrachéale",
    kind: "airway",
    absolute: ["Trouble majeur de l'hémostase", "Fracture de la base du crâne"],
    notes: ["Narine la plus perméable, vasoconstricteur local ; sonde nasale préformée"],
    refs: ["manual"],
    chapter: "chap. 17",
  }),
  awakeIntubation: card({
    id: "awakeIntubation",
    title: "Intubation vigile au fibroscope",
    kind: "airway",
    absolute: ["Refus ou impossibilité de coopérer"],
    relative: ["Saignement des voies aériennes", "Urgence après échec de la laryngoscopie (technique délicate)"],
    notes: ["Opérateur expérimenté ; anesthésie topique (dose de lidocaïne surveillée), sédation légère, oxygénation à haut débit tout au long"],
    refs: ["manual", "airwayAsa2022"],
    chapter: "chap. 17",
  }),

  // --- Gases ----------------------------------------------------------------------------------------
  volatile: card({
    id: "volatile",
    title: "Halogénés (sévoflurane)",
    kind: "gas",
    absolute: ["Hyperthermie maligne (susceptibilité connue ou suspectée) : anesthésie sans halogéné ni succinylcholine", "Hypertension intracrânienne (vasodilatation cérébrale, surtout aux fortes concentrations)"],
    notes: [
      "CAM diminuée chez le sujet âgé ; potentialisent les curares",
      "Bas débit de gaz frais ; pas de desflurane ni de N₂O en routine (impact climatique)",
      "L'insuffisance rénale n'est pas une contre-indication au sévoflurane pour de nombreux auteurs",
    ],
    refs: ["manual", "mh2021"],
    chapter: "chap. 4",
  }),
  n2o: card({
    id: "n2o",
    title: "Protoxyde d'azote",
    kind: "gas",
    absolute: [
      "Chirurgie tympanique",
      "Hypertension intracrânienne",
      "Hypertension artérielle pulmonaire",
      "Chirurgie à risque d'embolie gazeuse",
      "Pneumothorax",
      "Iléus, occlusion",
      "Gaz intraoculaire (vitrectomie récente ou prévue)",
    ],
    relative: ["Carence en vitamine B12 (inactivation de la vitamine B12)", "Risque élevé de NVPO"],
    notes: ["Diffuse dans les cavités closes (expansion, ballonnet de la sonde) ; hypoxie de diffusion à l'arrêt : FiO₂ 100 % quelques minutes", "Gaz de tamponnement intraoculaire : contre-indiqué tant que la bulle persiste (5 à 35 jours selon le gaz)"],
    refs: ["manual"],
    chapter: "chap. 4, 23 et 38",
  }),

  // --- Positions and approach ------------------------------------------------------------------------
  laparoscopy: card({
    id: "laparoscopy",
    title: "Pneumopéritoine (cœlioscopie, robot)",
    kind: "position",
    absolute: ["Hypertension intracrânienne"],
    relative: ["Insuffisance cardiaque", "Insuffisance rénale", "Foramen ovale perméable", "Hypovolémie", "Dérivation ventriculopéritonéale", "Tumeur du système nerveux central"],
    notes: [
      "Pression intra-abdominale la plus basse qui permet l'exposition, sans dépasser 12–15 mmHg",
      "EtCO₂ obligatoire ; gazométrie si cardiopathie ou pneumopathie ; péritonite et cancer ne contre-indiquent pas la cœlioscopie",
      "Embolie de CO₂ : chute de l'EtCO₂, hypotension, hypoxémie — exsuffler, FiO₂ 100 %, décubitus latéral gauche",
    ],
    refs: ["manual", "pneumoperitoneum2002"],
    chapter: "chap. 30",
  }),
  trendelenburg: card({
    id: "trendelenburg",
    title: "Trendelenburg marqué",
    kind: "position",
    absolute: [],
    relative: ["Hypertension intracrânienne", "Glaucome (pression intraoculaire augmentée)", "Réserve respiratoire basse, obésité (capacité résiduelle fonctionnelle et compliance diminuées)"],
    relativeLabel: "Prudence",
    notes: ["Bras le long du corps (plexus brachial), yeux protégés, épaulières évitées ; œdème facial et laryngé si prolongé"],
    refs: ["manual"],
    chapter: "chap. 19 et 30",
  }),
  prone: card({
    id: "prone",
    title: "Décubitus ventral",
    kind: "position",
    absolute: [],
    relative: ["Instabilité hémodynamique (compression abdominale, retour veineux diminué)", "Obésité (compliance thoracopulmonaire diminuée)"],
    relativeLabel: "Prudence",
    notes: [
      "Abdomen libre (alèses sous le thorax et les crêtes iliaques), yeux sans compression (ischémie rétinienne, cécité), plexus brachiaux, seins, organes génitaux",
      "Câbles et électrodes hors des zones d'appui ; test de fuite avant l'extubation (œdème des voies aériennes)",
    ],
    refs: ["manual"],
    chapter: "chap. 19",
  }),
  sitting: card({
    id: "sitting",
    title: "Position assise (neurochirurgie)",
    kind: "position",
    absolute: [],
    relative: ["Foramen ovale perméable (embolie paradoxale) : à rechercher par échographie avant", "Instabilité hémodynamique (retour veineux diminué)"],
    notes: [
      "Embolie gazeuse : Doppler précordial ou ETO ; chute de l'EtCO₂ = embolie jusqu'à preuve du contraire (inonder le champ, FiO₂ 100 %, compression jugulaire)",
      "Pneumencéphale : protoxyde d'azote arrêté avant la fermeture de la dure-mère",
    ],
    refs: ["manual"],
    chapter: "chap. 19",
  }),
  beachChair: card({
    id: "beachChair",
    title: "Position semi-assise (« beach chair »)",
    kind: "position",
    absolute: [],
    relative: ["Hypotension, hypovolémie, sténose carotidienne serrée : hypoperfusion cérébrale"],
    relativeLabel: "Prudence",
    notes: ["Pression artérielle mesurée ou corrigée au niveau du cerveau (hauteur hydrostatique) ; hypotension contrôlée à éviter"],
    refs: [],
  }),
  lithotomy: card({
    id: "lithotomy",
    title: "Lithotomie (position gynécologique)",
    kind: "position",
    absolute: [],
    relative: [],
    notes: [
      "Précharge augmentée à la montée des jambes, hypotension au retour : les deux jambes ensemble, lentement",
      "Nerfs sciatique, fémoral, saphène et fibulaire commun : flexion de hanche ≤ 90°, pas d'appui contre les tiges ; syndrome des loges si prolongée",
      "Capacité vitale diminuée, risque d'inhalation augmenté",
    ],
    refs: ["manual"],
    chapter: "chap. 19",
  }),
  lateral: card({
    id: "lateral",
    title: "Décubitus latéral",
    kind: "position",
    absolute: [],
    relative: [],
    notes: ["Billot sous le creux axillaire inférieur, pouls radiaux vérifiés, pas de traction sur l'épaule supérieure", "Rapport ventilation/perfusion modifié ; embolie gazeuse si le champ est au-dessus du cœur"],
    refs: ["manual"],
    chapter: "chap. 19",
  }),

  // --- Equipment ------------------------------------------------------------------------------------
  tourniquet: card({
    id: "tourniquet",
    title: "Garrot pneumatique",
    kind: "equipment",
    absolute: ["Artériopathie sévère", "Pontage vasculaire périphérique", "Fistule artérioveineuse", "Thrombose veineuse", "Drépanocytose", "Lésions cutanées", "Neuropathie périphérique"],
    notes: [
      "Pression : membre supérieur PAS + 70–100 mmHg, inférieur PAS + 100–150 mmHg (350 au maximum)",
      "Durée ≤ 120 min (sinon lâcher 5–20 min) ; dégonfler après la fermeture cutanée ; antibioprophylaxie 5–15 min avant le gonflage",
      "Gonflage : + 400–500 ml de volémie (cuisse) ; lâchage : hypotension, K⁺, lactates et EtCO₂ en hausse, température en baisse, emboles",
    ],
    refs: ["manual"],
    chapter: "chap. 40",
  }),
  arterialLine: card({
    id: "arterialLine",
    title: "Cathéter artériel radial",
    kind: "equipment",
    absolute: ["Arcade palmaire insuffisante (test d'Allen) : risque d'ischémie de la main", "Bras porteur d'une fistule artérioveineuse"],
    relative: ["Infection au point de ponction"],
    notes: ["Test d'Allen peu sensible : variante à l'oxymètre de pouls possible"],
    refs: ["manual"],
    chapter: "chap. 2 et 31",
  }),
  centralLine: card({
    id: "centralLine",
    title: "Voie veineuse centrale",
    kind: "equipment",
    absolute: ["Infection locale", "Thrombus ou tumeur rénale étendue à l'oreillette droite", "Végétations tricuspidiennes"],
    relative: ["Sous-clavière : troubles sévères de l'hémostase (non compressible)", "Jugulaire interne après endartériectomie carotidienne : seulement sous échographie"],
    notes: ["Échoguidage ; radiographie ou échographie de contrôle (pneumothorax, position)"],
    refs: ["manual"],
    chapter: "chap. 2",
  }),
  airwayLaser: card({
    id: "airwayLaser",
    title: "Laser ou bistouri électrique sur les voies aériennes",
    kind: "equipment",
    absolute: [],
    relative: [],
    notes: [
      "Risque de feu : FiO₂ la plus basse possible (≤ 0,3 si l'oxygénation le permet), pas de N₂O, sonde résistante au laser, ballonnet rempli de sérum coloré",
      "Feu : arrêter le gaz, retirer la sonde, sérum dans le champ, ventiler au masque, puis bronchoscopie",
    ],
    refs: ["fire2013"],
  }),
} satisfies Record<string, CiCard>;

export type CiCardId = keyof typeof CI_CARDS;

const CAUTION_LEVELS = { contraindicated: "absolute", relative: "relative", adapt: "adapt" } as const;

/**
 * A drug's contraindications from the reference (drug-reference.ts) as a
 * card: « contre-indiqué » and « à éviter » lines, then what to adapt.
 */
export function drugCiCard(ref: DrugReference): CiCard & { adapt: string[] } {
  const out = { absolute: [] as string[], relative: [] as string[], adapt: [] as string[] };
  for (const c of ref.cautions) {
    const level = CAUTION_LEVELS[c.level];
    const text = c.text.charAt(0).toUpperCase() + c.text.slice(1);
    if (!out[level].includes(text)) out[level].push(text);
  }
  return { id: `drug-${ref.name}`, title: ref.name, kind: "drug", ...out, notes: [], refs: ["manual"], chapter: ref.chapter };
}
