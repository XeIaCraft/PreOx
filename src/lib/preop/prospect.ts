// Procedure-specific postoperative pain management — the PROSPECT
// recommendations of the European Society of Regional Anaesthesia (ESRA),
// the most recent version of each, summarised from the published abstracts
// (PubMed identifiers given; read the full text before changing a protocol).
// Each recommendation is linked to the catalogue entries it applies to.

import type { SurgeryItem } from "./catalog";
import type { PostopAnalgesia } from "./postop";

export interface ProspectRecommendation {
  id: string;
  title: string;
  year: number;
  pmid: string;
  /** Basic analgesia, given before or during surgery and continued. */
  basic: string[];
  /** Regional or local techniques recommended, first choice first. */
  regional: string[];
  /** Other recommended adjuncts. */
  adjuncts?: string[];
  /** What the surgeon can do. */
  surgical?: string[];
  /** Explicitly not recommended (inefficacy or risks). */
  notRecommended?: string[];
  /** Post-operative analgesia to tick (postop.ts). */
  postop: PostopAnalgesia[];
  note?: string;
}

const RESCUE = "Opioïdes en secours seulement.";

export const PROSPECT: ProspectRecommendation[] = [
  {
    id: "tha",
    title: "Prothèse totale de hanche",
    year: 2026,
    pmid: "42473710",
    basic: ["Paracétamol et AINS (ou anti-COX-2) programmés", "Dexaméthasone IV ≤ 10 mg, dose unique"],
    regional: ["Bloc fascia iliaca supra-inguinal ou bloc PENG préopératoire (techniques préférées)", "Infiltration locale (LIA) en injection unique si ALR impossible"],
    adjuncts: ["Morphine intrathécale 0,1 mg envisageable avec une rachianesthésie chez le patient hospitalisé"],
    notRecommended: ["Bloc du carré des lombes et ESP lombaire (efficacité inconstante, faiblesse motrice)", "Péridurale, bloc fémoral, bloc du plexus lombaire, gabapentinoïdes (version 2021)"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "tka",
    title: "Prothèse totale de genou",
    year: 2022,
    pmid: "35852550",
    basic: ["Paracétamol et AINS (ou anti-COX-2)", "Dexaméthasone IV peropératoire, dose unique"],
    regional: ["Bloc du canal des adducteurs en injection unique", "Et infiltration périarticulaire (LIA)"],
    adjuncts: ["Morphine intrathécale 100 µg seulement si bloc et LIA impossibles, patient hospitalisé"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "rotator_cuff",
    title: "Réparation de la coiffe des rotateurs",
    year: 2019,
    pmid: "31392721",
    basic: ["Paracétamol, AINS", "Dexaméthasone IV"],
    regional: ["Bloc interscalénique, ou bloc suprascapulaire (± nerf axillaire)"],
    surgical: ["Voie arthroscopique"],
    notRecommended: ["Adjuvants périnerveux, gabapentine : preuves limitées"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "hallux_valgus",
    title: "Hallux valgus",
    year: 2025,
    pmid: "41122054",
    basic: ["Paracétamol et AINS (ou anti-COX-2)", "Dexaméthasone systémique"],
    regional: ["Bloc de cheville en premier choix", "Infiltration de la plaie en alternative"],
    surgical: ["Chirurgie mini-invasive ou ostéotomie percutanée plutôt qu'ouverte"],
    notRecommended: ["Bloc sciatique poplité continu, bloc du compartiment plantaire : pas de preuve"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "complex_spine",
    title: "Chirurgie complexe du rachis (arthrodèse)",
    year: 2021,
    pmid: "34397527",
    basic: ["Paracétamol et anti-COX-2 ou AINS, poursuivis après"],
    regional: ["Péridurale (anesthésique local ± opioïde)"],
    adjuncts: ["Kétamine IV peropératoire"],
    notRecommended: ["Méthadone peropératoire (sécurité)", "Infiltration, opioïdes intrathécaux ou périduraux, ESP, TLIP, lidocaïne IV, dexmédétomidine, gabapentine : preuves limitées"],
    postop: ["paracetamol", "nsaid", "ketamine"],
  },
  {
    id: "laminectomy",
    title: "Laminectomie lombaire (1–2 niveaux)",
    year: 2020,
    pmid: "33247353",
    basic: ["Paracétamol et AINS ou anti-COX-2, avant ou pendant, poursuivis après"],
    regional: ["Instillation ou infiltration de la plaie avant la fermeture"],
    notRecommended: ["Gabapentinoïdes et opioïdes intrathécaux (efficaces mais risqués)"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "lap_chole",
    title: "Cholécystectomie par cœlioscopie",
    year: 2024,
    pmid: "39129451",
    basic: ["Paracétamol et AINS (ou anti-COX-2), avant ou pendant", "Dexaméthasone IV peropératoire"],
    regional: ["Infiltration des orifices de trocart ou instillation intrapéritonéale d'anesthésique local", "ESP ou TAP en seconde ligne si risque de douleur élevé"],
    surgical: ["3 trocarts, pneumopéritoine à basse pression, extraction ombilicale, exsufflation active, lavage au sérum"],
    notRecommended: ["Rachianesthésie ou péridurale, gabapentinoïdes, lidocaïne, kétamine, dexmédétomidine IV (effets indésirables)", "Carré des lombes, gaine des droits, clonidine, néfopam"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "appendicectomy",
    title: "Appendicectomie (adulte et enfant)",
    year: 2024,
    pmid: "38214556",
    basic: ["Paracétamol et AINS en périopératoire"],
    regional: ["Cœlioscopie : instillation intrapéritonéale d'anesthésique local", "Voie ouverte : TAP unilatéral préopératoire, ou infiltration pré-incisionnelle"],
    surgical: ["Cœlioscopie préférée (moins douloureuse), 3 trocarts"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "colorectal_lap",
    title: "Chirurgie colorectale par cœlioscopie",
    year: 2024,
    pmid: "38298101",
    basic: ["Côlon : paracétamol et AINS ou anti-COX-2", "Rectum : paracétamol (AINS non recommandés)"],
    regional: ["Infiltration de la plaie"],
    adjuncts: ["Lidocaïne IV envisageable si l'analgésie de base est impossible"],
    notRecommended: ["Morphine intrathécale, lidocaïne IV : pas de consensus"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "colorectal_open",
    title: "Chirurgie colorectale ouverte",
    year: 2024,
    pmid: "38420876",
    basic: ["Paracétamol peropératoire", "Anti-COX-2 ou AINS (côlon seulement)"],
    regional: ["Péridurale thoracique", "Sinon : TAP bilatéral, lidocaïne IV ou infusion prépéritonéale continue"],
    notRecommended: ["Jamais deux voies d'anesthésique local en même temps (toxicité)"],
    postop: ["paracetamol", "nsaid", "pcea"],
  },
  {
    id: "open_liver",
    title: "Hépatectomie par laparotomie",
    year: 2021,
    pmid: "33436442",
    basic: ["Paracétamol et AINS (selon la fonction hépatique et rénale)"],
    regional: ["Péridurale thoracique continue, ou TAP sous-costal oblique bilatéral"],
    notRecommended: ["Lidocaïne, kétamine, dexaméthasone, gabapentinoïdes : pas de preuve spécifique"],
    postop: ["paracetamol", "pcea"],
  },
  {
    id: "sleeve",
    title: "Gastrectomie longitudinale (sleeve) par cœlioscopie",
    year: 2025,
    pmid: "41078236",
    basic: ["Paracétamol et AINS ou anti-COX-2", "Dexaméthasone IV peropératoire (analgésie et NVPO)"],
    regional: ["TAP bilatéral (échoguidé ou sous cœlioscopie)", "Infiltration des orifices de trocart"],
    notRecommended: ["Gabapentinoïdes"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "prostatectomy",
    title: "Prostatectomie radicale",
    year: 2021,
    pmid: "34197976",
    basic: ["Paracétamol et AINS ou anti-COX-2"],
    regional: ["Cœlioscopie ou robot : TAP bilatéral en fin d'intervention (premier choix)", "Voie ouverte : lidocaïne IV continue ; infiltration de la plaie"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "lap_hysterectomy",
    title: "Hystérectomie par cœlioscopie",
    year: 2019,
    pmid: "30914471",
    basic: ["Paracétamol, AINS, dexaméthasone"],
    regional: ["Pas de technique recommandée (TAP : preuves inconstantes ; intrapéritonéal et orifices : pas de preuve)"],
    surgical: ["Pression d'insufflation plus basse, gaz humidifié ou réchauffé (douleur d'épaule)"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "breast",
    title: "Chirurgie oncologique majeure du sein",
    year: 2026,
    pmid: "42581686",
    basic: ["Paracétamol, AINS ou anti-COX-2", "Dexaméthasone"],
    regional: ["Une technique en injection unique, équivalentes entre elles : ESP, PECS (interpectoral et pectoserratus), serratus superficiel ou profond, paravertébral, ou infiltration locale"],
    adjuncts: ["Kinésithérapie pré- et postopératoire"],
    notRecommended: ["Gabapentine (effets indésirables)", "Paravertébral continu (l'injection unique suffit)", "Adjuvants périnerveux"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "caesarean",
    title: "Césarienne programmée sous anesthésie neuraxiale",
    year: 2026,
    pmid: "41693258",
    basic: ["Paracétamol, AINS et dexaméthasone après l'extraction"],
    regional: ["Morphine intrathécale 50–100 µg (ou diamorphine 300 µg) avant l'incision", "Sans opioïde neuraxial : bloc de paroi (TAP, carré des lombes…) ou infiltration de la plaie"],
    surgical: ["Incision de Joel-Cohen, péritoine non refermé"],
    postop: ["paracetamol", "nsaid", "intrathecal_morphine"],
    note: "Ne s'applique pas aux césariennes urgentes ni sous anesthésie générale.",
  },
  {
    id: "vats",
    title: "Chirurgie thoracique vidéo-assistée (VATS)",
    year: 2021,
    pmid: "34739134",
    basic: ["Paracétamol et AINS ou anti-COX-2, poursuivis après"],
    regional: ["Bloc paravertébral ou ESP en premier choix", "Bloc du plan du serratus antérieur en second choix"],
    adjuncts: ["Dexmédétomidine IV peropératoire si l'analgésie de base et régionale sont impossibles"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "thoracotomy",
    title: "Thoracotomie",
    year: 2026,
    pmid: "41521792",
    basic: ["Paracétamol et AINS ou anti-COX-2"],
    regional: ["Péridurale thoracique ou bloc paravertébral en premier choix", "ESP, bloc rhomboïde-intercostal ou intercostal en second choix"],
    adjuncts: ["Acupuncture ou cryoanalgésie si ALR impossible (preuves faibles)"],
    postop: ["paracetamol", "nsaid", "pcea"],
  },
  {
    id: "sternotomy",
    title: "Chirurgie cardiaque par sternotomie",
    year: 2023,
    pmid: "37501517",
    basic: ["Paracétamol et AINS (sauf contre-indication), poursuivis après"],
    regional: ["Bloc parasternal ou infiltration du site opératoire"],
    adjuncts: ["Magnésium ou dexmédétomidine IV peropératoire, surtout sans analgésie de base"],
    notRecommended: ["Anti-COX-2 (preuves insuffisantes, sécurité)"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "craniotomy",
    title: "Craniotomie programmée",
    year: 2023,
    pmid: "37417808",
    basic: ["Paracétamol, AINS", "Dexmédétomidine IV peropératoire"],
    regional: ["Infiltration du site d'incision ou bloc du scalp"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "tonsillectomy",
    title: "Amygdalectomie",
    year: 2020,
    pmid: "33201518",
    basic: ["Paracétamol, AINS, dexaméthasone IV"],
    regional: [],
    adjuncts: ["Acupuncture per- et postopératoire, miel après", "Si un antalgique de base est contre-indiqué : kétamine (enfant), dexmédétomidine ou gabapentinoïdes"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "haemorrhoids",
    title: "Hémorroïdectomie",
    year: 2023,
    pmid: "39917290",
    basic: ["Paracétamol et AINS ou anti-COX-2", "Corticoïde systémique"],
    regional: ["Bloc bilatéral du nerf pudendal"],
    adjuncts: ["Topiques : métronidazole, diltiazem, sucralfate ou trinitrine ; toxine botulique"],
    notRecommended: ["Infiltration périanale, métronidazole oral"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "cleft_palate",
    title: "Fente palatine (enfant)",
    year: 2024,
    pmid: "38124208",
    basic: ["Paracétamol et AINS"],
    regional: ["Bloc du nerf maxillaire suprazygomatique, ou bloc palatin"],
    adjuncts: ["Dexmédétomidine avec l'anesthésique local ou IV"],
    postop: ["paracetamol", "nsaid"],
  },
  {
    id: "open_inguinal_hernia",
    title: "Cure de hernie inguinale ouverte",
    year: 2011,
    pmid: "21928388",
    basic: ["Paracétamol et AINS ou anti-COX-2"],
    regional: ["Bloc de champ (ilio-inguinal, ilio-hypogastrique) ± infiltration, seul ou avec l'AG"],
    notRecommended: ["Rachianesthésie : rétention urinaire, sortie plus tardive"],
    postop: ["paracetamol", "nsaid"],
    note: "Recommandation ancienne (2011), la plus récente de PROSPECT pour cette intervention.",
  },
];

/** Catalogue ids and families each recommendation applies to. */
const APPLIES: Record<string, { ids?: string[]; families?: string[] }> = {
  tha: { ids: ["prothese-totale-de-hanche", "prothese-totale-de-hanche-par-voie-anterieure"] },
  tka: { ids: ["prothese-totale-de-genou", "prothese-totale-de-genou-robot-assistee"] },
  rotator_cuff: { ids: ["reparation-de-la-coiffe-des-rotateurs", "arthroscopie-de-l-epaule"] },
  hallux_valgus: { ids: ["chirurgie-de-l-avant-pied", "chirurgie-du-pied"] },
  complex_spine: { ids: ["arthrodese-rachidienne", "arthrodese-lombaire-etendue", "arthrodese-pour-scoliose-de-l-adolescent", "arthrodese-pour-scoliose-neuromusculaire", "arthrodese-lombaire-par-voie-anterieure"] },
  laminectomy: { ids: ["decompression-lombaire", "cure-de-hernie-discale", "chirurgie-du-rachis-mini-invasive"] },
  lap_chole: { ids: ["cholecystectomie-c-lioscopique"] },
  appendicectomy: { families: ["appendicectomie"] },
  colorectal_lap: { ids: ["colectomie", "colectomie-par-c-lioscopie", "colectomie-robot-assistee", "resection-du-rectum-par-c-lioscopie", "resection-du-rectum-robot-assistee", "hemicolectomie-droite", "sigmoidectomie", "sigmoidectomie-par-c-lioscopie", "hemicolectomie-droite-par-c-lioscopie"] },
  colorectal_open: { ids: ["colectomie-par-laparotomie", "intervention-de-hartmann", "colectomie-totale", "resection-du-rectum"] },
  open_liver: { ids: ["hepatectomie", "hepatectomie-majeure", "hepatectomie-par-laparotomie"] },
  sleeve: { ids: ["gastrectomie-longitudinale"] },
  prostatectomy: { families: ["prostatectomie"] },
  lap_hysterectomy: { ids: ["hysterectomie-par-c-lioscopie-ou-robot", "hysterectomie-robot-assistee"] },
  breast: { ids: ["mastectomie", "tumorectomie-mammaire-et-ganglion-sentinelle", "chirurgie-du-sein", "curage-axillaire"] },
  caesarean: { ids: ["cesarienne", "cesarienne-programmee"] },
  vats: { ids: ["lobectomie-pulmonaire", "lobectomie-robot-assistee", "resection-de-bulles-d-emphyseme", "segmentectomie-ou-wedge-par-thoracoscopie", "pneumonectomie-par-thoracoscopie", "thoracoscopie-talcage", "pleurectomie-ou-pleurodese-chirurgicale", "chirurgie-du-pneumothorax"] },
  thoracotomy: { ids: ["lobectomie-par-thoracotomie", "segmentectomie-ou-wedge-par-thoracotomie", "pneumonectomie", "decortication-pleurale"] },
  sternotomy: { ids: ["pontages-aorto-coronariens-sous-cec", "pontages-coronaires-a-c-ur-battant", "chirurgie-cardiaque-sous-cec", "remplacement-valvulaire-aortique", "chirurgie-de-la-valve-mitrale", "chirurgie-de-l-aorte-thoracique", "thymectomie-par-sternotomie", "chirurgie-de-la-valve-tricuspide"] },
  craniotomy: { ids: ["craniotomie", "craniotomie-pour-tumeur", "chirurgie-de-la-fosse-posterieure", "anevrisme-cerebral-clippage", "chirurgie-de-l-epilepsie"] },
  tonsillectomy: { families: ["amygdalectomie"] },
  haemorrhoids: { ids: ["hemorroidectomie"] },
  cleft_palate: { ids: ["fente-labio-palatine"] },
  open_inguinal_hernia: { ids: ["cure-de-hernie-inguinale"] },
};

export function prospectFor(item: Pick<SurgeryItem, "id" | "family"> | undefined): ProspectRecommendation | undefined {
  if (!item) return undefined;
  const id = Object.entries(APPLIES).find(([, a]) => a.ids?.includes(item.id) || (item.family && a.families?.includes(item.family)))?.[0];
  return id ? PROSPECT.find((p) => p.id === id) : undefined;
}

/** Catalogue ids the recommendations name — to check they still exist. */
export function prospectLinkedIds(): string[] {
  return Object.values(APPLIES).flatMap((a) => a.ids ?? []);
}

export const PROSPECT_SOURCE = "PROSPECT (ESRA), recommandations par intervention — résumé des publications ; la version intégrale fait foi";
export { RESCUE as PROSPECT_RESCUE };
