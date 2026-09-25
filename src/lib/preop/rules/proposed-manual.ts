// Rules drawn from a reference textbook chapter supplied by the user:
// Chassot, Courbon, Albrecht — « Évaluation préopératoire et prémédication »,
// Manuel pratique d'anesthésie, 4e édition (Elsevier Masson, 2020), chapter 15
// (its antiplatelet and anticoagulant tables are adapted from Chassot &
// Pierrel, Précis d'anesthésie cardiaque 2019).
//
// Each rule carries the exact sentence of the book, what it protects (the
// surgery, the anaesthesia, or both) and the question to check it against
// the current guidelines — the book dates from 2020. They are imported as
// DRAFTS: none applies before it is opened, checked and activated. Where
// PreOx already proposes a more recent guideline on the same point
// (ESAIC/ESRA 2022), that one wins and the book shows as another opinion.

import type { Condition, Indication, Rule, RuleAction, RuleSource, Technique } from "./types";

type Proposed = Omit<Rule, "created_at" | "updated_at">;

const MANUAL: Omit<RuleSource, "quote"> = {
  organisation: "Chassot PG, Courbon C, Albrecht E — Manuel pratique d'anesthésie",
  title: "Chapitre 15, Évaluation préopératoire et prémédication, 4e édition (Elsevier Masson)",
  year: 2020,
  doi: "",
  pmid: "",
  grade: "",
  level: "book",
};

const RECHECK = "Ouvrage de 2020 : à confronter aux recommandations actuelles (ESAIC, ESC 2022, ESRA 2022, CBIP) avant activation.";

let n = 0;
/** Stable ids: the n-th rule of this file (never reorder existing entries — append). */
const nextId = () => `5f1c0a10-0002-4000-8000-${String(++n).padStart(12, "0")}`;

function m(p: { title: string; statement: string; conditions: Condition[]; action: RuleAction; quote: string; question: string; explanations?: string[]; chapterTitle?: string }): Proposed {
  return {
    id: nextId(),
    title: p.title,
    statement: p.statement,
    conditions: p.conditions,
    action: p.action,
    source: { ...MANUAL, ...(p.chapterTitle ? { title: p.chapterTitle } : {}), quote: p.quote },
    divergences: [],
    explanations: [...(p.explanations ?? []), RECHECK],
    status: "draft",
    version: 1,
    verified_at: null,
    review_at: null,
    question: p.question,
    tool: "PreOx (Manuel pratique d'anesthésie 2020, à vérifier)",
  };
}

const drug = (atc: string, extra: Omit<Extract<Condition, { kind: "drug" }>, "kind" | "atc"> = {}): Condition => ({ kind: "drug", atc, ...extra });
const bleeding = (...levels: ("minimal" | "low" | "high")[]): Condition => ({ kind: "surgery", attribute: "bleedingRisk", in: levels });
const closedSpace: Condition = { kind: "surgery", attribute: "closedSpace", in: ["yes"] };
const neuraxial: Condition = { kind: "technique", in: ["neuraxial", "deep_block"] as Technique[] };
const crclBelow = (v: number): Condition => ({ kind: "value", value: "crcl", op: "<", threshold: v });
const history = (condition: string, label: string, present = true): Condition => ({ kind: "history", condition, label, present });
const SECONDARY: Indication[] = ["secondary_prevention_coronary", "secondary_prevention_stroke", "coronary_stent", "peripheral_arterial_disease"];

const Q_ANTICOAG = (drugName: string) =>
  `According to current European guidelines (ESAIC/ESRA 2022, EHRA 2021, ESC 2022), how long before surgery should ${drugName} be stopped depending on the bleeding risk of the procedure and on renal function, how long before a neuraxial puncture or deep block, and when can it be resumed?`;
const Q_ANTIPLATELET = (drugName: string) =>
  `According to current European guidelines (ESC 2022 non-cardiac surgery, ESC 2023 ACS, ESAIC), when should ${drugName} be continued or stopped before non-cardiac surgery (by indication, time since stent or acute coronary syndrome, and bleeding risk), how many days before, and when should it be resumed?`;

// ---------------------------------------------------------------------------
// Anticoagulants — tableau 15.8 (Chassot & Pierrel 2019), text p. 255–256
// ---------------------------------------------------------------------------

const TABLE_15_8 =
  "Tableau 15.8 « Délais proposés pour l'interruption préopératoire des anticoagulants » — colonnes : chirurgie générale ; situations à risque (chirurgie à haut risque hémorragique, combinaison médicamenteuse augmentant le risque hémorragique, ALR rachidienne) ; clairance de la créatinine < 50 ml/min.";

/** One anticoagulant row of table 15.8: general surgery, high bleeding risk, neuraxial/deep block, renal failure. */
function anticoagulantRow(p: {
  name: string;
  atc: string;
  dose?: Extract<Condition, { kind: "drug" }>["dailyDose"];
  doseLabel?: string;
  row: string;
  general: number;
  risk: number;
  renal: number;
  renalNote?: string;
}): Proposed[] {
  const d = drug(p.atc, p.dose ? { dailyDose: p.dose } : {});
  const who = `${p.name}${p.doseLabel ? ` ${p.doseLabel}` : ""}`;
  const quote = `${p.row} (${TABLE_15_8})`;
  const q = Q_ANTICOAG(`${p.name}${p.doseLabel ? ` (${p.doseLabel})` : ""}`);
  const h = (x: number) => (x >= 48 && x % 24 === 0 ? `${x / 24} jours` : `${x} h`);
  const out = [
    m({
      title: `${who} : chirurgie à risque hémorragique faible`,
      statement: `${who} : dernière prise ${h(p.general)} avant une chirurgie à risque hémorragique faible (fonction rénale normale).`,
      conditions: [d, bleeding("low")],
      action: { type: "stop_before", hours: p.general, target: "surgery" },
      quote,
      question: q,
    }),
    m({
      title: `${who} : chirurgie à risque hémorragique élevé`,
      statement: `${who} : dernière prise ${h(p.risk)} avant une chirurgie à haut risque hémorragique (pertes sanguines massives, hémostase difficile, espace clos).`,
      conditions: [d, bleeding("high")],
      action: { type: "stop_before", hours: p.risk, target: "surgery" },
      quote,
      question: q,
    }),
    m({
      title: `${who} : ponction neuraxiale ou bloc profond`,
      statement: `${who} : attendre 5 demi-vies, soit ${h(p.risk)}, avant une ponction neuraxiale ou un bloc profond ; délai identique pour le retrait d'un cathéter péridural.`,
      conditions: [d, neuraxial],
      action: { type: "stop_before", hours: p.risk, target: "anaesthesia" },
      quote: `${p.row}. « ALR rachidienne et blocs profonds : par sécurité, attendre 5 demi-vies ; délais identiques pour la pose ou le retrait du cathéter péridural ; reprise du traitement anticoagulant > 6 heures après sa manipulation. »`,
      question: q,
    }),
  ];
  if (p.renal > p.risk)
    out.push(
      m({
        title: `${who} : clairance < 50 mL/min`,
        statement: `${who}, clairance de la créatinine < 50 mL/min : dernière prise ${h(p.renal)} avant l'intervention (délais doublés pour les substances éliminées par le rein).`,
        conditions: [d, crclBelow(50)],
        action: { type: "stop_before", hours: p.renal, target: "both" },
        quote: `${p.row}. « En cas d'insuffisance rénale, ils sont doublés pour les substances éliminées par les reins. »`,
        question: q,
        explanations: p.renalNote ? [p.renalNote] : [],
      })
    );
  return out;
}

const NOAC_RENAL = "Le tableau donne une fourchette ; PreOx retient la borne haute. Note du tableau : 72 h en chirurgie à bas risque hémorragique, 92–120 h à haut risque ou si la clairance est de 15–30 mL/min.";

const ANTICOAGULANTS: Proposed[] = [
  ...anticoagulantRow({ name: "Dabigatran", atc: "B01AE07", row: "Dabigatran (Pradaxa®) : chirurgie générale 48 h ; situations à risque 72 h ; clairance < 50 ml/min 3–5 jours", general: 48, risk: 72, renal: 120, renalNote: NOAC_RENAL }),
  ...anticoagulantRow({
    name: "Rivaroxaban",
    atc: "B01AF01",
    dose: { op: ">=", mg: 15 },
    doseLabel: "15–20 mg/j",
    row: "Rivaroxaban (Xarelto®) 15–20 mg/j : chirurgie générale 48 h ; situations à risque 72 h ; clairance < 50 ml/min 3–4 jours",
    general: 48,
    risk: 72,
    renal: 96,
    renalNote: NOAC_RENAL,
  }),
  ...anticoagulantRow({
    name: "Rivaroxaban",
    atc: "B01AF01",
    dose: { op: "<=", mg: 10 },
    doseLabel: "≤ 10 mg/j",
    row: "Rivaroxaban (Xarelto®) 10 mg/j : chirurgie générale 24 h ; situations à risque 48 h ; clairance < 50 ml/min 2–3 jours (2 × 2,5 mg/j : 24 h ; 24 h ; 48 h)",
    general: 24,
    risk: 48,
    renal: 72,
    renalNote: "À 2 × 2,5 mg/j, le tableau indique 24 h dans toutes les situations et 48 h si clairance < 50 mL/min : règle à scinder si vous suivez ce détail.",
  }),
  ...anticoagulantRow({ name: "Apixaban", atc: "B01AF02", row: "Apixaban (Eliquis®) : chirurgie générale 48 h ; situations à risque 72 h ; clairance < 50 ml/min 3–4 jours", general: 48, risk: 72, renal: 96, renalNote: NOAC_RENAL }),
  ...anticoagulantRow({ name: "Édoxaban", atc: "B01AF03", row: "Edoxaban (Lixiana®, Savaysa®) : chirurgie générale 48 h ; situations à risque 72 h ; clairance < 50 ml/min 3–5 jours", general: 48, risk: 72, renal: 120, renalNote: NOAC_RENAL }),
  ...anticoagulantRow({ name: "Fondaparinux", atc: "B01AX05", row: "Fondaparinux (Arixtra®) : chirurgie générale 48 h ; situations à risque ≥ 72 h ; clairance < 50 ml/min 4–6 jours", general: 48, risk: 72, renal: 144, renalNote: "Fourchette de 4–6 jours : PreOx retient la borne haute." }),
  m({
    title: "Énoxaparine prophylactique (≤ 40 mg/j)",
    statement: "HBPM à dose prophylactique : dernière injection 12 h avant l'intervention, 24 h si clairance < 50 mL/min.",
    conditions: [drug("B01AB05", { dailyDose: { op: "<=", mg: 40 } })],
    action: { type: "stop_before", hours: 12, target: "both" },
    quote: `HBPM prophylactique scut : chirurgie générale 12 h ; situations à risque 12 h ; clairance < 50 ml/min 24 h (${TABLE_15_8})`,
    question: Q_ANTICOAG("prophylactic-dose low-molecular-weight heparin (enoxaparin 40 mg daily)"),
    explanations: ["Le tableau vise toutes les HBPM ; la règle est écrite pour l'énoxaparine, dont la dose s'exprime en mg (les autres HBPM se dosent en UI)."],
  }),
  m({
    title: "Énoxaparine prophylactique et clairance < 50 mL/min",
    statement: "HBPM à dose prophylactique, clairance < 50 mL/min : dernière injection 24 h avant l'intervention.",
    conditions: [drug("B01AB05", { dailyDose: { op: "<=", mg: 40 } }), crclBelow(50)],
    action: { type: "stop_before", hours: 24, target: "both" },
    quote: `HBPM prophylactique scut : clairance < 50 ml/min 24 h (${TABLE_15_8})`,
    question: Q_ANTICOAG("prophylactic-dose low-molecular-weight heparin in renal impairment"),
  }),
  m({
    title: "Énoxaparine thérapeutique (> 40 mg/j)",
    statement: "HBPM à dose thérapeutique : dernière injection 24 h avant l'intervention, 48 h si clairance < 50 mL/min.",
    conditions: [drug("B01AB05", { dailyDose: { op: ">", mg: 40 } })],
    action: { type: "stop_before", hours: 24, target: "both" },
    quote: `HBPM thérapeutique scut : chirurgie générale 24 h ; situations à risque 24 h ; clairance < 50 ml/min 48 h (${TABLE_15_8})`,
    question: Q_ANTICOAG("therapeutic-dose low-molecular-weight heparin (enoxaparin 1 mg/kg twice daily)"),
  }),
  m({
    title: "Énoxaparine thérapeutique et clairance < 50 mL/min",
    statement: "HBPM à dose thérapeutique, clairance < 50 mL/min : dernière injection 48 h avant l'intervention.",
    conditions: [drug("B01AB05", { dailyDose: { op: ">", mg: 40 } }), crclBelow(50)],
    action: { type: "stop_before", hours: 48, target: "both" },
    quote: `HBPM thérapeutique scut : clairance < 50 ml/min 48 h (${TABLE_15_8})`,
    question: Q_ANTICOAG("therapeutic-dose low-molecular-weight heparin in renal impairment"),
  }),
  m({
    title: "Héparine non fractionnée",
    statement: "Héparine non fractionnée : arrêt 4–6 h avant l'intervention (6 h en situation à risque).",
    conditions: [drug("B01AB01")],
    action: { type: "stop_before", hours: 6, target: "both" },
    quote: `Héparine non-fractionnée (HNF) IV, scut : demi-vie 1–2,5 h ; chirurgie générale 4–6 h ; situations à risque 6 h ; clairance < 50 ml/min 4–6 h (${TABLE_15_8})`,
    question: Q_ANTICOAG("unfractionated heparin"),
  }),
  ...(
    [
      ["Acénocoumarol", "B01AA07", 96, "Acénocoumarol (Sintrom®) : demi-vie 11 h ; 4 jours dans toutes les situations"],
      ["Warfarine", "B01AA03", 144, "Warfarine (Coumadine®) : demi-vie 40 h ; 6 jours dans toutes les situations"],
      ["Phenprocoumone", "B01AA04", 240, "Phénprocoumone (Marcoumar®) : demi-vie 140 h ; 10 jours dans toutes les situations"],
    ] as const
  ).map(([name, atc, hours, row]) =>
    m({
      title: `${name} : arrêt avant l'intervention`,
      statement: `${name} : dernière prise ${hours / 24} jours avant l'intervention ; contrôler l'INR (< 1,5) avant le geste.`,
      conditions: [drug(atc)],
      action: { type: "stop_before", hours, target: "both" },
      quote: `${row} (${TABLE_15_8}) « Contrôle de l'adéquation du délai par la valeur du TP (> 75 %) / INR (< 1,5). »`,
      question: Q_ANTICOAG(`${name.toLowerCase()} (vitamin K antagonist), including bridging with heparin`),
      explanations: ["Relais par héparine : selon le risque thrombotique (valve mécanique, FA à haut risque, MTEV récente) — à régler par une règle dédiée."],
    })
  ),
  m({
    title: "AVK : INR contrôlé avant le geste",
    statement: "Sous antivitamine K, vérifier que le délai d'arrêt a suffi : TP > 75 % / INR < 1,5 avant le geste.",
    conditions: [drug("B01AA")],
    action: { type: "requirement", text: "INR < 1,5 (TP > 75 %) avant le geste.", blocking: true, target: "both" },
    quote: "Contrôle de l'adéquation du délai par la valeur du TP (> 75 %) / INR (< 1,5). (Tableau 15.8)",
    question: "Before surgery or neuraxial anaesthesia in a patient whose vitamin K antagonist was stopped, which INR threshold is required according to current European guidelines?",
  }),
  m({
    title: "AVK : INR la veille",
    statement: "Sous antivitamine K arrêté, contrôler l'INR la veille ou le matin du geste.",
    conditions: [drug("B01AA")],
    action: { type: "exam", exam: "INR / TP", withinDays: 1, target: "both" },
    quote: "Contrôle de l'adéquation du délai par la valeur du TP (> 75 %) / INR (< 1,5). (Tableau 15.8)",
    question: "When should the INR be checked before surgery after stopping a vitamin K antagonist?",
  }),
  m({
    title: "AOD : chirurgie à risque hémorragique nul ou minime",
    statement: "Anticoagulant oral direct et intervention sans risque hémorragique (dents, ophtalmologie, paroi) : pas d'interruption ; opérer à distance de la dernière prise (taux bas).",
    conditions: [drug("B01AF"), bleeding("minimal")],
    action: { type: "info", text: "Pas d'interruption de l'AOD ; opérer quand le taux est bas : 12–18 h après la dernière prise (le tableau 15.9 propose 8–10 h). Pas de relais par héparine.", target: "surgery" },
    quote:
      "Les interventions mineures sans risque hémorragique (dentisterie, ophthalmologie, chirurgie de paroi, etc.) se déroulent sans interruption des NACO, en prenant toutefois soin d'opérer lorsque le taux sérique est bas (entre 12 et 18 heures après la dernière prise).",
    question: Q_ANTICOAG("a direct oral anticoagulant (rivaroxaban, apixaban, edoxaban) for a procedure with minimal bleeding risk"),
  }),
  m({
    title: "Dabigatran : chirurgie à risque hémorragique minime",
    statement: "Dabigatran et intervention sans risque hémorragique : pas d'interruption ; opérer à distance de la dernière prise.",
    conditions: [drug("B01AE07"), bleeding("minimal")],
    action: { type: "info", text: "Pas d'interruption du dabigatran ; opérer 12–18 h après la dernière prise. Pas de relais par héparine.", target: "surgery" },
    quote:
      "Les interventions mineures sans risque hémorragique (dentisterie, ophthalmologie, chirurgie de paroi, etc.) se déroulent sans interruption des NACO, en prenant toutefois soin d'opérer lorsque le taux sérique est bas (entre 12 et 18 heures après la dernière prise).",
    question: Q_ANTICOAG("dabigatran for a procedure with minimal bleeding risk"),
  }),
  ...(
    [
      ["B01AF", "Xabans"],
      ["B01AE07", "Dabigatran"],
    ] as const
  ).flatMap(([atc, name]) => [
    m({
      title: `${name} : reprise après chirurgie à faible risque hémorragique`,
      statement: `${name} : reprise à J1 si le risque hémorragique est faible.`,
      conditions: [drug(atc), bleeding("minimal", "low")],
      action: { type: "resume_after", hours: 24, target: "surgery" },
      quote: "Pour les NACO : J1 si risque hémorragique faible, J2–3 si risque hémorragique élevé (activité après 2–4 heures). (Tableau 15.8)",
      question: Q_ANTICOAG(name.toLowerCase()),
    }),
    m({
      title: `${name} : reprise après chirurgie à haut risque hémorragique`,
      statement: `${name} : reprise à J2–J3 si le risque hémorragique est élevé ; HBPM ou HNF dans l'intervalle si le risque thrombotique est élevé.`,
      conditions: [drug(atc), bleeding("high")],
      action: { type: "resume_after", hours: 48, target: "surgery" },
      quote:
        "Pour les NACO : J1 si risque hémorragique faible, J2–3 si risque hémorragique élevé (activité après 2–4 heures) ; dans les cas à risque hémorragique élevé et risque thrombotique élevé, prévoir HBPM ou HNF selon protocole institutionnel dans le postop immédiat.",
      question: Q_ANTICOAG(name.toLowerCase()),
    }),
  ]),
  m({
    title: "AVK : reprise à J1 avec relais",
    statement: "Antivitamine K : reprise à J1 ; efficace après 3–5 jours, d'où un relais par HBPM.",
    conditions: [drug("B01AA")],
    action: { type: "resume_after", hours: 24, target: "surgery" },
    quote: "Reprise postopératoire pour les AVK : J1 (activité après 3–5 jours, substitution par HBPM). (Tableau 15.8)",
    question: Q_ANTICOAG("a vitamin K antagonist"),
  }),
  ...(
    [
      ["B01AF", "Xabans"],
      ["B01AE07", "Dabigatran"],
      ["B01AB", "Héparines"],
      ["B01AX05", "Fondaparinux"],
    ] as const
  ).map(([atc, name]) =>
    m({
      title: `${name} : reprise après ponction ou retrait de cathéter`,
      statement: `${name} : reprise plus de 6 heures après une ponction neuraxiale, un bloc profond ou le retrait du cathéter.`,
      conditions: [drug(atc), neuraxial],
      action: { type: "resume_after", hours: 6, target: "anaesthesia" },
      quote: "ALR rachidienne et blocs profonds : par sécurité, attendre 5 demi-vies ; délais identiques pour la pose ou le retrait du cathéter péridural ; reprise du traitement anticoagulant > 6 heures après sa manipulation.",
      question: Q_ANTICOAG(name.toLowerCase()),
    })
  ),
];

// ---------------------------------------------------------------------------
// Antiplatelets — text p. 246–252, tableaux 15.4, 15.5, 15.7, figures 15.8–15.10
// ---------------------------------------------------------------------------

const TABLE_15_7 =
  "Tableau 15.7 « Délais proposés pour l'interruption préopératoire des antiplaquettaires » — colonnes : chirurgie générale ; situations à risque (chirurgie à haut risque hémorragique, combinaison médicamenteuse, ALR rachidienne) ; clairance < 50 ml/min.";

const P2Y12 = [
  { name: "Clopidogrel", atc: "B01AC04", general: 120, risk: 168, row: "Clopidogrel (Plavix®) : chirurgie générale 5 jours ; situations à risque 5–7 jours ; clairance < 50 ml/min 5 jours" },
  { name: "Prasugrel", atc: "B01AC22", general: 168, risk: 240, row: "Prasugrel (Efient®) : chirurgie générale 7 jours ; situations à risque 10 jours ; clairance < 50 ml/min 7 jours" },
  { name: "Ticagrélor", atc: "B01AC24", general: 72, risk: 120, row: "Ticagrélor (Brilique®, Brilinta®) : chirurgie générale 3–5 jours ; situations à risque 5 jours ; clairance < 50 ml/min 5 jours" },
];

const ANTIPLATELETS: Proposed[] = [
  m({
    title: "Aspirine en prévention secondaire : ne pas l'interrompre",
    statement: "L'aspirine prescrite en prévention secondaire n'est jamais interrompue pour une chirurgie, sauf neurochirurgie intracrânienne à très haut risque hémorragique.",
    conditions: [drug("B01AC06", { indications: SECONDARY })],
    action: { type: "info", text: "Poursuivre l'aspirine (prévention secondaire) : son arrêt expose à la thrombose (coronaire, stent) plus que son maintien au saignement.", target: "surgery" },
    quote:
      "L'AAS prescrit en prévention primaire peut être arrêté sans risque ; l'AAS en prévention secondaire n'est jamais interrompu, sauf dans certains cas de neurochirurgie intracrânienne à très haut risque hémorragique ; il en est de même du clopidogrel prescrit seul (au lieu de l'AAS).",
    question: Q_ANTIPLATELET("low-dose aspirin taken for secondary prevention"),
    explanations: ["« Suspendre le traitement antiplaquettaire dans la phase préopératoire transforme une coronaropathie stabilisée en syndrome instable. »"],
  }),
  m({
    title: "Aspirine en prévention primaire : arrêt possible",
    statement: "L'aspirine prescrite en prévention primaire peut être arrêtée sans risque ; si elle l'est, 5 jours avant la chirurgie.",
    conditions: [drug("B01AC06", { indications: ["primary_prevention"] }), bleeding("low", "high")],
    action: { type: "stop_before", hours: 120, target: "surgery" },
    quote: "L'AAS prescrit en prévention primaire peut être arrêté sans risque. […] Sauf exception, le traitement ne doit pas être interrompu avant la chirurgie ; en cas de nécessité absolue, il doit être arrêté 5 jours avant l'intervention.",
    question: Q_ANTIPLATELET("low-dose aspirin taken for primary prevention"),
  }),
  m({
    title: "Aspirine et chirurgie en espace clos",
    statement: "Chirurgie en espace clos (intracrânienne, canal médullaire, chambre postérieure de l'œil) sous aspirine : rapport bénéfice/risque au cas par cas ; si arrêt, 5 jours avant.",
    conditions: [drug("B01AC06"), closedSpace],
    action: { type: "requirement", text: "Décider avec le chirurgien (et le cardiologue si prévention secondaire) : maintien ou arrêt de l'aspirine 5 jours avant.", blocking: false, target: "surgery" },
    quote:
      "Risque hémorragique excessif : chirurgie en espace clos (neurochirurgie intracrânienne, chirurgie du canal médullaire, chirurgie de la chambre postérieure de l'œil), présence de coagulopathie, chirurgie invasive accompagnée d'hémorragie massive et d'hémostase difficile. Dans ces situations, le rapport risque / bénéfice doit être évalué au cas par cas.",
    question: Q_ANTIPLATELET("aspirin before intracranial, spinal or posterior eye chamber surgery"),
  }),
  m({
    title: "Aspirine et ALR",
    statement: "L'anesthésie locorégionale est possible sous aspirine, quelle que soit la dose.",
    conditions: [drug("B01AC06"), neuraxial],
    action: { type: "info", text: "ALR possible sous aspirine seule, quelle que soit la dose (vérifier l'absence d'autre antithrombotique).", target: "anaesthesia" },
    quote: "L'anesthésie locorégionale est en revanche possible lors de traitement à l'aspirine, quelles que soient les doses prescrites.",
    question: "Can a neuraxial block be performed in a patient on aspirin alone, whatever the dose, according to ESAIC/ESRA 2022?",
  }),
  m({
    title: "Antiplaquettaires : pas d'arrêt pour une ALR",
    statement: "Interrompre un antiplaquettaire de prévention secondaire dans le seul but de faire une ALR est injustifié.",
    conditions: [drug("B01AC", { indications: SECONDARY }), neuraxial],
    action: {
      type: "info",
      text: "Ne pas arrêter l'antiplaquettaire pour pouvoir faire l'ALR : choisir une autre technique si la ponction n'est pas permise sous ce traitement.",
      target: "anaesthesia",
    },
    quote:
      "Enfin, l'interruption des antiplaquettaires prescrits en prévention secondaire est injustifiée dans le seul but de pratiquer une anesthésie locorégionale, car les risques de complications cardiovasculaires dus à l'arrêt du traitement sont largement supérieurs au bénéfice escompté de l'anesthésie locorégionale.",
    question: Q_ANTIPLATELET("P2Y12 inhibitors when a neuraxial block is planned"),
  }),
  m({
    title: "Clopidogrel seul en prévention secondaire",
    statement: "Le clopidogrel prescrit seul (au lieu de l'aspirine) se gère comme l'aspirine : pas d'interruption, sauf espace clos.",
    conditions: [drug("B01AC04", { indications: ["secondary_prevention_coronary", "secondary_prevention_stroke", "peripheral_arterial_disease"] })],
    action: { type: "info", text: "Clopidogrel seul en prévention secondaire : poursuivre, comme l'aspirine (sauf chirurgie en espace clos : au cas par cas).", target: "surgery" },
    quote: "L'AAS en prévention secondaire n'est jamais interrompu, sauf dans certains cas de neurochirurgie intracrânienne à très haut risque hémorragique ; il en est de même du clopidogrel prescrit seul (au lieu de l'AAS).",
    question: Q_ANTIPLATELET("clopidogrel monotherapy for secondary prevention"),
  }),
  m({
    title: "Stent récent (< 6 semaines) : pas de chirurgie non vitale",
    statement: "Aucune intervention non urgente pendant les 4–6 premières semaines après une revascularisation coronaire : la mortalité de la chirurgie y est multipliée par 5 à 10.",
    conditions: [drug("B01AC", { indications: ["coronary_stent"], monthsSinceEvent: { op: "<", months: 1.5 } }), { kind: "surgery", attribute: "urgency", in: ["elective", "semi_urgent"] }],
    action: {
      type: "requirement",
      text: "Reporter la chirurgie : moins de 6 semaines après la revascularisation. L'anesthésie n'est pas en cause — c'est le risque de thrombose de stent (arrêt) ou de saignement (maintien). Avis cardiologique.",
      blocking: true,
      target: "surgery",
    },
    quote:
      "Quel que soit le mode de revascularisation coronarienne, la mortalité de la chirurgie non cardiaque est augmentée de 5 à 10 fois pendant le premier mois qui suit la procédure. Aucune intervention ne doit donc être envisagée pendant les premières 4–6 semaines (figure 15.8).",
    question: Q_ANTIPLATELET("dual antiplatelet therapy within 6 weeks of coronary stenting"),
  }),
  m({
    title: "Stent actif < 6 mois : reporter la chirurgie programmée",
    statement: "Après stent actif de 2e–3e génération, toute intervention élective est reportée à 6 mois (exceptionnellement 3) ; 12 mois après stent de 1re génération ou SCA.",
    conditions: [drug("B01AC", { indications: ["coronary_stent"], monthsSinceEvent: { op: "<", months: 6 } }), { kind: "surgery", attribute: "urgency", in: ["elective"] }],
    action: {
      type: "requirement",
      text: "Chirurgie programmée à reporter jusqu'à la fin de la bithérapie (6 mois après stent actif 2e–3e génération ; 12 mois après 1re génération ou SCA ; 3 mois exceptionnellement si l'indication est impérative). La bithérapie ne doit pas être arrêtée pour opérer.",
      blocking: true,
      target: "surgery",
    },
    quote:
      "Après revascularisation par stent actif de 1re génération, toute intervention élective est contre-indiquée pendant 12 mois. Après revascularisation par stent actif de 2e–3e génération, ce délai est abaissé à 6 mois ; il peut être exceptionnellement raccourci à 3 mois si l'indication opératoire est impérative et si le risque cardio-vasculaire de l'intervention le permet (tableau 15.5).",
    question: Q_ANTIPLATELET("dual antiplatelet therapy within 6 months of drug-eluting stent implantation (elective surgery)"),
  }),
  m({
    title: "Stent < 6 mois et chirurgie semi-urgente",
    statement: "Chirurgie qui ne peut pas attendre la fin de la bithérapie : opérer sous antiplaquettaires ; maintien ou arrêt du 2e agent selon le risque hémorragique, au cas par cas.",
    conditions: [drug("B01AC", { indications: ["coronary_stent"], monthsSinceEvent: { op: "<", months: 6 } }), { kind: "surgery", attribute: "urgency", in: ["semi_urgent", "urgent"] }],
    action: {
      type: "requirement",
      text: "Opérer sous aspirine (jamais arrêtée) ; bithérapie maintenue sauf risque hémorragique excessif (espace clos) — alors arrêt du 2e agent ± substitution (tirofiban, eptifibatide, cangrélor). Décision avec le cardiologue ; centre avec angioplastie en urgence.",
      blocking: false,
      target: "surgery",
    },
    quote:
      "La chirurgie semi-élective concerne tous les cas qui ne relèvent pas d'une urgence mais qui ne peuvent pas attendre la fin de la bithérapie : chirurgie oncologique, anévrisme menaçant de rompre, fracture invalidante, etc. Le maintien ou l'arrêt des antiplaquettaires est fonction du risque représenté par l'hémorragie et par la thrombose en fonction de la situation particulière de chaque cas. (Figure 15.10)",
    question: Q_ANTIPLATELET("dual antiplatelet therapy within 6 months of coronary stenting when surgery cannot be postponed"),
    explanations: ["« Les patients à risque doivent être opérés dans une institution disposant de toutes les facilités pour pratiquer une angioplastie coronarienne en urgence. »"],
  }),
  ...P2Y12.flatMap((p) => [
    m({
      title: `${p.name} (stent > 6 mois) : chirurgie à risque hémorragique faible`,
      statement: `${p.name} dans une situation cardiaque à faible risque (stent de plus de 6 mois) : arrêt ${p.general / 24} jours avant la chirurgie ; l'aspirine est maintenue.`,
      conditions: [drug(p.atc, { indications: ["coronary_stent"], monthsSinceEvent: { op: ">=", months: 6 } }), bleeding("low")],
      action: { type: "stop_before", hours: p.general, target: "surgery" },
      quote: `${p.row} (${TABLE_15_7}) Figure 15.9 : situations cardiaques à risque faible (> 6 mois après DES 2e génération…) — stop bithérapie, maintien aspirine.`,
      question: Q_ANTIPLATELET(p.name.toLowerCase()),
      explanations: ["Stent métallique nu ou angioplastie sans stent : la situation est déjà à faible risque après 3 mois ; stent actif de 1re génération : après 12 mois (figure 15.9)."],
    }),
    m({
      title: `${p.name} (stent > 6 mois) : chirurgie à haut risque hémorragique`,
      statement: `${p.name} dans une situation cardiaque à faible risque : arrêt ${p.risk / 24} jours avant une chirurgie à haut risque hémorragique ; l'aspirine est maintenue.`,
      conditions: [drug(p.atc, { indications: ["coronary_stent"], monthsSinceEvent: { op: ">=", months: 6 } }), bleeding("high")],
      action: { type: "stop_before", hours: p.risk, target: "surgery" },
      quote: `${p.row} (${TABLE_15_7})`,
      question: Q_ANTIPLATELET(p.name.toLowerCase()),
    }),
    m({
      title: `${p.name} et chirurgie en espace clos`,
      statement: `${p.name} et chirurgie en espace clos : arrêt ${p.risk / 24} jours avant, aspirine poursuivie ; substitution si le risque thrombotique est élevé.`,
      conditions: [drug(p.atc), closedSpace],
      action: { type: "stop_before", hours: p.risk, target: "surgery" },
      quote:
        "La bithérapie (AAS + clopidogrel ou prasugrel ou ticagrélor) n'est pas interrompue en préopératoire, sauf en cas de chirurgie en espace clos (neurochirurgie intracrânienne, chirurgie du canal médullaire, chirurgie de la chambre postérieure de l'œil), de chirurgie invasive à haut risque hémorragique où l'hémostase est difficile, et de coagulopathies ; dans ces cas, le clopidogrel, le prasugrel ou le ticagrélor sont interrompus mais l'AAS est poursuivi.",
      question: Q_ANTIPLATELET(`${p.name.toLowerCase()} before closed-space surgery`),
      explanations: ["Substitution si risque thrombotique élevé : perfusion de tirofiban ou d'eptifibatide (stop 6 h avant) ou de cangrélor (stop 1–2 h avant). L'héparine n'a pas d'activité antiplaquettaire et ne remplace pas."],
    }),
    m({
      title: `${p.name} : ponction neuraxiale ou bloc profond`,
      statement: `${p.name} : ${p.risk / 24} jours avant une ponction neuraxiale ou un bloc profond (colonne « situations à risque »).`,
      conditions: [drug(p.atc), neuraxial],
      action: { type: "stop_before", hours: p.risk, target: "anaesthesia" },
      quote: `${p.row} (${TABLE_15_7}) « ALR rachidienne et blocs profonds : par sécurité, attendre 5 demi-vies. »`,
      question: `According to the ESAIC/ESRA 2022 guidelines, how long before a neuraxial puncture or deep block should ${p.name.toLowerCase()} be stopped?`,
    }),
    m({
      title: `${p.name} : reprise après la chirurgie`,
      statement: `${p.name} : reprise dans les 24 premières heures postopératoires${p.atc === "B01AC04" ? ", avec une dose de charge (300 mg) si l'interruption a duré 5 jours ou plus" : ", sans dose de charge"}.`,
      conditions: [drug(p.atc, { indications: ["coronary_stent", "secondary_prevention_coronary"] })],
      action: { type: "resume_after", hours: 24, target: "surgery" },
      quote:
        "Le traitement antiplaquettaire est repris dans le courant des 24 premières heures postopératoires, éventuellement avec une dose de charge (clopidogrel) lorsque l'interruption est de ≥ 5 jours (pas de dose de charge pour le prasugrel et le ticagrélor).",
      question: Q_ANTIPLATELET(p.name.toLowerCase()),
    }),
  ]),
  m({
    title: "Infarctus ou AVC < 3 mois : reporter la chirurgie programmée",
    statement: "Après un infarctus non compliqué, un pontage ou un AVC, le délai de sécurité est de 3 mois ; entre 6 semaines et 3 mois, seules les opérations vitales sont envisageables.",
    conditions: [drug("B01AC", { indications: ["secondary_prevention_coronary", "secondary_prevention_stroke"], monthsSinceEvent: { op: "<", months: 3 } }), { kind: "surgery", attribute: "urgency", in: ["elective"] }],
    action: { type: "requirement", text: "Chirurgie programmée à reporter : moins de 3 mois après l'infarctus, le pontage ou l'AVC.", blocking: true, target: "surgery" },
    quote:
      "Après un infarctus sans complications ou un pontage aortocoronarien, le délai de sécurité pour une intervention non cardiaque est de 3 mois ; entre 6 semaines et 3 mois, le risque est intermédiaire ; seules des opérations vitales sont envisageables. Ces délais sont les mêmes après un AVC.",
    question: "How long should elective non-cardiac surgery be delayed after myocardial infarction, coronary bypass or ischaemic stroke, according to current European guidelines (ESC 2022, ESAIC)?",
  }),
];

// ---------------------------------------------------------------------------
// Other treatments — « Arrêt des médicaments préopératoires », p. 253–255
// ---------------------------------------------------------------------------

const OTHERS: Proposed[] = [
  m({
    title: "IEC et sartans : arrêt la veille",
    statement: "Inhibiteurs de l'enzyme de conversion et antagonistes de l'angiotensine : arrêt 24–48 h avant l'intervention (hypotension), sauf insuffisance cardiaque ou chirurgie mineure.",
    conditions: [drug("C09"), history("heart_failure", "Insuffisance cardiaque", false), { kind: "surgery", attribute: "grade", in: ["intermediate", "major"] }],
    action: { type: "stop_before", hours: 24, target: "anaesthesia" },
    quote: "Inhibiteurs de l'enzyme de conversion : arrêt 24–48 h avant l'intervention en raison du risque d'hypotension, sauf en cas d'insuffisance cardiaque ou de chirurgie mineure (cataracte). Antagonistes des récepteurs de l'angiotensine : arrêt 24–48 h avant l'intervention en raison du risque d'hypotension, sauf en cas d'insuffisance cardiaque ou de chirurgie mineure (cataracte).",
    question: "Should ACE inhibitors and angiotensin receptor blockers be withheld before non-cardiac surgery, how long before, and in which patients should they be continued, according to current European guidelines (ESC 2022, ESAIC)?",
    explanations: ["Le risque protégé est l'hypotension à l'induction et en peropératoire : c'est l'anesthésie qui est concernée, pas le geste chirurgical."],
  }),
  m({
    title: "IEC et sartans : poursuivre si insuffisance cardiaque",
    statement: "En cas d'insuffisance cardiaque, les IEC et sartans sont poursuivis.",
    conditions: [drug("C09"), history("heart_failure", "Insuffisance cardiaque")],
    action: { type: "info", text: "Insuffisance cardiaque : poursuivre l'IEC ou le sartan ; anticiper l'hypotension à l'induction.", target: "anaesthesia" },
    quote: "Arrêt 24–48 h avant l'intervention en raison du risque d'hypotension, sauf en cas d'insuffisance cardiaque ou de chirurgie mineure (cataracte).",
    question: "Should ACE inhibitors be continued before surgery in patients with heart failure, according to ESC 2022?",
  }),
  m({
    title: "Metformine : arrêt 48 h avant",
    statement: "Metformine : arrêt 48 h avant l'intervention (acidose lactique favorisée par une insuffisance rénale aiguë ou une hypoxie), sauf intervention mineure ; la tendance actuelle est de ne plus l'arrêter.",
    conditions: [drug("A10BA02"), { kind: "surgery", attribute: "grade", in: ["intermediate", "major"] }],
    action: { type: "stop_before", hours: 48, target: "both" },
    quote:
      "Hypoglycémiants oraux type biguanide (metformine [Glucinan®, Stagid®, Glucophage®]) : arrêt 48 h avant l'intervention en raison du risque d'acidose lactique, favorisée par une insuffisance rénale aiguë ou une hypoxie, et éventuel relais par de l'insuline parentérale sauf en cas d'intervention mineure ; la tendance actuelle est de ne plus les arrêter.",
    question: "Should metformin be stopped before surgery, how long before, and in which situations (renal function, contrast, major surgery), according to current guidelines (ESAIC, CPOC/JBDS 2021)?",
    explanations: ["Le livre signale lui-même que la pratique a évolué (« la tendance actuelle est de ne plus les arrêter ») : à vérifier avant activation."],
  }),
  m({
    title: "Sulfamides hypoglycémiants : arrêt la veille",
    statement: "Sulfamides hypoglycémiants : arrêt 24 h avant l'opération (risque d'hypoglycémie à jeun), relais par insuline si besoin.",
    conditions: [drug("A10BB")],
    action: { type: "stop_before", hours: 24, target: "both" },
    quote: "Hypoglycémiants de type sulfamide (Glucidoral®, Diabinèse®, Glutril®, Dolipol®, Daonil®, Diamicron®, Amarel®, Amaryl®) et inhibiteurs des alphaglucosidases (acarbose [Glucor®]) : arrêt 24 h avant l'opération, et éventuel relais par de l'insuline parentérale.",
    question: "When should sulfonylureas be withheld before surgery according to current perioperative diabetes guidelines?",
  }),
  m({
    title: "Acarbose : arrêt la veille",
    statement: "Inhibiteurs des alphaglucosidases : arrêt 24 h avant l'opération.",
    conditions: [drug("A10BF")],
    action: { type: "stop_before", hours: 24, target: "both" },
    quote: "Inhibiteurs des alphaglucosidases (acarbose [Glucor®]) : arrêt 24 h avant l'opération, et éventuel relais par de l'insuline parentérale.",
    question: "When should alpha-glucosidase inhibitors be withheld before surgery?",
  }),
  m({
    title: "Anorexigènes : arrêt 10–15 jours avant",
    statement: "Anorexigènes : arrêt 10–15 jours avant l'intervention (crises hypertensives et troubles du rythme pendant l'anesthésie).",
    conditions: [drug("A08A")],
    action: { type: "stop_before", hours: 240, target: "anaesthesia" },
    quote: "Anorexigènes (Modératan®, Lucofène Forte®, Dinintel®, Dexamyl®, Pondéral®) : arrêt 10–15 jours avant l'intervention en raison du risque de crises hypertensives et de troubles du rythme durant l'anesthésie.",
    question: "Should appetite suppressants (anorectics, including GLP-1 agonists used for weight loss) be stopped before anaesthesia, and how long before?",
    explanations: ["Les produits cités ne sont plus commercialisés ; les agonistes du GLP-1 (A10BJ) relèvent d'une autre question (vidange gastrique)."],
  }),
  m({
    title: "Bêta-bloquants : ne jamais interrompre",
    statement: "Un traitement bêta-bloquant en cours est impérativement maintenu en périopératoire : son arrêt brutal provoque un effet rebond.",
    conditions: [drug("C07")],
    action: { type: "info", text: "Poursuivre le bêta-bloquant, y compris le matin de l'intervention (arrêt brutal : effet rebond — tachycardie, hypertension). Maintenir FC < 70/min et PAM > 70 mmHg.", target: "both" },
    quote: "Il est impératif de maintenir le traitement bêta-bloquant en cours dans la phase périopératoire ; en effet, son arrêt brutal avant la chirurgie ou dans la phase postopératoire immédiate peut avoir des conséquences néfastes (effet rebond) : augmentation de la FC, de la PAM et de la concentration plasmatique de noradrénaline (NA).",
    question: "Should chronic beta-blocker therapy be continued perioperatively, and should beta-blockers be started before non-cardiac surgery, according to ESC 2022?",
    explanations: ["« Le traitement prophylactique avant chirurgie à risque est formellement déconseillé » chez le patient à faible risque coronarien."],
  }),
  m({
    title: "Statines : poursuivre",
    statement: "Les statines sont poursuivies en périopératoire : elles réduisent les complications cardiaques et leur arrêt brutal entraîne un effet rebond.",
    conditions: [drug("C10AA")],
    action: { type: "info", text: "Poursuivre la statine (cardioprotection ; effet rebond à l'arrêt).", target: "both" },
    quote: "Le maintien des statines dans la phase périopératoire permet de diminuer le risque de complications cardiaques chez les patients coronariens et/ou polyvasculaires, d'autant plus qu'un arrêt brutal entraîne un effet rebond.",
    question: "Should statins be continued perioperatively, according to ESC 2022?",
  }),
  m({
    title: "Corticothérapie : maintenir",
    statement: "L'hormonothérapie en cours est maintenue, notamment la corticothérapie (prévention d'une insuffisance surrénalienne aiguë).",
    conditions: [drug("H02AB")],
    action: { type: "info", text: "Poursuivre la corticothérapie le jour de l'intervention ; discuter une supplémentation selon la dose et la chirurgie.", target: "both" },
    quote: "Maintien de l'hormonothérapie en cours (par exemple prévention d'une insuffisance surrénalienne aiguë chez le patient sous corticothérapie).",
    question: "How should chronic glucocorticoid therapy be managed perioperatively (continue, stress-dose supplementation by dose and surgery), according to current guidelines (e.g. AAGBI 2020)?",
  }),
];

// ---------------------------------------------------------------------------
// Examinations — « Examens complémentaires », tableau 15.1, p. 229–232
// ---------------------------------------------------------------------------

const ECG_QUOTE =
  "Un ECG 12 dérivations doit être effectué chez tout patient de plus de 65 ans ou qui présente des facteurs de risque cardiovasculaires, une pathologie cardiaque ou une maladie systémique avancée. Un ECG peut être considéré comme valide pendant une année si aucun événement cardiovasculaire particulier ne survient dans l'intervalle.";
const ECG_Q = "In which patients is a preoperative 12-lead ECG recommended before non-cardiac surgery, and how long does it remain valid, according to ESC 2022 and ESAIC 2018?";
const LAB_QUOTE = "Ces examens peuvent être considérés comme valides pendant une année si aucun événement particulier ne survient dans l'intervalle.";

const EXAMS: Proposed[] = [
  m({
    title: "ECG après 65 ans",
    statement: "ECG 12 dérivations chez tout patient de plus de 65 ans (valable un an sans nouvel événement).",
    conditions: [{ kind: "value", value: "age", op: ">", threshold: 65 }],
    action: { type: "exam", exam: "ECG 12 dérivations (< 1 an)", withinDays: 365, target: "both" },
    quote: ECG_QUOTE,
    question: ECG_Q,
  }),
  ...(
    [
      ["hypertension", "HTA"],
      ["diabetes_oral", "Diabète"],
      ["diabetes_insulin", "Diabète insulinotraité"],
      ["coronary", "Coronaropathie"],
      ["heart_failure", "Insuffisance cardiaque"],
      ["arrhythmia", "Trouble du rythme"],
      ["valve", "Valvulopathie"],
    ] as const
  ).map(([code, label]) =>
    m({
      title: `ECG : ${label.toLowerCase()}`,
      statement: `ECG 12 dérivations en cas de ${label.toLowerCase()} (facteur de risque cardiovasculaire ou cardiopathie).`,
      conditions: [history(code, label)],
      action: { type: "exam", exam: "ECG 12 dérivations (< 1 an)", withinDays: 365, target: "both" },
      quote: ECG_QUOTE,
      question: ECG_Q,
    })
  ),
  m({
    title: "Électrolytes et créatinine sous diurétique",
    statement: "Sous traitement diurétique : ionogramme (Na⁺, K⁺) et créatininémie.",
    conditions: [drug("C03")],
    action: { type: "exam", exam: "Ionogramme (Na⁺, K⁺) et créatinine (< 1 an)", withinDays: 365, target: "both" },
    quote: `En cas de traitement diurétique, d'insuffisance rénale : un dosage des électrolytes et une créatinémie. ${LAB_QUOTE}`,
    question: "Which preoperative laboratory tests are recommended in patients on diuretics or with chronic kidney disease (ESAIC 2018)?",
  }),
  m({
    title: "Électrolytes et créatinine : insuffisance rénale",
    statement: "Insuffisance rénale : ionogramme et créatininémie.",
    conditions: [history("ckd", "Insuffisance rénale chronique")],
    action: { type: "exam", exam: "Ionogramme (Na⁺, K⁺) et créatinine (< 1 an)", withinDays: 365, target: "both" },
    quote: `En cas de traitement diurétique, d'insuffisance rénale : un dosage des électrolytes et une créatinémie. ${LAB_QUOTE}`,
    question: "Which preoperative laboratory tests are recommended in patients with chronic kidney disease (ESAIC 2018)?",
  }),
  m({
    title: "Hémoglobine, groupe et RAI si risque hémorragique",
    statement: "Risque hémorragique important : hémoglobine, groupe sanguin et recherche d'agglutinines irrégulières.",
    conditions: [bleeding("high")],
    action: { type: "exam", exam: "Hémoglobine, groupe sanguin et RAI", target: "surgery" },
    quote: "En cas de risque hémorragique important : un dosage de l'hémoglobine, groupe sanguin et recherche d'agglutinines irrégulières.",
    question: "Which preoperative tests (haemoglobin, blood group, antibody screen) are recommended before surgery with a high bleeding risk?",
  }),
  ...(
    [
      ["B01AA", "antivitamine K"],
      ["B01AF", "xaban"],
      ["B01AE07", "dabigatran"],
    ] as const
  ).map(([atc, label]) =>
    m({
      title: `TP et TCA sous ${label}`,
      statement: `Traitement anticoagulant (${label}) : temps de Quick (TP/INR) et TCA.`,
      conditions: [drug(atc)],
      action: { type: "exam", exam: "TP (INR) et TCA", target: "both" },
      quote: "En cas de traitement anticoagulant, ou d'anamnèse hématologique positive, temps de Quick (taux de prothombine), temps de céphaline activé (TCA ou aPTT).",
      question: `Which coagulation tests are useful before surgery in a patient on ${label === "antivitamine K" ? "a vitamin K antagonist" : label}, and do standard tests reflect the anticoagulant effect?`,
      explanations: label === "antivitamine K" ? [] : ["TP et TCA reflètent mal l'effet des AOD : un dosage spécifique (anti-Xa calibré, temps de thrombine dilué) est plus fiable si un doute persiste."],
    })
  ),
  m({
    title: "TP et TCA : cirrhose",
    statement: "Cirrhose hépatique : temps de Quick et TCA.",
    conditions: [history("cirrhosis", "Cirrhose")],
    action: { type: "exam", exam: "TP (INR) et TCA", target: "both" },
    quote: "Temps de Quick (taux de prothombine), temps de céphaline activé (TCA ou aPTT) : intervention hépatobiliaire ou neurochirurgicale, malabsorption, dénutrition, éthylisme chronique, cirrhose hépatique, traitement anticoagulant, anamnèse hématologique positive, néoplasie. (Tableau 15.1)",
    question: "Which coagulation tests are recommended before surgery in patients with cirrhosis?",
  }),
  m({
    title: "Glycémie sous corticothérapie",
    statement: "Corticothérapie : glycémie (et ionogramme).",
    conditions: [drug("H02AB")],
    action: { type: "exam", exam: "Glycémie et ionogramme", target: "both" },
    quote: "Glycémie : diabète, maladie pancréatique, maladie endocrinienne, corticothérapie. Na+, K+ : diurétiques, malabsorption, dénutrition, insuffisance rénale, corticothérapie. (Tableau 15.1)",
    question: "Which preoperative laboratory tests are recommended in patients on long-term corticosteroids?",
  }),
  m({
    title: "Biomarqueurs cardiaques : coronarien avant chirurgie à risque",
    statement: "Patient à risque avant une intervention intermédiaire ou majeure : doser troponine haute sensibilité et BNP/NT-proBNP avant d'envisager des investigations cardiologiques.",
    conditions: [history("coronary", "Coronaropathie"), { kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "exam", exam: "Troponine hs et BNP / NT-proBNP", target: "both" },
    quote:
      "Pour les limiter aux situations où elles ont le plus de chance de modifier la prise en charge, il est recommandé en premier lieu de doser les biomarqueurs (troponines, BNP/NT-proBNP) chez les patients à risque avant des interventions intermédiaires ou majeures.",
    question: "In which patients are preoperative high-sensitivity troponin and BNP/NT-proBNP recommended before non-cardiac surgery, according to ESC 2022?",
    explanations: ["Seuils cités : TnT-hs > 14 ng/l (risque d'infarctus × 3) ; BNP 92 ng/l, NT-proBNP 300 ng/l (complications × 4)."],
  }),
  m({
    title: "Biomarqueurs cardiaques : insuffisance cardiaque",
    statement: "Insuffisance cardiaque avant une intervention intermédiaire ou majeure : troponine haute sensibilité et BNP/NT-proBNP.",
    conditions: [history("heart_failure", "Insuffisance cardiaque"), { kind: "surgery", attribute: "cardiacRisk", in: ["intermediate", "high"] }],
    action: { type: "exam", exam: "Troponine hs et BNP / NT-proBNP", target: "both" },
    quote: "Il est actuellement suggéré de doser les biomarqueurs chez les patients à risque intermédiaire et majeur avant des interventions majeures. Cette attitude permet de limiter les investigations cardiologiques.",
    question: "In which patients are preoperative high-sensitivity troponin and BNP/NT-proBNP recommended before non-cardiac surgery, according to ESC 2022?",
  }),
  m({
    title: "Radiographie du thorax : insuffisance cardiaque",
    statement: "Radiographie du thorax en présence d'insuffisance cardiaque (valable un an sans nouvel événement respiratoire).",
    conditions: [history("heart_failure", "Insuffisance cardiaque")],
    action: { type: "exam", exam: "Radiographie du thorax (< 1 an)", withinDays: 365, target: "both" },
    quote: "Une radiographie du thorax est effectuée : chez les patients migrants qui n'ont pas subi de contrôle sanitaire ; en présence de goitre, d'insuffisance cardiaque, de maladie pulmonaire aiguë, de processus néoplasique ou de métastases pulmonaires.",
    question: "When is a preoperative chest X-ray indicated before non-cardiac surgery (ESAIC 2018)?",
  }),
  m({
    title: "Anémie avant chirurgie hémorragique programmée",
    statement: "Anémie (Hb < 12 g/dL chez la femme, < 13 g/dL chez l'homme) avant une chirurgie hémorragique programmée : la corriger (fer per os ou IV, EPO), idéalement 4–6 semaines avant.",
    conditions: [{ kind: "value", value: "hb", op: "<", threshold: 13 }, bleeding("high"), { kind: "surgery", attribute: "urgency", in: ["elective"] }],
    action: {
      type: "requirement",
      text: "Corriger l'anémie avant la chirurgie : bilan martial, fer (100–200 mg/j per os, ou IV), EPO si carence exclue ; effet du fer IV maximal à 3 semaines. Seuil femme : 12 g/dL.",
      blocking: false,
      target: "surgery",
    },
    quote:
      "L'anémie est définie par une valeur d'Hb < 120 g/l (Ht < 36 %) chez la femme et < 130 g/l (Ht < 39 %) chez l'homme. […] La correction d'une anémie préopératoire n'est efficace que si l'on dispose du temps nécessaire pour la corriger. Le pic d'effet sur l'érythropoïèse d'une perfusion de fer n'apparaît qu'au bout de 3 semaines et dure environ 2 mois. De ce fait, l'évaluation préopératoire des malades à risque pour une chirurgie élective (orthopédie, chirurgie cardiovasculaire ou thoracique) doit avoir lieu 4–6 semaines avant l'intervention.",
    question: "How should preoperative anaemia be investigated and treated before elective surgery with expected blood loss (iron, erythropoietin, timing), according to current consensus (Muñoz 2017, ESAIC 2023 PBM)?",
    explanations: ["Le seuil de 13 g/dL est celui de l'homme ; la règle s'applique aussi à la femme entre 12 et 13 g/dL — lire le seuil femme dans le message."],
  }),
];

// ---------------------------------------------------------------------------
// Antecedents — valvulopathies, prémédication, jeûne
// ---------------------------------------------------------------------------

const ANTECEDENTS: Proposed[] = [
  m({
    title: "Sténose aortique serrée symptomatique : remplacement valvulaire d'abord",
    statement: "Une sténose aortique serrée symptomatique (angor, syncope, dyspnée) découverte avant une chirurgie non cardiaque doit être opérée (RVA ou TAVI) avant l'intervention programmée.",
    conditions: [history("aortic_stenosis", "Rétrécissement aortique"), { kind: "surgery", attribute: "urgency", in: ["elective"] }],
    action: {
      type: "requirement",
      text: "Si la sténose est serrée (< 1 cm² ou gradient moyen > 50 mmHg) et symptomatique, ou serrée avant une chirurgie majeure : avis cardiologique et remplacement valvulaire (RVA ou TAVI) avant la chirurgie programmée. Échocardiographie récente.",
      blocking: false,
      target: "both",
    },
    quote:
      "Une sténose aortique serrée (< 0,6 cm2/m2) découverte dans le préopératoire de chirurgie générale doit être opérée (remplacement valvulaire aortique, RVA) avant de procéder à l'intervention non cardiaque lorsqu'elle est symptomatique (angor, syncope et/ou dyspnée). Lorsque le patient porteur d'une sténose aortique serrée est asymptomatique et qu'il doit subir une intervention élective majeure (chirurgie de l'aorte abdominale, chirurgie hépato-pancréatique), il est également conseillé de prévoir un RVA préopératoire.",
    question: "How should severe aortic stenosis be managed before elective non-cardiac surgery (symptomatic vs asymptomatic, surgical risk), according to ESC 2022 and ESC/EACTS 2021 valvular guidelines?",
  }),
  m({
    title: "Prémédication anxiolytique : SAOS",
    statement: "Le SAOS contre-indique une prémédication anxiolytique.",
    conditions: [history("osa", "SAOS")],
    action: { type: "info", text: "Pas de prémédication anxiolytique (benzodiazépine) : SAOS.", target: "anaesthesia" },
    quote: "Contre-indications à une médication anxiolytique : BPCO sévère ; SAOS ; obstruction des voies aériennes supérieures ; diminution de la vigilance (par exemple hypertension intracrânienne) ; hypovolémie.",
    question: "Is sedative premedication (benzodiazepines) contraindicated in patients with obstructive sleep apnoea, according to current guidelines?",
  }),
  m({
    title: "Prémédication anxiolytique : BPCO sévère",
    statement: "Une BPCO sévère contre-indique une prémédication anxiolytique.",
    conditions: [history("copd", "BPCO")],
    action: { type: "info", text: "Pas de prémédication anxiolytique si la BPCO est sévère.", target: "anaesthesia" },
    quote: "Contre-indications à une médication anxiolytique : BPCO sévère ; SAOS ; obstruction des voies aériennes supérieures ; diminution de la vigilance (par exemple hypertension intracrânienne) ; hypovolémie.",
    question: "Is sedative premedication contraindicated in severe COPD?",
  }),
  m({
    title: "Jeûne préopératoire de l'adulte",
    statement: "Adulte : jeûne de 6 h pour les solides, 2 h pour les liquides clairs (eau, thé, café, jus sans pulpe).",
    conditions: [{ kind: "value", value: "age", op: ">=", threshold: 16 }],
    action: { type: "info", text: "Jeûne : solides 6 h, liquides clairs 2 h (eau, thé, café sans lait, jus sans pulpe).", target: "anaesthesia" },
    quote: "Chez l'adulte, ce jeûne est de : 6 h pour les solides ; 2 h pour les liquides clairs (eau, thé, café, jus de fruit sans pulpe).",
    question: "What are the current preoperative fasting recommendations for adults (ESAIC 2022 fasting guidelines), including clear fluids?",
  }),
  m({
    title: "Jeûne préopératoire de l'enfant",
    statement: "Enfant (0–16 ans) : solides et laits non maternels 6 h, lait maternel 4 h, liquides clairs 1 h.",
    conditions: [{ kind: "value", value: "age", op: "<", threshold: 16 }],
    action: { type: "info", text: "Jeûne : solides et lait non maternel 6 h, lait maternel 4 h, liquides clairs 1 h.", target: "anaesthesia" },
    quote: "Chez l'enfant de 0 à 16 ans, ce jeûne est de : 6 h pour les solides, y compris lait de vache et lait artificiel ; 4 h pour le lait maternel ; 1 h pour les liquides clairs (eau, thé, jus de fruit sans pulpe).",
    question: "What are the current preoperative fasting recommendations for children (ESAIC 2022 paediatric fasting)?",
  }),
];

// ---------------------------------------------------------------------------
// Chapitre 13 (ALR), tableau 13.2 — délais avant une ALR et reprise.
// Appended after the chapter 15 rules so that their ids don't move.
// ---------------------------------------------------------------------------

const CH13 = "Chapitre 13, Anesthésie locorégionale (ALR), 4e édition (Elsevier Masson)";
const T132 =
  "Tableau 13.2 « Recommandations des délais de procédures d'anesthésie locorégionale en fonction des prescriptions des médicaments altérant l'hémostase. Ces recommandations concernent principalement les blocs périmédullaires ou profonds, et les patients avec une fonction rénale normale. »";
const Q_ALR = (drugName: string) =>
  `According to the ESAIC/ESRA 2022 guidelines, what is the minimum interval between the last dose of ${drugName} and a neuraxial puncture, deep block or catheter removal, and how long after the procedure or catheter removal can it be resumed?`;

function alrPair(p: { name: string; atc: string; dose?: Extract<Condition, { kind: "drug" }>["dailyDose"]; doseLabel?: string; before: number; after: number | null; row: string }): Proposed[] {
  const d = drug(p.atc, p.dose ? { dailyDose: p.dose } : {});
  const who = `${p.name}${p.doseLabel ? ` ${p.doseLabel}` : ""}`;
  const h = (x: number) => (x >= 48 && x % 24 === 0 ? `${x / 24} jours` : `${x} h`);
  const out = [
    m({
      title: `${who} : délai avant ALR (tableau 13.2)`,
      statement: `${who} : dernière prise au moins ${h(p.before)} avant une ponction neuraxiale, un bloc profond ou le retrait d'un cathéter.`,
      conditions: [d, neuraxial],
      action: { type: "stop_before", hours: p.before, target: "anaesthesia" },
      quote: `${p.row} (${T132})`,
      question: Q_ALR(p.name.toLowerCase()),
      chapterTitle: CH13,
    }),
  ];
  if (p.after !== null)
    out.push(
      m({
        title: `${who} : reprise après ALR (tableau 13.2)`,
        statement: `${who} : reprise au plus tôt ${h(p.after)} après la ponction ou le retrait du cathéter.`,
        conditions: [d, neuraxial],
        action: { type: "resume_after", hours: p.after, target: "anaesthesia" },
        quote: `${p.row} (${T132})`,
        question: Q_ALR(p.name.toLowerCase()),
        chapterTitle: CH13,
      })
    );
  return out;
}

const ALR_TABLE: Proposed[] = [
  ...alrPair({ name: "Héparine non fractionnée", atc: "B01AB01", before: 4, after: 1, row: "Héparine non fractionnée (prophylaxie sc, traitement IV) : 4 h avant ; reprise 1 h après" }),
  ...alrPair({ name: "Énoxaparine prophylactique", atc: "B01AB05", dose: { op: "<=", mg: 40 }, doseLabel: "(≤ 40 mg/j)", before: 12, after: 4, row: "HBPM : 12 h si dose prophylactique, 24 h si dose thérapeutique ; reprise 4 h après" }),
  ...alrPair({ name: "Énoxaparine thérapeutique", atc: "B01AB05", dose: { op: ">", mg: 40 }, doseLabel: "(> 40 mg/j)", before: 24, after: 4, row: "HBPM : 12 h si dose prophylactique, 24 h si dose thérapeutique ; reprise 4 h après" }),
  ...alrPair({ name: "Fondaparinux prophylactique", atc: "B01AX05", dose: { op: "<=", mg: 2.5 }, doseLabel: "(≤ 2,5 mg/j)", before: 48, after: 6, row: "Fondaparinux : 48 h si prophylaxie, mesurer l'anti-Xa si thérapeutique ; reprise 6–12 h après (prophylaxie)" }),
  ...alrPair({ name: "Clopidogrel", atc: "B01AC04", before: 168, after: null, row: "Clopidogrel (Plavix) : 7 j ; reprise après retrait du cathéter" }),
  ...alrPair({ name: "Prasugrel", atc: "B01AC22", before: 168, after: 6, row: "Prasugrel (Efient) : 7 j ; reprise 6 h après" }),
  ...alrPair({ name: "Ticagrélor", atc: "B01AC24", before: 120, after: 6, row: "Ticagrélor (Brilique) : 5 j ; reprise 6 h après" }),
  ...alrPair({ name: "Rivaroxaban prophylactique", atc: "B01AF01", dose: { op: "<=", mg: 10 }, doseLabel: "(≤ 10 mg/j)", before: 18, after: 4, row: "Rivaroxaban : 18 h si dose prophylactique, 48 h si dose thérapeutique ; reprise 4–6 h après" }),
  ...alrPair({ name: "Rivaroxaban thérapeutique", atc: "B01AF01", dose: { op: ">", mg: 10 }, doseLabel: "(> 10 mg/j)", before: 48, after: 6, row: "Rivaroxaban : 18 h si dose prophylactique, 48 h si dose thérapeutique ; reprise 4–6 h après" }),
  ...alrPair({ name: "Apixaban", atc: "B01AF02", before: 48, after: 6, row: "Apixaban (prophylaxie) : 24–48 h ; reprise 4–6 h après" }),
  m({
    title: "Dabigatran : délai avant ALR selon la clairance (tableau 13.2)",
    statement: "Dabigatran : 72 h avant une ponction neuraxiale si clairance ≥ 80 mL/min, 3 jours entre 50 et 80, 4 jours en dessous de 50 ; reprise 6 h après.",
    conditions: [drug("B01AE07"), neuraxial, { kind: "value", value: "crcl", op: "<", threshold: 50 }],
    action: { type: "stop_before", hours: 96, target: "anaesthesia" },
    quote: `Dabigatran (Pradaxa) : 72 h si Cl créat ≥ 80 ml/min, 3 j si Cl créat 50–80 ml/min, 4 j si Cl créat ≤ 50 ml/min ; reprise 6 h après (${T132})`,
    question: Q_ALR("dabigatran"),
    chapterTitle: CH13,
    explanations: ["Règle écrite pour la clairance < 50 mL/min (4 jours) ; au-dessus, les délais de 72 h du chapitre 15 et d'ESAIC/ESRA s'appliquent."],
  }),
  m({
    title: "Aspirine et AINS : pas de précaution pour l'ALR (tableau 13.2)",
    statement: "Aspirine et AINS : aucune précaution particulière avant une ALR, quelle que soit la dose d'aspirine.",
    conditions: [drug("M01A"), neuraxial],
    action: { type: "info", text: "AINS seul : pas de délai avant la ponction (vérifier l'absence d'autre antithrombotique).", target: "anaesthesia" },
    quote: `AINS (Brufen, Ponstan) : aucune précaution nécessaire ; acide acétylsalicylique : aucune précaution nécessaire. « Concernant l'acide acétylsalicylique, la tendance actuelle est d'accepter les ALR, quelles que soient les doses. » (${T132})`,
    question: "Do NSAIDs require any interval before a neuraxial puncture according to ESAIC/ESRA 2022?",
    chapterTitle: CH13,
  }),
  m({
    title: "Contre-indications biologiques absolues de l'ALR",
    statement: "ALR contre-indiquée si TP < 50 % ou INR > 1,5, TCA > 40 s ou plaquettes < 50 G/L ; relative entre INR 1,3–1,5, TCA 35–40 s, plaquettes 50–100 G/L.",
    conditions: [{ kind: "value", value: "inr", op: ">", threshold: 1.5 }, { kind: "technique", in: ["neuraxial", "deep_block", "superficial_block"] }],
    action: { type: "requirement", text: "INR > 1,5 : ALR contre-indiquée (absolue).", blocking: true, target: "anaesthesia" },
    quote: "Contre-indications absolues à une anesthésie locorégionale : coagulopathie ou administration récente d'un anticoagulant : TP < 50 % ou INR > 1,5 ; TCA > 40 s ; plaquettes < 50 000/mm³. Infection au point de ponction. Sepsis.",
    question: "What coagulation thresholds (INR, aPTT, platelets) contraindicate neuraxial and peripheral regional anaesthesia according to current European guidelines?",
    chapterTitle: CH13,
  }),
  m({
    title: "Plaquettes < 50 G/L : ALR contre-indiquée",
    statement: "Plaquettes < 50 G/L : ALR contre-indiquée (absolue).",
    conditions: [{ kind: "value", value: "platelets", op: "<", threshold: 50 }, { kind: "technique", in: ["neuraxial", "deep_block", "superficial_block"] }],
    action: { type: "requirement", text: "Plaquettes < 50 G/L : ALR contre-indiquée (absolue).", blocking: true, target: "anaesthesia" },
    quote: "Contre-indications absolues à une anesthésie locorégionale : […] plaquettes < 50 000/mm³.",
    question: "What platelet count is required for neuraxial anaesthesia according to current European guidelines?",
    chapterTitle: CH13,
  }),
];

export const MANUAL_RULES: Proposed[] = [...ANTICOAGULANTS, ...ANTIPLATELETS, ...OTHERS, ...EXAMS, ...ANTECEDENTS, ...ALR_TABLE];
