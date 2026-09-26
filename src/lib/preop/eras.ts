// Enhanced Recovery After Surgery — the ERAS® Society guidelines, the most
// recent version of each procedure, summarised from the published abstracts
// (PubMed identifiers given; the full text prevails, and so does the local
// pathway). Each guideline is linked to the catalogue entries it covers.

import type { SurgeryItem } from "./catalog";

export interface ErasGuideline {
  id: string;
  title: string;
  year: number;
  pmid: string;
  /** What the guideline adds to the common items, from its abstract. */
  points: string[];
  note?: string;
}

/**
 * Items shared by almost every ERAS guideline (Grant & Engelman 2025,
 * PMID 41168801; list of the lung guideline 2019, PMID 30304509).
 */
export const ERAS_COMMON: string[] = [
  "Information et éducation préopératoires ; dépistage nutritionnel ; arrêt du tabac et de l'alcool",
  "Préhabilitation chez le patient à haut risque",
  "Jeûne court (liquides clairs jusqu'à 2 h), charge en glucides ; pas de prémédication sédative systématique",
  "Antibioprophylaxie et prophylaxie thromboembolique selon le protocole",
  "Normothermie ; anesthésiques de courte durée ; prévention des NVPO",
  "Analgésie multimodale épargnant les opioïdes, ALR quand elle est indiquée",
  "Remplissage visant l'euvolémie (ni restriction ni surcharge)",
  "Chirurgie mini-invasive quand c'est possible ; pas de sonde, drain ni cathéter urinaire systématiques, ou retrait précoce",
  "Alimentation et mobilisation précoces",
];

export const ERAS: ErasGuideline[] = [
  { id: "colorectal", title: "Chirurgie colorectale programmée", year: 2025, pmid: "40783294", points: ["Cinquième version du guide de référence des programmes ERAS : chaque élément commun est gradé (GRADE)"], note: "Résumé non disponible sur PubMed pour la version 2025 (version 2018 : PMID 30426190) : détail des éléments dans le texte intégral." },
  { id: "liver", title: "Chirurgie hépatique", year: 2022, pmid: "36310325", points: ["Préhabilitation chez le patient à haut risque", "Drainage biliaire préopératoire si foie cholestatique", "Arrêt du tabac et de l'alcool au moins 4 semaines avant l'hépatectomie"] },
  { id: "pancreatoduodenectomy", title: "Duodénopancréatectomie céphalique", year: 2019, pmid: "32161987", points: ["Éviter l'hypothermie", "Cathéters d'infiltration pariétale : alternative à la péridurale", "Protocoles d'antibioprophylaxie et de thromboprophylaxie", "Assistance nutritionnelle préopératoire si perte de poids > 15 %"] },
  { id: "oesophagectomy", title: "Œsophagectomie", year: 2019, pmid: "30276441", points: ["39 sections, dont des éléments thoraciques propres à l'œsophagectomie (premier guide ERAS avec un temps thoracique)"], note: "Le résumé ne détaille pas les éléments : texte intégral à consulter." },
  { id: "gastrectomy", title: "Gastrectomie", year: 2014, pmid: "25047143", points: ["25 éléments, dont 8 spécifiques à la gastrectomie ; niveau de preuve variable"], note: "Version la plus récente indexée : 2014." },
  { id: "bariatric", title: "Chirurgie bariatrique", year: 2021, pmid: "34984504", points: ["Deuxième mise à jour ; preuves souvent de faible niveau en bariatrique, parfois extrapolées d'autres chirurgies"] },
  { id: "cystectomy", title: "Cystectomie radicale", year: 2013, pmid: "24189391", points: ["Pas de préparation colique", "Retrait précoce de la sonde gastrique", "Remplissage guidé par Doppler œsophagien", "Prévention multimodale de l'iléus (gomme à mâcher, NVPO, chirurgie mini-invasive)"], note: "Version la plus récente indexée : 2013." },
  { id: "gyn_onc", title: "Chirurgie gynécologique et gynéco-oncologique", year: 2019, pmid: "30877144", points: ["Éléments communs ERAS, gradés GRADE, pour la chirurgie gynécologique bénigne et oncologique"] },
  { id: "caesarean", title: "Césarienne", year: 2025, pmid: "40335352", points: ["Antibioprophylaxie avant l'incision ; préparation abdominale et vaginale", "Prophylaxie des NVPO et de l'hypotension de la rachianesthésie", "Normothermie, euvolémie, utérotoniques à la dose optimale", "Analgésie multimodale ; peau à peau précoce", "Avant : antiacide et anti-H2, jeûne des liquides clairs 2 h (partie 1, PMID 30240657)", "Après : alimentation précoce, prévention thromboembolique, mobilisation et retrait de sonde précoces (partie 3, PMID 30995461)"] },
  { id: "lung", title: "Chirurgie pulmonaire", year: 2019, pmid: "30304509", points: ["ERAS et ESTS : 45 éléments", "Anesthésie régionale, analgésie épargnant les opioïdes, remplissage euvolémique", "Retrait précoce du drain thoracique, pas de sonde urinaire, mobilisation précoce"] },
  { id: "cardiac", title: "Chirurgie cardiaque", year: 2019, pmid: "31054241", points: ["Éléments communs ERAS adaptés à la chirurgie cardiaque"], note: "Le résumé ne détaille pas les éléments : texte intégral à consulter." },
  { id: "hip_knee", title: "Prothèse totale de hanche et de genou", year: 2019, pmid: "31663402", points: ["Éducation préopératoire", "Technique anesthésique et stratégie transfusionnelle optimisées", "Analgésie multimodale épargnant les opioïdes, mobilisation précoce", "Aucune technique chirurgicale (voie, mini-invasif, navigation) n'est supérieure pour la sortie"] },
  { id: "lumbar_fusion", title: "Arthrodèse lombaire", year: 2021, pmid: "33444664", points: ["28 recommandations : 9 préopératoires, 11 peropératoires, 6 postopératoires", "Éducation et évaluation nutritionnelle ; analgésie multimodale", "Préhabilitation non retenue (preuves insuffisantes)"] },
  { id: "breast_reconstruction", title: "Reconstruction mammaire", year: 2017, pmid: "28445352", points: ["Médicaments épargnant les opioïdes", "Jeûne minimal, alimentation précoce", "Technique limitant NVPO et douleur ; prévention de l'hypothermie ; mobilisation précoce"] },
  { id: "emergency_laparotomy", title: "Laparotomie en urgence", year: 2023, pmid: "37277507", points: ["Avant (partie 1, PMID 33677649) : diagnostic et évaluation rapides, prise en charge du sepsis et correction des désordres physiologiques avant l'incision", "Pendant et après : 23 éléments, pour beaucoup extrapolés de la chirurgie programmée"] },
  { id: "crs_hipec", title: "Chirurgie de cytoréduction ± CHIP", year: 2020, pmid: "32873454", points: ["72 éléments, consensus pour 71", "Pas de consensus sur le plasma frais congelé préventif", "Suite postopératoire : partie II, PMID 32826114"] },
  { id: "neonatal", title: "Nouveau-né opéré (hors cardiaque)", year: 2024, pmid: "39083294", points: ["16 recommandations en réanimation néonatale : communication d'équipe, jeûne, température, antibioprophylaxie, préparation cutanée", "Ventilation, remplissage, glycémie, seuils transfusionnels, alimentation entérale, présence des parents"] },
];

/** Catalogue ids, families, or a test, each guideline applies to. */
const APPLIES: Record<string, { ids?: string[]; families?: string[]; test?: (s: Pick<SurgeryItem, "id" | "family" | "population" | "category" | "grade">) => boolean }> = {
  colorectal: { families: ["colectomie", "resection-du-rectum"], ids: ["amputation-abdomino-perineale", "retablissement-de-continuite", "stomie-confection-ou-fermeture", "colectomie-totale"] },
  liver: { families: ["hepatectomie"], ids: ["kyste-hydatique-ou-kyste-hepatique"] },
  pancreatoduodenectomy: { ids: ["duodenopancreatectomie-cephalique", "duodenopancreatectomie-cephalique-robot-assistee"] },
  oesophagectomy: { families: ["sophagectomie"] },
  gastrectomy: { families: ["gastrectomie"] },
  bariatric: { families: ["bariatrique-sleeve", "bariatrique-bypass", "bariatrique-anneau"], ids: ["chirurgie-bariatrique", "reprise-de-chirurgie-bariatrique"] },
  cystectomy: { families: ["cystectomie"] },
  gyn_onc: { test: (s) => s.category === "J1" && s.grade === "major" },
  caesarean: { ids: ["cesarienne", "cesarienne-programmee", "cesarienne-en-urgence"] },
  lung: { families: ["lobectomie", "emphyseme"], ids: ["pneumonectomie", "pneumonectomie-par-thoracoscopie", "segmentectomie-ou-wedge-par-thoracoscopie", "segmentectomie-ou-wedge-par-thoracotomie", "reduction-de-volume-pulmonaire"] },
  cardiac: { ids: ["chirurgie-cardiaque-sous-cec", "pontages-aorto-coronariens-sous-cec", "pontages-coronaires-a-c-ur-battant", "remplacement-valvulaire-aortique", "chirurgie-de-la-valve-mitrale", "chirurgie-de-la-valve-tricuspide", "chirurgie-valvulaire-mini-invasive", "chirurgie-de-l-aorte-thoracique"] },
  hip_knee: { families: ["pth", "ptg"] },
  lumbar_fusion: { families: ["arthrodese-lombaire"], ids: ["arthrodese-rachidienne", "arthrodese-lombaire-etendue"] },
  breast_reconstruction: { ids: ["reconstruction-mammaire-par-lambeau-libre", "reconstruction-mammaire-par-prothese"] },
  emergency_laparotomy: { ids: ["laparotomie-pour-occlusion", "peritonite-generalisee", "reparation-de-perforation-digestive", "ulcere-perfore", "ischemie-mesenterique-resection", "volvulus-detorsion-ou-colectomie", "hernie-etranglee", "laparotomie-exploratrice", "intervention-de-hartmann"] },
  crs_hipec: { ids: ["chirurgie-de-cytoreduction-et-chip"] },
  neonatal: { test: (s) => s.population === "neonate" && s.category !== "F" && s.grade !== "minor" },
};

/** The guidelines that cover this intervention (most specific first). */
export function erasFor(item: Pick<SurgeryItem, "id" | "family" | "population" | "category" | "grade"> | undefined): ErasGuideline[] {
  if (!item) return [];
  const ids = Object.entries(APPLIES)
    .filter(([, a]) => a.ids?.includes(item.id) || (item.family && a.families?.includes(item.family)) || a.test?.(item))
    .map(([id]) => id);
  return ERAS.filter((g) => ids.includes(g.id));
}

/** Catalogue ids the guidelines name — to check they still exist. */
export function erasLinkedIds(): string[] {
  return Object.values(APPLIES).flatMap((a) => a.ids ?? []);
}

export const ERAS_SOURCE = "ERAS® Society, recommandations par chirurgie — résumé des publications ; la version intégrale et le chemin clinique local font foi";
