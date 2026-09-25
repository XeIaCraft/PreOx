// Rules PreOx proposes as a starting point, from the main guidelines —
// imported as DRAFTS only: none is applied until you have opened the
// source, copied the exact sentence and activated it. Each one carries the
// question to check it with Consensus / OpenEvidence. The figures are the
// commonly cited ones; guidelines differ (ESAIC/ESRA 2022, ASRA 2025…),
// which is exactly why they must be checked against the source you follow.

import { MANUAL_RULES } from "./proposed-manual";
import type { Rule, RuleSource } from "./types";

type Proposed = Omit<Rule, "created_at" | "updated_at">;

const ESAIC_ESRA_2022: RuleSource = {
  organisation: "ESAIC / ESRA",
  title: "Regional anaesthesia in patients on antithrombotic drugs: joint ESAIC/ESRA guidelines",
  year: 2022,
  doi: "10.1097/EJA.0000000000001600",
  pmid: "",
  quote: "",
  grade: "",
  level: "eu",
};

const base = (p: Pick<Proposed, "id" | "title" | "statement" | "conditions" | "action" | "source" | "question"> & Partial<Proposed>): Proposed => ({
  divergences: [],
  explanations: [],
  status: "draft",
  version: 1,
  verified_at: null,
  review_at: null,
  tool: "PreOx (proposition à vérifier)",
  ...p,
});

const neuraxialQ = (drug: string, extra = "") =>
  `According to the ESAIC/ESRA 2022 guidelines on regional anaesthesia in patients on antithrombotic drugs, what is the minimum interval between the last dose of ${drug}${extra} and a neuraxial puncture or deep block, and when can it be resumed?`;

const GUIDELINE_RULES: Proposed[] = [
  base({
    id: "5f1c0a10-0001-4000-8000-000000000001",
    title: "Aspirine à faible dose et ponction neuraxiale",
    statement: "L'aspirine à faible dose seule ne nécessite pas d'arrêt avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AC06" }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "info", text: "Aspirine à faible dose seule : pas d'arrêt nécessaire pour la ponction (vérifier l'absence d'autre antithrombotique)." },
    source: ESAIC_ESRA_2022,
    question: neuraxialQ("low-dose aspirin"),
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000002",
    title: "Clopidogrel et ponction neuraxiale",
    statement: "Arrêter le clopidogrel 5 jours avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AC04" }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "stop_before", hours: 120 },
    source: ESAIC_ESRA_2022,
    divergences: [{ summary: "ASRA : 5 à 7 jours.", source: "ASRA 2025 (5e édition)", level: "int" }],
    question: neuraxialQ("clopidogrel"),
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000003",
    title: "Prasugrel et ponction neuraxiale",
    statement: "Arrêter le prasugrel 7 jours avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AC22" }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "stop_before", hours: 168 },
    source: ESAIC_ESRA_2022,
    question: neuraxialQ("prasugrel"),
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000004",
    title: "Ticagrélor et ponction neuraxiale",
    statement: "Arrêter le ticagrélor 5 jours avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AC24" }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "stop_before", hours: 120 },
    source: ESAIC_ESRA_2022,
    divergences: [{ summary: "ASRA : 5 à 7 jours.", source: "ASRA 2025 (5e édition)", level: "int" }],
    question: neuraxialQ("ticagrelor"),
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000005",
    title: "Xabans à dose thérapeutique et ponction neuraxiale",
    statement: "Rivaroxaban, apixaban, édoxaban à dose thérapeutique : dernière prise au moins 72 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AF" }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "stop_before", hours: 72 },
    source: ESAIC_ESRA_2022,
    explanations: ["Dose prophylactique : délai plus court dans les recommandations (à vérifier et à écrire comme règle séparée avec une condition de dose)."],
    question: neuraxialQ("rivaroxaban, apixaban or edoxaban", " at therapeutic dose"),
  }),
  ...(
    [
      ["06", ">=", 80, 72],
      ["07", ">=", 50, 96],
      ["08", ">=", 30, 120],
    ] as const
  ).map(([n, op, crcl, hours]) =>
    base({
      id: `5f1c0a10-0001-4000-8000-0000000000${n}`,
      title: `Dabigatran, clairance ${crcl === 80 ? "≥ 80" : crcl === 50 ? "50–79" : "30–49"} mL/min, et ponction neuraxiale`,
      statement: `Dabigatran à dose thérapeutique, clairance ${crcl === 80 ? "≥ 80" : crcl === 50 ? "entre 50 et 79" : "entre 30 et 49"} mL/min : dernière prise au moins ${hours} h avant une ponction neuraxiale ou un bloc profond.`,
      conditions: [
        { kind: "drug" as const, atc: "B01AE07" },
        { kind: "technique" as const, in: ["neuraxial" as const, "deep_block" as const] },
        { kind: "value" as const, value: "crcl" as const, op, threshold: crcl },
        ...(crcl === 80 ? [] : [{ kind: "value" as const, value: "crcl" as const, op: "<" as const, threshold: crcl === 50 ? 80 : 50 }]),
      ],
      action: { type: "stop_before" as const, hours },
      source: ESAIC_ESRA_2022,
      question: neuraxialQ("dabigatran", ` (creatinine clearance ${crcl === 80 ? "≥ 80" : crcl === 50 ? "50–79" : "30–49"} mL/min)`),
    })
  ),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000009",
    title: "HBPM prophylactique et ponction neuraxiale",
    statement: "Énoxaparine à dose prophylactique (≤ 40 mg/j) : dernière injection au moins 12 h avant une ponction neuraxiale.",
    conditions: [{ kind: "drug", atc: "B01AB05", dailyDose: { op: "<=", mg: 40 } }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "stop_before", hours: 12 },
    source: ESAIC_ESRA_2022,
    question: neuraxialQ("prophylactic-dose enoxaparin"),
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000010",
    title: "HBPM curative et ponction neuraxiale",
    statement: "Énoxaparine à dose curative : dernière injection au moins 24 h avant une ponction neuraxiale.",
    conditions: [{ kind: "drug", atc: "B01AB05", dailyDose: { op: ">", mg: 40 } }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "stop_before", hours: 24 },
    source: ESAIC_ESRA_2022,
    question: neuraxialQ("therapeutic-dose enoxaparin"),
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000011",
    title: "AVK : INR avant ponction neuraxiale",
    statement: "Sous antivitamine K, la ponction neuraxiale n'est réalisée qu'avec un INR normalisé (seuil de la recommandation suivie).",
    conditions: [{ kind: "drug", atc: "B01AA" }, { kind: "technique", in: ["neuraxial", "deep_block"] }],
    action: { type: "requirement", text: "INR normalisé (≤ 1,4 selon ESAIC/ESRA 2022) avant la ponction.", blocking: true },
    source: ESAIC_ESRA_2022,
    divergences: [{ summary: "ASRA : INR normal (< 1,5).", source: "ASRA 2025 (5e édition)", level: "int" }],
    question: "According to ESAIC/ESRA 2022, what INR threshold is required before neuraxial puncture in a patient treated with a vitamin K antagonist, and how long before should it be stopped?",
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000012",
    title: "Inhibiteurs du SGLT2 avant chirurgie",
    statement: "Arrêter les inhibiteurs du SGLT2 au moins 3 jours avant une chirurgie programmée (4 jours pour l'ertugliflozine) : risque d'acidocétose euglycémique.",
    conditions: [{ kind: "drug", atc: "A10BK" }],
    action: { type: "stop_before", hours: 72 },
    source: { organisation: "ESC", title: "2022 ESC Guidelines on cardiovascular assessment and management of patients undergoing non-cardiac surgery", year: 2022, doi: "10.1093/eurheartj/ehac270", pmid: "", quote: "", grade: "", level: "eu" },
    divergences: [{ summary: "FDA 2020 : 3 jours (canagliflozine, dapagliflozine, empagliflozine), 4 jours (ertugliflozine).", source: "FDA 2020", level: "int" }],
    question: "How many days before elective surgery should SGLT2 inhibitors be stopped, according to current European guidelines (ESC 2022, ESAIC), and when can they be resumed?",
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000013",
    title: "ECG préopératoire en cas de cardiopathie",
    statement: "ECG 12 dérivations avant une chirurgie à risque intermédiaire ou élevé chez un patient avec une cardiopathie connue.",
    conditions: [{ kind: "history", condition: "coronary", present: true, label: "Coronaropathie" }, { kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "exam", exam: "ECG 12 dérivations" },
    source: { organisation: "ESC", title: "2022 ESC Guidelines on cardiovascular assessment and management of patients undergoing non-cardiac surgery", year: 2022, doi: "10.1093/eurheartj/ehac270", pmid: "", quote: "", grade: "", level: "eu" },
    question: "According to the ESC 2022 guidelines on non-cardiac surgery, in which patients is a preoperative 12-lead ECG recommended?",
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000014",
    title: "Anémie avant chirurgie hémorragique : bilan martial",
    statement: "Avant une chirurgie à risque hémorragique élevé, une anémie doit être explorée (bilan martial) et traitée, idéalement plusieurs semaines avant.",
    conditions: [{ kind: "history", condition: "anemia", present: true, label: "Anémie connue" }, { kind: "surgery", attribute: "bleedingRisk", in: ["high"] }],
    action: { type: "exam", exam: "Bilan martial (ferritine, saturation de la transferrine, CRP)" },
    source: { organisation: "Consensus international (Muñoz et al.)", title: "International consensus statement on the peri-operative management of anaemia and iron deficiency", year: 2017, doi: "10.1111/anae.13773", pmid: "", quote: "", grade: "", level: "int" },
    question: "What do current guidelines recommend for the preoperative investigation and treatment of anaemia and iron deficiency before surgery with expected major blood loss?",
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000015",
    title: "Allergie à la pénicilline peu probable : céfazoline",
    statement: "Allergie déclarée à la pénicilline avec PEN-FAST < 3 et sans réaction grave : la céfazoline peut être utilisée pour l'antibioprophylaxie.",
    conditions: [{ kind: "allergy", allergen: "betalactams", present: true, label: "Pénicillines / bêtalactamines", penFast: "low" }],
    action: { type: "info", text: "Céfazoline utilisable pour l'antibioprophylaxie (allergie vraie peu probable, pas de réaction grave)." },
    source: { organisation: "AAAAI / ACAAI", title: "Drug allergy: a 2022 practice parameter update", year: 2022, doi: "10.1016/j.jaci.2022.08.028", pmid: "", quote: "", grade: "", level: "int" },
    question: "In a patient with a reported penicillin allergy at low risk (PEN-FAST < 3, no severe reaction), can cefazolin be given for surgical antibiotic prophylaxis according to current guidelines (European and international)?",
  }),
  base({
    id: "5f1c0a10-0001-4000-8000-000000000016",
    title: "HbA1c chez le diabétique avant chirurgie programmée",
    statement: "Chez le patient diabétique, disposer d'une HbA1c de moins de 3 mois avant une chirurgie programmée.",
    conditions: [{ kind: "history", condition: "diabetes_oral", present: true, label: "Diabète (sans insuline)" }],
    action: { type: "exam", exam: "HbA1c (si > 3 mois)", withinDays: 90 },
    source: { organisation: "CPOC / JBDS", title: "Guideline for perioperative care for people with diabetes mellitus undergoing elective and emergency surgery", year: 2021, doi: "", pmid: "", quote: "", grade: "", level: "int" },
    question: "Before elective surgery in a patient with diabetes, is a recent HbA1c recommended (how recent), and above which value should surgery be deferred for optimisation?",
  }),
];

/** Proposed rules, by origin — each group is imported on its own. */
export const PROPOSED_GROUPS: { id: string; title: string; description: string; rules: Proposed[] }[] = [
  {
    id: "guidelines",
    title: "Principales recommandations",
    description:
      "Antithrombotiques et ponction neuraxiale (ESAIC/ESRA 2022), SGLT2, ECG préopératoire (ESC 2022), anémie, allergie à la pénicilline, HbA1c. Citation à recopier depuis la source.",
    rules: GUIDELINE_RULES,
  },
  {
    id: "manual-2020",
    title: "Manuel pratique d'anesthésie (2020), chapitre 15",
    description:
      "Anticoagulants et antiplaquettaires (chirurgie, ponction, reprise, stents), IEC/sartans, antidiabétiques, bêta-bloquants, statines, corticoïdes, examens préopératoires, sténose aortique, prémédication, jeûne. Chaque règle porte la phrase exacte du livre et ce qu'elle protège (chirurgie ou anesthésie) ; le livre date de 2020 : à confronter aux recommandations actuelles.",
    rules: MANUAL_RULES,
  },
];

export const PROPOSED_RULES: Proposed[] = PROPOSED_GROUPS.flatMap((g) => g.rules);
