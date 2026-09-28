// The airway plan of every patient, said to the team before the induction:
// strategy (awake or asleep, rapid sequence), oxygenation, then plans
// A–B–C–D with their limits — adapted to the predictors of the consultation
// (El-Ganzouri, Langeron), the known history, obesity, pregnancy, full
// stomach, child, and upper airway pathology.
//
// Difficult Airway Society 2015 (Frerk et al., Br J Anaesth, PMID 26556848);
// DAS awake tracheal intubation 2020 (Ahmad et al., Anaesthesia, PMID
// 31729018); ASA difficult airway 2022 (Apfelbaum et al., Anesthesiology,
// PMID 34762729); SFAR 2017 (intubation difficile et extubation).

import type { ScoreResult } from "./scores";
import { fold } from "./catalog";

export interface AirwayPlanInput {
  age?: number;
  bmi?: number;
  /** El-Ganzouri. */
  laryngoscopy: ScoreResult;
  /** Langeron. */
  mask: ScoreResult;
  /** Condition ids present. */
  conditions: Set<string>;
  surgeryName?: string;
  emergency?: boolean;
}

export interface AirwayPlan {
  level: "routine" | "anticipated" | "awake";
  summary: string;
  why: string[];
  strategy: string[];
  oxygenation: string[];
  planA: string[];
  planB: string[];
  planC: string[];
  planD: string[];
  extubation: string[];
  material: string[];
}

export const AIRWAY_SOURCES =
  "DAS 2015 (Frerk, Br J Anaesth, PMID 26556848) ; DAS intubation vigile 2020 (Ahmad, Anaesthesia, PMID 31729018) ; ASA 2022 (Apfelbaum, Anesthesiology, PMID 34762729) ; SFAR 2017 (intubation difficile et extubation).";

export function airwayPlan(i: AirwayPlanInput): AirwayPlan {
  const has = (id: string) => i.conditions.has(id);
  const child = i.age !== undefined && i.age < 12;
  const obese = (i.bmi !== undefined && i.bmi >= 35) || has("obesity") || has("obesity_hypoventilation");
  const name = fold(i.surgeryName ?? "");
  const fullStomach =
    !!i.emergency || has("bowel_obstruction") || has("gastroparesis") || has("achalasia") || has("pregnancy") || /occlusion|cesarienne|hemorragie apres amygdal|appendic|peritonite/.test(name);
  const knownDifficult = has("difficult_airway");
  const predicted = i.laryngoscopy.level === "high";
  const maskDifficult = i.mask.level === "high" || has("difficult_mask");
  const upperAirway = has("head_neck_radiotherapy") || has("subglottic_stenosis") || has("mediastinal_mass") || has("svc_syndrome") || /tumeur (du )?larynx|laryngectomie|abces|epiglott|stridor/.test(name);
  const spine = has("cervical_spine") || has("ankylosing") || has("rheumatoid");

  // Awake intubation when failure of asleep techniques is likely and oxygenation may not be rescued (DAS 2020, ASA 2022).
  const awake = (knownDifficult && maskDifficult) || (predicted && maskDifficult) || upperAirway || (knownDifficult && fullStomach && predicted);
  const level: AirwayPlan["level"] = awake ? "awake" : knownDifficult || predicted || maskDifficult || obese || spine ? "anticipated" : "routine";

  const why = [
    knownDifficult ? "Antécédent d'intubation difficile" : "",
    predicted ? `Laryngoscopie difficile prévisible (El-Ganzouri ${i.laryngoscopy.value}/12)` : "",
    maskDifficult ? `Ventilation au masque difficile prévisible (Langeron ${i.mask.value}/5)` : "",
    upperAirway ? "Pathologie des voies aériennes supérieures ou compression (irradiation, tumeur, sténose, masse médiastinale)" : "",
    obese ? `Obésité${i.bmi ? ` (IMC ${Math.round(i.bmi)})` : ""} : désaturation rapide` : "",
    spine ? "Rachis cervical raide ou instable" : "",
    fullStomach ? "Estomac plein" : "",
    child ? `Enfant de ${i.age} an(s)` : "",
  ].filter(Boolean);

  const strategy = awake
    ? [
        "Intubation vigile : fibroscope souple (ou vidéolaryngoscope), anesthésie topique (lidocaïne ≤ 9 mg/kg de poids maigre), sédation légère (rémifentanil Ce 1–3 ng/mL ou dexmédétomidine), oxygénation à haut débit tout au long (DAS 2020 : « sTOP » — sédation, topicalisation, oxygénation, procédure).",
        "Sédation minimale : le patient doit continuer à respirer et à coopérer ; 3 tentatives au plus, puis réévaluer (trachéotomie sous anesthésie locale si nécessaire).",
      ]
    : fullStomach
      ? ["Séquence rapide : préoxygénation, hypnotique et curare d'action rapide (rocuronium 1,2 mg/kg ou succinylcholine 1 mg/kg), pas de ventilation au masque sauf désaturation (alors douce, < 20 cmH₂O) ; manœuvre de Sellick discutée (à relâcher si elle gêne)."]
      : ["Induction intraveineuse standard, curarisation pour la laryngoscopie (vérifier la ventilation au masque ne retarde pas le curare)."];
  if (level === "anticipated" && !awake) strategy.push("Plan annoncé à l'équipe et aide senior prévenue avant l'induction ; chariot d'intubation difficile ouvert en salle.");

  const oxygenation = [
    `Préoxygénation jusqu'à FeO₂ ≥ 0,9 (3 min en volume courant ou 8 capacités vitales)${obese ? ", position proclive 25–30° (« rampe »), PEP ou VNI" : ""}.`,
    level !== "routine" || obese || fullStomach ? "Oxygénation apnéique : lunettes nasales à haut débit (jusqu'à 70 L/min) ou 15 L/min pendant la laryngoscopie." : "Oxygénation apnéique par lunettes nasales à envisager.",
    child ? "Enfant : réserve en oxygène faible, désaturation rapide — tentatives courtes (≤ 30 s)." : "",
  ].filter(Boolean);

  const planA = [
    predicted || knownDifficult || spine || obese ? "Vidéolaryngoscope d'emblée (lame hyperangulée si ouverture limitée), mandrin ou bougie." : "Laryngoscopie directe ou vidéolaryngoscope, bougie à portée.",
    "Position optimisée (« sniffing », conduit auditif au niveau du sternum chez l'obèse), curarisation complète, manipulation laryngée externe.",
    "3 tentatives au plus + 1 par un opérateur plus expérimenté ; chaque tentative change quelque chose (dispositif, position, opérateur).",
    "Confirmation par la capnographie (courbe sur plusieurs cycles) ; « pas de courbe = œsophage ».",
  ];
  const planB = [
    "Déclarer l'échec de l'intubation. Dispositif supraglottique de 2e génération (i-gel, LMA ProSeal/Supreme), 3 tentatives au plus.",
    "Oxygénation obtenue : s'arrêter et réfléchir — réveiller le patient, intuber par le dispositif sous fibroscope, poursuivre (rarement) ou trachéotomie.",
  ];
  const planC = [
    "Ventilation au masque à deux mains, canule oropharyngée ou nasopharyngée.",
    "Oxygénation possible : réveiller le patient (sugammadex 16 mg/kg si rocuronium) ; oxygénation impossible : curarisation complète et passer au plan D.",
  ];
  const planD = [
    "« Ni intubation, ni oxygénation » (CICO) : déclarer l'urgence, cricothyroïdotomie au bistouri — bistouri lame 10, bougie, sonde à ballonnet 6,0 ; repérer la membrane cricothyroïdienne avant l'induction (échographie si besoin).",
    child ? "Enfant < 8 ans : cricothyroïdotomie à l'aiguille ou trachéotomie chirurgicale selon le protocole pédiatrique." : "",
  ].filter(Boolean);

  const extubation = [
    level === "routine" ? "Extubation vigile standard : curarisation antagonisée (TOF ≥ 0,9), aspiration, FiO₂ 1, patient réveillé." : "Extubation à risque : patient complètement réveillé et décurarisé (TOF ≥ 0,9), en proclive, plan de réintubation prêt ; mandrin échangeur laissé en place si réintubation difficile.",
    knownDifficult || predicted ? "Courrier « intubation difficile » au patient et note au dossier (technique qui a réussi)." : "",
  ].filter(Boolean);

  const material = [
    "Aspiration fonctionnelle",
    "Masques et canules adaptés",
    child ? "Sondes à ballonnet adaptées à l'âge (taille calculée ± 0,5)" : "Sondes 7,0 et 6,0",
    "Bougie / mandrin long",
    "Vidéolaryngoscope",
    "Dispositifs supraglottiques de 2e génération (2 tailles)",
    level !== "routine" ? "Chariot d'intubation difficile" : "",
    level !== "routine" ? "Kit de cricothyroïdotomie (bistouri, bougie, sonde 6,0)" : "",
    awake || level !== "routine" ? "Fibroscope souple" : "",
    level !== "routine" || obese ? "Lunettes nasales à haut débit" : "",
    "Sugammadex calculé (16 mg/kg si rocuronium)",
  ].filter(Boolean);

  const summary =
    level === "awake"
      ? "Intubation vigile recommandée"
      : level === "anticipated"
        ? `Difficulté anticipée : vidéolaryngoscope, plan A–D annoncé${fullStomach ? ", séquence rapide" : ""}`
        : fullStomach
          ? "Séquence rapide, plan A–D standard"
          : "Plan standard (A–D)";

  return { level, summary, why, strategy, oxygenation, planA, planB, planC, planD, extubation, material };
}
