// Antecedents that need a rule — proposed from the reference guideline of
// each field (ESC 2022, ASH, WFH, ISHLT, FIGO, EULAR, ESAIC). Imported active
// and marked « à relire »: the exact sentence is to be checked in the full
// text, which could not be read from PreOx's build environment.

import type { Condition, Rule, RuleSource } from "./types";

type Proposed = Omit<Rule, "created_at" | "updated_at">;

const id = (n: number) => `5f1c0a10-0006-4000-8000-${String(n).padStart(12, "0")}`;

const source = (organisation: string, title: string, year: number, pmid = "", doi = ""): RuleSource => ({ organisation, title, year, doi, pmid, quote: "", grade: "", level: "int" });

const ESC_2022: RuleSource = { ...source("ESC (avec l'ESAIC)", "2022 ESC Guidelines on cardiovascular assessment and management of patients undergoing non-cardiac surgery (Halvorsen et al., Eur Heart J 2022)", 2022, "36017553", "10.1093/eurheartj/ehac270"), level: "eu" };
const ASH_HIT = source("American Society of Hematology", "ASH 2018 guidelines for management of venous thromboembolism: heparin-induced thrombocytopenia (Cuker et al., Blood Adv 2018;2:3360-3392)", 2018, "30482768", "10.1182/bloodadvances.2018024489");
const WFH_2020 = source("World Federation of Hemophilia", "WFH Guidelines for the Management of Hemophilia, 3rd edition (Srivastava et al., Haemophilia 2020)", 2020);
const VWD_2021 = source("ASH / ISTH / NHF / WFH", "2021 guidelines on the management of von Willebrand disease (Connell et al., Blood Adv 2021)", 2021);
const ESAIC_BLEEDING = { ...source("ESAIC", "Management of severe perioperative bleeding: guidelines from the European Society of Anaesthesiology and Intensive Care, second update 2022 (Kietaibl et al., Eur J Anaesthesiol 2023)", 2023), level: "eu" as const };
const ISHLT_MCS = source("ISHLT", "The 2023 ISHLT guidelines for mechanical circulatory support (Saeed et al., J Heart Lung Transplant 2023)", 2023);
const FIGO_PAS = source("FIGO", "FIGO consensus guidelines on placenta accreta spectrum disorders (2018)", 2018);
const EULAR_APS = { ...source("EULAR", "EULAR recommendations for the management of antiphospholipid syndrome in adults (Tektonidou et al., Ann Rheum Dis 2019)", 2019), level: "eu" as const };
const PROPHYLAXIS_2013 = source("ASHP / IDSA / SIS / SHEA", "Clinical practice guidelines for antimicrobial prophylaxis in surgery (Bratzler et al., Am J Health Syst Pharm 2013)", 2013);

const history = (condition: string, label: string): Condition => ({ kind: "history", condition, present: true, label });

const rule = (n: number, p: Pick<Proposed, "title" | "statement" | "conditions" | "action" | "source" | "question"> & Partial<Proposed>): Proposed => ({
  id: id(n),
  divergences: [],
  explanations: [],
  status: "draft",
  version: 1,
  verified_at: null,
  review_at: null,
  tool: "PreOx (proposition à vérifier sur le texte intégral)",
  ...p,
});

export const CONDITION_RULES: Proposed[] = [
  rule(1, {
    title: "Pacemaker ou défibrillateur : contrôle récent et programmation",
    statement: "Porteur d'un stimulateur ou d'un défibrillateur : dernier contrôle, dépendance, programmation ; défibrillateur désactivé (antitachycardie) si bistouri monopolaire au-dessus de l'ombilic, avec défibrillation externe disponible et monitorage continu.",
    conditions: [history("pacemaker", "Pacemaker / DAI")],
    action: { type: "requirement", text: "Carte du dispositif et dernier contrôle ; plan avec le cardiologue (aimant, reprogrammation, désactivation des thérapies du DAI) ; bipolaire ou monopolaire loin du boîtier ; palettes en place.", blocking: false, target: "both" },
    source: ESC_2022,
    question: "According to the ESC 2022 non-cardiac surgery guidelines and the HRS/ASA expert consensus, how should pacemakers and ICDs be managed perioperatively (interrogation, reprogramming, deactivation of ICD therapies)?",
  }),
  rule(2, {
    title: "Assistance ventriculaire (LVAD) : centre expert",
    statement: "Assistance ventriculaire gauche : prise en charge coordonnée avec l'équipe d'assistance (anticoagulation, précharge, pression artérielle moyenne, pas de compressions thoraciques externes sans avis).",
    conditions: [history("lvad", "Assistance ventriculaire (LVAD)")],
    action: { type: "requirement", text: "Avis de l'équipe d'assistance ; plan d'anticoagulation ; PAM par Doppler ou artère ; éviter l'hypovolémie et l'augmentation des résistances pulmonaires.", blocking: true, target: "both" },
    source: ISHLT_MCS,
    question: "According to the 2023 ISHLT guidelines, how should patients with a durable LVAD be managed for non-cardiac surgery (anticoagulation, monitoring, haemodynamic goals)?",
  }),
  rule(3, {
    title: "Trouble de l'hémostase : plan hématologique avant le geste",
    statement: "Trouble de l'hémostase connu : bilan et plan de correction avec l'hématologue avant une chirurgie ou une ALR neuraxiale.",
    conditions: [history("bleeding_disorder", "Trouble de l'hémostase")],
    action: { type: "requirement", text: "Plan hématologique écrit (facteurs, desmopressine, acide tranexamique) ; ALR neuraxiale seulement après correction.", blocking: true, target: "both" },
    source: ESAIC_BLEEDING,
    question: "According to the ESAIC 2022 guidelines on perioperative bleeding, how should patients with a known inherited bleeding disorder be assessed and prepared before surgery?",
  }),
  rule(4, {
    title: "Maladie de Willebrand : plan de traitement avant le geste",
    statement: "Maladie de Willebrand : type et taux de base ; desmopressine (type 1 répondeur) ou concentré de facteur Willebrand ; acide tranexamique ; objectifs de taux selon la chirurgie.",
    conditions: [history("von_willebrand", "Maladie de Willebrand")],
    action: { type: "requirement", text: "Plan de l'hématologue : test à la desmopressine ou concentré VWF (objectif ≥ 0,50 UI/mL, plus haut pour la chirurgie majeure), acide tranexamique ; ALR neuraxiale selon les taux.", blocking: true, target: "both" },
    source: VWD_2021,
    question: "According to the 2021 ASH/ISTH/NHF/WFH guidelines, what VWF and FVIII activity targets are recommended for major and minor surgery, and when can neuraxial anaesthesia be performed?",
  }),
  rule(5, {
    title: "Hémophilie : substitution en facteur dans un centre de référence",
    statement: "Hémophilie : chirurgie programmée dans un centre avec laboratoire et hématologue ; substitution en facteur VIII ou IX (ou émicizumab) selon un plan écrit ; pas d'injection intramusculaire.",
    conditions: [history("hemophilia", "Hémophilie")],
    action: { type: "requirement", text: "Plan écrit du centre d'hémophilie (facteur, dosage des inhibiteurs, cible de taux, durée) ; pas d'AINS ni d'IM.", blocking: true, target: "both" },
    source: WFH_2020,
    question: "According to the WFH 2020 guidelines, how should factor replacement be planned for surgery in haemophilia A and B (target levels, duration, inhibitor screening)?",
  }),
  rule(6, {
    title: "Antécédent de TIH : pas d'héparine",
    statement: "Antécédent de thrombopénie induite par l'héparine : pas d'héparine pour la thromboprophylaxie ; fondaparinux ou anticoagulant oral direct.",
    conditions: [history("hit_history", "Antécédent de TIH")],
    action: { type: "requirement", text: "Pas d'HNF ni d'HBPM (y compris rinçages) ; thromboprophylaxie par fondaparinux ; chirurgie cardiaque : avis spécialisé (anticorps).", blocking: false, target: "both" },
    source: ASH_HIT,
    question: "According to the ASH 2018 HIT guidelines, how should venous thromboembolism prophylaxis and cardiac surgery be managed in patients with a history of HIT?",
  }),
  rule(7, {
    title: "Syndrome des antiphospholipides : risque thrombotique élevé",
    statement: "SAPL : risque thrombotique élevé ; relais de l'antivitamine K discuté avec l'hématologue ; les anticoagulants oraux directs sont déconseillés (triple positivité).",
    conditions: [history("antiphospholipid", "Syndrome des antiphospholipides")],
    action: { type: "info", text: "Relais héparinique en règle ; thromboprophylaxie prolongée ; TCA faussement allongé (anticoagulant lupique) : suivre l'anti-Xa.", target: "both" },
    source: EULAR_APS,
    question: "According to the EULAR 2019 APS recommendations, how should anticoagulation be bridged around surgery in antiphospholipid syndrome, and are DOACs appropriate?",
  }),
  rule(8, {
    title: "Portage de BMR ou BHRe : antibioprophylaxie adaptée",
    statement: "Portage de SARM ou d'une bactérie multirésistante : décolonisation et antibioprophylaxie adaptée (vancomycine associée pour le SARM) ; précautions de contact.",
    conditions: [history("mdro", "Portage de BMR / BHRe")],
    action: { type: "info", text: "SARM : décolonisation (mupirocine, chlorhexidine) et vancomycine 15 mg/kg associée à la céfazoline ; BHRe : avis infectiologique ; précautions contact.", target: "surgery" },
    source: PROPHYLAXIS_2013,
    question: "According to current surgical prophylaxis guidelines, how should antibiotic prophylaxis be adapted for MRSA carriers and patients colonised with multidrug-resistant Gram-negative bacteria?",
  }),
  rule(9, {
    title: "Infarctus de moins de 3 mois : différer la chirurgie programmée",
    statement: "Infarctus récent : différer une chirurgie non urgente ; avis cardiologique et évaluation de l'ischémie résiduelle.",
    conditions: [history("recent_mi", "Infarctus < 3 mois"), { kind: "surgery", attribute: "urgency", in: ["elective"] }],
    action: { type: "requirement", text: "Chirurgie programmée différée (au moins 2 mois, idéalement 3) ; avis cardiologique ; antiagrégants poursuivis.", blocking: true, target: "surgery" },
    source: ESC_2022,
    question: "According to the ESC 2022 non-cardiac surgery guidelines, how long should elective surgery be deferred after an acute myocardial infarction?",
  }),
  rule(10, {
    title: "Stent coronaire : date de pose, type et antiagrégants",
    statement: "Porteur d'un stent : date de pose, contexte (syndrome coronarien aigu ou non) et double antiagrégation ; pas d'arrêt de l'aspirine ; délai minimal avant chirurgie programmée selon le type de pose.",
    conditions: [history("coronary_stent", "Stent coronaire")],
    action: { type: "info", text: "Préciser la date et le contexte de pose ; aspirine poursuivie ; arrêt du P2Y12 seulement après la durée minimale (6 mois, 12 mois après un SCA) et avec le cardiologue.", target: "both" },
    source: ESC_2022,
    question: "According to the ESC 2022 guidelines, what is the minimum delay between coronary stenting (elective PCI or ACS) and elective non-cardiac surgery, and how should antiplatelet therapy be managed?",
  }),
  rule(11, {
    title: "Thrombopénie : numération récente avant le geste",
    statement: "Thrombopénie connue : numération plaquettaire récente ; seuils de 50 G/L pour la chirurgie et de 80 G/L pour une ALR neuraxiale (usages courants).",
    conditions: [history("thrombocytopenia", "Thrombopénie")],
    action: { type: "exam", exam: "Numération plaquettaire", withinDays: 7 },
    source: ESAIC_BLEEDING,
    question: "According to ESAIC and ESRA guidance, what platelet count thresholds are recommended for major surgery and for neuraxial anaesthesia?",
  }),
  rule(12, {
    title: "Placenta accreta : centre expert et préparation transfusionnelle",
    statement: "Spectre du placenta accreta : accouchement programmé dans un centre expert, équipe multidisciplinaire, produits sanguins disponibles, récupération peropératoire, voies veineuses de gros calibre et artère.",
    conditions: [history("placenta_accreta", "Placenta prævia / accreta")],
    action: { type: "requirement", text: "Centre expert, césarienne programmée (34–36 SA), réserve de CGR, plasma, plaquettes et fibrinogène, cell saver, cathéters de gros calibre, artère ; anesthésie générale ou combinée selon le cas.", blocking: true, target: "both" },
    source: FIGO_PAS,
    question: "According to FIGO 2018 and RCOG 2018 guidance, how should delivery be planned for placenta accreta spectrum (centre, timing, blood products, anaesthetic technique)?",
  }),
];
