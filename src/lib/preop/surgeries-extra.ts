// More procedures for the catalogue, by specialty — same conventions as
// surgeries.ts: grade after the NICE NG45 examples, cardiac risk after the
// ESC 2022 table (non-cardiac surgery; cardiac surgery is classed high),
// bleeding risk after the EHRA 2021 practical guide, Lee « high-risk
// surgery » (intraperitoneal, intrathoracic, suprainguinal vascular), the
// ARISCAT incision, a usual position, duration and technique — all
// starting points, editable in Paramètres › Interventions.

import type { CatalogSurgery, SurgeryGrade } from "./surgeries";
import type { RiskGrade } from "./dossier";
import type { BleedingRisk } from "./catalog";
import type { SurgeryExamProfile } from "./exams";
import type { Technique } from "./rules/types";

type Incision = CatalogSurgery["incision"];

interface Extra {
  aka?: string[];
  /** Skin-to-skin, hours. */
  h?: number;
  t?: Technique[];
  closed?: boolean;
  profile?: SurgeryExamProfile;
  pos?: string;
}

function slug(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const G = ["general"] as Technique[];
const SP = ["neuraxial"] as Technique[];
const BL = ["superficial_block"] as Technique[];
const SED = ["sedation"] as Technique[];

function x(name: string, category: string, grade: SurgeryGrade, cardiacRisk: RiskGrade, bleedingRisk: BleedingRisk, rcriHighRisk: boolean, incision: Incision, e: Extra = {}): CatalogSurgery & { examProfile?: SurgeryExamProfile } {
  return {
    id: slug(name),
    name,
    category,
    grade,
    cardiacRisk,
    bleedingRisk,
    rcriHighRisk,
    incision,
    position: e.pos,
    aka: e.aka,
    durationHours: e.h,
    techniques: e.t,
    closedSpace: e.closed,
    examProfile: e.profile,
  };
}

const P = "peripheral" as const;
const UA = "upper_abdominal" as const;
const IT = "intrathoracic" as const;
const DORSAL = "Décubitus dorsal";
const LATERAL = "Décubitus latéral";
const PRONE = "Décubitus ventral";
const LITHO = "Lithotomie (position gynécologique)";

export const EXTRA_SURGERIES = [
  // --- Chirurgie cardiaque (F) -------------------------------------------------------
  x("Pontages aorto-coronariens sous CEC", "F", "major", "high", "high", true, IT, { aka: ["PAC", "CABG", "pontage coronaire"], h: 4, t: G, profile: "cardiac_cpb", pos: DORSAL }),
  x("Pontages coronaires à cœur battant", "F", "major", "high", "high", true, IT, { aka: ["OPCAB", "off-pump"], h: 3.5, t: G, profile: "cardiac_cpb", pos: DORSAL }),
  x("Remplacement valvulaire aortique", "F", "major", "high", "high", true, IT, { aka: ["RVA", "AVR", "Bentall"], h: 4, t: G, profile: "cardiac_valve", pos: DORSAL }),
  x("Chirurgie de la valve mitrale", "F", "major", "high", "high", true, IT, { aka: ["plastie mitrale", "RVM", "remplacement mitral"], h: 4.5, t: G, profile: "cardiac_valve", pos: DORSAL }),
  x("Chirurgie valvulaire mini-invasive", "F", "major", "high", "high", true, IT, { aka: ["mini-thoracotomie", "robotique mitrale"], h: 4.5, t: G, profile: "cardiac_valve", pos: DORSAL }),
  x("Chirurgie de l'aorte thoracique", "F", "major", "high", "high", true, IT, { aka: ["remplacement de l'aorte ascendante", "crosse aortique", "dissection aortique type A"], h: 6, t: G, profile: "cardiac_cpb", pos: DORSAL }),
  x("Endoprothèse de l'aorte thoracique", "F", "major", "high", "high", true, IT, { aka: ["TEVAR"], h: 2.5, t: G, profile: "major_vascular", pos: DORSAL }),
  x("Chirurgie des cardiopathies congénitales de l'adulte", "F", "major", "high", "high", true, IT, { aka: ["CIA", "CIV", "Fallot"], h: 5, t: G, profile: "cardiac_cpb", pos: DORSAL }),
  x("Transplantation cardiaque", "F", "major", "high", "high", true, IT, { aka: ["greffe cardiaque"], h: 5, t: G, profile: "cardiac_cpb", pos: DORSAL }),
  x("Assistance ventriculaire gauche (implantation)", "F", "major", "high", "high", true, IT, { aka: ["LVAD", "HeartMate"], h: 5, t: G, profile: "cardiac_cpb", pos: DORSAL }),
  x("Péricardectomie ou fenêtre péricardique", "F", "major", "high", "high", true, IT, { aka: ["drainage péricardique", "tamponnade"], h: 2, t: G, pos: DORSAL }),
  x("MitraClip / réparation mitrale percutanée", "F", "intermediate", "intermediate", "low", false, P, { aka: ["TEER", "clip mitral"], h: 2.5, t: G, profile: "tavi", pos: DORSAL }),
  x("Fermeture percutanée de l'auricule gauche", "F", "intermediate", "intermediate", "low", false, P, { aka: ["Watchman", "Amulet", "LAAO"], h: 1.5, t: G, pos: DORSAL }),
  x("Fermeture percutanée de FOP ou CIA", "F", "minor", "low", "low", false, P, { aka: ["foramen ovale perméable", "Amplatzer"], h: 1, t: SED, pos: DORSAL }),
  x("Ablation de fibrillation auriculaire", "X", "intermediate", "low", "low", false, P, { aka: ["isolation des veines pulmonaires", "cryoablation", "ablation FA"], h: 3, t: G, pos: DORSAL }),
  x("Ablation par cathéter (autres arythmies)", "X", "intermediate", "low", "low", false, P, { aka: ["flutter", "TV", "électrophysiologie"], h: 2.5, t: SED, pos: DORSAL }),
  x("Implantation de pacemaker ou de défibrillateur", "X", "minor", "low", "low", false, P, { aka: ["PM", "DAI", "ICD", "resynchronisation", "CRT"], h: 1.25, t: SED, pos: DORSAL }),
  x("Extraction de sondes de stimulation", "X", "intermediate", "intermediate", "high", false, P, { aka: ["extraction de sonde", "laser"], h: 3, t: G, pos: DORSAL }),
  x("Coronarographie et angioplastie", "X", "minor", "low", "low", false, P, { aka: ["PCI", "stent coronaire"], h: 1, t: SED, pos: DORSAL }),

  // --- Chirurgie thoracique (G) ----------------------------------------------------------
  x("Segmentectomie ou wedge par thoracoscopie", "G", "major", "low", "low", true, IT, { aka: ["wedge", "VATS", "résection atypique", "RATS"], h: 2, t: G, profile: "lung_resection", pos: LATERAL }),
  x("Lobectomie par thoracotomie", "G", "major", "intermediate", "high", true, IT, { aka: ["thoracotomie"], h: 3, t: G, profile: "lung_resection", pos: LATERAL }),
  x("Décortication pleurale", "G", "major", "intermediate", "high", true, IT, { aka: ["empyème", "pleurectomie"], h: 3, t: G, pos: LATERAL }),
  x("Chirurgie du pneumothorax", "G", "major", "low", "low", true, IT, { aka: ["bullectomie", "pleurodèse", "abrasion pleurale"], h: 1.5, t: G, pos: LATERAL }),
  x("Thymectomie", "G", "major", "intermediate", "high", true, IT, { aka: ["thymome", "myasthénie"], h: 2.5, t: G, pos: DORSAL }),
  x("Résection de tumeur du médiastin", "G", "major", "intermediate", "high", true, IT, { aka: ["médiastin"], h: 3, t: G, pos: DORSAL }),
  x("Réduction de volume pulmonaire", "G", "major", "intermediate", "high", true, IT, { aka: ["emphysème", "LVRS"], h: 3, t: G, profile: "lung_resection", pos: LATERAL }),
  x("Transplantation pulmonaire", "G", "major", "high", "high", true, IT, { aka: ["greffe pulmonaire"], h: 7, t: G, profile: "lung_resection", pos: DORSAL }),
  x("Chirurgie de la paroi thoracique", "G", "major", "intermediate", "high", true, IT, { aka: ["pectus excavatum", "Nuss", "résection costale"], h: 2.5, t: G, pos: DORSAL }),
  x("Résection trachéale", "G", "major", "intermediate", "high", true, IT, { aka: ["sténose trachéale", "trachéoplastie"], h: 4, t: G, pos: DORSAL }),
  x("Chirurgie de l'hyperhidrose", "G", "minor", "low", "low", true, IT, { aka: ["sympathectomie thoracique"], h: 1, t: G, pos: "Semi-assise, bras en abduction" }),
  x("Drain thoracique ou pleuroscopie", "G", "minor", "low", "low", false, IT, { aka: ["pleuroscopie", "drainage pleural"], h: 0.5, t: SED, pos: LATERAL }),

  // --- Vasculaire (A) ----------------------------------------------------------------------
  x("Stenting carotidien", "A", "intermediate", "intermediate", "low", false, P, { aka: ["angioplastie carotidienne", "CAS"], h: 1.5, t: SED, pos: DORSAL }),
  x("Pontage fémoro-poplité ou distal", "A", "major", "high", "high", false, P, { aka: ["pontage fémoro-poplité", "pontage jambier"], h: 3.5, t: G, pos: DORSAL }),
  x("Pontage aorto-bifémoral", "A", "major", "high", "high", true, UA, { aka: ["aorto-bi-fémoral", "Leriche"], h: 4, t: G, profile: "major_vascular", pos: DORSAL }),
  x("Endartériectomie fémorale", "A", "intermediate", "intermediate", "high", false, P, { aka: ["désobstruction fémorale", "patch fémoral"], h: 2, t: G, pos: DORSAL }),
  x("Embolectomie artérielle", "A", "intermediate", "high", "high", false, P, { aka: ["ischémie aiguë", "Fogarty", "thrombectomie artérielle"], h: 1.5, t: G, pos: DORSAL }),
  x("Endoprothèse fenêtrée ou branchée", "A", "major", "high", "high", true, P, { aka: ["FEVAR", "BEVAR"], h: 4, t: G, profile: "major_vascular", pos: DORSAL }),
  x("Anévrisme aortique rompu", "A", "major", "high", "high", true, UA, { aka: ["AAA rompu", "rupture d'anévrisme"], h: 3, t: G, profile: "major_vascular", pos: DORSAL }),
  x("Amputation d'orteil ou transmétatarsienne", "A", "minor", "intermediate", "low", false, P, { aka: ["amputation d'orteil", "Lisfranc"], h: 0.75, t: [...SP, ...BL], pos: DORSAL }),
  x("Amputation au-dessus du genou", "A", "major", "high", "high", false, P, { aka: ["amputation de cuisse", "transfémorale"], h: 1.25, t: SP, pos: DORSAL }),
  x("Fistule artério-veineuse : superficialisation ou reprise", "A", "minor", "low", "low", false, P, { aka: ["FAV", "superficialisation"], h: 1, t: BL, pos: "Décubitus dorsal, bras sur table" }),
  x("Cathéter de dialyse ou de dialyse péritonéale", "A", "minor", "low", "low", false, P, { aka: ["Tenckhoff", "cathéter tunnellisé"], h: 0.75, t: SED, pos: DORSAL }),
  x("Chirurgie de l'artère rénale ou digestive", "A", "major", "high", "high", true, UA, { aka: ["pontage mésentérique", "ischémie mésentérique"], h: 4, t: G, profile: "major_vascular", pos: DORSAL }),
  x("Thrombo-endartériectomie pulmonaire", "F", "major", "high", "high", true, IT, { aka: ["HTP thromboembolique", "CTEPH"], h: 7, t: G, profile: "cardiac_cpb", pos: DORSAL }),
  x("Chirurgie des malformations vasculaires", "A", "intermediate", "low", "high", false, P, { aka: ["angiome", "malformation artérioveineuse"], h: 2, t: G, pos: "Selon la localisation" }),

  // --- Digestif (A) -------------------------------------------------------------------------
  x("Hernie inguinale par cœlioscopie", "A", "intermediate", "low", "low", true, P, { aka: ["TAPP", "TEP"], h: 1, t: G, pos: DORSAL }),
  x("Hernie crurale", "A", "intermediate", "low", "low", false, P, { aka: ["hernie fémorale"], h: 1, t: G, pos: DORSAL }),
  x("Hernie étranglée", "A", "intermediate", "intermediate", "low", true, P, { aka: ["hernie incarcérée"], h: 1.5, t: G, pos: DORSAL }),
  x("Gastrectomie longitudinale", "A", "major", "intermediate", "high", true, UA, { aka: ["sleeve gastrectomy", "sleeve"], h: 1.5, t: G, profile: "bariatric", pos: "Décubitus dorsal, proclive, jambes écartées" }),
  x("Bypass gastrique", "A", "major", "intermediate", "high", true, UA, { aka: ["Roux-en-Y", "RYGB", "bypass"], h: 2, t: G, profile: "bariatric", pos: "Décubitus dorsal, proclive, jambes écartées" }),
  x("Reprise de chirurgie bariatrique", "A", "major", "intermediate", "high", true, UA, { aka: ["conversion sleeve", "anneau gastrique"], h: 3, t: G, profile: "bariatric", pos: "Décubitus dorsal, proclive" }),
  x("Pancréatectomie gauche", "A", "major", "high", "high", true, UA, { aka: ["splénopancréatectomie", "pancréatectomie caudale"], h: 4, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Pancréatectomie totale", "A", "major", "high", "high", true, UA, { aka: ["pancréatectomie"], h: 6, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Nécrosectomie pancréatique", "A", "major", "high", "high", true, UA, { aka: ["pancréatite nécrosante"], h: 2, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Hépatectomie majeure", "A", "major", "high", "high", true, UA, { aka: ["hépatectomie droite", "hépatectomie gauche", "lobectomie hépatique"], h: 5, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Résection hépatique mineure par cœlioscopie", "A", "major", "high", "high", true, UA, { aka: ["métastasectomie", "segmentectomie hépatique"], h: 3, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Transplantation hépatique", "A", "major", "high", "high", true, UA, { aka: ["greffe hépatique", "greffe de foie"], h: 7, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Prélèvement de foie ou de rein sur donneur vivant", "A", "major", "intermediate", "high", true, UA, { aka: ["donneur vivant"], h: 4, t: G, pos: DORSAL }),
  x("Kyste hydatique ou kyste hépatique", "A", "major", "high", "high", true, UA, { aka: ["fenestration de kyste"], h: 2.5, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Anastomose bilio-digestive", "A", "major", "high", "high", true, UA, { aka: ["hépatico-jéjunostomie", "cholédoco-duodénostomie"], h: 4, t: G, profile: "hepatobiliary", pos: DORSAL }),
  x("Œsophagectomie par thoracoscopie", "A", "major", "high", "high", true, IT, { aka: ["Lewis-Santy", "McKeown", "œsophagectomie mini-invasive"], h: 6, t: G, profile: "major_digestive", pos: "Décubitus ventral puis dorsal" }),
  x("Myotomie de Heller", "A", "intermediate", "intermediate", "low", true, UA, { aka: ["achalasie", "cardiomyotomie"], h: 2, t: G, pos: DORSAL }),
  x("Gastrostomie chirurgicale", "A", "intermediate", "intermediate", "low", true, UA, { aka: ["jéjunostomie d'alimentation"], h: 1, t: G, pos: DORSAL }),
  x("Gastrectomie totale", "A", "major", "intermediate", "high", true, UA, { aka: ["gastrectomie totale", "cancer de l'estomac"], h: 4, t: G, profile: "major_digestive", pos: DORSAL }),
  x("Ulcère perforé", "A", "major", "high", "high", true, UA, { aka: ["suture d'ulcère", "perforation gastrique"], h: 1.5, t: G, pos: DORSAL }),
  x("Résection de l'intestin grêle", "A", "major", "intermediate", "high", true, UA, { aka: ["entérectomie", "résection iléale"], h: 2.5, t: G, profile: "major_digestive", pos: DORSAL }),
  x("Hémicolectomie droite", "A", "major", "intermediate", "high", true, UA, { aka: ["colectomie droite"], h: 2.5, t: G, profile: "major_digestive", pos: DORSAL }),
  x("Sigmoïdectomie", "A", "major", "intermediate", "high", true, UA, { aka: ["colectomie gauche", "diverticulite"], h: 3, t: G, profile: "major_digestive", pos: "Décubitus dorsal, jambes écartées ou Lloyd-Davies" }),
  x("Colectomie totale", "A", "major", "high", "high", true, UA, { aka: ["coloprotectomie", "anastomose iléo-anale", "RCH"], h: 5, t: G, profile: "major_digestive", pos: "Lloyd-Davies" }),
  x("Amputation abdomino-périnéale", "A", "major", "high", "high", true, UA, { aka: ["AAP", "Miles"], h: 5, t: G, profile: "major_digestive", pos: "Lloyd-Davies puis ventral" }),
  x("Exentération pelvienne", "A", "major", "high", "high", true, UA, { aka: ["pelvectomie"], h: 8, t: G, profile: "major_digestive", pos: "Lloyd-Davies" }),
  x("Chirurgie de cytoréduction et CHIP", "A", "major", "high", "high", true, UA, { aka: ["HIPEC", "CHIP", "carcinose péritonéale"], h: 8, t: G, profile: "major_digestive", pos: DORSAL }),
  x("Laparotomie exploratrice", "A", "major", "intermediate", "high", true, UA, { aka: ["laparotomie", "abdomen aigu"], h: 2, t: G, pos: DORSAL }),
  x("Laparoscopie exploratrice", "A", "intermediate", "intermediate", "low", true, UA, { aka: ["cœlioscopie diagnostique"], h: 1, t: G, pos: DORSAL }),
  x("Péritonite généralisée", "A", "major", "high", "high", true, UA, { aka: ["lavage péritonéal", "abcès intra-abdominal"], h: 2.5, t: G, pos: DORSAL }),
  x("Ischémie mésentérique : résection", "A", "major", "high", "high", true, UA, { aka: ["infarctus mésentérique"], h: 3, t: G, pos: DORSAL }),
  x("Stomie : confection ou fermeture", "A", "intermediate", "intermediate", "low", true, UA, { aka: ["iléostomie", "colostomie", "fermeture de stomie"], h: 1.5, t: G, pos: DORSAL }),
  x("Hémorroïdectomie", "A", "minor", "low", "low", false, P, { aka: ["Milligan-Morgan", "Longo", "HAL-RAR", "hémorroïdes"], h: 0.75, t: SP, pos: LITHO }),
  x("Fistule ou abcès anal", "A", "minor", "low", "low", false, P, { aka: ["fistule anale", "abcès de la marge", "séton"], h: 0.5, t: SP, pos: LITHO }),
  x("Fissure anale", "A", "minor", "low", "low", false, P, { aka: ["sphinctérotomie", "fissurectomie"], h: 0.5, t: SP, pos: LITHO }),
  x("Rectopexie", "A", "intermediate", "intermediate", "low", true, UA, { aka: ["prolapsus rectal", "promontofixation rectale"], h: 2.5, t: G, pos: "Décubitus dorsal, Trendelenburg" }),
  x("Surrénalectomie par cœlioscopie", "A", "major", "high", "high", true, UA, { aka: ["phéochromocytome", "Conn", "adénome surrénalien"], h: 2.5, t: G, pos: LATERAL }),
  x("Parathyroïdectomie", "A", "intermediate", "low", "low", false, P, { aka: ["hyperparathyroïdie", "adénome parathyroïdien"], h: 1.5, t: G, profile: "thyroid", pos: "Décubitus dorsal, cou en extension" }),
  x("Thyroïdectomie totale", "A", "major", "low", "high", false, P, { aka: ["thyroïdectomie totale", "goitre", "cancer thyroïdien"], h: 2, t: G, profile: "thyroid", pos: "Décubitus dorsal, cou en extension" }),
  x("Lobo-isthmectomie thyroïdienne", "A", "intermediate", "low", "low", false, P, { aka: ["hémithyroïdectomie", "nodule thyroïdien"], h: 1.25, t: G, profile: "thyroid", pos: "Décubitus dorsal, cou en extension" }),
  x("Mastectomie", "A", "major", "low", "low", false, P, { aka: ["mastectomie totale", "Patey"], h: 1.5, t: G, pos: "Décubitus dorsal, bras en abduction" }),
  x("Tumorectomie mammaire et ganglion sentinelle", "A", "intermediate", "low", "low", false, P, { aka: ["tumorectomie", "ganglion sentinelle", "zonectomie"], h: 1.25, t: G, pos: "Décubitus dorsal, bras en abduction" }),
  x("Curage axillaire", "A", "intermediate", "low", "low", false, P, { aka: ["curage ganglionnaire axillaire"], h: 1.5, t: G, pos: "Décubitus dorsal, bras en abduction" }),
  x("Curage inguinal", "A", "intermediate", "low", "low", false, P, { aka: ["lymphadénectomie inguinale"], h: 2, t: G, pos: DORSAL }),
  x("Exérèse de lipome ou de kyste", "A", "minor", "low", "minimal", false, P, { aka: ["lipome", "kyste sébacé", "tumeur sous-cutanée"], h: 0.5, t: SED, pos: "Selon la localisation" }),
  x("Mélanome : reprise d'exérèse", "A", "minor", "low", "minimal", false, P, { aka: ["élargissement", "mélanome"], h: 1, t: G, pos: "Selon la localisation" }),
  x("Débridement de plaie ou d'escarre", "A", "minor", "low", "low", false, P, { aka: ["nécrosectomie cutanée", "escarre", "VAC"], h: 0.75, t: G, pos: "Selon la localisation" }),
  x("Fasciite nécrosante", "A", "major", "high", "high", false, P, { aka: ["dermohypodermite nécrosante", "Fournier"], h: 2, t: G, pos: "Selon la localisation" }),
  x("Splénectomie par cœlioscopie", "A", "intermediate", "intermediate", "high", true, UA, { aka: ["PTI"], h: 2, t: G, pos: LATERAL }),

  // --- Urologie (J2) --------------------------------------------------------------------------
  x("Prostatectomie radicale robot-assistée", "J2", "major", "intermediate", "high", true, P, { aka: ["prostatectomie robotique", "Da Vinci"], h: 3, t: G, pos: "Trendelenburg forcé, jambes écartées" }),
  x("Néphrectomie partielle", "J2", "major", "intermediate", "high", true, UA, { aka: ["tumorectomie rénale"], h: 3, t: G, pos: "Décubitus latéral (lombotomie) ou dorsal" }),
  x("Néphro-urétérectomie", "J2", "major", "intermediate", "high", true, UA, { aka: ["tumeur de la voie excrétrice"], h: 4, t: G, pos: LATERAL }),
  x("Cystoprostatectomie avec dérivation urinaire", "J2", "major", "high", "high", true, UA, { aka: ["Bricker", "néovessie"], h: 6, t: G, profile: "major_digestive", pos: DORSAL }),
  x("Urétérorénoscopie souple et laser", "J2", "minor", "low", "low", false, P, { aka: ["URS souple", "lithotritie laser", "calcul du rein", "calcul urétéral"], h: 1, t: G, pos: LITHO }),
  x("Lithotritie extracorporelle", "J2", "minor", "low", "low", false, P, { aka: ["LEC", "lithotripsie", "ESWL", "calcul rénal"], h: 0.75, t: SED, pos: DORSAL }),
  x("Pyéloplastie", "J2", "intermediate", "intermediate", "low", true, UA, { aka: ["syndrome de la jonction"], h: 2.5, t: G, pos: LATERAL }),
  x("Adénomectomie prostatique", "J2", "major", "intermediate", "high", true, P, { aka: ["adénomectomie voie haute", "Millin"], h: 2, t: SP, pos: DORSAL }),
  x("Vaporisation prostatique au laser", "J2", "intermediate", "low", "low", false, P, { aka: ["PVP", "GreenLight"], h: 1, t: SP, pos: LITHO }),
  x("Sphincter urinaire artificiel", "J2", "intermediate", "low", "low", false, P, { aka: ["AMS 800", "incontinence"], h: 1.5, t: SP, pos: LITHO }),
  x("Implant pénien", "J2", "intermediate", "low", "low", false, P, { aka: ["prothèse pénienne"], h: 1.5, t: SP, pos: DORSAL }),
  x("Orchidectomie", "J2", "minor", "low", "low", false, P, { aka: ["cancer du testicule", "pulpectomie"], h: 0.75, t: SP, pos: DORSAL }),
  x("Cure d'hydrocèle ou de varicocèle", "J2", "minor", "low", "low", false, P, { aka: ["hydrocèle", "varicocèle", "kyste du cordon"], h: 0.75, t: SP, pos: DORSAL }),
  x("Vasectomie", "J2", "minor", "low", "minimal", false, P, { h: 0.5, t: SED, pos: DORSAL }),
  x("Urétrotomie ou urétroplastie", "J2", "intermediate", "low", "low", false, P, { aka: ["sténose urétrale", "urétrotomie interne"], h: 1.5, t: SP, pos: LITHO }),
  x("Biopsies prostatiques", "J2", "minor", "low", "low", false, P, { aka: ["biopsie transpérinéale"], h: 0.5, t: SED, pos: LITHO }),
  x("Curiethérapie prostatique", "J2", "minor", "low", "low", false, P, { aka: ["grains d'iode"], h: 1.5, t: SP, pos: LITHO }),
  x("Injection intravésicale de toxine botulique", "J2", "minor", "low", "minimal", false, P, { aka: ["Botox vésical"], h: 0.5, t: SED, pos: LITHO }),
  x("Surrénalectomie ou chirurgie rétropéritonéale", "J2", "major", "high", "high", true, UA, { aka: ["curage rétropéritonéal", "masse rétropéritonéale"], h: 4, t: G, pos: DORSAL }),
  x("Circoncision de l'enfant ou cure de phimosis", "J2", "minor", "low", "minimal", false, P, { aka: ["phimosis", "posthectomie"], h: 0.5, t: G, pos: DORSAL }),

  // --- Gynécologie (J1) et obstétrique (B) --------------------------------------------------
  x("Hystérectomie vaginale", "J1", "intermediate", "intermediate", "low", false, P, { aka: ["HV"], h: 1.5, t: SP, pos: LITHO }),
  x("Hystérectomie par cœlioscopie ou robot", "J1", "major", "intermediate", "high", true, P, { aka: ["hystérectomie totale", "HTL", "robot"], h: 2.5, t: G, pos: "Lithotomie, Trendelenburg" }),
  x("Chirurgie carcinologique de l'ovaire", "J1", "major", "high", "high", true, UA, { aka: ["cytoréduction ovarienne", "cancer de l'ovaire", "debulking"], h: 6, t: G, profile: "major_digestive", pos: DORSAL }),
  x("Hystérectomie élargie", "J1", "major", "intermediate", "high", true, UA, { aka: ["Wertheim", "cancer du col", "lymphadénectomie pelvienne"], h: 4, t: G, pos: "Lithotomie, Trendelenburg" }),
  x("Kystectomie ovarienne", "J1", "intermediate", "low", "low", true, P, { aka: ["kyste de l'ovaire", "torsion d'annexe"], h: 1.25, t: G, pos: "Lithotomie, Trendelenburg" }),
  x("Grossesse extra-utérine", "J1", "intermediate", "intermediate", "high", true, P, { aka: ["GEU", "salpingectomie"], h: 1, t: G, pos: "Lithotomie, Trendelenburg" }),
  x("Endométriose profonde", "J1", "major", "intermediate", "high", true, UA, { aka: ["endométriose", "nodule recto-vaginal"], h: 4, t: G, pos: "Lithotomie, Trendelenburg" }),
  x("Promontofixation", "J1", "major", "intermediate", "low", true, P, { aka: ["prolapsus génital", "sacrocolpopexie"], h: 3, t: G, pos: "Lithotomie, Trendelenburg" }),
  x("Conisation", "J1", "intermediate", "low", "low", false, P, { aka: ["LEEP", "anse diathermique"], h: 0.5, t: SED, pos: LITHO }),
  x("Stérilisation tubaire", "J1", "minor", "low", "low", true, P, { aka: ["ligature des trompes", "salpingectomie bilatérale"], h: 0.75, t: G, pos: "Lithotomie, Trendelenburg" }),
  x("Vulvectomie", "J1", "intermediate", "low", "low", false, P, { aka: ["cancer de la vulve"], h: 2, t: G, pos: LITHO }),
  x("Interruption volontaire de grossesse", "J1", "minor", "low", "low", false, P, { aka: ["IVG", "aspiration"], h: 0.25, t: SED, pos: LITHO }),
  x("Césarienne en urgence", "B", "major", "low", "high", true, P, { aka: ["césarienne code rouge", "césarienne urgente"], h: 0.75, t: SP, profile: "obstetric", pos: "Décubitus dorsal, inclinaison latérale gauche" }),
  x("Césarienne programmée", "B", "major", "low", "high", true, P, { aka: ["césarienne élective"], h: 0.75, t: SP, profile: "obstetric", pos: "Décubitus dorsal, inclinaison latérale gauche" }),
  x("Hystérectomie d'hémostase", "B", "major", "high", "high", true, P, { aka: ["placenta accreta", "hémorragie du post-partum"], h: 2.5, t: G, profile: "obstetric", pos: DORSAL }),
  x("Analgésie péridurale du travail", "B", "minor", "low", "minimal", false, P, { aka: ["péridurale obstétricale", "APD"], h: 0.25, t: SP, profile: "obstetric", pos: "Assise ou décubitus latéral" }),
  x("Suture de déchirure périnéale", "B", "minor", "low", "low", false, P, { aka: ["déchirure du 3e degré", "épisiotomie"], h: 0.75, t: SP, profile: "obstetric", pos: LITHO }),
  x("Version par manœuvre externe", "B", "minor", "low", "minimal", false, P, { aka: ["VME"], h: 0.5, t: SP, profile: "obstetric", pos: DORSAL }),
  x("Chirurgie non obstétricale pendant la grossesse", "B", "intermediate", "low", "low", false, P, { aka: ["appendicectomie de la femme enceinte"], h: 1.5, t: G, pos: "Décubitus latéral gauche incliné" }),

  // --- ORL et tête et cou (C) -----------------------------------------------------------------
  x("Laryngectomie totale", "C", "major", "intermediate", "high", false, P, { aka: ["laryngectomie"], h: 5, t: G, profile: "major_digestive", pos: "Décubitus dorsal, cou en extension" }),
  x("Pharyngectomie ou buccopharyngectomie", "C", "major", "intermediate", "high", false, P, { aka: ["commando", "lambeau libre"], h: 8, t: G, profile: "major_digestive", pos: "Décubitus dorsal, tête tournée" }),
  x("Curage ganglionnaire cervical", "C", "major", "intermediate", "high", false, P, { aka: ["évidement cervical"], h: 2.5, t: G, pos: "Décubitus dorsal, tête tournée" }),
  x("Chirurgie endoscopique des sinus", "C", "intermediate", "low", "low", false, P, { aka: ["FESS", "polypose nasale", "ethmoïdectomie"], h: 1.5, t: G, pos: "Décubitus dorsal, proclive" }),
  x("Septoplastie ou rhinoplastie", "C", "intermediate", "low", "low", false, P, { aka: ["turbinoplastie", "rhinoseptoplastie"], h: 1.25, t: G, pos: "Décubitus dorsal, proclive" }),
  x("Tympanoplastie", "C", "intermediate", "low", "minimal", false, P, { aka: ["myringoplastie", "cholestéatome", "mastoïdectomie"], h: 2, t: G, pos: "Décubitus dorsal, tête tournée" }),
  x("Implant cochléaire", "C", "intermediate", "low", "minimal", false, P, { aka: ["implant auditif"], h: 2, t: G, pos: "Décubitus dorsal, tête tournée" }),
  x("Stapédotomie", "C", "intermediate", "low", "minimal", false, P, { aka: ["otospongiose"], h: 1.25, t: G, pos: "Décubitus dorsal, tête tournée" }),
  x("Chirurgie du ronflement et du SAOS", "C", "intermediate", "low", "low", false, P, { aka: ["uvulopalatopharyngoplastie", "UPPP", "stimulation du nerf hypoglosse"], h: 1.5, t: G, pos: DORSAL }),
  x("Laser laryngé ou trachéal", "C", "minor", "low", "low", false, P, { aka: ["laser CO2", "papillomatose", "jet ventilation"], h: 0.75, t: G, pos: "Décubitus dorsal, laryngoscope en suspension" }),
  x("Panendoscopie ORL", "C", "minor", "low", "low", false, P, { aka: ["panendoscopie", "laryngoscopie directe"], h: 0.5, t: G, pos: DORSAL }),
  x("Chirurgie de la glande sous-maxillaire", "C", "intermediate", "low", "low", false, P, { aka: ["sous-mandibulaire", "sialendoscopie"], h: 1.5, t: G, pos: "Décubitus dorsal, tête tournée" }),
  x("Abcès péri-amygdalien ou cervical profond", "C", "intermediate", "low", "low", false, P, { aka: ["phlegmon", "cellulite cervicale"], h: 1, t: G, pos: DORSAL }),
  x("Hémorragie après amygdalectomie", "C", "intermediate", "low", "high", false, P, { aka: ["reprise amygdale"], h: 0.5, t: G, pos: DORSAL }),
  x("Chirurgie de la base du crâne par voie endonasale", "C", "major", "intermediate", "high", false, P, { aka: ["hypophyse", "voie trans-sphénoïdale"], h: 4, t: G, closed: true, profile: "neurosurgery", pos: "Décubitus dorsal, proclive" }),

  // --- Stomatologie, maxillo-faciale (E) -----------------------------------------------------
  x("Extraction des dents de sagesse", "E", "minor", "low", "minimal", false, P, { aka: ["dents de sagesse", "germectomie"], h: 0.75, t: G, pos: DORSAL }),
  x("Soins dentaires sous anesthésie générale", "E", "minor", "low", "minimal", false, P, { aka: ["soins dentaires", "patient handicapé"], h: 1.5, t: G, pos: DORSAL }),
  x("Implants dentaires ou greffe osseuse", "E", "minor", "low", "low", false, P, { aka: ["sinus lift", "greffe osseuse"], h: 1.5, t: SED, pos: DORSAL }),
  x("Ostéotomie bimaxillaire", "E", "major", "low", "high", false, P, { aka: ["orthognathie", "Le Fort I", "BSSO"], h: 4, t: G, pos: DORSAL }),
  x("Fracture de mandibule ou du massif facial", "E", "intermediate", "low", "low", false, P, { aka: ["fracture zygomatique", "fracture orbitaire", "blocage maxillo-mandibulaire"], h: 2, t: G, pos: DORSAL }),
  x("Chirurgie de l'articulation temporo-mandibulaire", "E", "intermediate", "low", "low", false, P, { aka: ["ATM", "arthroscopie ATM"], h: 1.5, t: G, pos: DORSAL }),
  x("Cellulite ou abcès dentaire", "E", "intermediate", "low", "low", false, P, { aka: ["abcès dentaire", "Ludwig"], h: 1, t: G, pos: DORSAL }),

  // --- Neurochirurgie (D) -------------------------------------------------------------------
  x("Craniotomie pour tumeur", "D", "major", "intermediate", "high", false, P, { aka: ["méningiome", "gliome", "métastase cérébrale"], h: 4, t: G, closed: true, profile: "neurosurgery", pos: "Selon l'abord" }),
  x("Craniotomie éveillée", "D", "major", "intermediate", "high", false, P, { aka: ["awake craniotomy", "chirurgie éveillée"], h: 5, t: SED, closed: true, profile: "neurosurgery", pos: "Décubitus latéral ou dorsal" }),
  x("Hématome sous-dural chronique", "D", "intermediate", "intermediate", "high", false, P, { aka: ["HSD", "trous de trépan"], h: 1, t: G, closed: true, profile: "neurosurgery", pos: DORSAL }),
  x("Hématome extradural ou sous-dural aigu", "D", "major", "high", "high", false, P, { aka: ["HED", "traumatisme crânien", "craniectomie décompressive"], h: 2, t: G, closed: true, profile: "neurosurgery", pos: DORSAL }),
  x("Anévrisme cérébral : clippage", "D", "major", "intermediate", "high", false, P, { aka: ["clippage", "hémorragie sous-arachnoïdienne"], h: 5, t: G, closed: true, profile: "neurosurgery", pos: "Selon l'abord" }),
  x("Embolisation d'anévrisme ou de MAV cérébrale", "X", "intermediate", "intermediate", "low", false, P, { aka: ["coiling", "embolisation", "neuroradiologie interventionnelle"], h: 2.5, t: G, closed: true, pos: DORSAL }),
  x("Chirurgie de la fosse postérieure", "D", "major", "intermediate", "high", false, P, { aka: ["Chiari", "neurinome", "position assise"], h: 5, t: G, closed: true, profile: "neurosurgery", pos: "Ventral, latéral ou assise" }),
  x("Chirurgie de l'hypophyse", "D", "major", "intermediate", "high", false, P, { aka: ["adénome hypophysaire", "trans-sphénoïdal"], h: 3, t: G, closed: true, profile: "neurosurgery", pos: "Décubitus dorsal, proclive" }),
  x("Stimulation cérébrale profonde", "D", "major", "intermediate", "high", false, P, { aka: ["DBS", "Parkinson"], h: 5, t: SED, closed: true, profile: "neurosurgery", pos: "Semi-assise, cadre stéréotaxique" }),
  x("Biopsie cérébrale stéréotaxique", "D", "intermediate", "low", "high", false, P, { aka: ["biopsie stéréotaxique"], h: 1.5, t: G, closed: true, profile: "neurosurgery", pos: DORSAL }),
  x("Dérivation ventriculaire externe", "D", "intermediate", "low", "high", false, P, { aka: ["DVE", "hydrocéphalie aiguë"], h: 0.75, t: G, closed: true, pos: DORSAL }),
  x("Ventriculocisternostomie endoscopique", "D", "intermediate", "low", "high", false, P, { aka: ["VCS", "hydrocéphalie"], h: 1.5, t: G, closed: true, profile: "neurosurgery", pos: DORSAL }),
  x("Chirurgie de l'épilepsie", "D", "major", "intermediate", "high", false, P, { aka: ["lobectomie temporale", "électrodes profondes"], h: 5, t: G, closed: true, profile: "neurosurgery", pos: "Selon l'abord" }),
  x("Cranioplastie", "D", "intermediate", "low", "high", false, P, { aka: ["volet crânien"], h: 2, t: G, pos: DORSAL }),
  x("Laminectomie cervicale ou arthrodèse cervicale postérieure", "D", "major", "intermediate", "high", false, P, { aka: ["myélopathie cervicarthrosique"], h: 3, t: G, closed: true, pos: PRONE }),
  x("Hernie discale cervicale (arthrodèse antérieure)", "D", "major", "intermediate", "high", false, P, { aka: ["ACDF", "discectomie cervicale"], h: 2, t: G, closed: true, pos: "Décubitus dorsal, cou en extension" }),
  x("Tumeur intramédullaire ou du canal rachidien", "D", "major", "intermediate", "high", false, P, { aka: ["neurinome", "méningiome rachidien"], h: 4, t: G, closed: true, profile: "neurosurgery", pos: PRONE }),
  x("Neurostimulateur médullaire", "D", "intermediate", "low", "high", false, P, { aka: ["stimulation médullaire", "SCS"], h: 1.5, t: G, closed: true, pos: PRONE }),
  x("Pompe intrathécale", "D", "intermediate", "low", "high", false, P, { aka: ["pompe à baclofène", "pompe à morphine"], h: 1.5, t: G, closed: true, pos: LATERAL }),
  x("Décompression du nerf ulnaire ou carpien", "D", "minor", "low", "minimal", false, P, { aka: ["canal carpien", "canal cubital", "nerf ulnaire"], h: 0.5, t: BL, pos: "Décubitus dorsal, bras sur table" }),
  x("Décompression microvasculaire", "D", "major", "intermediate", "high", false, P, { aka: ["névralgie du trijumeau", "Jannetta"], h: 3, t: G, closed: true, profile: "neurosurgery", pos: "Décubitus latéral" }),

  // --- Ophtalmologie (I) ---------------------------------------------------------------------
  x("Chirurgie du décollement de rétine", "I", "intermediate", "low", "low", false, P, { aka: ["indentation", "cerclage", "tamponnement gazeux"], h: 1.5, t: G, closed: true, pos: DORSAL }),
  x("Kératoplastie", "I", "intermediate", "low", "minimal", false, P, { aka: ["greffe de cornée", "DMEK"], h: 1.25, t: G, pos: DORSAL }),
  x("Plaie du globe oculaire", "I", "intermediate", "low", "low", false, P, { aka: ["globe ouvert", "traumatisme oculaire"], h: 1.5, t: G, closed: true, pos: DORSAL }),
  x("Chirurgie des voies lacrymales", "I", "minor", "low", "low", false, P, { aka: ["DCR", "dacryocystorhinostomie"], h: 1, t: G, pos: DORSAL }),
  x("Énucléation ou éviscération", "I", "intermediate", "low", "low", false, P, { aka: ["énucléation"], h: 1.25, t: G, pos: DORSAL }),
  x("Injections intravitréennes", "I", "minor", "low", "minimal", false, P, { aka: ["IVT", "anti-VEGF"], h: 0.25, t: SED, pos: DORSAL }),
  x("Chirurgie de l'orbite", "I", "intermediate", "low", "high", false, P, { aka: ["décompression orbitaire", "tumeur de l'orbite"], h: 2.5, t: G, closed: true, pos: DORSAL }),

  // --- Orthopédie et traumatologie (K) --------------------------------------------------------
  x("Prothèse unicompartimentale du genou", "K", "major", "intermediate", "high", false, P, { aka: ["PUC", "uni"], h: 1.25, t: [...SP, ...BL], profile: "arthroplasty", pos: DORSAL }),
  x("Prothèse totale de cheville", "K", "major", "low", "low", false, P, { h: 2, t: [...SP, ...BL], pos: DORSAL }),
  x("Prothèse de coude", "K", "major", "low", "low", false, P, { h: 2, t: [...G, ...BL], pos: "Décubitus latéral, bras sur appui" }),
  x("Prothèse intermédiaire de hanche", "K", "major", "intermediate", "high", false, P, { aka: ["PIH", "hémiarthroplastie", "Moore"], h: 1.25, t: SP, profile: "arthroplasty", pos: "Décubitus latéral" }),
  x("Enclouage du fémur", "K", "major", "intermediate", "high", false, P, { aka: ["clou fémoral", "fracture de la diaphyse fémorale", "clou gamma long"], h: 1.5, t: ["neuraxial", "general", "superficial_block"], profile: "arthroplasty", pos: "Table orthopédique" }),
  x("Ostéosynthèse de la hanche", "K", "major", "intermediate", "high", false, P, { aka: ["DHS", "vis-plaque", "clou gamma", "PFNA", "fracture pertrochantérienne"], h: 1, t: SP, profile: "arthroplasty", pos: "Table orthopédique" }),
  x("Fracture du bassin ou du cotyle", "K", "major", "intermediate", "high", false, P, { aka: ["fracture du bassin", "cotyle", "acétabulum"], h: 4, t: G, profile: "arthroplasty", pos: "Selon l'abord" }),
  x("Ostéosynthèse du plateau tibial", "K", "intermediate", "low", "low", false, P, { aka: ["plateau tibial"], h: 2, t: SP, pos: DORSAL }),
  x("Enclouage du tibia", "K", "intermediate", "low", "low", false, P, { aka: ["clou tibial", "fracture de jambe"], h: 1.5, t: SP, pos: DORSAL }),
  x("Fracture de l'humérus", "K", "intermediate", "low", "low", false, P, { aka: ["humérus proximal", "palette humérale", "diaphyse humérale"], h: 2, t: [...G, ...BL], pos: "Semi-assise ou latérale" }),
  x("Fracture de l'olécrâne ou de la tête radiale", "K", "intermediate", "low", "low", false, P, { aka: ["olécrâne", "tête radiale"], h: 1.25, t: BL, pos: "Décubitus dorsal, bras sur table" }),
  x("Fracture de la clavicule", "K", "intermediate", "low", "low", false, P, { aka: ["clavicule"], h: 1, t: G, pos: "Semi-assise (beach chair)" }),
  x("Fixateur externe", "K", "intermediate", "low", "low", false, P, { aka: ["fixateur externe", "polytraumatisé"], h: 1, t: G, pos: DORSAL }),
  x("Lavage articulaire (arthrite septique)", "K", "intermediate", "low", "low", false, P, { aka: ["arthrite septique", "lavage arthroscopique"], h: 1, t: G, pos: "Selon l'articulation" }),
  x("Infection de prothèse : reprise", "K", "major", "intermediate", "high", false, P, { aka: ["spacer", "prothèse infectée", "DAIR"], h: 3, t: G, profile: "arthroplasty", pos: "Selon l'articulation" }),
  x("Ligamentoplastie du genou", "K", "intermediate", "low", "low", false, P, { aka: ["LCA", "ligament croisé antérieur", "DIDT"], h: 1.5, t: [...G, ...BL], pos: DORSAL }),
  x("Réparation de la coiffe des rotateurs", "K", "intermediate", "low", "low", false, P, { aka: ["coiffe des rotateurs", "suture de coiffe"], h: 1.5, t: [...G, ...BL], pos: "Semi-assise (beach chair)" }),
  x("Butée de l'épaule", "K", "intermediate", "low", "low", false, P, { aka: ["Latarjet", "instabilité d'épaule", "Bankart"], h: 1.5, t: [...G, ...BL], pos: "Semi-assise (beach chair)" }),
  x("Chirurgie du tendon d'Achille", "K", "minor", "low", "low", false, P, { aka: ["rupture du tendon d'Achille"], h: 1, t: SP, pos: PRONE }),
  x("Arthrodèse de cheville ou du pied", "K", "intermediate", "low", "low", false, P, { aka: ["arthrodèse sous-talienne", "triple arthrodèse"], h: 1.5, t: [...SP, ...BL], pos: DORSAL }),
  x("Chirurgie de l'avant-pied", "K", "minor", "low", "low", false, P, { aka: ["hallux valgus", "orteils en griffe", "percutané"], h: 1, t: BL, pos: DORSAL }),
  x("Fracture de la cheville (bimalléolaire)", "K", "intermediate", "low", "low", false, P, { aka: ["bimalléolaire", "trimalléolaire", "ORIF cheville"], h: 1.25, t: [...SP, ...BL], pos: DORSAL }),
  x("Chirurgie du poignet et de la main (tendons, nerfs)", "K", "minor", "low", "low", false, P, { aka: ["plaie de la main", "tendons fléchisseurs", "rhizarthrose", "trapézectomie"], h: 1, t: BL, pos: "Décubitus dorsal, bras sur table" }),
  x("Réimplantation digitale ou de membre", "K", "major", "low", "high", false, P, { aka: ["réimplantation", "amputation traumatique"], h: 5, t: [...G, ...BL], pos: "Décubitus dorsal, bras sur table" }),
  x("Arthrodèse lombaire étendue", "K", "major", "intermediate", "high", false, P, { aka: ["scoliose de l'adulte", "correction de déformation", "ostéotomie vertébrale"], h: 5, t: G, closed: true, profile: "arthroplasty", pos: PRONE }),
  x("Chirurgie du rachis mini-invasive", "K", "major", "intermediate", "high", false, P, { aka: ["TLIF", "XLIF", "vis percutanées"], h: 2.5, t: G, closed: true, pos: PRONE }),
  x("Chirurgie des métastases osseuses", "K", "major", "intermediate", "high", false, P, { aka: ["enclouage prophylactique", "fracture pathologique"], h: 2, t: G, profile: "arthroplasty", pos: "Selon le segment" }),
  x("Sarcome des parties molles", "K", "major", "intermediate", "high", false, P, { aka: ["sarcome", "résection tumorale"], h: 3, t: G, pos: "Selon la localisation" }),
  x("Amputation de membre supérieur", "K", "intermediate", "low", "low", false, P, { aka: ["amputation de bras"], h: 1.25, t: BL, pos: DORSAL }),
  x("Syndrome des loges : fasciotomie", "K", "intermediate", "low", "low", false, P, { aka: ["fasciotomie", "syndrome compartimental"], h: 1, t: G, pos: DORSAL }),
  x("Réduction de luxation sous anesthésie", "K", "minor", "low", "minimal", false, P, { aka: ["luxation d'épaule", "luxation de prothèse"], h: 0.25, t: SED, pos: DORSAL }),

  // --- Plastique (L) ---------------------------------------------------------------------------
  x("Reconstruction mammaire par lambeau libre", "L", "major", "low", "high", false, P, { aka: ["DIEP", "lambeau libre"], h: 6, t: G, pos: DORSAL }),
  x("Reconstruction mammaire par prothèse", "L", "intermediate", "low", "low", false, P, { aka: ["expandeur", "prothèse mammaire"], h: 1.5, t: G, pos: "Décubitus dorsal, bras en abduction" }),
  x("Plastie mammaire de réduction", "L", "intermediate", "low", "low", false, P, { aka: ["réduction mammaire"], h: 3, t: G, pos: "Décubitus dorsal, semi-assise" }),
  x("Augmentation mammaire", "L", "intermediate", "low", "low", false, P, { aka: ["implants mammaires"], h: 1.25, t: G, pos: "Décubitus dorsal, semi-assise" }),
  x("Abdominoplastie", "L", "intermediate", "low", "low", false, P, { aka: ["dermolipectomie", "lipoabdominoplastie"], h: 3, t: G, pos: DORSAL }),
  x("Chirurgie après amaigrissement massif", "L", "major", "low", "high", false, P, { aka: ["body lift", "brachioplastie", "cruroplastie"], h: 5, t: G, pos: "Ventral puis dorsal" }),
  x("Lifting cervico-facial", "L", "intermediate", "low", "low", false, P, { aka: ["lifting", "blépharoplastie"], h: 3, t: G, pos: DORSAL }),
  x("Greffe de peau", "L", "minor", "low", "low", false, P, { aka: ["greffe de peau mince"], h: 1, t: G, pos: "Selon la localisation" }),
  x("Lambeau pédiculé ou libre (membres, tête et cou)", "L", "major", "low", "high", false, P, { aka: ["lambeau libre", "microchirurgie"], h: 5, t: G, pos: "Selon la localisation" }),
  x("Chirurgie des brûlés étendus", "L", "major", "high", "high", false, P, { aka: ["brûlures étendues", "escarrotomie"], h: 3, t: G, pos: "Selon les zones" }),
  x("Fente labio-palatine", "L", "intermediate", "low", "low", false, P, { aka: ["bec-de-lièvre", "palatoplastie"], h: 2, t: G, pos: DORSAL }),

  // --- Hors bloc, endoscopie, radiologie, divers (X) ---------------------------------------------
  x("Coloscopie", "X", "minor", "low", "minimal", false, P, { aka: ["coloscopie", "polypectomie"], h: 0.5, t: SED, pos: "Décubitus latéral gauche" }),
  x("Gastroscopie", "X", "minor", "low", "minimal", false, P, { aka: ["FOGD", "gastroscopie"], h: 0.25, t: SED, pos: "Décubitus latéral gauche" }),
  x("CPRE", "X", "intermediate", "low", "low", false, P, { aka: ["cholangiographie rétrograde", "sphinctérotomie endoscopique"], h: 1, t: SED, pos: "Décubitus ventral ou latéral" }),
  x("Écho-endoscopie", "X", "minor", "low", "low", false, P, { aka: ["EUS", "ponction écho-guidée"], h: 0.75, t: SED, pos: "Décubitus latéral gauche" }),
  x("Mucosectomie ou dissection sous-muqueuse", "X", "intermediate", "low", "high", false, P, { aka: ["ESD", "EMR", "mucosectomie"], h: 2, t: G, pos: "Selon le site" }),
  x("POEM (myotomie endoscopique)", "X", "intermediate", "low", "low", false, P, { aka: ["POEM", "achalasie"], h: 1.5, t: G, pos: DORSAL }),
  x("Gastrostomie endoscopique", "X", "minor", "low", "low", false, P, { aka: ["GPE", "PEG"], h: 0.5, t: SED, pos: DORSAL }),
  x("Hémorragie digestive : endoscopie", "X", "intermediate", "intermediate", "low", false, P, { aka: ["hémorragie digestive haute", "varices œsophagiennes", "ligature"], h: 0.75, t: G, pos: "Décubitus latéral gauche" }),
  x("TIPS", "X", "intermediate", "intermediate", "low", false, P, { aka: ["shunt porto-systémique"], h: 2, t: G, pos: DORSAL }),
  x("Chimio-embolisation hépatique", "X", "intermediate", "low", "low", false, P, { aka: ["TACE", "radio-embolisation", "SIRT"], h: 1.5, t: SED, pos: DORSAL }),
  x("Radiofréquence ou cryoablation percutanée", "X", "intermediate", "low", "low", false, P, { aka: ["radiofréquence", "micro-ondes", "cryothérapie"], h: 1.5, t: G, pos: "Selon le site" }),
  x("Embolisation utérine ou prostatique", "X", "intermediate", "low", "low", false, P, { aka: ["embolisation de fibrome", "embolisation prostatique"], h: 2, t: SED, pos: DORSAL }),
  x("Pose de filtre cave ou de voie veineuse centrale", "X", "minor", "low", "low", false, P, { aka: ["PICC line", "filtre cave", "voie centrale"], h: 0.5, t: SED, pos: DORSAL }),
  x("Ponction-biopsie sous scanner", "X", "minor", "low", "low", false, P, { aka: ["biopsie percutanée", "biopsie pulmonaire", "biopsie hépatique"], h: 0.75, t: SED, pos: "Selon le site" }),
  x("Radiothérapie sous anesthésie (enfant)", "X", "minor", "low", "minimal", false, P, { aka: ["radiothérapie pédiatrique", "protonthérapie"], h: 0.5, t: SED, pos: DORSAL }),
  x("Endoscopie bronchique interventionnelle", "X", "intermediate", "low", "low", false, P, { aka: ["prothèse bronchique", "désobstruction", "cryobiopsie"], h: 1.25, t: G, pos: DORSAL }),
  x("Bloc ou infiltration antalgique", "X", "minor", "low", "low", false, P, { aka: ["infiltration", "radiofréquence facettaire", "bloc stellaire"], h: 0.5, t: SED, pos: "Selon le site" }),
  x("Blood patch", "X", "minor", "low", "low", false, P, { aka: ["céphalée post-ponction"], h: 0.5, t: SED, pos: "Assise ou décubitus latéral" }),
  x("Prélèvement d'organes", "X", "major", "high", "high", true, UA, { aka: ["donneur en mort encéphalique"], h: 4, t: G, pos: DORSAL }),
  x("Prélèvement de moelle osseuse", "X", "minor", "low", "low", false, P, { aka: ["don de moelle", "ponction de crête"], h: 1, t: G, pos: PRONE }),
  x("Examen sous anesthésie (enfant)", "X", "minor", "low", "minimal", false, P, { aka: ["examen sous AG", "fond d'œil sous AG"], h: 0.25, t: SED, pos: DORSAL }),

  // --- Pédiatrie (catégories par spécialité) ---------------------------------------------------
  x("Cure de hernie inguinale de l'enfant", "A", "minor", "low", "low", false, P, { aka: ["hernie de l'enfant", "canal péritonéo-vaginal"], h: 0.5, t: G, pos: DORSAL }),
  x("Orchidopexie", "J2", "minor", "low", "low", false, P, { aka: ["cryptorchidie", "testicule non descendu"], h: 0.75, t: G, pos: DORSAL }),
  x("Pylorotomie", "A", "intermediate", "low", "low", true, UA, { aka: ["sténose du pylore", "Fredet-Ramstedt"], h: 0.5, t: G, pos: DORSAL }),
  x("Invagination intestinale", "A", "intermediate", "low", "low", true, UA, { aka: ["invagination"], h: 1, t: G, pos: DORSAL }),
  x("Hypospade", "J2", "intermediate", "low", "low", false, P, { aka: ["hypospadias"], h: 1.5, t: G, pos: DORSAL }),
  x("Frein de langue ou adénoïdectomie de l'enfant", "C", "minor", "low", "low", false, P, { aka: ["végétations", "frein lingual"], h: 0.25, t: G, pos: DORSAL }),
];
