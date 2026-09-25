// Common procedures with suggested attributes, pre-filled when one is
// picked (always editable):
// - severity grade (minor / intermediate / major) as used by the preop
//   testing guidance (NICE NG45, the grid the KCE report built on);
// - surgical cardiac risk class of the ESC 2022 guidelines on non-cardiac
//   surgery (low < 1 %, intermediate 1–5 %, high > 5 % of cardiac events);
// - bleeding risk (low / high) in the spirit of the EHRA practical guide
//   for anticoagulated patients — to confirm per procedure and surgeon;
// - "high-risk surgery" of the Lee index (intraperitoneal, intrathoracic,
//   suprainguinal vascular) and the ARISCAT incision site;
// - an indicative duration (ARISCAT), to adjust to the team.

import type { AriscatInput } from "./scores";
import type { RiskGrade } from "./dossier";
import type { BleedingRisk } from "./catalog";
import type { Technique } from "./rules/types";

export type SurgeryGrade = "minor" | "intermediate" | "major";

export interface CatalogSurgery {
  id: string;
  name: string;
  aka?: string[];
  /** Carnet category. */
  category: string;
  grade: SurgeryGrade;
  cardiacRisk: RiskGrade;
  bleedingRisk: BleedingRisk;
  rcriHighRisk: boolean;
  incision: NonNullable<AriscatInput["incision"]>;
  position?: string;
  durationHours?: number;
  techniques?: Technique[];
  closedSpace?: boolean;
}

const s = (
  name: string,
  category: string,
  grade: SurgeryGrade,
  cardiacRisk: RiskGrade,
  bleedingRisk: BleedingRisk,
  rcriHighRisk: boolean,
  incision: CatalogSurgery["incision"],
  position?: string,
  aka?: string[]
): CatalogSurgery => ({ id: slug(name), name, category, grade, cardiacRisk, bleedingRisk, rcriHighRisk, incision, position, aka });

function slug(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const SURGERY_CATALOG: CatalogSurgery[] = [
  // Orthopédie
  s("Prothèse totale de hanche", "K", "major", "intermediate", "high", false, "peripheral", "Décubitus latéral ou dorsal selon la voie", ["PTH", "prothèse de hanche"]),
  s("Prothèse totale de genou", "K", "major", "intermediate", "high", false, "peripheral", "Décubitus dorsal", ["PTG", "prothèse de genou"]),
  s("Fracture du col du fémur", "K", "major", "intermediate", "high", false, "peripheral", "Décubitus dorsal (table orthopédique) ou latéral", ["FCF", "prothèse intermédiaire", "clou gamma"]),
  s("Arthrodèse rachidienne", "K", "major", "intermediate", "high", false, "peripheral", "Décubitus ventral", ["rachis", "laminectomie"]),
  s("Arthroscopie du genou", "K", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal", ["ménisectomie", "LCA", "ligamentoplastie"]),
  s("Arthroscopie de l'épaule", "K", "intermediate", "low", "low", false, "peripheral", "Semi-assise (beach chair) ou latérale", ["coiffe des rotateurs", "acromioplastie"]),
  s("Chirurgie du pied", "K", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal", ["hallux valgus"]),
  s("Chirurgie de la main", "K", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal, bras sur table", ["canal carpien", "doigt à ressaut", "Dupuytren"]),
  s("Ostéosynthèse de membre", "K", "intermediate", "low", "high", false, "peripheral", "Selon le segment", ["fracture", "plaque", "clou"]),
  s("Ablation de matériel", "K", "minor", "low", "minimal", false, "peripheral", "Selon le segment", ["AMO"]),
  // Chirurgie générale et digestive
  s("Cholécystectomie cœlioscopique", "A", "intermediate", "intermediate", "high", true, "upper_abdominal", "Décubitus dorsal", ["vésicule", "cholécystectomie"]),
  s("Cure de hernie inguinale", "A", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal", ["hernie", "TEP", "Lichtenstein"]),
  s("Appendicectomie", "A", "intermediate", "intermediate", "high", true, "peripheral", "Décubitus dorsal", ["appendicite"]),
  s("Colectomie", "A", "major", "intermediate", "high", true, "upper_abdominal", "Décubitus dorsal ou position de Lloyd-Davies", ["hémicolectomie", "sigmoïdectomie", "résection colique"]),
  s("Chirurgie bariatrique", "A", "major", "intermediate", "high", true, "upper_abdominal", "Décubitus dorsal, proclive", ["bypass gastrique", "sleeve"]),
  s("Gastrectomie", "A", "major", "intermediate", "high", true, "upper_abdominal", "Décubitus dorsal"),
  s("Duodénopancréatectomie céphalique", "A", "major", "high", "high", true, "upper_abdominal", "Décubitus dorsal", ["Whipple", "DPC"]),
  s("Hépatectomie", "A", "major", "high", "high", true, "upper_abdominal", "Décubitus dorsal", ["résection hépatique"]),
  s("Œsophagectomie", "A", "major", "high", "high", true, "intrathoracic", "Décubitus dorsal puis latéral"),
  s("Réparation de perforation digestive", "A", "major", "high", "high", true, "upper_abdominal", "Décubitus dorsal", ["péritonite", "perforation"]),
  s("Thyroïdectomie", "A", "intermediate", "low", "high", false, "peripheral", "Décubitus dorsal, cou en extension", ["thyroïde", "parathyroïdectomie"]),
  s("Chirurgie du sein", "A", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal", ["tumorectomie", "mastectomie", "ganglion sentinelle"]),
  s("Proctologie", "A", "minor", "low", "low", false, "peripheral", "Lithotomie ou génupectorale", ["hémorroïdes", "fistule anale", "fissure"]),
  s("Exérèse cutanée", "A", "minor", "low", "minimal", false, "peripheral", "Selon la localisation", ["kyste", "lipome", "naevus"]),
  // Vasculaire
  s("Chirurgie aortique ouverte", "A", "major", "high", "high", true, "upper_abdominal", "Décubitus dorsal", ["anévrisme aorte", "pontage aorto-bifémoral"]),
  s("Endoprothèse aortique", "A", "intermediate", "intermediate", "high", false, "peripheral", "Décubitus dorsal", ["EVAR"]),
  s("Endartériectomie carotidienne", "A", "intermediate", "intermediate", "high", false, "peripheral", "Décubitus dorsal, tête tournée", ["carotide"]),
  s("Revascularisation ouverte du membre inférieur", "A", "major", "high", "high", false, "peripheral", "Décubitus dorsal", ["pontage fémoro-poplité"]),
  s("Amputation de membre inférieur", "A", "intermediate", "high", "high", false, "peripheral", "Décubitus dorsal", ["amputation"]),
  s("Fistule artério-veineuse", "A", "minor", "low", "low", false, "peripheral", "Décubitus dorsal, bras sur table", ["FAV"]),
  // Urologie
  s("Résection transurétrale de prostate", "J2", "intermediate", "low", "high", false, "peripheral", "Lithotomie", ["RTUP"]),
  s("Résection transurétrale de vessie", "J2", "intermediate", "low", "high", false, "peripheral", "Lithotomie", ["RTUV"]),
  s("Prostatectomie radicale", "J2", "major", "intermediate", "high", true, "peripheral", "Décubitus dorsal, Trendelenburg marqué (robot)", ["prostatectomie"]),
  s("Cystectomie totale", "J2", "major", "high", "high", true, "peripheral", "Décubitus dorsal", ["cystectomie"]),
  s("Néphrectomie", "J2", "major", "intermediate", "high", false, "upper_abdominal", "Décubitus latéral"),
  s("Urétéroscopie", "J2", "minor", "low", "minimal", false, "peripheral", "Lithotomie", ["URS", "lithiase"]),
  // Gynécologie, obstétrique
  s("Hystérectomie", "J1", "major", "intermediate", "high", true, "peripheral", "Décubitus dorsal ou lithotomie, Trendelenburg", ["hystérectomie"]),
  s("Cœlioscopie gynécologique", "J1", "intermediate", "intermediate", "low", true, "peripheral", "Lithotomie, Trendelenburg", ["kystectomie ovarienne", "annexectomie", "endométriose"]),
  s("Hystéroscopie", "J1", "minor", "low", "minimal", false, "peripheral", "Lithotomie", ["curetage", "conisation"]),
  s("Césarienne", "B", "intermediate", "low", "high", true, "peripheral", "Décubitus dorsal, inclinaison latérale gauche"),
  // ORL, ophtalmo, stomato
  s("Amygdalectomie", "C", "intermediate", "low", "high", false, "peripheral", "Décubitus dorsal, tête en extension", ["adénoïdectomie"]),
  s("Chirurgie endonasale", "C", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal, proclive", ["septoplastie", "FESS", "méatotomie"]),
  s("Chirurgie carcinologique tête et cou", "C", "major", "intermediate", "high", false, "peripheral", "Décubitus dorsal, tête en extension", ["laryngectomie", "curage ganglionnaire"]),
  s("Cataracte", "I", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal"),
  s("Vitrectomie", "I", "intermediate", "low", "minimal", false, "peripheral", "Décubitus dorsal"),
  s("Extractions dentaires", "E", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["dents de sagesse"]),
  s("Chirurgie maxillo-faciale majeure", "E", "major", "intermediate", "high", false, "peripheral", "Décubitus dorsal", ["ostéotomie", "fracture mandibulaire"]),
  // Neuro, thorax, plastique, hors bloc
  s("Craniotomie", "D", "major", "intermediate", "high", false, "peripheral", "Selon l'abord (dorsal, latéral, ventral, assis)", ["neurochirurgie", "tumeur cérébrale"]),
  s("Cure de hernie discale", "D", "intermediate", "intermediate", "high", false, "peripheral", "Décubitus ventral", ["discectomie"]),
  s("Lobectomie pulmonaire", "G", "major", "intermediate", "high", true, "intrathoracic", "Décubitus latéral", ["segmentectomie", "VATS"]),
  s("Pneumonectomie", "G", "major", "high", "high", true, "intrathoracic", "Décubitus latéral"),
  s("Chirurgie plastique ou reconstructrice", "L", "intermediate", "low", "low", false, "peripheral", "Selon la localisation", ["lambeau", "abdominoplastie", "plastie mammaire"]),
  s("Endoscopie digestive", "X", "minor", "low", "minimal", false, "peripheral", "Décubitus latéral gauche ou dorsal", ["gastroscopie", "coloscopie", "CPRE"]),
  // --- Added -------------------------------------------------------------------
  // Orthopédie
  s("Prothèse d'épaule", "K", "major", "intermediate", "high", false, "peripheral", "Semi-assise (beach chair)", ["PTE", "prothèse inversée"]),
  s("Reprise de prothèse de hanche ou de genou", "K", "major", "intermediate", "high", false, "peripheral", "Selon l'articulation", ["révision de PTH", "révision de PTG", "reprise PTH"]),
  s("Arthroscopie de hanche", "K", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal, table de traction"),
  s("Ostéotomie", "K", "intermediate", "low", "high", false, "peripheral", "Décubitus dorsal", ["ostéotomie tibiale", "ostéotomie de valgisation"]),
  s("Ostéosynthèse du poignet", "K", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal, bras sur table", ["fracture du radius", "Pouteau-Colles"]),
  s("Ostéosynthèse de la cheville", "K", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal", ["fracture de cheville", "malléole"]),
  s("Vertébroplastie / cyphoplastie", "K", "minor", "low", "low", false, "peripheral", "Décubitus ventral", ["tassement vertébral"]),
  // Chirurgie générale et digestive
  s("Cure d'éventration", "A", "intermediate", "intermediate", "low", true, "upper_abdominal", "Décubitus dorsal", ["éventration", "hernie ventrale", "hernie incisionnelle"]),
  s("Cure de hernie ombilicale", "A", "minor", "low", "low", false, "peripheral", "Décubitus dorsal", ["hernie ombilicale", "hernie de la ligne blanche"]),
  s("Fundoplicature / cure de hernie hiatale", "A", "intermediate", "intermediate", "low", true, "upper_abdominal", "Décubitus dorsal, proclive", ["Nissen", "Toupet", "hernie hiatale"]),
  s("Splénectomie", "A", "intermediate", "intermediate", "high", true, "upper_abdominal", "Décubitus dorsal ou latéral droit", ["rate"]),
  s("Surrénalectomie", "A", "major", "high", "high", true, "upper_abdominal", "Décubitus latéral", ["surrénale"]),
  s("Chirurgie des voies biliaires", "A", "major", "high", "high", true, "upper_abdominal", "Décubitus dorsal", ["anastomose bilio-digestive", "cholédoque"]),
  s("Résection du rectum", "A", "major", "intermediate", "high", true, "upper_abdominal", "Position de Lloyd-Davies, Trendelenburg", ["résection antérieure du rectum", "amputation abdomino-périnéale", "TME"]),
  s("Rétablissement de continuité", "A", "intermediate", "intermediate", "high", true, "upper_abdominal", "Décubitus dorsal", ["fermeture de stomie", "Hartmann"]),
  s("Laparotomie pour occlusion", "A", "major", "intermediate", "high", true, "upper_abdominal", "Décubitus dorsal", ["occlusion", "laparotomie exploratrice", "adhérences", "bride"]),
  s("Pose de chambre implantable", "A", "minor", "low", "low", false, "peripheral", "Décubitus dorsal", ["PAC", "port-a-cath", "chambre implantable"]),
  s("Sinus pilonidal", "A", "minor", "low", "low", false, "peripheral", "Décubitus ventral", ["kyste pilonidal"]),
  // Vasculaire
  s("Chirurgie des varices", "A", "minor", "low", "low", false, "peripheral", "Décubitus dorsal", ["stripping", "crossectomie", "phlébectomie"]),
  s("Angioplastie périphérique", "A", "intermediate", "intermediate", "low", false, "peripheral", "Décubitus dorsal", ["angioplastie", "stent périphérique"]),
  // Urologie
  s("Néphrolithotomie percutanée", "J2", "intermediate", "low", "high", false, "peripheral", "Décubitus ventral ou dorsal", ["NLPC"]),
  s("Énucléation de prostate au laser", "J2", "intermediate", "low", "high", false, "peripheral", "Lithotomie", ["HoLEP", "vaporisation laser"]),
  s("Transplantation rénale", "J2", "major", "intermediate", "high", false, "peripheral", "Décubitus dorsal", ["greffe rénale"]),
  s("Chirurgie scrotale", "J2", "minor", "low", "low", false, "peripheral", "Décubitus dorsal", ["hydrocèle", "orchidectomie", "orchidopexie", "varicocèle"]),
  s("Circoncision", "J2", "minor", "low", "low", false, "peripheral", "Décubitus dorsal", ["posthectomie", "phimosis"]),
  s("Cystoscopie / sonde JJ", "J2", "minor", "low", "minimal", false, "peripheral", "Lithotomie", ["cystoscopie", "sonde double J", "JJ"]),
  s("Bandelette sous-urétrale", "J1", "minor", "low", "low", false, "peripheral", "Lithotomie", ["TVT", "TOT", "incontinence urinaire"]),
  // Gynécologie, obstétrique
  s("Myomectomie", "J1", "intermediate", "intermediate", "high", true, "peripheral", "Décubitus dorsal ou lithotomie", ["fibrome", "myome"]),
  s("Cure de prolapsus", "J1", "intermediate", "intermediate", "low", true, "peripheral", "Lithotomie, Trendelenburg", ["promontofixation", "prolapsus"]),
  s("Ponction ovocytaire", "J1", "minor", "low", "minimal", false, "peripheral", "Lithotomie", ["FIV", "PMA"]),
  s("Aspiration endo-utérine", "J1", "minor", "low", "low", false, "peripheral", "Lithotomie", ["IVG", "fausse couche", "aspiration"]),
  s("Cerclage du col", "B", "minor", "low", "low", false, "peripheral", "Lithotomie", ["cerclage"]),
  s("Révision utérine / délivrance artificielle", "B", "minor", "low", "high", false, "peripheral", "Lithotomie", ["délivrance", "rétention placentaire", "hémorragie du post-partum"]),
  // ORL, ophtalmologie
  s("Parotidectomie", "C", "intermediate", "intermediate", "low", false, "peripheral", "Décubitus dorsal, tête tournée", ["parotide", "sous-maxillectomie"]),
  s("Chirurgie de l'oreille", "C", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal, tête tournée", ["tympanoplastie", "stapédectomie", "mastoïdectomie", "implant cochléaire"]),
  s("Aérateurs transtympaniques", "C", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["yoyos", "drains transtympaniques", "paracentèse"]),
  s("Microchirurgie laryngée", "C", "minor", "low", "low", false, "peripheral", "Décubitus dorsal, laryngoscopie en suspension", ["laryngoscopie", "polype des cordes vocales", "panendoscopie"]),
  s("Trachéotomie", "C", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal, cou en extension"),
  s("Chirurgie du strabisme", "I", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["strabisme"]),
  s("Chirurgie du glaucome", "I", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["trabéculectomie"]),
  s("Chirurgie des paupières", "I", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["blépharoplastie", "ptosis", "ectropion"]),
  // Neurochirurgie, thorax, cardiaque
  s("Décompression lombaire", "D", "intermediate", "intermediate", "high", false, "peripheral", "Décubitus ventral", ["canal lombaire étroit", "laminectomie lombaire"]),
  s("Arthrodèse cervicale antérieure", "D", "intermediate", "intermediate", "high", false, "peripheral", "Décubitus dorsal", ["ACDF", "hernie discale cervicale"]),
  s("Dérivation ventriculo-péritonéale", "D", "intermediate", "intermediate", "high", false, "peripheral", "Décubitus dorsal, tête tournée", ["DVP", "valve de dérivation"]),
  s("Médiastinoscopie", "G", "intermediate", "low", "high", false, "peripheral", "Décubitus dorsal, cou en extension", ["EBUS chirurgical"]),
  s("Thoracoscopie / talcage", "G", "intermediate", "low", "low", false, "intrathoracic", "Décubitus latéral", ["pleuroscopie", "talcage", "décortication"]),
  s("Bronchoscopie rigide", "G", "minor", "low", "low", false, "peripheral", "Décubitus dorsal", ["stent trachéal", "désobstruction bronchique"]),
  s("Chirurgie cardiaque sous CEC", "F", "major", "high", "high", true, "intrathoracic", "Décubitus dorsal", ["pontage aorto-coronarien", "remplacement valvulaire", "CEC"]),
  s("TAVI", "F", "intermediate", "intermediate", "high", false, "peripheral", "Décubitus dorsal", ["TAVR", "valve aortique percutanée"]),
  // Plastique
  s("Liposuccion", "L", "intermediate", "low", "low", false, "peripheral", "Selon les zones", ["lipoaspiration"]),
  s("Excision-greffe de brûlure", "L", "intermediate", "low", "high", false, "peripheral", "Selon les zones", ["brûlure", "greffe de peau"]),
  // Hors bloc
  s("Cardioversion électrique", "X", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["CEE", "choc électrique externe"]),
  s("Électroconvulsivothérapie", "X", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["sismothérapie", "ECT"]),
  s("Échographie transœsophagienne", "X", "minor", "low", "minimal", false, "peripheral", "Décubitus latéral gauche", ["ETO"]),
  s("Bronchoscopie souple / EBUS", "X", "minor", "low", "low", false, "peripheral", "Décubitus dorsal", ["fibroscopie bronchique", "EBUS", "LBA"]),
  s("Radiologie interventionnelle", "X", "intermediate", "low", "low", false, "peripheral", "Décubitus dorsal", ["embolisation", "TIPS", "chimioembolisation", "drainage percutané"]),
  s("Thrombectomie cérébrale", "X", "intermediate", "intermediate", "low", false, "peripheral", "Décubitus dorsal", ["AVC", "thrombectomie mécanique"]),
  s("Imagerie sous anesthésie", "X", "minor", "low", "minimal", false, "peripheral", "Décubitus dorsal", ["IRM", "scanner"]),
];

/** Indicative durations (skin to skin, hours) — feed ARISCAT; always editable. */
const DURATIONS: Record<string, number> = {
  "prothese-totale-de-hanche": 1.5, "prothese-totale-de-genou": 1.5, "fracture-du-col-du-femur": 1.25, "arthrodese-rachidienne": 3,
  "arthroscopie-du-genou": 1, "arthroscopie-de-l-epaule": 1.5, "chirurgie-du-pied": 1.25, "chirurgie-de-la-main": 0.5, "osteosynthese-de-membre": 1.5, "ablation-de-materiel": 0.75,
  "cholecystectomie-c-lioscopique": 1.25, "cure-de-hernie-inguinale": 1, "appendicectomie": 1, "colectomie": 3, "chirurgie-bariatrique": 2, "gastrectomie": 4,
  "duodenopancreatectomie-cephalique": 6, "hepatectomie": 4, "sophagectomie": 6, "reparation-de-perforation-digestive": 2, "thyroidectomie": 1.5, "chirurgie-du-sein": 1.5,
  "proctologie": 0.5, "exerese-cutanee": 0.5, "chirurgie-aortique-ouverte": 4, "endoprothese-aortique": 2.5, "endarteriectomie-carotidienne": 2,
  "revascularisation-ouverte-du-membre-inferieur": 3.5, "amputation-de-membre-inferieur": 1.25, "fistule-arterio-veineuse": 1,
  "resection-transuretrale-de-prostate": 1, "resection-transuretrale-de-vessie": 0.75, "prostatectomie-radicale": 3, "cystectomie-totale": 5, "nephrectomie": 2.5, "ureteroscopie": 0.75,
  "hysterectomie": 2, "c-lioscopie-gynecologique": 1.25, "hysteroscopie": 0.5, "cesarienne": 0.75,
  "amygdalectomie": 0.5, "chirurgie-endonasale": 1.25, "chirurgie-carcinologique-tete-et-cou": 5, "cataracte": 0.33, "vitrectomie": 1.25, "extractions-dentaires": 0.75,
  "chirurgie-maxillo-faciale-majeure": 3, "craniotomie": 4, "cure-de-hernie-discale": 1.25, "lobectomie-pulmonaire": 3, "pneumonectomie": 3.5,
  "chirurgie-plastique-ou-reconstructrice": 2, "endoscopie-digestive": 0.5,
  "prothese-d-epaule": 2, "reprise-de-prothese-de-hanche-ou-de-genou": 3, "arthroscopie-de-hanche": 2, "osteotomie": 1.5, "osteosynthese-du-poignet": 1, "osteosynthese-de-la-cheville": 1.25,
  "vertebroplastie-cyphoplastie": 1, "cure-d-eventration": 2, "cure-de-hernie-ombilicale": 0.75, "fundoplicature-cure-de-hernie-hiatale": 2, "splenectomie": 2, "surrenalectomie": 2.5,
  "chirurgie-des-voies-biliaires": 4, "resection-du-rectum": 4, "retablissement-de-continuite": 2.5, "laparotomie-pour-occlusion": 2, "pose-de-chambre-implantable": 0.75, "sinus-pilonidal": 0.5,
  "chirurgie-des-varices": 1, "angioplastie-peripherique": 1.5, "nephrolithotomie-percutanee": 2, "enucleation-de-prostate-au-laser": 1.5, "transplantation-renale": 3.5,
  "chirurgie-scrotale": 0.75, "circoncision": 0.5, "cystoscopie-sonde-jj": 0.5, "bandelette-sous-uretrale": 0.5, "myomectomie": 2, "cure-de-prolapsus": 2.5,
  "ponction-ovocytaire": 0.25, "aspiration-endo-uterine": 0.25, "cerclage-du-col": 0.5, "revision-uterine-delivrance-artificielle": 0.5,
  "parotidectomie": 2.5, "chirurgie-de-l-oreille": 2, "aerateurs-transtympaniques": 0.25, "microchirurgie-laryngee": 0.5, "tracheotomie": 0.75,
  "chirurgie-du-strabisme": 1, "chirurgie-du-glaucome": 1, "chirurgie-des-paupieres": 1, "decompression-lombaire": 2, "arthrodese-cervicale-anterieure": 2,
  "derivation-ventriculo-peritoneale": 1.5, "mediastinoscopie": 1, "thoracoscopie-talcage": 1, "bronchoscopie-rigide": 0.75, "chirurgie-cardiaque-sous-cec": 4, "tavi": 1.5,
  "liposuccion": 2, "excision-greffe-de-brulure": 2, "cardioversion-electrique": 0.25, "electroconvulsivotherapie": 0.25, "echographie-trans-sophagienne": 0.25,
  "bronchoscopie-souple-ebus": 0.5, "radiologie-interventionnelle": 1.5, "thrombectomie-cerebrale": 1.5, "imagerie-sous-anesthesie": 1,
};
for (const x of SURGERY_CATALOG) if (DURATIONS[x.id] !== undefined) x.durationHours = DURATIONS[x.id];

/** Closed space — intracranial, spinal canal, posterior chamber of the eye — where the bleeding rules are stricter. */
const CLOSED_SPACE = new Set(["craniotomie", "derivation-ventriculo-peritoneale", "arthrodese-rachidienne", "cure-de-hernie-discale", "decompression-lombaire", "arthrodese-cervicale-anterieure", "vitrectomie"]);
for (const x of SURGERY_CATALOG) if (CLOSED_SPACE.has(x.id)) x.closedSpace = true;

/** Usual technique(s), to pre-fill « Technique envisagée » when no protocol applies — a starting point, to adapt to the patient and the team. */
const USUAL_TECHNIQUES: Record<string, Technique[]> = {
  "prothese-totale-de-hanche": ["neuraxial"],
  "prothese-totale-de-genou": ["neuraxial", "superficial_block"],
  "fracture-du-col-du-femur": ["neuraxial", "superficial_block"],
  "arthrodese-rachidienne": ["general"],
  "arthroscopie-du-genou": ["general"],
  "arthroscopie-de-l-epaule": ["general", "superficial_block"],
  "chirurgie-du-pied": ["superficial_block", "general"],
  "chirurgie-de-la-main": ["superficial_block"],
  "osteosynthese-de-membre": ["general"],
  "ablation-de-materiel": ["general"],
  "cholecystectomie-c-lioscopique": ["general"],
  "cure-de-hernie-inguinale": ["general"],
  "appendicectomie": ["general"],
  "colectomie": ["general"],
  "chirurgie-bariatrique": ["general"],
  "gastrectomie": ["general", "neuraxial"],
  "duodenopancreatectomie-cephalique": ["general", "neuraxial"],
  "hepatectomie": ["general"],
  "sophagectomie": ["general", "neuraxial"],
  "reparation-de-perforation-digestive": ["general"],
  "thyroidectomie": ["general"],
  "chirurgie-du-sein": ["general"],
  "proctologie": ["general"],
  "exerese-cutanee": ["sedation"],
  "chirurgie-aortique-ouverte": ["general", "neuraxial"],
  "endoprothese-aortique": ["general"],
  "endarteriectomie-carotidienne": ["general"],
  "revascularisation-ouverte-du-membre-inferieur": ["general"],
  "amputation-de-membre-inferieur": ["general"],
  "fistule-arterio-veineuse": ["superficial_block"],
  "resection-transuretrale-de-prostate": ["neuraxial"],
  "resection-transuretrale-de-vessie": ["neuraxial"],
  "prostatectomie-radicale": ["general"],
  "cystectomie-totale": ["general", "neuraxial"],
  "nephrectomie": ["general"],
  "ureteroscopie": ["general"],
  "hysterectomie": ["general"],
  "c-lioscopie-gynecologique": ["general"],
  "hysteroscopie": ["general"],
  "cesarienne": ["neuraxial"],
  "amygdalectomie": ["general"],
  "chirurgie-endonasale": ["general"],
  "chirurgie-carcinologique-tete-et-cou": ["general"],
  "cataracte": ["sedation"],
  "vitrectomie": ["sedation"],
  "extractions-dentaires": ["general"],
  "chirurgie-maxillo-faciale-majeure": ["general"],
  "craniotomie": ["general"],
  "cure-de-hernie-discale": ["general"],
  "lobectomie-pulmonaire": ["general", "deep_block"],
  "pneumonectomie": ["general", "deep_block"],
  "chirurgie-plastique-ou-reconstructrice": ["general"],
  "endoscopie-digestive": ["sedation"],
  "prothese-d-epaule": ["general", "superficial_block"],
  "reprise-de-prothese-de-hanche-ou-de-genou": ["general"],
  "arthroscopie-de-hanche": ["general"],
  "osteotomie": ["general"],
  "osteosynthese-du-poignet": ["superficial_block"],
  "osteosynthese-de-la-cheville": ["superficial_block", "general"],
  "vertebroplastie-cyphoplastie": ["sedation"],
  "cure-d-eventration": ["general"],
  "cure-de-hernie-ombilicale": ["general"],
  "fundoplicature-cure-de-hernie-hiatale": ["general"],
  "splenectomie": ["general"],
  "surrenalectomie": ["general"],
  "chirurgie-des-voies-biliaires": ["general"],
  "resection-du-rectum": ["general"],
  "retablissement-de-continuite": ["general"],
  "laparotomie-pour-occlusion": ["general"],
  "pose-de-chambre-implantable": ["sedation"],
  "sinus-pilonidal": ["general"],
  "chirurgie-des-varices": ["general"],
  "angioplastie-peripherique": ["sedation"],
  "nephrolithotomie-percutanee": ["general"],
  "enucleation-de-prostate-au-laser": ["general"],
  "transplantation-renale": ["general"],
  "chirurgie-scrotale": ["general"],
  "circoncision": ["general"],
  "cystoscopie-sonde-jj": ["general"],
  "bandelette-sous-uretrale": ["general"],
  "myomectomie": ["general"],
  "cure-de-prolapsus": ["general"],
  "ponction-ovocytaire": ["sedation"],
  "aspiration-endo-uterine": ["sedation"],
  "cerclage-du-col": ["neuraxial"],
  "revision-uterine-delivrance-artificielle": ["general"],
  "parotidectomie": ["general"],
  "chirurgie-de-l-oreille": ["general"],
  "aerateurs-transtympaniques": ["general"],
  "microchirurgie-laryngee": ["general"],
  "tracheotomie": ["general"],
  "chirurgie-du-strabisme": ["general"],
  "chirurgie-du-glaucome": ["sedation"],
  "chirurgie-des-paupieres": ["sedation"],
  "decompression-lombaire": ["general"],
  "arthrodese-cervicale-anterieure": ["general"],
  "derivation-ventriculo-peritoneale": ["general"],
  "mediastinoscopie": ["general"],
  "thoracoscopie-talcage": ["general"],
  "bronchoscopie-rigide": ["general"],
  "chirurgie-cardiaque-sous-cec": ["general"],
  "tavi": ["sedation"],
  "liposuccion": ["general"],
  "excision-greffe-de-brulure": ["general"],
  "cardioversion-electrique": ["sedation"],
  "electroconvulsivotherapie": ["general"],
  "echographie-trans-sophagienne": ["sedation"],
  "bronchoscopie-souple-ebus": ["sedation"],
  "radiologie-interventionnelle": ["sedation"],
  "thrombectomie-cerebrale": ["sedation", "general"],
  "imagerie-sous-anesthesie": ["sedation"],
};
for (const x of SURGERY_CATALOG) if (USUAL_TECHNIQUES[x.id]) x.techniques = USUAL_TECHNIQUES[x.id];

export const SURGERY_CATALOG_SOURCE =
  "Classes proposées : grade selon les exemples de NICE NG45 (2016), risque cardiaque selon ESC 2022 (chirurgie non cardiaque), risque hémorragique d'après le guide EHRA 2021 — à confirmer pour chaque patient.";

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function searchSurgeries(query: string, limit = 6, list: CatalogSurgery[] = SURGERY_CATALOG): CatalogSurgery[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  return list.filter((x) => [x.name, ...(x.aka ?? [])].some((h) => fold(h).includes(q))).slice(0, limit);
}

export const SURGERY_GRADES: { code: SurgeryGrade; label: string }[] = [
  { code: "minor", label: "Mineure" },
  { code: "intermediate", label: "Intermédiaire" },
  { code: "major", label: "Majeure" },
];

/** Bleeding risk of the procedure — what each level means (in the spirit of the EHRA 2021 practical guide). */
export const BLEEDING_RISKS: { code: BleedingRisk; label: string; definition: string }[] = [
  { code: "minimal", label: "Minime", definition: "Saignement rare, de faible volume, contrôlable localement — ex. cataracte, extraction dentaire simple, endoscopie sans biopsie, geste cutané superficiel." },
  { code: "low", label: "Faible", definition: "Saignement possible mais peu abondant ou compressible, sans conséquence grave — ex. arthroscopie, chirurgie de la main, hernie inguinale, chirurgie du sein." },
  { code: "high", label: "Élevé", definition: "Saignement potentiellement abondant, ou dans un espace clos où un hématome est grave — ex. chirurgie majeure abdominale, thoracique, orthopédique, vasculaire, urologique ; neurochirurgie, rachis." },
];
