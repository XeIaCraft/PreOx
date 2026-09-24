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

export type SurgeryGrade = "minor" | "intermediate" | "major";

export interface CatalogSurgery {
  name: string;
  aka?: string[];
  /** Carnet category. */
  category: string;
  grade: SurgeryGrade;
  cardiacRisk: RiskGrade;
  bleedingRisk: RiskGrade;
  rcriHighRisk: boolean;
  incision: NonNullable<AriscatInput["incision"]>;
}

const s = (
  name: string,
  category: string,
  grade: SurgeryGrade,
  cardiacRisk: RiskGrade,
  bleedingRisk: RiskGrade,
  rcriHighRisk: boolean,
  incision: CatalogSurgery["incision"],
  aka?: string[]
): CatalogSurgery => ({ name, category, grade, cardiacRisk, bleedingRisk, rcriHighRisk, incision, aka });

export const SURGERY_CATALOG: CatalogSurgery[] = [
  // Orthopédie
  s("Prothèse totale de hanche", "K", "major", "intermediate", "high", false, "peripheral", ["PTH"]),
  s("Prothèse totale de genou", "K", "major", "intermediate", "high", false, "peripheral", ["PTG"]),
  s("Fracture du col du fémur", "K", "major", "intermediate", "high", false, "peripheral", ["FCF", "prothèse intermédiaire", "clou gamma"]),
  s("Arthrodèse rachidienne", "K", "major", "intermediate", "high", false, "peripheral", ["rachis", "laminectomie"]),
  s("Arthroscopie du genou", "K", "intermediate", "low", "low", false, "peripheral", ["ménisectomie", "LCA", "ligamentoplastie"]),
  s("Arthroscopie de l'épaule", "K", "intermediate", "low", "low", false, "peripheral", ["coiffe des rotateurs", "acromioplastie"]),
  s("Chirurgie du pied", "K", "intermediate", "low", "low", false, "peripheral", ["hallux valgus"]),
  s("Chirurgie de la main", "K", "minor", "low", "low", false, "peripheral", ["canal carpien", "doigt à ressaut", "Dupuytren"]),
  s("Ostéosynthèse de membre", "K", "intermediate", "low", "high", false, "peripheral", ["fracture", "plaque", "clou"]),
  s("Ablation de matériel", "K", "minor", "low", "low", false, "peripheral", ["AMO"]),
  // Chirurgie générale et digestive
  s("Cholécystectomie cœlioscopique", "A", "intermediate", "intermediate", "high", true, "upper_abdominal", ["vésicule", "cholécystectomie"]),
  s("Cure de hernie inguinale", "A", "intermediate", "low", "low", false, "peripheral", ["hernie", "TEP", "Lichtenstein"]),
  s("Appendicectomie", "A", "intermediate", "intermediate", "high", true, "peripheral", ["appendicite"]),
  s("Colectomie", "A", "major", "intermediate", "high", true, "upper_abdominal", ["hémicolectomie", "sigmoïdectomie", "résection colique"]),
  s("Chirurgie bariatrique", "A", "major", "intermediate", "high", true, "upper_abdominal", ["bypass gastrique", "sleeve"]),
  s("Gastrectomie", "A", "major", "intermediate", "high", true, "upper_abdominal"),
  s("Duodénopancréatectomie céphalique", "A", "major", "high", "high", true, "upper_abdominal", ["Whipple", "DPC"]),
  s("Hépatectomie", "A", "major", "high", "high", true, "upper_abdominal", ["résection hépatique"]),
  s("Œsophagectomie", "A", "major", "high", "high", true, "intrathoracic"),
  s("Réparation de perforation digestive", "A", "major", "high", "high", true, "upper_abdominal", ["péritonite", "perforation"]),
  s("Thyroïdectomie", "A", "intermediate", "low", "high", false, "peripheral", ["thyroïde", "parathyroïdectomie"]),
  s("Chirurgie du sein", "A", "intermediate", "low", "low", false, "peripheral", ["tumorectomie", "mastectomie", "ganglion sentinelle"]),
  s("Proctologie", "A", "minor", "low", "low", false, "peripheral", ["hémorroïdes", "fistule anale", "fissure"]),
  s("Exérèse cutanée", "A", "minor", "low", "low", false, "peripheral", ["kyste", "lipome", "naevus"]),
  // Vasculaire
  s("Chirurgie aortique ouverte", "A", "major", "high", "high", true, "upper_abdominal", ["anévrisme aorte", "pontage aorto-bifémoral"]),
  s("Endoprothèse aortique", "A", "intermediate", "intermediate", "high", false, "peripheral", ["EVAR"]),
  s("Endartériectomie carotidienne", "A", "intermediate", "intermediate", "high", false, "peripheral", ["carotide"]),
  s("Revascularisation ouverte du membre inférieur", "A", "major", "high", "high", false, "peripheral", ["pontage fémoro-poplité"]),
  s("Amputation de membre inférieur", "A", "intermediate", "high", "high", false, "peripheral", ["amputation"]),
  s("Fistule artério-veineuse", "A", "minor", "low", "low", false, "peripheral", ["FAV"]),
  // Urologie
  s("Résection transurétrale de prostate", "J2", "intermediate", "low", "high", false, "peripheral", ["RTUP"]),
  s("Résection transurétrale de vessie", "J2", "intermediate", "low", "high", false, "peripheral", ["RTUV"]),
  s("Prostatectomie radicale", "J2", "major", "intermediate", "high", true, "peripheral", ["prostatectomie"]),
  s("Cystectomie totale", "J2", "major", "high", "high", true, "peripheral", ["cystectomie"]),
  s("Néphrectomie", "J2", "major", "intermediate", "high", false, "upper_abdominal"),
  s("Urétéroscopie", "J2", "minor", "low", "low", false, "peripheral", ["URS", "lithiase"]),
  // Gynécologie, obstétrique
  s("Hystérectomie", "J1", "major", "intermediate", "high", true, "peripheral", ["hystérectomie"]),
  s("Cœlioscopie gynécologique", "J1", "intermediate", "intermediate", "low", true, "peripheral", ["kystectomie ovarienne", "annexectomie", "endométriose"]),
  s("Hystéroscopie", "J1", "minor", "low", "low", false, "peripheral", ["curetage", "conisation"]),
  s("Césarienne", "B", "intermediate", "low", "high", true, "peripheral"),
  // ORL, ophtalmo, stomato
  s("Amygdalectomie", "C", "intermediate", "low", "high", false, "peripheral", ["adénoïdectomie"]),
  s("Chirurgie endonasale", "C", "intermediate", "low", "low", false, "peripheral", ["septoplastie", "FESS", "méatotomie"]),
  s("Chirurgie carcinologique tête et cou", "C", "major", "intermediate", "high", false, "peripheral", ["laryngectomie", "curage ganglionnaire"]),
  s("Cataracte", "I", "minor", "low", "low", false, "peripheral"),
  s("Vitrectomie", "I", "intermediate", "low", "low", false, "peripheral"),
  s("Extractions dentaires", "E", "minor", "low", "low", false, "peripheral", ["dents de sagesse"]),
  s("Chirurgie maxillo-faciale majeure", "E", "major", "intermediate", "high", false, "peripheral", ["ostéotomie", "fracture mandibulaire"]),
  // Neuro, thorax, plastique, hors bloc
  s("Craniotomie", "D", "major", "intermediate", "high", false, "peripheral", ["neurochirurgie", "tumeur cérébrale"]),
  s("Cure de hernie discale", "D", "intermediate", "intermediate", "high", false, "peripheral", ["discectomie"]),
  s("Lobectomie pulmonaire", "G", "major", "intermediate", "high", true, "intrathoracic", ["segmentectomie", "VATS"]),
  s("Pneumonectomie", "G", "major", "high", "high", true, "intrathoracic"),
  s("Chirurgie plastique ou reconstructrice", "L", "intermediate", "low", "low", false, "peripheral", ["lambeau", "abdominoplastie", "plastie mammaire"]),
  s("Endoscopie digestive", "X", "minor", "low", "low", false, "peripheral", ["gastroscopie", "coloscopie", "CPRE"]),
];

export const SURGERY_CATALOG_SOURCE =
  "Classes proposées : grade selon les exemples de NICE NG45 (2016), risque cardiaque selon ESC 2022 (chirurgie non cardiaque), risque hémorragique d'après le guide EHRA 2021 — à confirmer pour chaque patient.";

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function searchSurgeries(query: string, limit = 6): CatalogSurgery[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  return SURGERY_CATALOG.filter((x) => [x.name, ...(x.aka ?? [])].some((h) => fold(h).includes(q))).slice(0, limit);
}

export const SURGERY_GRADES: { code: SurgeryGrade; label: string }[] = [
  { code: "minor", label: "Mineure" },
  { code: "intermediate", label: "Intermédiaire" },
  { code: "major", label: "Majeure" },
];
