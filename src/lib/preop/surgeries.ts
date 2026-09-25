// Common procedures with suggested attributes, pre-filled when one is
// picked (always editable):
// - severity grade (minor / intermediate / major) as used by the preop
//   testing guidance (NICE NG45, the grid the KCE report built on);
// - surgical cardiac risk class of the ESC 2022 guidelines on non-cardiac
//   surgery (low < 1 %, intermediate 1–5 %, high > 5 % of cardiac events);
// - bleeding risk (low / high) in the spirit of the EHRA practical guide
//   for anticoagulated patients — to confirm per procedure and surgeon;
// - "high-risk surgery" of the Lee index (intraperitoneal, intrathoracic,
//   suprainguinal vascular) and the ARISCAT incision site.

import type { AriscatInput } from "./scores";
import type { RiskGrade } from "./dossier";
import type { BleedingRisk } from "./catalog";

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
  s("Prothèse totale de hanche", "K", "major", "intermediate", "high", false, "peripheral", "Décubitus latéral ou dorsal selon la voie", ["PTH"]),
  s("Prothèse totale de genou", "K", "major", "intermediate", "high", false, "peripheral", "Décubitus dorsal", ["PTG"]),
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
];

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
