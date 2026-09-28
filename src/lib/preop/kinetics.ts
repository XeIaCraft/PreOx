// How fast and how long: onset, peak, clinical duration, half-lives and the
// context-sensitive half-time of the anaesthesia drugs — usual adult values
// after a usual dose, to anticipate the next dose and the awakening. The
// elimination half-life says little about waking up after an infusion: the
// context-sensitive half-time (time for the concentration to halve after
// stopping an infusion of a given duration) does (Hughes, Glass, Jacobs,
// Anesthesiology 1992, PMID 1539843).
//
// Sources: Stoelting's Pharmacology & Physiology in Anesthetic Practice
// (6e éd.) ; Miller's Anesthesia (9e éd.) ; Manuel pratique d'anesthésie 2020
// (chap. 6–10) ; RCP (sugammadex, rocuronium). Ranges, not exact numbers: age,
// liver and kidney function, obesity and the other drugs change them.

import { fold } from "./catalog";

export interface Kinetics {
  name: string;
  words: string[];
  group: "hypnotic" | "opioid" | "nmb" | "reversal" | "inhaled" | "local" | "adjuvant" | "vasoactive";
  /** After the usual dose and route. */
  dose: string;
  onset: string;
  peak?: string;
  /** Clinical duration of one dose. */
  duration: string;
  /** Minutes of clinical effect, used to show « effect until ~hh:mm » after a dose given in theatre. */
  durationMin?: [number, number];
  halfLife?: string;
  /** Context-sensitive half-time: after 1 h, 3 h, 8 h of infusion. */
  csht?: string;
  /** What it means for the awakening and the recovery room. */
  wake: string;
  /** Elimination, what prolongs it. */
  elimination?: string;
}

const K = (k: Kinetics) => k;

export const KINETICS: Kinetics[] = [
  // Hypnotics
  K({ name: "Propofol", words: ["propofol", "diprivan"], group: "hypnotic", dose: "2–2,5 mg/kg IV (induction)", onset: "30–45 s", peak: "1–2 min", duration: "5–10 min après un bolus", durationMin: [5, 10], halfLife: "t½ d'élimination 4–7 h (redistribution rapide)", csht: "≈ 10 min (1 h) · ≈ 20–25 min (3 h) · < 40 min (8 h)", wake: "Réveil quand la Ce descend vers 1–1,5 µg/mL (plus haut sans morphinique) ; le rémifentanil permet de garder le propofol bas et de se réveiller vite.", elimination: "Hépatique et extra-hépatique ; peu modifiée par l'insuffisance rénale ou hépatique." }),
  K({ name: "Étomidate", words: ["etomidate", "hypnomidate"], group: "hypnotic", dose: "0,2–0,3 mg/kg IV", onset: "30–60 s", peak: "1 min", duration: "3–5 min", durationMin: [3, 5], halfLife: "2–5 h", wake: "Réveil rapide ; inhibition de la 11β-hydroxylase (cortisol) 6–8 h après une dose, plus en perfusion (à éviter). Myoclonies, NVPO.", elimination: "Hépatique (estérases)." }),
  K({ name: "Kétamine", words: ["ketamine", "ketalar"], group: "hypnotic", dose: "1–2 mg/kg IV (induction) ; 0,15–0,5 mg/kg (analgésie)", onset: "30–60 s IV (IM 3–5 min)", peak: "1 min", duration: "10–20 min (hypnose) ; analgésie plus longue", durationMin: [10, 20], halfLife: "2–3 h (norkétamine active)", wake: "Réveil plus lent en dose d'induction, rêves et agitation (benzodiazépine à discuter) ; aux doses d'épargne morphinique, peu d'effet sur le réveil.", elimination: "Hépatique (CYP3A4, 2B6) → norkétamine active." }),
  K({ name: "Midazolam", words: ["midazolam", "dormicum"], group: "hypnotic", dose: "1–2 mg IV (anxiolyse) ; 0,1–0,2 mg/kg (induction)", onset: "1–3 min", peak: "3–5 min", duration: "15–30 min (bolus) ; plus long chez le sujet âgé", durationMin: [15, 45], halfLife: "2–3 h ; ×2 chez le sujet âgé et l'obèse", csht: "≈ 40 min (1 h) · > 60 min (3 h) · accumulation en perfusion", wake: "Réveil retardé, confusion postopératoire chez le sujet âgé ; antidote : flumazénil 0,2 mg (durée plus courte que le midazolam : resédation).", elimination: "Hépatique CYP3A4 (azolés, macrolides, diltiazem l'allongent) ; métabolite actif en insuffisance rénale." }),
  K({ name: "Dexmédétomidine", words: ["dexmedetomidine", "dexdor"], group: "hypnotic", dose: "0,5–1 µg/kg sur 10 min, puis 0,2–0,7 µg/kg/h", onset: "5–10 min (charge sur 10 min)", peak: "15–30 min", duration: "1–2 h après l'arrêt", durationMin: [60, 120], halfLife: "2–3 h", csht: "≈ 4 min (10 min) · ≈ 250 min (8 h)", wake: "Sédation « réveillable », pas de dépression respiratoire ; bradycardie et hypotension prolongées ; arrêter 30–60 min avant la fin.", elimination: "Hépatique ; réduire en insuffisance hépatique." }),

  // Opioids
  K({ name: "Sufentanil", words: ["sufentanil", "sufenta"], group: "opioid", dose: "0,2–0,5 µg/kg IV", onset: "1–3 min", peak: "3–5 min", duration: "30–60 min (selon la dose)", durationMin: [30, 60], halfLife: "t½ d'élimination ≈ 2,5 h", csht: "≈ 15–20 min (1 h) · ≈ 35 min (4 h) · ≈ 60 min (8 h)", wake: "Dernière réinjection ≥ 30–45 min avant la fin pour une ventilation spontanée au réveil ; dépression respiratoire si Ce > 0,2–0,3 ng/mL.", elimination: "Hépatique (CYP3A4)." }),
  K({ name: "Fentanyl", words: ["fentanyl"], group: "opioid", dose: "1–3 µg/kg IV", onset: "1–2 min", peak: "4–5 min", duration: "30–60 min", durationMin: [30, 60], halfLife: "3–4 h", csht: "≈ 20–30 min (1 h) · ≈ 100 min (3 h) · > 4 h (8 h)", wake: "S'accumule en réinjections répétées ou en perfusion : réveil et ventilation spontanée retardés.", elimination: "Hépatique (CYP3A4)." }),
  K({ name: "Rémifentanil", words: ["remifentanil", "ultiva"], group: "opioid", dose: "AIVOC Ce 2–8 ng/mL ; 0,1–0,5 µg/kg/min", onset: "1 min", peak: "1–2 min", duration: "5–10 min après l'arrêt", durationMin: [5, 10], halfLife: "3–10 min", csht: "3–4 min, quelle que soit la durée", wake: "Réveil rapide et prévisible, mais aucune analgésie résiduelle : relais (morphine, piritramide, ALR) 20–30 min avant l'arrêt ; hyperalgésie aux fortes doses.", elimination: "Estérases plasmatiques et tissulaires (indépendant du foie et du rein)." }),
  K({ name: "Alfentanil", words: ["alfentanil", "rapifen"], group: "opioid", dose: "10–30 µg/kg IV", onset: "< 1 min", peak: "1–2 min", duration: "10–15 min", durationMin: [10, 15], halfLife: "1,5 h", csht: "≈ 50–60 min en plateau après 2 h", wake: "Bolus avant un stimulus bref (laryngoscopie) ; en perfusion longue, moins bon que le sufentanil.", elimination: "Hépatique (CYP3A4)." }),
  K({ name: "Morphine", words: ["morphine"], group: "opioid", dose: "0,05–0,1 mg/kg IV", onset: "5–10 min", peak: "15–30 min (effet lent : titrer)", duration: "3–4 h", durationMin: [180, 240], halfLife: "2–3 h", wake: "Titrer par 2–3 mg toutes les 5–10 min en salle de réveil ; injecter 30–45 min avant la fin pour un relais du rémifentanil.", elimination: "Hépatique → M6G active, éliminée par le rein : accumulation en insuffisance rénale." }),
  K({ name: "Piritramide", words: ["piritramide", "dipidolor"], group: "opioid", dose: "0,1–0,2 mg/kg IV (titration par 3–5 mg)", onset: "5–10 min", peak: "15–20 min", duration: "4–6 h", durationMin: [240, 360], halfLife: "4–10 h", wake: "Relais analgésique usuel en Belgique : 30–45 min avant la fin ; sédation chez le sujet âgé.", elimination: "Hépatique." }),
  K({ name: "Oxycodone", words: ["oxycodone", "oxynorm"], group: "opioid", dose: "0,05–0,1 mg/kg IV", onset: "2–5 min", peak: "10–15 min", duration: "3–4 h", durationMin: [180, 240], halfLife: "3–4 h", wake: "Relais analgésique ; moins de métabolites actifs que la morphine en insuffisance rénale modérée.", elimination: "Hépatique (CYP3A4, 2D6)." }),

  // Neuromuscular blockers
  K({ name: "Succinylcholine", words: ["succinylcholine", "suxamethonium", "celocurine", "myoplegine"], group: "nmb", dose: "1–1,5 mg/kg IV", onset: "45–60 s", peak: "1 min", duration: "5–10 min", durationMin: [5, 10], wake: "Déficit en pseudocholinestérases : bloc de plusieurs heures (sédation et ventilation jusqu'à récupération, TOF).", elimination: "Pseudocholinestérases plasmatiques." }),
  K({ name: "Rocuronium", words: ["rocuronium", "esmeron"], group: "nmb", dose: "0,6 mg/kg (1,2 mg/kg en séquence rapide)", onset: "1,5–2 min (60 s à 1,2 mg/kg)", peak: "2–3 min", duration: "30–40 min (0,6 mg/kg) ; 60–70 min (1,2 mg/kg)", durationMin: [30, 40], halfLife: "1–2 h", wake: "TOF ≥ 0,9 obligatoire avant l'extubation ; allongé chez le sujet âgé, en insuffisance hépatique, avec les halogénés et le magnésium. Antagonisation : sugammadex selon la profondeur.", elimination: "Hépatique et biliaire (rénale 30 %)." }),
  K({ name: "Cisatracurium", words: ["cisatracurium", "nimbex"], group: "nmb", dose: "0,15 mg/kg IV", onset: "3–5 min", peak: "5 min", duration: "45–60 min", durationMin: [45, 60], halfLife: "20–30 min", wake: "Durée prévisible, indépendante du foie et du rein (voie de Hofmann) ; antagonisation par néostigmine (pas de sugammadex).", elimination: "Voie de Hofmann (température, pH)." }),
  K({ name: "Atracurium", words: ["atracurium", "tracrium"], group: "nmb", dose: "0,5 mg/kg IV", onset: "2–3 min", peak: "3–4 min", duration: "30–40 min", durationMin: [30, 40], halfLife: "20 min", wake: "Histaminolibération (injection lente) ; antagonisation par néostigmine.", elimination: "Voie de Hofmann et estérases." }),
  K({ name: "Mivacurium", words: ["mivacurium", "mivacron"], group: "nmb", dose: "0,2 mg/kg IV", onset: "2–3 min", peak: "3 min", duration: "15–20 min", durationMin: [15, 20], wake: "Court ; prolongé en déficit en pseudocholinestérases.", elimination: "Pseudocholinestérases." }),

  // Reversal
  K({ name: "Sugammadex", words: ["sugammadex", "bridion"], group: "reversal", dose: "2 mg/kg (TOF ≥ 2 réponses) ; 4 mg/kg (PTC 1–2) ; 16 mg/kg (immédiat après rocuronium 1,2 mg/kg)", onset: "TOF ≥ 0,9 en ≈ 2 min (2 mg/kg), ≈ 3 min (4 mg/kg), ≈ 1,5 min (16 mg/kg)", duration: "Pas de re-curarisation si la dose est adaptée à la profondeur", halfLife: "≈ 2 h (rénale) ; déconseillé si clairance < 30 mL/min", wake: "Recurariser ensuite : rocuronium 1,2 mg/kg possible 5 min après ≤ 4 mg/kg (délai plus long) ; contraception hormonale orale moins efficace 7 jours.", elimination: "Rénale, complexe sugammadex-rocuronium." }),
  K({ name: "Néostigmine", words: ["neostigmine", "prostigmine"], group: "reversal", dose: "40–50 µg/kg (max 5 mg) + atropine 15 µg/kg ou glycopyrrolate", onset: "1–3 min", peak: "7–10 min", duration: "≈ 60 min", durationMin: [60, 60], wake: "Seulement si le bloc est déjà en récupération (TOF ≥ 2–4 réponses) ; effet plafond, re-curarisation possible si bloc profond. Toujours vérifier TOF ≥ 0,9.", elimination: "Rénale." }),

  // Inhaled
  K({ name: "Sévoflurane", words: ["sevoflurane", "sevorane"], group: "inhaled", dose: "CAM 2 % à 40 ans (≈ 1,7 % à 60 ans)", onset: "Induction inhalatoire 1–2 min (8 %)", duration: "Réveil 5–10 min après l'arrêt (plus après plusieurs heures)", halfLife: "Élimination pulmonaire, peu soluble (coefficient sang/gaz 0,65)", wake: "Réveil quand la fraction expirée approche la CAM-réveil (≈ 0,3–0,4 CAM, ≈ 0,6–0,7 %) : haut débit de gaz frais à la fin. Les morphiniques diminuent peu la CAM-réveil.", elimination: "Pulmonaire (métabolisme hépatique 3–5 %)." }),

  // Local / neuraxial
  K({ name: "Bupivacaïne hyperbare (rachianesthésie)", words: ["bupivacaine hyperbare", "marcaine spinal", "rachi"], group: "local", dose: "7,5–12,5 mg intrathécal", onset: "5–10 min", peak: "15–20 min", duration: "1,5–3 h (bloc moteur)", durationMin: [90, 180], wake: "Levée du bloc moteur à attendre avant la sortie de salle de réveil (score de Bromage) ; miction avant la sortie en ambulatoire selon le protocole.", elimination: "Hépatique." }),
  K({ name: "Chloroprocaïne (rachianesthésie)", words: ["chloroprocaine", "clorotekal"], group: "local", dose: "30–50 mg intrathécal", onset: "5–10 min", duration: "40–80 min", durationMin: [40, 80], wake: "Levée rapide : ambulatoire.", elimination: "Pseudocholinestérases." }),
  K({ name: "Ropivacaïne (bloc périphérique)", words: ["ropivacaine", "naropin"], group: "local", dose: "0,375–0,5 % selon le bloc", onset: "15–30 min", duration: "6–12 h (analgésie)", durationMin: [360, 720], wake: "Prévoir le relais analgésique avant la levée du bloc (« rebond ») ; membre protégé tant qu'il est insensible.", elimination: "Hépatique (CYP1A2)." }),
  K({ name: "Lidocaïne IV", words: ["lidocaine iv", "lidocaine"], group: "local", dose: "1,5 mg/kg puis 1–2 mg/kg/h", onset: "1–2 min", duration: "Arrêt en fin d'intervention (ou 24 h en service surveillé)", halfLife: "1,5–2 h", wake: "Pas avec une péridurale ou un bloc en cours ; toxicité : goût métallique, acouphènes.", elimination: "Hépatique." }),

  // Adjuvants
  K({ name: "Paracétamol", words: ["paracetamol", "perfusalgan"], group: "adjuvant", dose: "1 g IV sur 15 min", onset: "5–10 min", peak: "1 h", duration: "4–6 h", durationMin: [240, 360], wake: "Injecter tôt pour un effet au réveil.", elimination: "Hépatique." }),
  K({ name: "Kétorolac", words: ["ketorolac", "taradyl"], group: "adjuvant", dose: "15–30 mg IV", onset: "10–30 min", peak: "1–2 h", duration: "4–6 h", durationMin: [240, 360], wake: "Injecter 30 min avant la fin.", elimination: "Rénale." }),
  K({ name: "Dexaméthasone", words: ["dexamethasone", "aacidexam"], group: "adjuvant", dose: "4–8 mg IV", onset: "1–2 h (antiémétique)", duration: "24–72 h", wake: "À l'induction : effet antiémétique au réveil ; hyperglycémie transitoire.", elimination: "Hépatique." }),
  K({ name: "Ondansétron", words: ["ondansetron", "zofran"], group: "adjuvant", dose: "4 mg IV", onset: "< 30 min", duration: "≈ 8 h", halfLife: "3–4 h", wake: "30 min avant la fin.", elimination: "Hépatique." }),
  K({ name: "Dropéridol", words: ["droperidol", "dehydrobenzperidol"], group: "adjuvant", dose: "0,625–1,25 mg IV", onset: "3–10 min", duration: "2–4 h", durationMin: [120, 240], wake: "Sédation possible au réveil ; QT.", elimination: "Hépatique." }),
  K({ name: "Clonidine", words: ["clonidine", "catapressan"], group: "adjuvant", dose: "1–2 µg/kg IV", onset: "10 min", peak: "30–60 min", duration: "3–6 h", durationMin: [180, 360], halfLife: "8–12 h", wake: "Sédation, bradycardie et hypotension au réveil.", elimination: "Rénale 50 %." }),
  K({ name: "Magnésium", words: ["magnesium"], group: "adjuvant", dose: "30–50 mg/kg IV", onset: "Immédiat", duration: "Heures", wake: "Potentialise les curares (TOF) ; sédation.", elimination: "Rénale." }),

  // Vasoactive
  K({ name: "Éphédrine", words: ["ephedrine"], group: "vasoactive", dose: "3–9 mg IV", onset: "< 1 min", duration: "10–15 min", durationMin: [10, 15], wake: "Tachyphylaxie.", elimination: "Rénale." }),
  K({ name: "Phényléphrine", words: ["phenylephrine", "neosynephrine"], group: "vasoactive", dose: "50–100 µg IV", onset: "< 1 min", duration: "5–10 min", durationMin: [5, 10], wake: "Bradycardie réflexe.", elimination: "Hépatique." }),
  K({ name: "Noradrénaline", words: ["noradrenaline", "norepinephrine"], group: "vasoactive", dose: "0,05–0,5 µg/kg/min", onset: "1–2 min", duration: "1–2 min après l'arrêt", halfLife: "2–3 min", wake: "Sevrage progressif ; voie dédiée, jamais de bolus de rinçage.", elimination: "Recaptage, COMT, MAO." }),
  K({ name: "Atropine", words: ["atropine"], group: "vasoactive", dose: "0,5–1 mg IV (10–20 µg/kg)", onset: "1 min", duration: "30–60 min", durationMin: [30, 60], wake: "Confusion possible chez le sujet âgé.", elimination: "Hépatique et rénale." }),
];

export const KINETICS_GROUPS: { code: Kinetics["group"]; label: string }[] = [
  { code: "hypnotic", label: "Hypnotiques" },
  { code: "opioid", label: "Morphiniques" },
  { code: "nmb", label: "Curares" },
  { code: "reversal", label: "Antagonisation" },
  { code: "inhaled", label: "Halogéné" },
  { code: "local", label: "Anesthésiques locaux" },
  { code: "adjuvant", label: "Adjuvants" },
  { code: "vasoactive", label: "Vasoactifs" },
];

export const KINETICS_SOURCE =
  "Valeurs usuelles chez l'adulte : Stoelting's Pharmacology & Physiology in Anesthetic Practice ; Miller's Anesthesia ; Manuel pratique d'anesthésie 2020 ; RCP. Demi-vie contextuelle : Hughes, Glass, Jacobs, Anesthesiology 1992 (PMID 1539843).";

/** The kinetics card of a drug name (plan line or drug given). */
export function kineticsFor(name: string): Kinetics | undefined {
  const n = ` ${fold(name).replace(/[^a-z0-9]+/g, " ")} `;
  // Longest word first: « lidocaine iv » before « lidocaine », « bupivacaine hyperbare » before nothing.
  let best: { k: Kinetics; len: number } | undefined;
  for (const k of KINETICS)
    for (const w of k.words) {
      const fw = fold(w);
      if (n.includes(` ${fw} `) || n.includes(` ${fw}`)) if (!best || fw.length > best.len) best = { k, len: fw.length };
    }
  return best?.k;
}

/** « Effect until ~10:45–11:05 » for a dose given at `at` (ISO). */
export function effectWindow(k: Kinetics, at: string): { from: string; to: string } | null {
  if (!k.durationMin) return null;
  const t = Date.parse(at);
  const hm = (ms: number) => new Date(ms).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
  return { from: hm(t + k.durationMin[0] * 60_000), to: hm(t + k.durationMin[1] * 60_000) };
}
