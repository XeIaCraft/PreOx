// Rules taken from the MAPAR (Protocoles d'anesthésie-réanimation, fiches
// « Évaluation préopératoire » : adaptation des traitements, corticothérapie,
// anticoagulants curatifs, jeûne, prémédication), where it adds to the rules
// PreOx already has. Only the facts are kept, with the chapter; the book stays
// out of the repository. Imported active and marked « à relire ».

import { MANUAL_RULES } from "./proposed-manual";
import type { Condition, Rule, RuleSource } from "./types";

type Proposed = Omit<Rule, "created_at" | "updated_at">;

const id = (n: number) => `5f1c0a10-0007-4000-8000-${String(n).padStart(12, "0")}`;

const mapar = (chapter: string, quote = ""): RuleSource => ({
  organisation: "MAPAR",
  title: `Protocoles d'anesthésie-réanimation MAPAR — ${chapter}`,
  year: null,
  doi: "",
  pmid: "",
  quote,
  grade: "",
  level: "book",
});

const drug = (atc: string, extra: Partial<Extract<Condition, { kind: "drug" }>> = {}): Condition => ({ kind: "drug", atc, ...extra });
const history = (condition: string, label: string): Condition => ({ kind: "history", condition, present: true, label });
const adult: Condition = { kind: "value", value: "age", op: ">=", threshold: 16 };

const rule = (n: number, p: Pick<Proposed, "title" | "statement" | "conditions" | "action" | "source" | "question"> & Partial<Proposed>): Proposed => ({
  id: id(n),
  divergences: [],
  explanations: [],
  status: "draft",
  version: 1,
  verified_at: null,
  review_at: null,
  tool: "PreOx (d'après le MAPAR, à relire)",
  ...p,
});

const NEURO = "Le MAPAR vise la neurochirurgie intracrânienne ; PreOx l'applique à la chirurgie en espace clos (intracrânienne, canal rachidien, chambre postérieure de l'œil), plus large.";

export const MAPAR_RULES: Proposed[] = [
  rule(1, {
    title: "Xabans et neurochirurgie intracrânienne : arrêt 5 jours avant",
    statement: "Anticoagulant oral direct et neurochirurgie intracrânienne : dernière prise à J-5 (fonction rénale conservée, DFG > 50 mL/min) ; pas de relais, pas de dosage.",
    conditions: [drug("B01AF"), { kind: "surgery", attribute: "closedSpace", in: ["yes"] }, { kind: "value", value: "crcl", op: ">=", threshold: 50 }],
    action: { type: "stop_before", hours: 120, target: "surgery" },
    source: mapar("Adaptation des traitements (antithrombotiques)", "Arrêt J-5 si neurochirurgie intracrânienne (si DFG > 50 mL/min)."),
    explanations: [NEURO, "Hors espace clos, le délai de l'ESC 2022 / EHRA s'applique (48 h en chirurgie à haut risque hémorragique)."],
    question: "For intracranial neurosurgery, how many days before surgery should rivaroxaban, apixaban or edoxaban be stopped (GIHP, EHRA, neurosurgical guidance)?",
  }),
  rule(2, {
    title: "Dabigatran et neurochirurgie intracrânienne : arrêt 5 jours avant",
    statement: "Dabigatran et neurochirurgie intracrânienne : dernière prise à J-5 si DFG > 50 mL/min.",
    conditions: [drug("B01AE07"), { kind: "surgery", attribute: "closedSpace", in: ["yes"] }, { kind: "value", value: "crcl", op: ">=", threshold: 50 }],
    action: { type: "stop_before", hours: 120, target: "surgery" },
    source: mapar("Adaptation des traitements (antithrombotiques)", "Arrêt J-5 si neurochirurgie intracrânienne (si DFG > 50 mL/min)."),
    explanations: [NEURO],
    question: "For intracranial neurosurgery, how many days before surgery should dabigatran be stopped when creatinine clearance is above 50 mL/min?",
  }),
  rule(3, {
    title: "Anticoagulant curatif : relais héparinique seulement si risque thrombotique très élevé",
    statement: "Pas de relais par héparine en règle (le risque hémorragique l'emporte). Relais seulement si : valve mécanique, AVC ou AIT récent (< 3–6 mois) en FA, TVP proximale ou EP < 3 mois ou récidivante, thrombophilie sévère ; à discuter si CHADS₂ > 5.",
    conditions: [drug("B01AA")],
    action: { type: "info", text: "Relais héparinique seulement si valve mécanique, AVC/AIT < 3–6 mois en FA, MTEV < 3 mois ou récidivante, thrombophilie sévère (à discuter si CHADS₂ > 5) ; AVC ou MTEV récents : discussion pluridisciplinaire.", target: "both" },
    source: mapar("Adaptation périopératoire des anticoagulants curatifs"),
    question: "Which patients on vitamin K antagonists need heparin bridging before surgery (BRIDGE trial, ACCP 2022)?",
  }),
  rule(4, {
    title: "AINS au long cours et chirurgie à haut risque hémorragique : arrêt selon la demi-vie",
    statement: "AINS et chirurgie à haut risque hémorragique (neurochirurgie intracrânienne, RTUP, RTUV, amygdalectomie, rachis, ophtalmologie hors cataracte, orthopédie lourde) : arrêt selon la demi-vie, de 24 h à 10 jours.",
    conditions: [drug("M01A"), { kind: "surgery", attribute: "bleedingRisk", in: ["high"] }],
    action: { type: "info", text: "Arrêter l'AINS selon sa demi-vie : ibuprofène et diclofénac 24 h, naproxène et méloxicam 3–4 jours, piroxicam 10 jours ; paracétamol en relais.", target: "surgery" },
    source: mapar("Adaptation des traitements (douleur chronique)"),
    question: "How long before high bleeding risk surgery should chronic NSAIDs be discontinued, according to their half-life?",
  }),
  rule(5, {
    title: "Corticothérapie : supplémentation selon le stress chirurgical",
    statement: "Pas de freinage de l'axe surrénalien si corticothérapie < 3 semaines ou < 5 mg de prednisone le matin. Sinon : dose habituelle du matin, puis stress mineur (dentaire, coloscopie, hernie) : rien de plus ; modéré (cholécystectomie, hystérectomie, prothèse de hanche ou de genou) : hydrocortisone 50 mg à l'induction puis 50 mg × 3/j pendant 24 h ; majeur (œsophagectomie, chirurgie cardiaque) : 100 mg à l'induction puis 50 mg × 3/j pendant 24–72 h, et décroissance.",
    conditions: [drug("H02AB")],
    action: { type: "info", text: "Dose du matin ; stress modéré : hydrocortisone 50 mg à l'induction puis 50 mg × 3/j 24 h ; majeur : 100 mg puis 50 mg × 3/j 24–72 h. Inutile si < 3 semaines ou < 5 mg de prednisone. Dexaméthasone 4 mg ≈ 100 mg d'hydrocortisone sur 24 h (sans effet minéralocorticoïde). Éviter l'étomidate.", target: "both" },
    source: mapar("Adaptation de la corticothérapie"),
    question: "According to the 2024 ESE/Endocrine Society guideline on glucocorticoid-induced adrenal insufficiency and the 2020 Association of Anaesthetists guideline, what perioperative hydrocortisone doses are recommended by surgical stress level?",
  }),
  rule(6, {
    title: "Antituberculeux : poursuivre",
    statement: "Traitement antituberculeux poursuivi (vitamine B6 avec l'isoniazide) ; hépatotoxicité ; rifampicine inducteur enzymatique (AVK, AOD, opioïdes, corticoïdes, contraceptifs) ; avis spécialisé si la voie orale est impossible.",
    conditions: [drug("J04A")],
    action: { type: "info", text: "Poursuivre ; bilan hépatique ; rifampicine : inducteur enzymatique (doses d'AVK, d'AOD, d'opioïdes et de corticoïdes à revoir) ; avis spécialisé si voie orale impossible.", target: "both" },
    source: mapar("Adaptation des traitements (anti-infectieux)"),
    question: "Should antituberculous treatment be continued perioperatively, and which interactions of rifampicin matter for anaesthesia?",
  }),
  rule(7, {
    title: "Prémédication anxiolytique : pas en routine",
    statement: "La prémédication anxiolytique systématique est inefficace et parfois délétère : relation, information et hypnose d'abord ; si nécessaire, benzodiazépine de demi-vie courte ; pas d'hydroxyzine ; hypnotique la veille si insomnie.",
    conditions: [adult],
    action: { type: "info", text: "Pas de prémédication anxiolytique systématique ; si besoin, benzodiazépine de demi-vie courte (pas d'hydroxyzine) ; zolpidem ou zopiclone la veille si insomnie.", target: "anaesthesia" },
    source: mapar("Prémédication chez l'adulte"),
    question: "Is routine anxiolytic premedication recommended in adults (Maurice-Szamburski, JAMA 2015; SFAR)?",
  }),
  rule(8, {
    title: "Jeûne de l'adulte : 2 h pour les liquides clairs, 6 h pour un repas léger",
    statement: "Liquides clairs jusqu'à 2 h (quantité libre ; un peu de lait dans une boisson chaude compte comme liquide clair), 6 h après un repas léger, au moins 8 h après un repas gras ou avec de la viande. Tabac, vapotage, patch ou gomme à la nicotine, chewing-gum et bonbons ne retardent pas l'anesthésie.",
    conditions: [adult],
    action: { type: "info", text: "Liquides clairs jusqu'à 2 h (un peu de lait dans le café accepté) ; repas léger 6 h ; repas gras ou avec viande 8 h. Cigarette, vapotage, chewing-gum, bonbons : pas de report. Doute : échographie gastrique.", target: "anaesthesia" },
    source: mapar("Jeûne préopératoire chez l'adulte"),
    question: "According to the ESAIC 2022 adult fasting guideline, what are the fasting times for clear fluids, light meals and fatty meals, and do chewing gum or smoking delay anaesthesia?",
  }),
  rule(9, {
    title: "Cannabis : pas de consommation dans les 12 h",
    statement: "Cannabis : arrêt de la consommation plus de 12 h avant l'anesthésie.",
    conditions: [history("cannabis", "Consommation de cannabis")],
    action: { type: "info", text: "Pas de consommation dans les 12 h ; besoins en hypnotiques augmentés, hyperréactivité bronchique si fumé.", target: "anaesthesia" },
    source: mapar("Adaptation des traitements (toxicomanie)"),
    question: "How long before anaesthesia should cannabis use stop (ASRA 2023 cannabis consensus)?",
  }),
  rule(10, {
    title: "Cocaïne : une semaine d'abstinence avant une chirurgie programmée",
    statement: "Cocaïne : sevrage d'une semaine avant une chirurgie programmée ; pas de bêtabloquant seul (vasoconstriction coronaire).",
    conditions: [history("cocaine", "Consommation de cocaïne ou d'amphétamines")],
    action: { type: "requirement", text: "Pas de consommation dans la semaine qui précède (report sinon) ; pas de bêtabloquant seul.", blocking: false, target: "both" },
    source: mapar("Adaptation des traitements (toxicomanie)"),
    question: "How long should elective surgery be postponed after recent cocaine use, and are beta-blockers contraindicated?",
  }),
  rule(11, {
    title: "Ticagrélor et neurochirurgie intracrânienne : arrêt 7 jours avant",
    statement: "Antiplaquettaires : dernière prise à J-3 (aspirine), J-5 (clopidogrel, ticagrélor), J-7 (prasugrel) quand l'arrêt est décidé ; ajouter 2 jours pour une neurochirurgie intracrânienne — soit J-7 pour le ticagrélor.",
    conditions: [drug("B01AC24"), { kind: "surgery", attribute: "closedSpace", in: ["yes"] }],
    action: { type: "stop_before", hours: 168, target: "surgery" },
    source: mapar("Agents antiplaquettaires (gestion périopératoire des AAP oraux)", "Ajouter 2 j à chaque durée si neurochirurgie intracrânienne."),
    explanations: [NEURO, "Bithérapie pour stent : différer la procédure à la fin de la bithérapie ; stent < 1 mois, ou < 6 mois à haut risque thrombotique, ou infarctus < 6 mois : différer, sinon poursuivre l'aspirine."],
    question: "Before intracranial neurosurgery, how many days before surgery should ticagrelor be stopped (ESC 2022, GIHP 2018)?",
  }),
];

/** Older proposals the MAPAR replaces (a more complete version of the same advice). */
const manualId = (title: string) => {
  const r = MANUAL_RULES.find((x) => x.title === title);
  if (!r) throw new Error(`Règle du manuel introuvable : ${title}`);
  return r.id;
};
export const MAPAR_SUPERSEDES: Record<string, string[]> = {
  [id(8)]: [manualId("Jeûne préopératoire de l'adulte")],
  [id(11)]: [manualId("Ticagrélor et chirurgie en espace clos")],
};
