// Gas plan of each reference protocol with a general anaesthesia: sevoflurane
// in air/O₂ at low flow by default (gases.ts), TIVA where the protocol calls
// for it, and the particular cases — no N₂O in a closed cavity, laser, FiO₂ of
// one-lung ventilation, caesarean section, neonate.

import type { GasPlan, ProtocolContent } from "./protocols";
import { DEFAULT_GASES, TIVA_GASES } from "./gases";

const NO_N2O_BOWEL = "distension des anses (occlusion, laparotomie longue), NVPO";
const NO_N2O_CLOSED = "diffusion dans les cavités closes (pneumothorax, pneumocéphalie, oreille moyenne, bulles)";

const tiva = (note: string, extra: Partial<GasPlan> = {}): GasPlan => ({ ...TIVA_GASES, note, ...extra });
const sevo = (extra: Partial<GasPlan>): GasPlan => ({ ...DEFAULT_GASES, ...extra });

/** Protocol number → its gas plan, when it differs from the default. */
const GASES: Record<number, GasPlan> = {
  // Rachis avec potentiels évoqués, neurochirurgie, champ exsangue
  26: sevo({ mac: [0.5, 1], noN2O: NO_N2O_CLOSED, note: "Sévoflurane ≤ 1 CAM (vasodilatation cérébrale) ou AIVOC si œdème ou hypertension intracrânienne ; normocapnie." }),
  29: tiva("Potentiels évoqués moteurs : AIVOC propofol-rémifentanil ; halogéné ≤ 0,5 CAM seulement si accord du neurophysiologiste."),
  66: tiva("Champ exsangue : AIVOC propofol-rémifentanil (moins de saignement que le sévoflurane)."),
  75: tiva("Potentiels évoqués : AIVOC propofol-rémifentanil."),
  76: tiva("Hypertension intracrânienne : AIVOC (pas de vasodilatation cérébrale), normocapnie, tête surélevée.", { noN2O: NO_N2O_CLOSED }),
  78: tiva("Craniotomie éveillée : propofol-rémifentanil ou dexmédétomidine, O₂ par lunettes avec capnographie pendant le temps éveillé."),
  79: sevo({ noN2O: NO_N2O_CLOSED }),
  99: tiva("Scoliose : potentiels évoqués — AIVOC propofol-rémifentanil."),
  101: tiva("Neurochirurgie de l'enfant : AIVOC si hypertension intracrânienne ou potentiels évoqués ; sinon sévoflurane ≤ 1 CAM.", { noN2O: NO_N2O_CLOSED }),
  // ORL
  67: sevo({ noN2O: "oreille moyenne (décollement du greffon tympanique)", note: "Ou AIVOC propofol-rémifentanil pour un champ exsangue (hypotension contrôlée)." }),
  68: tiva("Laser : FiO₂ la plus basse possible (≤ 30 %), jamais de N₂O (comburant) ; jet-ventilation selon le geste.", { fio2: [0.21, 0.3], noN2O: "risque d'incendie des voies aériennes (comburant)" }),
  104: tiva("Bronchoscopie rigide : voies aériennes ouvertes, AIVOC indispensable (pas d'halogéné délivrable de façon fiable)."),
  // Thorax (ventilation unipulmonaire)
  24: sevo({ fio2: [0.5, 1], mac: [0.7, 1], noN2O: NO_N2O_CLOSED, note: "Unipulmonaire : FiO₂ titrée pour SpO₂ ≥ 92 %, halogéné ≤ 1 CAM (vasoconstriction pulmonaire hypoxique préservée) ; Vt 4–6 mL/kg, PEP 5." }),
  25: sevo({ fio2: [0.5, 1], noN2O: NO_N2O_CLOSED, note: "Unipulmonaire : FiO₂ titrée pour SpO₂ ≥ 92 %, halogéné ≤ 1 CAM ; Vt 4–6 mL/kg, PEP 5." }),
  38: sevo({ fio2: [0.5, 1], noN2O: NO_N2O_CLOSED, note: "Temps thoracique unipulmonaire : FiO₂ titrée pour SpO₂ ≥ 92 %, halogéné ≤ 1 CAM." }),
  83: sevo({ noN2O: NO_N2O_CLOSED }),
  102: sevo({ fio2: [0.5, 1], noN2O: NO_N2O_CLOSED, note: "Unipulmonaire : FiO₂ titrée pour SpO₂ ≥ 92 %." }),
  110: sevo({ fio2: [0.5, 1], noN2O: NO_N2O_CLOSED, note: "Unipulmonaire ou ECMO : FiO₂ titrée pour SpO₂ ≥ 92 % ; AIVOC si ventilation par jet ou voies aériennes ouvertes." }),
  // Cardiaque, vasculaire, transplantation
  33: sevo({ fio2: [0.5, 0.6], mac: [0.5, 1], noN2O: "embolie gazeuse (CEC)", note: "Halogéné pendant la CEC par l'évaporateur du circuit (préconditionnement) ; FiO₂ de CEC réglée avec le perfusionniste." }),
  103: sevo({ fio2: [0.21, 1], noN2O: "embolie gazeuse, shunt", note: "FiO₂ selon la cardiopathie : basse si circulation pulmonaire dépendante d'un canal (hyperdébit pulmonaire), élevée si hypertension pulmonaire." }),
  45: sevo({ noN2O: NO_N2O_BOWEL }),
  58: sevo({ noN2O: NO_N2O_BOWEL }),
  // Digestif et urgences
  36: sevo({ noN2O: NO_N2O_BOWEL }),
  7: sevo({ noN2O: NO_N2O_BOWEL }),
  21: sevo({ noN2O: NO_N2O_BOWEL }),
  37: sevo({ noN2O: NO_N2O_BOWEL }),
  40: sevo({ noN2O: NO_N2O_BOWEL }),
  41: sevo({ noN2O: NO_N2O_BOWEL }),
  42: sevo({ noN2O: NO_N2O_BOWEL }),
  14: sevo({ fio2: [0.4, 0.6], note: "Obésité : préoxygénation FiO₂ 100 % proclive puis FiO₂ titrée ; PEP 8–10, recrutement ; sévoflurane (desflurane déconseillé : impact climatique)." }),
  // Obstétrique
  63: sevo({ fio2: [0.5, 0.5], mac: [0.8, 1], note: "Avant l'extraction : CAM ≥ 0,8 (mémorisation) ; après : 0,5–0,7 CAM et relais propofol si atonie utérine (les halogénés relâchent l'utérus)." }),
  65: sevo({ fio2: [0.5, 0.5], note: "Grossesse : FiO₂ ≥ 50 %, normocapnie de la femme enceinte (EtCO₂ 30–32 mmHg)." }),
  // Enfant
  9: sevo({ note: "Ou AIVOC propofol-rémifentanil (moins d'agitation et de NVPO) ; FiO₂ ≤ 30 % si bistouri électrique près des voies aériennes." }),
  70: sevo({ note: "Ou AIVOC propofol : moins de laryngospasme ; FiO₂ ≤ 30 % si laser ou bistouri près des voies aériennes." }),
  95: sevo({ note: "Nourrisson : débit de gaz frais adapté au circuit ; FiO₂ titrée pour SpO₂ 94–98 %." }),
  96: sevo({ fio2: [0.21, 0.4], mac: [0.5, 1], note: "Nouveau-né, prématuré : FiO₂ la plus basse pour SpO₂ 91–95 % (rétinopathie) ; halogéné titré (fragilité hémodynamique), fentanyl associé.", noN2O: NO_N2O_BOWEL }),
  // Autres
  80: sevo({ note: "Masse médiastinale : induction en ventilation spontanée (sévoflurane), sans curare tant que la ventilation au masque n'est pas assurée." }),
  107: tiva("Électroconvulsivothérapie : hypnotique IV seul, ventilation au masque O₂ 100 % (hyperventilation brève)."),
  108: sevo({ fio2: [0.4, 0.5], note: "Donneur : FiO₂ la plus basse pour SpO₂ ≥ 95 % et PaO₂ ≥ 80 mmHg (poumons) ; halogéné pour la stabilité et le préconditionnement." }),
};

/** The gas plan of a reference protocol: none without a general anaesthesia. */
export function referenceGases(n: number, c: ProtocolContent): GasPlan | undefined {
  if (!c.techniques.includes("general")) return undefined;
  if (GASES[n]) return GASES[n];
  // A protocol whose maintenance is TIVA (AIVOC in its targets).
  if (/AIVOC|TIVA/i.test(c.targets.join(" ") + c.notes)) return tiva("AIVOC propofol-rémifentanil (voir les cibles du protocole).");
  return DEFAULT_GASES;
}

export const referenceGasesNumbers = () => Object.keys(GASES).map(Number);
