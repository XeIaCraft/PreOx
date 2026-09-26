// Rules checked against their source (September 2026): the exact sentence,
// its class / level of evidence and the PubMed identifiers are filled in.
// They are imported ACTIVE, and archive the drafts they replace (`SUPERSEDES`).
//
// Sources actually read:
// - ESC 2022 non-cardiac surgery guidelines, full text (recommendation tables
//   and figure 10) — the highest European level for the surgery itself.
// - ESAIC/ESRA 2022 regional anaesthesia and antithrombotics: abstract, and
//   the deep-block / neuraxial table as reproduced in Acta Clin Croat 2022
//   (the journal full text could not be opened from here — see `explanations`).
// - ESAIC 2022 paediatric fasting guideline (abstract), multisociety 2024
//   GLP-1 RA guidance (full text, PMC).

import type { Condition, Rule, RuleSource } from "./types";

type Verified = Omit<Rule, "created_at" | "updated_at">;

const VERIFIED_AT = "2026-09-25T00:00:00.000Z";
const REVIEW_AT = "2027-09-25";
const TOOL = "PreOx : PubMed, Consensus et texte de la recommandation";

const id = (n: number) => `5f1c0a10-0003-4000-8000-${String(n).padStart(12, "0")}`;
const guideline = (n: number) => `5f1c0a10-0001-4000-8000-${String(n).padStart(12, "0")}`;
const manual = (n: number) => `5f1c0a10-0002-4000-8000-${String(n).padStart(12, "0")}`;

const ESC_2022 = {
  organisation: "ESC (avec l'ESAIC)",
  title: "2022 ESC Guidelines on cardiovascular assessment and management of patients undergoing non-cardiac surgery (Halvorsen et al., Eur Heart J 2022;43:3826-3924)",
  year: 2022,
  doi: "10.1093/eurheartj/ehac270",
  pmid: "36017553",
  level: "eu",
} as const;

const ESAIC_ESRA_2022 = {
  organisation: "ESAIC / ESRA",
  title: "Regional anaesthesia in patients on antithrombotic drugs: Joint ESAIC/ESRA guidelines (Kietaibl et al., Eur J Anaesthesiol 2022;39:100-132)",
  year: 2022,
  doi: "10.1097/EJA.0000000000001600",
  pmid: "34980845",
  level: "eu",
} as const;

/** How the ESAIC/ESRA intervals were read — said on every rule that uses the table. */
const ESAIC_TABLE_NOTE =
  "Délai lu dans le tableau « Management of antithrombotic therapy in deep PNBs (adapted from ESAIC/ESRA) » reproduit par Acta Clin Croat 2022;61(Suppl 2) (DOI 10.20471/acc.2022.61.s2.08, PMID 36824631, texte intégral PMC9942461). Le texte intégral de l'EJA n'était pas accessible : à confronter au tableau original si votre service en a une copie.";
const ESAIC_DEEP = "Les blocs profonds (non compressibles) suivent les mêmes délais que la ponction neuraxiale ; les blocs superficiels, non.";
const ESAIC_GRADE = "GRADE C (consensus Delphi)";

const src = (base: typeof ESC_2022 | typeof ESAIC_ESRA_2022, quote: string, grade: string): RuleSource => ({ ...base, quote, grade });

const PUNCTURE: Condition = { kind: "technique", in: ["neuraxial", "deep_block"] };

const rule = (
  n: number,
  p: Pick<Verified, "title" | "statement" | "conditions" | "action" | "source"> & Partial<Pick<Verified, "divergences" | "explanations" | "question">>
): Verified => ({
  id: id(n),
  divergences: [],
  explanations: [],
  status: "active",
  version: 1,
  verified_at: VERIFIED_AT,
  review_at: REVIEW_AT,
  question: "",
  tool: TOOL,
  ...p,
});

// ---------------------------------------------------------------------------
// Antithrombotics and neuraxial puncture / deep block (ESAIC/ESRA 2022)
// ---------------------------------------------------------------------------

const ALR: Verified[] = [
  rule(1, {
    title: "Rivaroxaban à faible dose (≤ 10 mg/j) : ponction ou bloc profond",
    statement: "Rivaroxaban à faible dose : dernière prise au moins 24 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AF01", dailyDose: { op: "<=", mg: 10 } }, PUNCTURE],
    action: { type: "stop_before", hours: 24, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "DXA low — 24h rivaroxaban, 36h apixaban", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, ESAIC_DEEP],
  }),
  rule(2, {
    title: "Apixaban à faible dose (2,5 mg × 2, prophylaxie) : ponction ou bloc profond",
    statement: "Apixaban à dose prophylactique : dernière prise au moins 36 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AF02", dailyDose: { op: "<=", mg: 5 }, indications: ["other", "primary_prevention"] }, PUNCTURE],
    action: { type: "stop_before", hours: 36, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "DXA low — 24h rivaroxaban, 36h apixaban", ESAIC_GRADE),
    explanations: [
      ESAIC_TABLE_NOTE,
      "Apixaban 2,5 mg × 2 donné pour une fibrillation auriculaire (dose réduite) est une dose thérapeutique : c'est la règle « forte dose » (72 h) qui s'applique.",
    ],
  }),
  rule(3, {
    title: "Apixaban à dose thérapeutique (fibrillation, thrombose) : ponction ou bloc profond",
    statement: "Apixaban à dose thérapeutique, y compris 2,5 mg × 2 pour une fibrillation auriculaire : dernière prise au moins 72 h avant une ponction neuraxiale ou un bloc profond, ou taux spécifique < 30 ng/ml.",
    conditions: [{ kind: "drug", atc: "B01AF02", indications: ["af", "vte", "secondary_prevention_stroke"] }, PUNCTURE],
    action: { type: "stop_before", hours: 72, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "DXA high — 72h or until target lab value — DXA < 30 ng/mL (alternative: anti-Xa ≤ 0.1 IU/mL)", ESAIC_GRADE),
    explanations: [
      ESAIC_TABLE_NOTE,
      "Le dosage (anti-Xa calibré) est conseillé en cas d'insuffisance rénale ou quand l'heure de la dernière prise est incertaine.",
    ],
    question: "Indication du traitement : fibrillation auriculaire, thrombose, prévention secondaire ?",
  }),
  rule(4, {
    title: "Rivaroxaban > 10 mg/j : ponction ou bloc profond",
    statement: "Rivaroxaban 15 ou 20 mg/j (dose thérapeutique) : dernière prise au moins 72 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AF01", dailyDose: { op: ">", mg: 10 } }, PUNCTURE],
    action: { type: "stop_before", hours: 72, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "DXA high — 72h or until target lab value — DXA < 30 ng/mL (alternative: anti-Xa ≤ 0.1 IU/mL)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE],
  }),
  rule(5, {
    title: "Édoxaban : ponction ou bloc profond",
    statement: "Édoxaban (30 ou 60 mg/j, doses thérapeutiques) : dernière prise au moins 72 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AF03" }, PUNCTURE],
    action: { type: "stop_before", hours: 72, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "DXA high — 72h or until target lab value — DXA < 30 ng/mL (alternative: anti-Xa ≤ 0.1 IU/mL)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "L'édoxaban n'a pas de dose prophylactique en Europe : toute prise est traitée comme une forte dose."],
  }),
  rule(6, {
    title: "Dabigatran à forte dose : ponction ou bloc profond",
    statement: "Dabigatran à dose thérapeutique : dernière prise au moins 72 h avant une ponction neuraxiale ou un bloc profond, ou taux < 30 ng/ml (temps de thrombine normal).",
    conditions: [{ kind: "drug", atc: "B01AE07", indications: ["af", "vte", "secondary_prevention_stroke"] }, PUNCTURE],
    action: { type: "stop_before", hours: 72, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "Dabigatran high — 72h or until target lab value — DTI level < 30 ng/mL (alternative: thrombin time)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "Élimination rénale : en cas d'insuffisance rénale, le dosage est conseillé plutôt que le seul délai."],
    divergences: [{ summary: "ASRA et le manuel de 2020 allongent le délai selon la clairance (jusqu'à 120 h si 30–49 ml/min).", source: "ASRA 2025 ; Manuel pratique d'anesthésie 2020", level: "int" }],
  }),
  rule(7, {
    title: "Dabigatran à faible dose (prophylaxie) : ponction ou bloc profond",
    statement: "Dabigatran à dose prophylactique : dernière prise au moins 48 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AE07", indications: ["other", "primary_prevention"] }, PUNCTURE],
    action: { type: "stop_before", hours: 48, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "Dabigatran low — 48h", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE],
  }),
  rule(8, {
    title: "Énoxaparine prophylactique : ponction ou bloc profond",
    statement: "HBPM à dose prophylactique : dernière injection au moins 12 h avant une ponction neuraxiale ou un bloc profond (24 h si clairance < 30 ml/min).",
    conditions: [{ kind: "drug", atc: "B01AB05", dailyDose: { op: "<=", mg: 40 } }, PUNCTURE, { kind: "value", value: "crcl", op: ">=", threshold: 30 }],
    action: { type: "stop_before", hours: 12, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "LMWH low — 12h (24h if CrCl<30)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "Les autres HBPM (nadroparine, tinzaparine) suivent les mêmes délais ; leur dose s'exprime en UI, à ajouter comme règle séparée."],
  }),
  rule(9, {
    title: "Énoxaparine prophylactique et clairance < 30 ml/min",
    statement: "HBPM à dose prophylactique et clairance < 30 ml/min : dernière injection au moins 24 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AB05", dailyDose: { op: "<=", mg: 40 } }, PUNCTURE, { kind: "value", value: "crcl", op: "<", threshold: 30 }],
    action: { type: "stop_before", hours: 24, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "LMWH low — 12h (24h if CrCl<30)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE],
  }),
  rule(10, {
    title: "Énoxaparine curative : ponction ou bloc profond",
    statement: "HBPM à dose thérapeutique : dernière injection au moins 24 h avant une ponction neuraxiale ou un bloc profond (48 h si clairance < 30 ml/min), ou anti-Xa ≤ 0,1 UI/ml.",
    conditions: [{ kind: "drug", atc: "B01AB05", dailyDose: { op: ">", mg: 40 } }, PUNCTURE, { kind: "value", value: "crcl", op: ">=", threshold: 30 }],
    action: { type: "stop_before", hours: 24, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "LMWH high — 24h (48h if CrCl<30) or until target lab value — anti-Xa ≤ 0.1 IU/mL", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "Anti-Xa conseillé si clairance < 30 ml/min, patient âgé, fragile ou de très faible poids."],
  }),
  rule(11, {
    title: "Énoxaparine curative et clairance < 30 ml/min",
    statement: "HBPM à dose thérapeutique et clairance < 30 ml/min : dernière injection au moins 48 h avant une ponction neuraxiale ou un bloc profond, ou anti-Xa ≤ 0,1 UI/ml.",
    conditions: [{ kind: "drug", atc: "B01AB05", dailyDose: { op: ">", mg: 40 } }, PUNCTURE, { kind: "value", value: "crcl", op: "<", threshold: 30 }],
    action: { type: "stop_before", hours: 48, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "LMWH high — 24h (48h if CrCl<30) or until target lab value — anti-Xa ≤ 0.1 IU/mL", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE],
  }),
  rule(12, {
    title: "Héparine non fractionnée sous-cutanée prophylactique : ponction",
    statement: "HNF à faible dose : dernière injection au moins 4 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AB01" }, PUNCTURE],
    action: { type: "stop_before", hours: 4, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "UFH low — 4h", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "HNF à forte dose : attendre un TCA, un anti-Xa ou un ACT normal (environ 6 h en IV, 12 h en SC)."],
  }),
  rule(13, {
    title: "Fondaparinux prophylactique : ponction ou bloc profond",
    statement: "Fondaparinux 2,5 mg/j : dernière injection au moins 36 h avant une ponction neuraxiale ou un bloc profond (72 h si clairance < 50 ml/min).",
    conditions: [{ kind: "drug", atc: "B01AX05", dailyDose: { op: "<=", mg: 2.5 } }, PUNCTURE, { kind: "value", value: "crcl", op: ">=", threshold: 50 }],
    action: { type: "stop_before", hours: 36, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "Fondaparinux low — 36h (72h if CrCl<50)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "Fondaparinux à dose thérapeutique : attendre un anti-Xa calibré ≤ 0,1 UI/ml (environ 4 jours)."],
  }),
  rule(14, {
    title: "Fondaparinux prophylactique et clairance < 50 ml/min",
    statement: "Fondaparinux 2,5 mg/j et clairance < 50 ml/min : dernière injection au moins 72 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AX05", dailyDose: { op: "<=", mg: 2.5 } }, PUNCTURE, { kind: "value", value: "crcl", op: "<", threshold: 50 }],
    action: { type: "stop_before", hours: 72, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "Fondaparinux low — 36h (72h if CrCl<50)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE],
  }),
  rule(15, {
    title: "AVK : INR normal avant ponction ou bloc profond",
    statement: "Sous antivitamine K, la ponction neuraxiale ou le bloc profond demande un INR normal (warfarine arrêtée environ 5 jours).",
    conditions: [{ kind: "drug", atc: "B01AA" }, PUNCTURE],
    action: { type: "requirement", text: "INR normal le jour de la ponction.", blocking: true, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "VKA — Target lab. value (warfarin 5 days) — INR normal", ESAIC_GRADE),
    explanations: [
      ESAIC_TABLE_NOTE,
      "En urgence, la ponction reste possible après réversion complète par concentré de complexe prothrombinique (dose adaptée à l'INR) et vitamine K 10 mg, après évaluation individuelle.",
      "En Belgique, l'acénocoumarol (Sintrom) s'élimine plus vite et la phenprocoumone (Marcoumar) beaucoup plus lentement que la warfarine : c'est l'INR qui décide.",
    ],
    divergences: [{ summary: "ASRA : INR < 1,5 ; le manuel de 2020 : INR < 1,5 (ou < 1,2 selon les équipes).", source: "ASRA 2025 ; Manuel pratique d'anesthésie 2020", level: "int" }],
  }),
  rule(16, {
    title: "Aspirine à faible dose : pas d'arrêt pour la ponction",
    statement: "Aspirine à faible dose seule : aucun délai avant une ponction neuraxiale ou un bloc profond. Associée à un anticoagulant : délai de l'anticoagulant.",
    conditions: [{ kind: "drug", atc: "B01AC06", dailyDose: { op: "<=", mg: 160 } }, PUNCTURE],
    action: { type: "info", text: "Aspirine à faible dose : pas de délai pour la ponction (délai de l'autre antithrombotique s'il y en a un).", target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "Aspirin low — 0 ; Aspirin low + anticoagulant — Aspirin 0 + time interval of specific anticoagulant", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "Aspirine à forte dose (analgésique) : 3 jours, plaquettes normales."],
  }),
  rule(17, {
    title: "Ticagrélor : ponction ou bloc profond",
    statement: "Ticagrélor : dernière prise au moins 5 jours avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AC24" }, PUNCTURE],
    action: { type: "stop_before", hours: 120, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "P2Y12 inhibitor — 5 days ticagrelor, 5-7 days clopidogrel, 7 days prasugrel", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "Reprise : 24 h après la ponction ou le retrait du cathéter."],
  }),
  rule(18, {
    title: "Clopidogrel : ponction ou bloc profond",
    statement: "Clopidogrel : dernière prise 5 à 7 jours avant une ponction neuraxiale ou un bloc profond ; le délai peut descendre à 5 jours avec des plaquettes et un test de fonction plaquettaire normaux.",
    conditions: [{ kind: "drug", atc: "B01AC04" }, PUNCTURE],
    action: { type: "stop_before", hours: 168, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "P2Y12 inhibitor — 5 days ticagrelor, 5-7 days clopidogrel, 7 days prasugrel", ESAIC_GRADE),
    explanations: [
      ESAIC_TABLE_NOTE,
      "PreOx applique la borne haute (7 jours) ; « a normal platelet count and/or aggregation test may assist in decision making and shorten the time interval for clopidogrel towards 5 days ».",
      "Reprise : immédiatement à 75 mg ; 2 jours après en cas de dose de charge de 300 mg.",
    ],
  }),
  rule(19, {
    title: "Prasugrel : ponction ou bloc profond",
    statement: "Prasugrel : dernière prise au moins 7 jours avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AC22" }, PUNCTURE],
    action: { type: "stop_before", hours: 168, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "P2Y12 inhibitor — 5 days ticagrelor, 5-7 days clopidogrel, 7 days prasugrel", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE, "Reprise : 24 h après la ponction ou le retrait du cathéter."],
  }),
  rule(21, {
    title: "Apixaban > 5 mg/j : ponction ou bloc profond",
    statement: "Apixaban 5 mg × 2 (ou dose de charge) : dernière prise au moins 72 h avant une ponction neuraxiale ou un bloc profond.",
    conditions: [{ kind: "drug", atc: "B01AF02", dailyDose: { op: ">", mg: 5 } }, PUNCTURE],
    action: { type: "stop_before", hours: 72, target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "DXA high — 72h or until target lab value — DXA < 30 ng/mL (alternative: anti-Xa ≤ 0.1 IU/mL)", ESAIC_GRADE),
    explanations: [ESAIC_TABLE_NOTE],
  }),
  rule(20, {
    title: "Bloc superficiel sous antithrombotique",
    statement: "Pour un bloc périphérique superficiel et compressible, les délais d'arrêt ne s'appliquent pas, quelle que soit la dose.",
    conditions: [{ kind: "drug", atc: "B01" }, { kind: "technique", in: ["superficial_block"] }],
    action: { type: "info", text: "Bloc superficiel compressible : pas de délai d'arrêt ni de bilan ; dose suivante à l'heure habituelle.", target: "anaesthesia" },
    source: src(ESAIC_ESRA_2022, "In peripheral nerve blocks with low bleeding risk (superficial, compressible), these time intervals do not apply.", ESAIC_GRADE),
    explanations: ["Phrase du résumé de la recommandation (PubMed 34980845)."],
  }),
];

// ---------------------------------------------------------------------------
// Antithrombotics and the surgery itself (ESC 2022)
// ---------------------------------------------------------------------------

const P2Y12_QUOTE =
  "If interruption of P2Y12 inhibitor is indicated, it is recommended to withhold ticagrelor for 3–5 days, clopidogrel for 5 days, and prasugrel for 7 days prior to NCS.";
const NOAC_FIG10 = "Figure 10 : Pre-operative interruption of NOACs according to bleeding risk of the surgery and renal function (dernière prise).";
const NON_MINOR: Condition = { kind: "surgery", attribute: "bleedingRisk", in: ["low", "high"] };

const xaban = (n: number, bleeding: "low" | "high", crcl: [number, number | null], hours: number): Verified =>
  rule(n, {
    title: `Xabans : chirurgie à risque hémorragique ${bleeding === "low" ? "faible" : "élevé"}, clairance ${crcl[1] === null ? `≥ ${crcl[0]}` : `${crcl[0]}–${crcl[1] - 1}`} ml/min`,
    statement: `Apixaban, rivaroxaban ou édoxaban, chirurgie à risque hémorragique ${bleeding === "low" ? "faible" : "élevé"}, clairance ${crcl[1] === null ? `≥ ${crcl[0]}` : `de ${crcl[0]} à ${crcl[1] - 1}`} ml/min : dernière prise au moins ${hours} h avant.`,
    conditions: [
      { kind: "drug", atc: "B01AF" },
      { kind: "surgery", attribute: "bleedingRisk", in: [bleeding] },
      { kind: "value", value: "crcl", op: ">=", threshold: crcl[0] },
      ...(crcl[1] === null ? [] : [{ kind: "value" as const, value: "crcl" as const, op: "<" as const, threshold: crcl[1] }]),
    ],
    action: { type: "stop_before", hours, target: "surgery" },
    source: src(
      ESC_2022,
      "In non-minor bleeding risk procedures in patients using a NOAC, it is recommended to use an interruption regimen based on the NOAC compound, renal function, and bleeding risk. I B",
      "I B"
    ),
    explanations: [NOAC_FIG10, "Pas de relais par héparine (III B). Reprise 6–8 h après une hémostase complète pour un faible risque ; 48–72 h (thromboprophylaxie entre-temps) pour un risque élevé."],
  });

const dabigatran = (n: number, bleeding: "low" | "high", crcl: [number, number | null], hours: number): Verified =>
  rule(n, {
    title: `Dabigatran : chirurgie à risque hémorragique ${bleeding === "low" ? "faible" : "élevé"}, clairance ${crcl[1] === null ? `≥ ${crcl[0]}` : `${crcl[0]}–${crcl[1] - 1}`} ml/min`,
    statement: `Dabigatran, chirurgie à risque hémorragique ${bleeding === "low" ? "faible" : "élevé"}, clairance ${crcl[1] === null ? `≥ ${crcl[0]}` : `de ${crcl[0]} à ${crcl[1] - 1}`} ml/min : dernière prise au moins ${hours} h avant.`,
    conditions: [
      { kind: "drug", atc: "B01AE07" },
      { kind: "surgery", attribute: "bleedingRisk", in: [bleeding] },
      { kind: "value", value: "crcl", op: ">=", threshold: crcl[0] },
      ...(crcl[1] === null ? [] : [{ kind: "value" as const, value: "crcl" as const, op: "<" as const, threshold: crcl[1] }]),
    ],
    action: { type: "stop_before", hours, target: "surgery" },
    source: src(
      ESC_2022,
      "In non-minor bleeding risk procedures in patients using a NOAC, it is recommended to use an interruption regimen based on the NOAC compound, renal function, and bleeding risk. I B",
      "I B"
    ),
    explanations: [NOAC_FIG10, "Dabigatran et clairance < 30 ml/min : non indiqué (figure 10)."],
  });

const SURGERY: Verified[] = [
  xaban(30, "low", [30, null], 24),
  xaban(31, "low", [15, 30], 36),
  xaban(32, "high", [15, null], 48),
  dabigatran(33, "low", [80, null], 24),
  dabigatran(34, "low", [50, 80], 36),
  dabigatran(35, "low", [30, 50], 48),
  dabigatran(36, "high", [80, null], 48),
  dabigatran(37, "high", [50, 80], 72),
  dabigatran(38, "high", [30, 50], 96),
  rule(39, {
    title: "Anticoagulant oral : chirurgie à risque hémorragique minime",
    statement: "Chirurgie à risque hémorragique minime (saignement facilement contrôlé) : pas d'interruption de l'anticoagulant oral ; sous AOD, opérer à la vallée (12–24 h après la dernière prise).",
    conditions: [{ kind: "drug", atc: "B01A" }, { kind: "surgery", attribute: "bleedingRisk", in: ["minimal"] }],
    action: { type: "info", text: "Ne pas interrompre l'anticoagulant oral ; sous AOD, programmer le geste 12–24 h après la dernière prise.", target: "surgery" },
    source: src(
      ESC_2022,
      "In minor bleeding risk surgery and other procedures where bleeding can easily be controlled, it is recommended to perform surgery without interruption of OAC therapy. I B […] In patients using NOACs, it is recommended that minor bleeding risk procedures are performed at trough levels (typically 12–24 h after last intake). I C",
      "I B ; I C"
    ),
  }),
  rule(40, {
    title: "Pas de relais héparine si risque thrombotique faible ou modéré",
    statement: "Le relais de l'anticoagulant oral par une héparine n'est pas recommandé chez le patient à risque thrombotique faible ou modéré.",
    conditions: [{ kind: "drug", atc: "B01A" }, NON_MINOR],
    action: { type: "info", text: "Pas de relais par héparine sauf risque thrombotique élevé (valve mécanique, AVC < 3 mois, CHA₂DS₂-VASc élevé…).", target: "surgery" },
    source: src(ESC_2022, "Bridging of OAC therapy is not recommended in patients with low/moderate thrombotic risk undergoing NCS. III B", "III B"),
    explanations: ["Valve mécanique à haut risque : relais par HBPM (alternative à l'HNF), recommandation I B."],
  }),
  rule(41, {
    title: "AOD : chirurgie urgente",
    statement: "Chirurgie urgente sous AOD : interrompre l'AOD immédiatement.",
    conditions: [{ kind: "drug", atc: "B01AF" }, { kind: "surgery", attribute: "urgency", in: ["urgent"] }],
    action: { type: "info", text: "Arrêt immédiat de l'AOD ; dosage spécifique et antidote selon l'urgence et le saignement.", target: "surgery" },
    source: src(ESC_2022, "When an urgent surgical intervention is required, it is recommended that NOAC therapy is immediately interrupted. I C", "I C"),
  }),
  rule(42, {
    title: "Ticagrélor : chirurgie",
    statement: "Si l'arrêt est indiqué, ticagrélor arrêté 3 à 5 jours avant la chirurgie.",
    conditions: [{ kind: "drug", atc: "B01AC24" }, NON_MINOR],
    action: { type: "stop_before", hours: 120, target: "surgery" },
    source: src(ESC_2022, `${P2Y12_QUOTE} I B`, "I B"),
    explanations: ["PreOx applique la borne haute (5 jours).", "Stent récent : décision partagée chirurgien, anesthésiste et cardiologue (I C) ; reprise dans les 48 h (I C)."],
  }),
  rule(43, {
    title: "Clopidogrel : chirurgie",
    statement: "Si l'arrêt est indiqué, clopidogrel arrêté 5 jours avant la chirurgie.",
    conditions: [{ kind: "drug", atc: "B01AC04" }, NON_MINOR],
    action: { type: "stop_before", hours: 120, target: "surgery" },
    source: src(ESC_2022, `${P2Y12_QUOTE} I B`, "I B"),
    explanations: ["Stent récent : décision partagée chirurgien, anesthésiste et cardiologue (I C) ; reprise dans les 48 h (I C)."],
  }),
  rule(44, {
    title: "Prasugrel : chirurgie",
    statement: "Si l'arrêt est indiqué, prasugrel arrêté 7 jours avant la chirurgie.",
    conditions: [{ kind: "drug", atc: "B01AC22" }, NON_MINOR],
    action: { type: "stop_before", hours: 168, target: "surgery" },
    source: src(ESC_2022, `${P2Y12_QUOTE} I B`, "I B"),
    explanations: ["Stent récent : décision partagée chirurgien, anesthésiste et cardiologue (I C) ; reprise dans les 48 h (I C)."],
  }),
  rule(45, {
    title: "Aspirine et chirurgie à très haut risque hémorragique (intracrânienne, rachis, rétine)",
    statement: "Chirurgie à haut risque hémorragique (intracrânienne, neurochirurgie rachidienne, vitréo-rétinienne) : aspirine arrêtée au moins 7 jours avant.",
    conditions: [{ kind: "drug", atc: "B01AC06" }, { kind: "surgery", attribute: "closedSpace", in: ["yes"] }],
    action: { type: "stop_before", hours: 168, target: "surgery" },
    source: src(ESC_2022, "For patients undergoing high bleeding risk surgery (e.g. intracranial, spinal neurosurgery, or vitroretinal eye surgery), it is recommended to interrupt aspirin for at least 7 days pre-operatively. I C", "I C"),
  }),
  rule(46, {
    title: "Aspirine après angioplastie coronaire : poursuivre",
    statement: "Après une angioplastie coronaire, l'aspirine est poursuivie pendant la période opératoire si le risque hémorragique le permet.",
    conditions: [{ kind: "drug", atc: "B01AC06", indications: ["coronary_stent", "secondary_prevention_coronary"] }],
    action: { type: "info", text: "Poursuivre l'aspirine si le risque hémorragique le permet.", target: "surgery" },
    source: src(ESC_2022, "In patients with a previous PCI, it is recommended to continue aspirin peri-operatively if the bleeding risk allows. I B", "I B"),
  }),
  rule(47, {
    title: "Stent coronaire récent : reporter la chirurgie programmée",
    statement: "Chirurgie programmée reportée à 6 mois après une angioplastie programmée et à 12 mois après un syndrome coronarien aigu.",
    conditions: [
      { kind: "drug", atc: "B01AC", indications: ["coronary_stent"], monthsSinceEvent: { op: "<", months: 6 } },
      { kind: "surgery", attribute: "urgency", in: ["elective"] },
    ],
    action: { type: "requirement", text: "Reporter la chirurgie programmée (6 mois après angioplastie programmée, 12 mois après SCA) ; sinon au moins 1 mois de double antiagrégation.", blocking: true, target: "surgery" },
    source: src(ESC_2022, "It is recommended to delay elective NCS until 6 months after elective PCI and 12 months after an ACS. I A", "I A"),
    explanations: ["Chirurgie qui ne peut pas attendre : au moins 1 mois de double antiagrégation (I B), décision en équipe (I C)."],
  }),
];

// ---------------------------------------------------------------------------
// Other treatments and the pre-operative work-up (ESC 2022, ESAIC, multisociety)
// ---------------------------------------------------------------------------

const TREATMENTS: Verified[] = [
  rule(60, {
    title: "Bêta-bloquants : poursuivre",
    statement: "Un bêta-bloquant en cours est poursuivi pendant la période opératoire ; il n'est pas instauré de routine.",
    conditions: [{ kind: "drug", atc: "C07" }],
    action: { type: "info", text: "Poursuivre le bêta-bloquant, y compris le matin de l'intervention.", target: "both" },
    source: src(ESC_2022, "Peri-operative continuation of beta-blockers is recommended in patients currently receiving this medication. I B ; Routine initiation of beta-blocker peri-operatively is not recommended. III A", "I B ; III A"),
  }),
  rule(61, {
    title: "Statines : poursuivre",
    statement: "Une statine en cours est poursuivie pendant la période opératoire.",
    conditions: [{ kind: "drug", atc: "C10AA" }],
    action: { type: "info", text: "Poursuivre la statine.", target: "both" },
    source: src(ESC_2022, "In patients already on statins, it is recommended to continue statins during the peri-operative period. I B", "I B"),
  }),
  rule(62, {
    title: "IEC et sartans sans insuffisance cardiaque : suspendre le jour de l'intervention",
    statement: "Sans insuffisance cardiaque, suspendre l'IEC ou le sartan le jour de l'intervention pour prévenir l'hypotension ; le reprendre dès que possible.",
    conditions: [{ kind: "drug", atc: "C09" }, { kind: "history", condition: "heart_failure", present: false, label: "Insuffisance cardiaque" }],
    action: { type: "stop_before", hours: 24, target: "anaesthesia" },
    source: src(ESC_2022, "In patients without HF, withholding RAAS inhibitors on the day of NCS should be considered to prevent peri-operative hypotension. IIa", "IIa B"),
    explanations: ["« If an ACEI/ARB is withheld prior to NCS, it should be restarted as soon as possible in order to prevent unintended long-term omission. »"],
  }),
  rule(63, {
    title: "IEC et sartans avec insuffisance cardiaque stable : poursuite possible",
    statement: "Insuffisance cardiaque stable : la poursuite de l'IEC ou du sartan peut être envisagée.",
    conditions: [{ kind: "drug", atc: "C09" }, { kind: "history", condition: "heart_failure", present: true, label: "Insuffisance cardiaque" }],
    action: { type: "info", text: "Insuffisance cardiaque stable : poursuite envisageable (recommandation faible).", target: "anaesthesia" },
    source: src(ESC_2022, "In patients with stable HF, peri-operative continuation of RAAS inhibitors may be considered.", "IIb C"),
  }),
  rule(64, {
    title: "Inhibiteurs du SGLT2 : arrêt 3 jours avant",
    statement: "Interrompre l'inhibiteur du SGLT2 au moins 3 jours avant une chirurgie à risque intermédiaire ou élevé (acidocétose euglycémique).",
    conditions: [{ kind: "drug", atc: "A10BK" }, { kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "stop_before", hours: 72, target: "anaesthesia" },
    source: src(ESC_2022, "It should be considered to interrupt SGLT-2 inhibitor therapy for at least 3 days before intermediate- and high-risk NCS.", "IIa C"),
    explanations: ["La FDA conseille 3 à 4 jours (4 pour l'ertugliflozine) ; doser les cétones devant tout symptôme évocateur."],
  }),
  rule(65, {
    title: "Diurétique pour hypertension : suspendre le jour de l'intervention",
    statement: "Diurétique prescrit pour une hypertension (sans insuffisance cardiaque) : suspension transitoire le jour de l'intervention.",
    conditions: [
      { kind: "drug", atc: "C03" },
      { kind: "history", condition: "hypertension", present: true, label: "Hypertension" },
      { kind: "history", condition: "heart_failure", present: false, label: "Insuffisance cardiaque" },
    ],
    action: { type: "stop_before", hours: 24, target: "anaesthesia" },
    source: src(ESC_2022, "For patients on diuretics to treat hypertension, transient discontinuation of diuretics on the day of NCS should be considered.", "IIa B"),
    explanations: ["Corriger une hypokaliémie ou une hypomagnésémie à temps ; une anomalie mineure asymptomatique ne retarde pas une chirurgie urgente."],
  }),
  rule(66, {
    title: "Agonistes du GLP-1 : décision partagée et prévention de l'inhalation",
    statement: "Sous agoniste du GLP-1, la poursuite se décide avec le patient et les équipes ; le risque d'inhalation (vidange gastrique retardée) se réduit par une adaptation du régime avant l'intervention ou une induction en séquence rapide.",
    conditions: [{ kind: "drug", atc: "A10BJ" }],
    action: { type: "info", text: "Pas d'arrêt systématique : régime adapté (liquides la veille) ou induction en séquence rapide ; échographie gastrique si doute.", target: "anaesthesia" },
    source: {
      organisation: "ASMBS, ASA, AGA, ISPOR, SAGES (guide multisociétés)",
      title: "Multi-society clinical practice guidance for the safe use of glucagon-like peptide-1 receptor agonists in the perioperative period (Kindel et al., Surg Endosc 2025;39:180-183)",
      year: 2024,
      doi: "10.1007/s00464-024-11263-2",
      pmid: "39370500",
      quote:
        "The safe use of GLP-1RAs in the perioperative period should include efforts to minimize the aspiration risk of delayed gastric emptying. This can be achieved by preoperative diet modification and/or altering anesthesia plan to consider rapid sequence induction of general anesthesia for tracheal intubation.",
      grade: "Guidance (consensus)",
      level: "int",
    },
    explanations: ["Document d'orientation fondé sur la pharmacologie et l'expérience clinique, pas une recommandation fondée sur les preuves (texte intégral PMC11666732)."],
    divergences: [{ summary: "ASA 2023 : arrêt une semaine avant (forme hebdomadaire) ou le jour même (forme quotidienne) ; remplacée par ce guide multisociétés.", source: "ASA 2023", level: "int" }],
  }),
  rule(67, {
    title: "ECG avant chirurgie à risque intermédiaire ou élevé à partir de 65 ans",
    statement: "ECG 12 dérivations avant une chirurgie à risque intermédiaire ou élevé chez le patient avec une cardiopathie, des facteurs de risque cardiovasculaire ou un âge ≥ 65 ans.",
    conditions: [{ kind: "value", value: "age", op: ">=", threshold: 65 }, { kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "exam", exam: "ECG 12 dérivations", target: "both" },
    source: src(
      ESC_2022,
      "In patients who have known CVD or CV risk factors (including age ≥65 years), or symptoms or signs suggestive of CVD it is recommended to obtain a pre-operative 12-lead ECG before intermediate- and high-risk NCS. I C",
      "I C"
    ),
    explanations: ["Patient à faible risque et chirurgie à risque faible ou intermédiaire : pas d'ECG, de troponine ni de BNP de routine (III B)."],
  }),
  rule(68, {
    title: "ECG avant chirurgie à risque intermédiaire ou élevé en cas de coronaropathie",
    statement: "ECG 12 dérivations avant une chirurgie à risque intermédiaire ou élevé chez le patient coronarien.",
    conditions: [{ kind: "history", condition: "coronary", present: true, label: "Coronaropathie" }, { kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "exam", exam: "ECG 12 dérivations", target: "both" },
    source: src(
      ESC_2022,
      "In patients who have known CVD or CV risk factors (including age ≥65 years), or symptoms or signs suggestive of CVD it is recommended to obtain a pre-operative 12-lead ECG before intermediate- and high-risk NCS. I C",
      "I C"
    ),
  }),
  rule(69, {
    title: "Hémoglobine avant chirurgie à risque intermédiaire ou élevé",
    statement: "Doser l'hémoglobine avant une chirurgie à risque intermédiaire ou élevé ; traiter une anémie à l'avance.",
    conditions: [{ kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "exam", exam: "Hémoglobine", target: "surgery" },
    source: src(ESC_2022, "It is recommended to measure haemoglobin pre-operatively in patients scheduled for intermediate- to high-risk NCS. I B", "I B"),
    explanations: ["« It is recommended to treat anaemia in advance of NCS in order to reduce the need for RBC transfusion during NCS. I A »"],
  }),
  rule(70, {
    title: "Créatinine avant chirurgie à risque intermédiaire ou élevé à partir de 65 ans",
    statement: "Avec un facteur de risque (âge ≥ 65 ans, IMC ≥ 30, diabète, hypertension, maladie cardiovasculaire, tabac), mesurer créatinine et DFG avant une chirurgie à risque intermédiaire ou élevé.",
    conditions: [{ kind: "value", value: "age", op: ">=", threshold: 65 }, { kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "exam", exam: "Créatinine et DFG", target: "both" },
    source: src(
      ESC_2022,
      "In patients with known risk factors (age >65 years, BMI >30 kg/m2, diabetes, hypertension, hyperlipidaemia, CV disease, or smoking) undergoing intermediate- or high-risk NCS, it is recommended to screen for pre-operative renal disease by measuring serum creatinine and GFR.",
      "I C"
    ),
  }),
  rule(71, {
    title: "HbA1c de moins de 3 mois chez le diabétique",
    statement: "Chez le diabétique, HbA1c si elle n'a pas été mesurée dans les 3 derniers mois.",
    conditions: [{ kind: "history", condition: "diabetes_oral", present: true, label: "Diabète (sans insuline)" }],
    action: { type: "exam", exam: "HbA1c (si > 3 mois)", withinDays: 90, target: "surgery" },
    source: src(
      ESC_2022,
      "In patients with diabetes or disturbed glucose metabolism, a pre-operative HbA1c is recommended, if this measurement has been not performed in the previous 3 months. In case of HbA1c ≥8.5% (≥69 mmol/mol), elective NCS should be postponed, if safe and practical. I B",
      "I B"
    ),
  }),
  rule(72, {
    title: "HbA1c de moins de 3 mois chez le diabétique insulinotraité",
    statement: "Chez le diabétique, HbA1c si elle n'a pas été mesurée dans les 3 derniers mois.",
    conditions: [{ kind: "history", condition: "diabetes_insulin", present: true, label: "Diabète insulinotraité" }],
    action: { type: "exam", exam: "HbA1c (si > 3 mois)", withinDays: 90, target: "surgery" },
    source: src(
      ESC_2022,
      "In patients with diabetes or disturbed glucose metabolism, a pre-operative HbA1c is recommended, if this measurement has been not performed in the previous 3 months. In case of HbA1c ≥8.5% (≥69 mmol/mol), elective NCS should be postponed, if safe and practical. I B",
      "I B"
    ),
  }),
  rule(73, {
    title: "HbA1c ≥ 8,5 % : reporter la chirurgie programmée",
    statement: "HbA1c ≥ 8,5 % (69 mmol/mol) : reporter la chirurgie programmée si c'est sûr et faisable.",
    conditions: [{ kind: "value", value: "hba1c", op: ">=", threshold: 8.5 }, { kind: "surgery", attribute: "urgency", in: ["elective"] }],
    action: { type: "requirement", text: "Reporter la chirurgie programmée pour équilibrer le diabète, si c'est sûr et faisable.", blocking: false, target: "surgery" },
    source: src(
      ESC_2022,
      "In case of HbA1c ≥8.5% (≥69 mmol/mol), elective NCS should be postponed, if safe and practical. I B",
      "I B"
    ),
  }),
  rule(75, {
    title: "Jeûne de l'enfant : liquides clairs jusqu'à 1 h",
    statement: "Chez l'enfant, liquides clairs autorisés jusqu'à 1 h avant l'induction, lait maternel jusqu'à 3 h ; réalimentation précoce après l'intervention.",
    conditions: [{ kind: "value", value: "age", op: "<", threshold: 16 }],
    action: { type: "info", text: "Liquides clairs jusqu'à 1 h avant, lait maternel jusqu'à 3 h, lait artificiel et repas léger jusqu'à 4 h (à vérifier dans le protocole du service).", target: "anaesthesia" },
    source: {
      organisation: "ESAIC",
      title: "Pre-operative fasting in children: A guideline from the European Society of Anaesthesiology and Intensive Care (Frykholm et al., Eur J Anaesthesiol 2022;39:4-25)",
      year: 2022,
      doi: "10.1097/EJA.0000000000001599",
      pmid: "34857683",
      quote: "Recommendations for reducing clear fluid fasting to 1 h, reducing breast milk fasting to 3 h, and allowing early postoperative feeding were the main results, with GRADE 1C or 1B evidence.",
      grade: "1B / 1C",
      level: "eu",
    },
    explanations: ["Phrase du résumé (PubMed). Le délai de 4 h pour le lait artificiel et le repas léger vient du corps du texte, non relu ici : à confirmer."],
  }),
];

export const VERIFIED_RULES: Verified[] = [...ALR, ...SURGERY, ...TREATMENTS];

/**
 * The drafts each verified rule replaces: archived when the verified group is
 * imported, so that the library holds one live answer per question. Only
 * drafts are touched — a rule you activated yourself stays as it is.
 */
export const SUPERSEDES: Record<string, string[]> = {
  [id(1)]: [manual(11)],
  [id(2)]: [manual(15)],
  [id(3)]: [manual(15)],
  [id(21)]: [manual(15)],
  [id(4)]: [guideline(5), manual(7)],
  [id(5)]: [guideline(5), manual(19)],
  [id(6)]: [guideline(6), guideline(7), guideline(8), manual(3)],
  [id(8)]: [guideline(9), manual(25)],
  [id(9)]: [manual(26)],
  [id(10)]: [guideline(10), manual(27)],
  [id(11)]: [manual(28)],
  [id(12)]: [manual(29)],
  [id(13)]: [manual(23)],
  [id(15)]: [guideline(11), manual(33)],
  [id(16)]: [guideline(1), manual(49)],
  [id(17)]: [guideline(4), manual(68)],
  [id(18)]: [guideline(2), manual(58)],
  [id(19)]: [guideline(3), manual(63)],
  [id(20)]: [manual(50)],
  [id(30)]: [manual(5), manual(9), manual(13), manual(17)],
  [id(32)]: [manual(6), manual(10), manual(14), manual(18)],
  [id(33)]: [manual(1)],
  [id(36)]: [manual(2)],
  [id(39)]: [manual(35), manual(36)],
  [id(42)]: [manual(65), manual(66)],
  [id(43)]: [manual(55), manual(56)],
  [id(44)]: [manual(60), manual(61)],
  [id(45)]: [manual(48)],
  [id(46)]: [manual(46)],
  [id(47)]: [manual(53)],
  [id(60)]: [manual(77)],
  [id(61)]: [manual(78)],
  [id(62)]: [manual(71)],
  [id(63)]: [manual(72)],
  [id(64)]: [guideline(12)],
  [id(67)]: [manual(80)],
  [id(68)]: [guideline(13)],
  [id(71)]: [guideline(16)],
};
