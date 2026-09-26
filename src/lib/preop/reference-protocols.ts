// Reference protocols for common interventions, importable from Paramètres ›
// Protocoles. They are a starting point, to be adapted to the service's own
// protocol: every dose comes from a named source — the Belgian
// inter-university teaching (EIUA / BeSARPP courses: Ph. Dubois, CHU UCL
// Namur, orthopaedics; F. Roelants, Saint-Luc, obstetrics 2022; P.-Y. Hardy,
// CHU Liège, enhanced recovery), the ESC/ESAIC guidelines and the reference
// textbook (Manuel pratique d'anesthésie 2020, chapter given). No patient
// data: doses are per kilo or fixed, computed for the patient in the plan.

import type { DoseUnit, DrugPhase, Protocol, ProtocolContent, ProtocolDrug, WeightBasis } from "./protocols";

export type ReferenceProtocol = Omit<Protocol, "created_at" | "updated_at">;

const pid = (n: number) => `5f1c0a10-0004-4000-8000-${String(n).padStart(12, "0")}`;

const MANUAL = "Manuel pratique d'anesthésie, 4e éd. 2020";
const DUBOIS = "Ph. Dubois, « Anesthésie en orthopédie », CHU UCL Namur (cours EIUA)";
const ROELANTS = "F. Roelants, « L'anesthésie de la femme enceinte », Cliniques universitaires Saint-Luc (EIUA 2022)";
const HARDY = "P.-Y. Hardy, « Réhabilitation améliorée après chirurgie abdominale », CHU Liège (cours EIUA)";
const ESAIC_FASTING = "ESAIC : jeûne de l'enfant 2022 (PMID 34857683)";

let seq = 0;
function drug(
  name: string,
  phase: DrugPhase,
  route: string,
  dose: { fixed: number } | { perKg: number; basis?: WeightBasis; max?: number },
  unit: DoseUnit,
  note = "",
  redoseEveryMin: number | null = null
): ProtocolDrug {
  seq++;
  const perKg = "perKg" in dose;
  return {
    id: `d${seq}`,
    name,
    route,
    phase,
    doseMode: perKg ? "per_kg" : "fixed",
    amount: perKg ? dose.perKg : dose.fixed,
    unit,
    weightBasis: perKg ? (dose.basis ?? "total") : "total",
    maxAmount: perKg ? (dose.max ?? null) : null,
    redoseEveryMin,
    note,
  };
}

const content = (c: Partial<ProtocolContent>): ProtocolContent => ({
  techniques: [],
  drugs: [],
  targets: [],
  material: [],
  risks: [],
  postop: [],
  tourniquetAlertMin: null,
  notes: "",
  ...c,
});

// Shared pieces --------------------------------------------------------------

const cefazolin = (note = "Dans l'heure avant l'incision ; > 120 kg : 3 g. Durée > 4 h : réinjection de 1 g.") =>
  drug("Céfazoline", "antibio", "bolus_iv", { fixed: 2 }, "g", note, 240);
const clindamycinAlt = () => drug("Clindamycine (si allergie immédiate aux bêtalactamines)", "antibio", "perfusion", { fixed: 600 }, "mg", "En 30 min, à la place de la céfazoline ; réinjection à 6 h.");
const propofolInduction = (perKg = 2, basis: WeightBasis = "total") => drug("Propofol", "induction", "bolus_iv", { perKg, basis }, "mg", "2–3 mg/kg chez l'adulte, 1–2 mg/kg chez la personne âgée (manuel, chap. 6).");
const sufentanil = (perKg = 0.2) => drug("Sufentanil", "induction", "bolus_iv", { perKg, basis: "lean" }, "µg", "0,2–0,6 µg/kg à l'induction (manuel, chap. 7).");
const rocuronium = (perKg = 0.6) => drug("Rocuronium", "induction", "bolus_iv", { perKg, basis: "ideal" }, "mg", "Au poids idéal ; 0,9–1,2 mg/kg en séquence rapide.");
const dexamethasone = (mg = 8) => drug("Dexaméthasone", "ponv", "bolus_iv", { fixed: mg }, "mg", "À l'induction : NVPO, analgésie (manuel, chap. 23 ; ERAS).");
const ondansetron = () => drug("Ondansétron", "ponv", "bolus_iv", { fixed: 4 }, "mg", "30 min avant la fin.");
const droperidol = () => drug("Dropéridol", "ponv", "bolus_iv", { fixed: 0.625 }, "mg", "0,5–1,25 mg, 30 min avant la fin, si PAS > 100 mmHg (manuel, chap. 23).");
const paracetamol = () => drug("Paracétamol", "analgesia", "perfusion", { fixed: 1 }, "g", "Sur 15 min ; 4 × / jour ensuite.");
const ketorolac = () => drug("Kétorolac", "analgesia", "bolus_iv", { fixed: 30 }, "mg", "Si pas de contre-indication aux AINS (rein, volémie, saignement).");
const tranexamic = () => drug("Acide tranexamique", "haemodynamic", "perfusion", { perKg: 15 }, "mg", "10–15 mg/kg en début d'intervention (manuel, chap. 40).");
const ketamineSparing = () => drug("Kétamine", "analgesia", "bolus_iv", { perKg: 0.15 }, "mg", "Épargne morphinique 0,15–0,5 mg/kg (cours Dubois ; manuel, chap. 6).");
const MONITORING = ["ECG", "PNI", "SpO₂", "EtCO₂", "Température"];

// Protocols ------------------------------------------------------------------

export const REFERENCE_PROTOCOLS: ReferenceProtocol[] = [
  {
    id: pid(1),
    name: "Prothèse totale de hanche sous rachianesthésie",
    surgery: "Prothèse totale de hanche",
    operation_category: "K",
    hospital: "",
    source: `${DUBOIS} ; ${MANUAL}, chap. 40 ; ERAS Society PTH/PTG (Wainwright, Acta Orthop 2020).`,
    content: content({
      techniques: ["neuraxial"],
      drugs: [
        drug("Bupivacaïne 0,5 % hyperbare", "alr", "intrathecal", { fixed: 12.5 }, "mg", "2–4 ml de bupivacaïne 0,5 % ; chirurgie > 120 min (cours Dubois)."),
        drug("Morphine intrathécale", "analgesia", "intrathecal", { fixed: 100 }, "µg", "Analgésie 12–24 h ; surveillance respiratoire à l'étage (dépression retardée à 6 h), NVPO, rétention urinaire."),
        drug("Propofol (sédation)", "maintenance", "pse", { perKg: 2 }, "mg", "Sédation 2–6 mg/kg/h si besoin."),
        cefazolin("Matériel intra-articulaire : 2 g puis 2 g × 2 (24 h au total) ; > 4 h : réinjection de 1 g (cours Dubois)."),
        clindamycinAlt(),
        tranexamic(),
        dexamethasone(8),
        paracetamol(),
        ketorolac(),
      ],
      targets: ["PAM ≥ 65 mmHg ou ≥ 80 % de la valeur de base", "Normothermie (T ≥ 36 °C)", "Hb transfusionnelle 7–9 g/dl selon le patient"],
      material: [...MONITORING, "Réchauffement actif (air pulsé)", "Groupe et RAI"],
      risks: [
        { title: "Syndrome d'implantation du ciment", conduct: "Hypotension, désaturation au scellement : volémie optimisée, FiO₂ augmentée, pas de N₂O, vasopresseur prêt. Prothèse non cimentée si HTAP ou dysfonction cardiaque." },
        { title: "Saignement", conduct: "Acide tranexamique, récupération peropératoire si prévue, seuil transfusionnel selon le terrain." },
      ],
      postop: ["Lever à J0–J1", "Thromboprophylaxie jusqu'à la déambulation normale (PTH : 28–35 jours)", "Pas de drain ni de sonde urinaire systématique"],
      notes: "AG possible (installation, voie antérieure en traction : curarisation profonde, rocuronium + sugammadex). Infiltration périarticulaire ou bloc (plexus lombaire, fémoral) selon l'équipe.",
    }),
  },
  {
    id: pid(2),
    name: "Prothèse totale de genou sous rachianesthésie",
    surgery: "Prothèse totale de genou",
    operation_category: "K",
    hospital: "",
    source: `${DUBOIS} ; ${MANUAL}, chap. 40 ; ERAS Society PTH/PTG (Wainwright, Acta Orthop 2020).`,
    content: content({
      techniques: ["neuraxial", "deep_block"],
      drugs: [
        drug("Bupivacaïne 0,5 % hyperbare", "alr", "intrathecal", { fixed: 12.5 }, "mg", "2–4 ml de bupivacaïne 0,5 %."),
        drug("Morphine intrathécale", "analgesia", "intrathecal", { fixed: 100 }, "µg", "Surveillance respiratoire à l'étage."),
        drug("Ropivacaïne (bloc du canal des adducteurs)", "alr", "perinerveux", { fixed: 75 }, "mg", "Bloc sensitif respectant le quadriceps ; ou infiltration périarticulaire par le chirurgien (ne pas cumuler au-delà de la dose maximale de 3 mg/kg)."),
        cefazolin("Matériel intra-articulaire : 2 g puis 2 g × 2 (24 h au total) ; > 4 h : réinjection de 1 g (cours Dubois)."),
        clindamycinAlt(),
        tranexamic(),
        dexamethasone(8),
        paracetamol(),
        ketorolac(),
      ],
      targets: ["PAM ≥ 65 mmHg", "Normothermie"],
      material: [...MONITORING, "Échographe", "Garrot pneumatique si utilisé"],
      tourniquetAlertMin: 90,
      risks: [
        { title: "Garrot", conduct: "Pression PAS + 100–150 mmHg au membre inférieur ; au lâcher : hypotension, hyperkaliémie, embolies — anticiper la volémie. Au-delà de 60 min : douleur, tachycardie, hypertension." },
        { title: "Syndrome du ciment", conduct: "Surveillance au scellement ; vasopresseur prêt." },
      ],
      postop: ["Mobilisation précoce, critères de sortie objectifs", "Thromboprophylaxie jusqu'à la déambulation normale (PTG : 14 jours)"],
      notes: "Le bloc fémoral bloque le quadriceps et retarde la revalidation active : canal des adducteurs ou infiltration périarticulaire préférés (cours Dubois, ERAS).",
    }),
  },
  {
    id: pid(3),
    name: "Fracture de l'extrémité supérieure du fémur (sujet âgé)",
    surgery: "Fracture du col du fémur",
    operation_category: "K",
    hospital: "",
    source: `${DUBOIS} ; ${MANUAL}, chap. 40 et 43.`,
    content: content({
      techniques: ["neuraxial", "deep_block"],
      drugs: [
        drug("Lévobupivacaïne (bloc ilio-fascial)", "alr", "perinerveux", { perKg: 1, max: 150 }, "mg", "Aux urgences et avant l'installation ; dose maximale 3 mg/kg."),
        drug("Bupivacaïne 0,5 % hyperbare", "alr", "intrathecal", { fixed: 10 }, "mg", "Dose réduite chez le sujet âgé ; pas de rachianesthésie si sténose aortique serrée (cours Dubois)."),
        cefazolin("Matériel extra-articulaire : dose unique ; prothèse : 24 h (cours Dubois)."),
        clindamycinAlt(),
        tranexamic(),
        paracetamol(),
      ],
      targets: ["PAM ≥ 65 mmHg ou ≥ 80 % de la valeur de base", "Normothermie", "Seuil transfusionnel plus élevé chez le coronarien"],
      material: [...MONITORING, "Échographe", "Deux concentrés érythrocytaires disponibles"],
      risks: [
        { title: "Délai opératoire", conduct: "Opérer dans les 24–48 h ; un antithrombotique ne retarde que le temps nécessaire (voir les règles de délai)." },
        { title: "Confusion postopératoire", conduct: "Éviter benzodiazépines et anticholinergiques, analgésie par bloc, lunettes et appareils auditifs, repérage." },
        { title: "Ciment (prothèse)", conduct: "Hypotension et désaturation au scellement : volémie, FiO₂, vasopresseur prêt." },
      ],
      postop: ["Lever précoce", "Thromboprophylaxie", "Dépistage de la dénutrition, de l'anémie, de la rhabdomyolyse (CK si station au sol)"],
      notes: "Anesthésie générale possible (+ bloc ilio-fascial) ; mortalité à 1 an ≈ 36 %.",
    }),
  },
  {
    id: pid(4),
    name: "Arthroscopie d'épaule : AG et bloc interscalénique",
    surgery: "Arthroscopie de l'épaule",
    operation_category: "K",
    hospital: "",
    source: `${DUBOIS} ; ${MANUAL}, chap. 12 et 40.`,
    content: content({
      techniques: ["general", "deep_block"],
      drugs: [
        drug("Ropivacaïne 0,5 % (bloc interscalénique)", "alr", "perinerveux", { fixed: 75 }, "mg", "15 ml ; paralysie phrénique homolatérale constante : prudence si insuffisance respiratoire."),
        propofolInduction(),
        sufentanil(),
        drug("Rocuronium", "induction", "bolus_iv", { perKg: 0.6, basis: "ideal" }, "mg", "Bloc profond si la chirurgie le demande ; décurarisation contrôlée (sugammadex)."),
        dexamethasone(8),
        ondansetron(),
        paracetamol(),
        ketorolac(),
      ],
      targets: ["Position semi-assise : PA mesurée au niveau du cerveau", "Éviter une hypotension prolongée (ischémie cérébrale en position assise)"],
      material: [...MONITORING, "Échographe", "Curamètre", "Protection des points d'appui (tête, bras)"],
      risks: [
        { title: "Position semi-assise", conduct: "Hypotension, bradycardie (réflexe de Bezold-Jarisch) : remplissage, éphédrine ou atropine." },
        { title: "Bloc interscalénique", conduct: "Paralysie phrénique, syndrome de Claude Bernard-Horner, dysphonie ; toxicité des AL (intralipides disponibles)." },
      ],
      postop: ["Arthroscopie sans implant : pas d'antibioprophylaxie (cours Dubois)", "Relai analgésique avant la levée du bloc"],
      notes: "Antibioprophylaxie : céfazoline 2 g seulement si implant (ancres, matériel).",
    }),
  },
  {
    id: pid(5),
    name: "Césarienne programmée sous rachianesthésie",
    surgery: "Césarienne",
    operation_category: "B",
    hospital: "",
    source: `${ROELANTS} ; ${MANUAL}, chap. 36.`,
    content: content({
      techniques: ["neuraxial"],
      drugs: [
        drug("Citrate de sodium 0,3 M", "premed", "po", { fixed: 30 }, "mL", "15 min avant ; + anti-H2 ou IPP (prophylaxie de l'inhalation)."),
        drug("Bupivacaïne 0,5 % hyperbare", "alr", "intrathecal", { fixed: 9 }, "mg", "8–10 mg avec sufentanil (ED95 pure 11 mg) ; ± 1 mg si < 155 cm ou > 170 cm ; macrosomie : moins, RCIU ou prématurité : + 1–2 mg."),
        drug("Sufentanil", "alr", "intrathecal", { fixed: 2.5 }, "µg", "2–5 µg."),
        drug("Morphine intrathécale", "analgesia", "intrathecal", { fixed: 100 }, "µg", "Analgésie postopératoire."),
        drug("Phényléphrine", "haemodynamic", "pse", { fixed: 25 }, "µg", "Perfusion prophylactique 25–50 µg/min dès la ponction (co-remplissage cristalloïde) ; bolus 50–150 µg si hypotension sans bradycardie ; bradycardie : éphédrine 5–10 mg. Objectif PAS > 90 % de la valeur de base."),
        cefazolin("Avant l'incision ; > 120 kg : 3 g."),
        drug("Ocytocine", "other", "bolus_iv", { fixed: 5 }, "UI", "Après la naissance, bolus lent (5 min) puis 5–10 UI/h (manuel, chap. 36)."),
        dexamethasone(8),
        paracetamol(),
        ketorolac(),
      ],
      targets: ["PAS > 90 % de la valeur de base", "Décubitus latéral gauche (15°) jusqu'à la naissance", "Durée d'une hypotension < 3 min"],
      material: [...MONITORING, "Phényléphrine en seringue", "Matériel d'intubation difficile (conversion en AG)", "Acide tranexamique et fibrinogène disponibles"],
      risks: [
        { title: "Conversion en AG", conduct: "Séquence rapide : propofol 2,5 mg/kg, succinylcholine 1,5 mg/kg (ou rocuronium 1–1,2 mg/kg avec sugammadex 16 mg/kg prêt), sonde 6,5–7, préoxygénation (FeO₂ ≥ 90 %), sévoflurane 0,75 CAM." },
        { title: "Hémorragie du post-partum", conduct: "Ocytocine puis sulprostone, acide tranexamique 1 g, fibrinogène (> 2 g/l), plaquettes > 50 G/l, Ca²⁺, normothermie." },
      ],
      postop: ["Paracétamol + AINS + morphine intrathécale ; sans opioïde neuraxial : TAP, ilio-inguinal ou carré des lombes", "Alimentation et lever précoces, contact mère-enfant", "Thromboprophylaxie selon le risque"],
      notes: "Pas d'oxygène systématique. Péridurale de travail en place : lidocaïne 2 % adrénalinée 20 ml (urgence) ou ropivacaïne 0,75 % (sans urgence).",
    }),
  },
  {
    id: pid(6),
    name: "Cholécystectomie cœlioscopique (RAC)",
    surgery: "Cholécystectomie par cœlioscopie",
    operation_category: "A",
    hospital: "",
    source: `${HARDY} ; ${MANUAL}, chap. 20, 23 et 30.`,
    content: content({
      techniques: ["general"],
      drugs: [
        propofolInduction(),
        sufentanil(),
        rocuronium(),
        dexamethasone(8),
        cefazolin("Dose unique avant l'incision (chirurgie propre-contaminée)."),
        clindamycinAlt(),
        ondansetron(),
        droperidol(),
        paracetamol(),
        ketorolac(),
        drug("Ropivacaïne (infiltration des orifices)", "analgesia", "infiltration", { fixed: 75 }, "mg", "Par le chirurgien, en fin d'intervention."),
      ],
      targets: ["Pression du pneumopéritoine ≤ 12–15 mmHg", "Ventilation protectrice (Vt 6–8 ml/kg de poids idéal, PEP)", "Euvolémie"],
      material: [...MONITORING, "Curamètre", "Compression pneumatique des membres inférieurs"],
      risks: [{ title: "Pneumopéritoine", conduct: "Hypercapnie, baisse du retour veineux, bradycardie à l'insufflation (arrêt de l'insufflation, atropine) ; emphysème sous-cutané, pneumothorax." }],
      postop: ["Réalimentation le jour même", "Lever précoce", "Ambulatoire possible"],
      notes: "Jeûne : solides 6 h, liquides clairs 2 h, boisson sucrée (50 g d'hydrates de carbone) ; pas de prémédication anxiolytique systématique (cours Hardy).",
    }),
  },
  {
    id: pid(7),
    name: "Colectomie par cœlioscopie (RAC)",
    surgery: "Colectomie",
    operation_category: "A",
    hospital: "",
    source: `${HARDY} ; ${MANUAL}, chap. 20 et 30 ; ERAS Society colorectal.`,
    content: content({
      techniques: ["general"],
      drugs: [
        propofolInduction(),
        sufentanil(),
        rocuronium(),
        drug("Lidocaïne IV", "analgesia", "pse", { perKg: 1.5 }, "mg", "Bolus 1,5 mg/kg puis 2 mg/kg/h : moins d'iléus et durée de séjour réduite (cours Hardy ; manuel, chap. 7)."),
        ketamineSparing(),
        drug("Dexaméthasone", "ponv", "bolus_iv", { perKg: 0.1, max: 8 }, "mg", "0,1 mg/kg (cours Hardy)."),
        cefazolin("Dans l'heure avant l'incision ; réinjection à 4 h."),
        drug("Métronidazole", "antibio", "perfusion", { fixed: 500 }, "mg", "En 20 min, avec la céfazoline (côlon, rectum) ; réinjection à 8 h."),
        ondansetron(),
        paracetamol(),
        ketorolac(),
      ],
      targets: ["Euvolémie (remplissage guidé, vasopresseur plutôt que surcharge)", "Diurèse ≥ 0,5 ml/kg/h tolérée", "Normothermie", "Ventilation protectrice"],
      material: [...MONITORING, "Curamètre", "Réchauffement actif", "Compression pneumatique", "Cathéter artériel si terrain le justifie"],
      risks: [{ title: "Iléus postopératoire", conduct: "Épargne morphinique (lidocaïne IV, AINS 48 h, ALR), pas de surcharge hydrique, réalimentation précoce." }],
      postop: ["Pas de sonde gastrique ni de drain systématiques ; sonde urinaire retirée tôt", "Réalimentation et lever le soir même", "HBPM postopératoire", "AINS 48 h si pas de contre-indication"],
      notes: "Pas de préparation colique (sauf rectum). Jeûne moderne et boisson sucrée ; dépister la dénutrition (IMC ≤ 18,5, < 21 après 70 ans, perte ≥ 10 %) : immunonutrition (cours Hardy).",
    }),
  },
  {
    id: pid(8),
    name: "Cure de hernie inguinale en ambulatoire",
    surgery: "Cure de hernie inguinale",
    operation_category: "A",
    hospital: "",
    source: `${DUBOIS} (anesthésiques intrathécaux) ; ${MANUAL}, chap. 13, 20 et 33.`,
    content: content({
      techniques: ["neuraxial"],
      drugs: [
        drug("Chloroprocaïne 1 % (Ampres)", "alr", "intrathecal", { fixed: 45 }, "mg", "4–5 ml ; chirurgie courte (40–45 min), miction jusqu'à 2 h, sortie ≈ 3 h (cours Dubois)."),
        drug("Prilocaïne 2 % hyperbare (Tachipri)", "alr", "intrathecal", { fixed: 50 }, "mg", "Alternative : 2–3 ml ; 100–130 min, sortie ≈ 4 h."),
        cefazolin("Dose unique si prothèse (plaque)."),
        drug("Ropivacaïne (bloc ilio-inguinal ou infiltration)", "analgesia", "infiltration", { fixed: 75 }, "mg", "Analgésie après la levée du bloc."),
        paracetamol(),
        ketorolac(),
      ],
      targets: ["Critères de sortie : miction, marche, douleur < 4, pas de NVPO"],
      material: [...MONITORING],
      risks: [{ title: "Rétention urinaire", conduct: "Éviter la morphine intrathécale ; échographie vésicale avant la sortie si doute." }],
      postop: ["Sortie le jour même", "Paracétamol + AINS 3–5 jours"],
      notes: "AG + bloc ou anesthésie locale selon le chirurgien et le patient.",
    }),
  },
  {
    id: pid(9),
    name: "Amygdalectomie de l'enfant",
    surgery: "Amygdalectomie",
    operation_category: "C",
    hospital: "",
    source: `${MANUAL}, chap. 37 et 38 ; ${ESAIC_FASTING}.`,
    content: content({
      techniques: ["general"],
      drugs: [
        drug("Midazolam (prémédication)", "premed", "po", { perKg: 0.3, max: 15 }, "mg", "0,3–0,5 mg/kg per os, 20–30 min avant (manuel, chap. 37)."),
        drug("Propofol", "induction", "bolus_iv", { perKg: 3 }, "mg", "2,5–5 mg/kg chez l'enfant ; ou induction au sévoflurane puis voie veineuse."),
        drug("Sufentanil", "induction", "bolus_iv", { perKg: 0.2 }, "µg", "Douleur importante."),
        drug("Dexaméthasone", "ponv", "bolus_iv", { perKg: 0.15, max: 8 }, "mg", "0,1–0,2 mg/kg (manuel, chap. 38)."),
        drug("Ondansétron", "ponv", "bolus_iv", { perKg: 0.1, max: 4 }, "mg", "0,1–0,2 mg/kg (manuel, chap. 38)."),
        drug("Paracétamol", "analgesia", "perfusion", { perKg: 15, max: 1000 }, "mg", "15 mg/kg, 4 × / jour."),
      ],
      targets: ["Sonde préformée (RAE), souvent sans curare", "Réveil calme, aspiration pharyngée sous contrôle de la vue"],
      material: ["ECG", "PNI", "SpO₂", "EtCO₂", "Sonde RAE", "Deux aspirations"],
      risks: [
        { title: "Laryngospasme", conduct: "O₂ 100 % en pression positive, approfondir (propofol), succinylcholine 0,3 mg/kg si désaturation." },
        { title: "Hémorragie (jusqu'à J7)", conduct: "Estomac plein de sang : correction de la volémie avant l'induction, séquence rapide, deux aspirations, groupe sanguin." },
        { title: "SAOS de l'enfant", conduct: "Opioïdes réduits, surveillance respiratoire prolongée." },
      ],
      postop: ["Paracétamol ; AINS selon le chirurgien", "Pas de codéine (métaboliseurs ultra-rapides)"],
      notes: "Jeûne ESAIC 2022 : liquides clairs jusqu'à 1 h, lait maternel 3 h, lait artificiel et repas léger 4–6 h. Pas d'antibioprophylaxie.",
    }),
  },
  {
    id: pid(10),
    name: "Thyroïdectomie",
    surgery: "Thyroïdectomie",
    operation_category: "C",
    hospital: "",
    source: `${MANUAL}, chap. 23 et 34.`,
    content: content({
      techniques: ["general"],
      drugs: [propofolInduction(), sufentanil(), rocuronium(0.6), dexamethasone(8), ondansetron(), paracetamol()],
      targets: ["Euthyroïdie obligatoire avant une chirurgie programmée", "Réveil sans toux ni effort"],
      material: [...MONITORING, "Sonde avec électrodes de monitorage du nerf récurrent (si demandée : curare de courte durée à l'intubation seulement)", "Vidéolaryngoscope", "Protection oculaire (exophtalmie)"],
      risks: [
        { title: "Intubation difficile", conduct: "Trachée déviée ou comprimée : bilan (scanner), vidéolaryngoscope ou fibroscope, sonde armée si trachéomalacie." },
        { title: "Hématome compressif", conduct: "Dyspnée, stridor : ouverture de la plaie au lit, réintubation." },
        { title: "Hypocalcémie, paralysie récurrentielle", conduct: "Calcémie postopératoire ; laryngospasme possible." },
      ],
      postop: ["Surveillance de la voie aérienne et de la loge", "Calcémie à J1"],
      notes: "Éviter anticholinergiques et kétamine (hyperthyroïdie) ; phényléphrine plutôt qu'éphédrine. Pas d'antibioprophylaxie en règle (chirurgie propre sans implant) : suivre le protocole du service.",
    }),
  },
  {
    id: pid(11),
    name: "Résection transurétrale de prostate sous rachianesthésie",
    surgery: "Résection transurétrale de la prostate",
    operation_category: "J2",
    hospital: "",
    source: `${MANUAL}, chap. 13, 20 et 35.`,
    content: content({
      techniques: ["neuraxial"],
      drugs: [
        drug("Bupivacaïne 0,5 % hyperbare", "alr", "intrathecal", { fixed: 10 }, "mg", "Niveau T10 ; patient conscient : détection précoce d'un syndrome de résorption."),
        drug("Céfuroxime", "antibio", "bolus_iv", { fixed: 1.5 }, "g", "Selon l'ECBU (stérile avant la chirurgie) et le protocole du service (manuel, chap. 20).", 240),
        paracetamol(),
      ],
      targets: ["Surveillance de la natrémie si résection longue (> 60 min) ou irrigation au glycocolle", "Normothermie (irrigation réchauffée)"],
      material: [...MONITORING, "Liquide d'irrigation réchauffé", "Natrémie au bloc"],
      risks: [
        { title: "Syndrome de résorption (TURP syndrome)", conduct: "Confusion, nausées, troubles visuels, bradycardie, hypertension puis hypotension : arrêter la résection, natrémie, furosémide si surcharge ; NaCl hypertonique si Na < 120 mmol/l symptomatique." },
        { title: "Perforation vésicale", conduct: "Douleur scapulaire ou abdominale, hypotension : arrêt et bilan." },
      ],
      postop: ["Irrigation continue", "Natrémie si symptômes"],
      notes: "Résection bipolaire au sérum physiologique : pas d'hyponatrémie de dilution, mais surcharge volémique possible.",
    }),
  },
  {
    id: pid(12),
    name: "Hystérectomie par cœlioscopie",
    surgery: "Hystérectomie",
    operation_category: "J1",
    hospital: "",
    source: `${HARDY} ; ${MANUAL}, chap. 20, 23 et 30 ; ERAS Society gynécologie.`,
    content: content({
      techniques: ["general"],
      drugs: [
        propofolInduction(),
        sufentanil(),
        rocuronium(),
        dexamethasone(8),
        cefazolin("Avant l'incision ; > 120 kg : 3 g ; réinjection à 4 h."),
        drug("Métronidazole", "antibio", "perfusion", { fixed: 500 }, "mg", "Voie vaginale ou ouverture vaginale selon le protocole du service."),
        ondansetron(),
        droperidol(),
        paracetamol(),
        ketorolac(),
      ],
      targets: ["Trendelenburg et pneumopéritoine : pressions de ventilation, PEP", "Euvolémie"],
      material: [...MONITORING, "Curamètre", "Protection des points d'appui (jambes écartées)", "Compression pneumatique"],
      risks: [{ title: "Trendelenburg prolongé", conduct: "Œdème facial et laryngé (test de fuite avant l'extubation), glissement du patient, pression intraoculaire." }],
      postop: ["Réalimentation précoce", "Thromboprophylaxie selon le risque", "NVPO fréquents : double prophylaxie"],
    }),
  },
  {
    id: pid(13),
    name: "Cataracte sous anesthésie topique",
    surgery: "Cataracte",
    operation_category: "I",
    hospital: "",
    source: `${MANUAL}, chap. 38.`,
    content: content({
      techniques: ["sedation"],
      drugs: [drug("Midazolam", "premed", "bolus_iv", { fixed: 1 }, "mg", "Sédation légère seulement si nécessaire : une sédation profonde fait bouger.")],
      targets: ["Patient coopérant, capable de rester à plat 20–30 min", "Glycémie et PA contrôlées sans retarder le geste"],
      material: ["ECG", "PNI", "SpO₂", "O₂ sous les champs (lunettes)"],
      risks: [{ title: "Agitation ou toux", conduct: "Arrêt du geste ; rester en contact verbal." }],
      postop: ["Sortie rapide", "Collyres selon l'ophtalmologue"],
      notes: "Antithrombotiques poursuivis pour une anesthésie topique (voir les règles). Pas d'antibioprophylaxie IV (céfuroxime intracamérulaire par l'ophtalmologue).",
    }),
  },
  {
    id: pid(14),
    name: "Chirurgie bariatrique (sleeve, bypass) par cœlioscopie",
    surgery: "Chirurgie bariatrique",
    operation_category: "A",
    hospital: "",
    source: `${HARDY} ; ${MANUAL}, chap. 20 et 44.`,
    content: content({
      techniques: ["general"],
      drugs: [
        drug("Propofol", "induction", "bolus_iv", { perKg: 2, basis: "adjusted" }, "mg", "Au poids corrigé (manuel, chap. 44)."),
        drug("Sufentanil", "induction", "bolus_iv", { perKg: 0.2, basis: "lean" }, "µg", "Au poids maigre."),
        drug("Rocuronium", "induction", "bolus_iv", { perKg: 0.6, basis: "ideal" }, "mg", "Au poids idéal ; sugammadex en fin d'intervention au poids réel."),
        drug("Céfazoline", "antibio", "bolus_iv", { fixed: 3 }, "g", "> 120 kg : 3 g (sinon 2 g) ; réinjection à 4 h.", 240),
        ketamineSparing(),
        drug("Dexaméthasone", "ponv", "bolus_iv", { fixed: 8 }, "mg", "NVPO."),
        ondansetron(),
        paracetamol(),
      ],
      targets: ["Préoxygénation proclive avec PEP", "PEP 8–10 cmH₂O et recrutements", "Vt 6–8 ml/kg de poids idéal"],
      material: [...MONITORING, "Coussin de rampe", "Vidéolaryngoscope", "Brassard adapté", "Curamètre", "Compression pneumatique"],
      risks: [
        { title: "Intubation et ventilation difficiles", conduct: "Rampe, préoxygénation proclive, vidéolaryngoscope ; séquence rapide seulement si reflux ou anneau gastrique." },
        { title: "SAOS", conduct: "Épargne morphinique (kétamine, AINS, infiltrations), extubation semi-assise, PPC en SSPI si appareillé." },
      ],
      postop: ["Lever le jour même", "HBPM à dose adaptée au poids", "PPC si SAOS appareillé"],
      notes: "Poids : idéal pour le rocuronium, corrigé pour l'induction au propofol, maigre pour les morphiniques (manuel, chap. 44).",
    }),
  },
];
