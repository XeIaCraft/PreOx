// Preoperative tests suggested from the patient and the procedure — a
// built-in starting point, displayed with its source so it can be checked:
// - NICE NG45 (2016) "Routine preoperative tests for elective surgery",
//   by surgery grade × ASA class (the grid the Belgian KCE report on
//   preoperative tests built on);
// - ESC 2022 guidelines on non-cardiac surgery (ECG, biomarkers,
//   echocardiography, haemoglobin).
// Your own rules (action "exam") are shown next to these, and a rule of a
// higher level (Belgian institution or society) is what you should follow.

import { anyOf, has, type Conditions, type Substances } from "./history";
import type { ConsultationState } from "./dossier";
import type { PatientTreatment } from "./rules/types";
import { treatmentMatches } from "./medications";
import { fold } from "./catalog";

export type ExamCode =
  | "fbc"
  | "renal"
  | "haemostasis"
  | "ecg"
  | "hba1c"
  | "pregnancy"
  | "troponin"
  | "bnp"
  | "echo"
  | "lung"
  | "group"
  | "iron"
  | "stress"
  | "coronary"
  | "carotid"
  | "tavi_ct"
  | "dental"
  | "staph"
  | "pft"
  | "cpet"
  | "vq"
  | "abg"
  | "device"
  | "sleep"
  | "albumin"
  | "micronutrients"
  | "larynx";
export type ExamStrength = "recommended" | "consider";

export const EXAM_LABELS: Record<ExamCode, string> = {
  fbc: "Hémogramme",
  renal: "Créatinine, ionogramme (fonction rénale)",
  haemostasis: "Bilan d'hémostase (TP/INR, TCA)",
  ecg: "ECG",
  hba1c: "HbA1c",
  pregnancy: "Test de grossesse",
  troponin: "Troponine hs (avant, puis J1 et J2)",
  bnp: "BNP / NT-proBNP",
  echo: "Échocardiographie",
  lung: "EFR / gazométrie ou avis",
  group: "Groupe sanguin et RAI",
  iron: "Bilan martial (ferritine, saturation de la transferrine, CRP)",
  stress: "Imagerie de stress (échographie de stress, scintigraphie ou IRM de perfusion)",
  coronary: "Coronarographie (ou coroscanner si probabilité faible)",
  carotid: "Écho-doppler des troncs supra-aortiques",
  tavi_ct: "Angioscanner (anneau aortique, axes ilio-fémoraux)",
  dental: "Bilan dentaire (± panoramique) et soins des foyers infectieux",
  staph: "Dépistage du portage nasal de S. aureus (± décolonisation)",
  pft: "EFR : spirométrie et DLCO",
  cpet: "Épreuve d'effort cardio-respiratoire (VO₂max)",
  vq: "Scintigraphie de perfusion pulmonaire (fonction séparée)",
  abg: "Gazométrie artérielle",
  device: "Contrôle du stimulateur ou du défibrillateur",
  sleep: "Polygraphie ou polysomnographie",
  albumin: "Albumine et évaluation nutritionnelle",
  micronutrients: "Fer, B12, folates, vitamine D (bilan bariatrique)",
  larynx: "Laryngoscopie (mobilité des cordes vocales)",
};

export interface ExamSource {
  label: string;
  /** Short reference shown on the badge. */
  short: string;
  level: "eu" | "int" | "book";
}

export const NICE_NG45: ExamSource = { label: "NICE NG45 (2016), tests préopératoires en chirurgie programmée", short: "NICE 2016", level: "int" };
export const ESC_2022: ExamSource = { label: "ESC 2022, évaluation cardiovasculaire en chirurgie non cardiaque", short: "ESC 2022", level: "eu" };
export const ESAIC_2018: ExamSource = { label: "ESAIC 2018, évaluation préopératoire de l'adulte en chirurgie non cardiaque (De Hert et al., Eur J Anaesthesiol)", short: "ESAIC 2018", level: "eu" };
export const ESC_VHD_2021: ExamSource = { label: "ESC/EACTS 2021, prise en charge des valvulopathies (Vahanian et al., Eur Heart J)", short: "ESC/EACTS 2021", level: "eu" };
export const ESC_REVASC_2018: ExamSource = { label: "ESC/EACTS 2018, revascularisation myocardique (Neumann et al., Eur Heart J)", short: "ESC/EACTS 2018", level: "eu" };
export const ESC_IE_2023: ExamSource = { label: "ESC 2023, endocardite infectieuse (Delgado et al., Eur Heart J)", short: "ESC 2023 EI", level: "eu" };
export const ERS_ESTS_2009: ExamSource = { label: "ERS/ESTS 2009, aptitude à la résection pulmonaire (Brunelli et al., Eur Respir J)", short: "ERS/ESTS 2009", level: "eu" };
export const ESPEN_2017: ExamSource = { label: "ESPEN 2017, nutrition clinique en chirurgie (Weimann et al., Clin Nutr)", short: "ESPEN 2017", level: "eu" };
export const MUNOZ_2017: ExamSource = { label: "Consensus international 2017, anémie et carence martiale périopératoires (Muñoz et al., Anaesthesia)", short: "PBM 2017", level: "int" };
export const WHO_SSI_2016: ExamSource = { label: "OMS 2016, prévention de l'infection du site opératoire", short: "OMS 2016", level: "int" };
export const HRS_ASA_2011: ExamSource = { label: "HRS/ASA 2011, dispositifs cardiaques implantables en périopératoire (Crossley et al., Heart Rhythm)", short: "HRS/ASA 2011", level: "int" };
export const SASM_2016: ExamSource = { label: "SASM 2016, dépistage et évaluation du SAOS avant chirurgie (Chung et al., Anesth Analg)", short: "SASM 2016", level: "int" };
export const ASMBS_2019: ExamSource = { label: "AACE/TOS/ASMBS/OMA/ASA 2019, prise en charge périopératoire de la chirurgie bariatrique (Mechanick et al.)", short: "ASMBS 2019", level: "int" };
export const AAOHNS_2013: ExamSource = { label: "AAO-HNS 2013, voix et chirurgie thyroïdienne (Chandrasekhar et al., Otolaryngol Head Neck Surg)", short: "AAO-HNS 2013", level: "int" };
export const MANUAL_2020: ExamSource = { label: "Manuel pratique d'anesthésie, 4e éd. 2020, chapitre 15 (tableau 15.1) — ouvrage de référence", short: "Manuel 2020", level: "book" };
export const MANUAL_2020_POSITION: ExamSource = { label: "Manuel pratique d'anesthésie, 4e éd. 2020, chapitre 19 (position assise) — ouvrage de référence", short: "Manuel 2020", level: "book" };
export const MANUAL_2020_NEURO: ExamSource = { label: "Manuel pratique d'anesthésie, 4e éd. 2020, chapitre 29 (maladies neuromusculaires) — ouvrage de référence", short: "Manuel 2020", level: "book" };
export const MANUAL_2020_SPECIALTIES: ExamSource = { label: "Manuel pratique d'anesthésie, 4e éd. 2020, chapitres 36 à 40 (obstétrique, pédiatrie, orthopédie) — ouvrage de référence", short: "Manuel 2020", level: "book" };

/**
 * Work-up usual for a family of procedures, each item tied to the guideline
 * it comes from. A procedure of the catalogue points to one profile
 * (Paramètres › Interventions), editable.
 */
export type SurgeryExamProfile =
  | "cardiac_cpb"
  | "cardiac_valve"
  | "tavi"
  | "lung_resection"
  | "pneumonectomy"
  | "major_vascular"
  | "bariatric"
  | "major_digestive"
  | "hepatobiliary"
  | "neurosurgery"
  | "arthroplasty"
  | "thyroid"
  | "obstetric";

interface ProfileItem {
  code: ExamCode;
  strength: ExamStrength;
  text: string;
  source: ExamSource;
}

const CORONARY_BEFORE_VALVE: ProfileItem = {
  code: "coronary",
  strength: "recommended",
  text: "avant chirurgie valvulaire : antécédent coronarien, suspicion d'ischémie, dysfonction VG, homme > 40 ans, femme ménopausée ou ≥ 1 facteur de risque (coroscanner si probabilité faible)",
  source: ESC_VHD_2021,
};
const DENTAL_BEFORE_VALVE: ProfileItem = { code: "dental", strength: "recommended", text: "avant implantation d'une prothèse valvulaire : foyers dentaires éradiqués au moins 2 semaines avant, sauf urgence", source: ESC_IE_2023 };
const STAPH_CARDIAC: ProfileItem = { code: "staph", strength: "recommended", text: "chirurgie cardiaque ou valve percutanée programmée : dépister le portage nasal de S. aureus et traiter les porteurs", source: ESC_IE_2023 };
const GROUP_BLEEDING: ProfileItem = { code: "group", strength: "recommended", text: "intervention potentiellement hémorragique", source: MANUAL_2020 };

export const SURGERY_EXAM_PROFILES: Record<SurgeryExamProfile, { label: string; items: ProfileItem[] }> = {
  cardiac_cpb: {
    label: "Chirurgie cardiaque sous CEC (pontages)",
    items: [
      { code: "echo", strength: "recommended", text: "fonction ventriculaire et valves avant chirurgie cardiaque", source: ESC_REVASC_2018 },
      { code: "coronary", strength: "recommended", text: "anatomie coronaire (bilan du pontage)", source: ESC_REVASC_2018 },
      { code: "carotid", strength: "recommended", text: "avant pontage : recommandé si AVC/AIT ou souffle carotidien ; à envisager si atteinte pluritronculaire, artériopathie ou âge > 70 ans", source: ESC_REVASC_2018 },
      STAPH_CARDIAC,
      GROUP_BLEEDING,
      { code: "haemostasis", strength: "recommended", text: "chirurgie sous CEC (héparinisation, risque hémorragique)", source: MANUAL_2020 },
    ],
  },
  cardiac_valve: {
    label: "Chirurgie valvulaire",
    items: [
      { code: "echo", strength: "recommended", text: "sévérité et mécanisme de la valvulopathie, fonction VG, pressions pulmonaires", source: ESC_VHD_2021 },
      CORONARY_BEFORE_VALVE,
      DENTAL_BEFORE_VALVE,
      STAPH_CARDIAC,
      GROUP_BLEEDING,
      { code: "haemostasis", strength: "recommended", text: "chirurgie sous CEC (héparinisation, risque hémorragique)", source: MANUAL_2020 },
    ],
  },
  tavi: {
    label: "TAVI et valves percutanées",
    items: [
      { code: "echo", strength: "recommended", text: "sévérité de la sténose, fonction VG", source: ESC_VHD_2021 },
      { code: "tavi_ct", strength: "recommended", text: "angioscanner : taille de l'anneau, voies d'abord (examen de référence avant TAVI)", source: ESC_VHD_2021 },
      { ...CORONARY_BEFORE_VALVE, text: "évaluation coronaire avant TAVI (coronarographie ou coroscanner)" },
      DENTAL_BEFORE_VALVE,
      STAPH_CARDIAC,
    ],
  },
  lung_resection: {
    label: "Résection pulmonaire",
    items: [
      { code: "pft", strength: "recommended", text: "VEMS et DLCO chez tous les candidats à une résection pulmonaire (valeurs postopératoires prédites)", source: ERS_ESTS_2009 },
      { code: "cpet", strength: "consider", text: "si VEMS ou DLCO < 80 % de la théorique : épreuve d'effort avec VO₂max", source: ERS_ESTS_2009 },
      { code: "ecg", strength: "recommended", text: "évaluation cardiologique préalable à toute résection pulmonaire", source: ERS_ESTS_2009 },
    ],
  },
  pneumonectomy: {
    label: "Pneumonectomie",
    items: [
      { code: "pft", strength: "recommended", text: "VEMS et DLCO chez tous les candidats à une résection pulmonaire (valeurs postopératoires prédites)", source: ERS_ESTS_2009 },
      { code: "cpet", strength: "consider", text: "si VEMS ou DLCO < 80 % de la théorique : épreuve d'effort avec VO₂max", source: ERS_ESTS_2009 },
      { code: "vq", strength: "consider", text: "pneumonectomie : scintigraphie de perfusion pour estimer la fonction postopératoire", source: ERS_ESTS_2009 },
      { code: "ecg", strength: "recommended", text: "évaluation cardiologique préalable à toute résection pulmonaire", source: ERS_ESTS_2009 },
      { code: "echo", strength: "consider", text: "pneumonectomie : pressions pulmonaires, fonction ventriculaire droite", source: ERS_ESTS_2009 },
    ],
  },
  major_vascular: {
    label: "Chirurgie aortique ou vasculaire majeure",
    items: [
      GROUP_BLEEDING,
      { code: "renal", strength: "recommended", text: "fonction rénale avant chirurgie aortique ou produit de contraste", source: ESAIC_2018 },
    ],
  },
  bariatric: {
    label: "Chirurgie bariatrique",
    items: [
      { code: "micronutrients", strength: "recommended", text: "bilan nutritionnel et vitaminique avant chirurgie bariatrique", source: ASMBS_2019 },
      { code: "hba1c", strength: "recommended", text: "glycémie et HbA1c avant chirurgie bariatrique", source: ASMBS_2019 },
      { code: "sleep", strength: "consider", text: "dépistage du SAOS avant chirurgie bariatrique ; examen du sommeil si dépistage positif", source: ASMBS_2019 },
    ],
  },
  major_digestive: {
    label: "Chirurgie digestive majeure ou carcinologique",
    items: [
      { code: "albumin", strength: "consider", text: "évaluation nutritionnelle avant chirurgie majeure (albumine pour le pronostic)", source: ESPEN_2017 },
      GROUP_BLEEDING,
    ],
  },
  hepatobiliary: {
    label: "Chirurgie hépatobiliaire et pancréatique",
    items: [
      { code: "haemostasis", strength: "recommended", text: "intervention hépatobiliaire", source: MANUAL_2020 },
      { code: "albumin", strength: "consider", text: "évaluation nutritionnelle avant chirurgie majeure (albumine pour le pronostic)", source: ESPEN_2017 },
      GROUP_BLEEDING,
    ],
  },
  neurosurgery: {
    label: "Neurochirurgie",
    items: [
      { code: "haemostasis", strength: "recommended", text: "intervention neurochirurgicale", source: MANUAL_2020 },
      GROUP_BLEEDING,
    ],
  },
  arthroplasty: {
    label: "Prothèse articulaire et orthopédie majeure",
    items: [
      { code: "fbc", strength: "recommended", text: "perte sanguine attendue > 500 mL : hémoglobine au moins 3–4 semaines avant pour corriger une anémie", source: MUNOZ_2017 },
      { code: "iron", strength: "consider", text: "si anémie ou perte sanguine attendue importante : rechercher une carence martiale et la traiter avant", source: MUNOZ_2017 },
      { code: "staph", strength: "consider", text: "chirurgie orthopédique : décolonisation des porteurs nasaux de S. aureus", source: WHO_SSI_2016 },
      GROUP_BLEEDING,
    ],
  },
  thyroid: {
    label: "Chirurgie thyroïdienne ou parathyroïdienne",
    items: [{ code: "larynx", strength: "consider", text: "examen des cordes vocales si dysphonie, antécédent de chirurgie cervicale ou cancer avec extension extrathyroïdienne", source: AAOHNS_2013 }],
  },
  obstetric: {
    label: "Obstétrique (césarienne, hémorragie)",
    items: [
      { code: "fbc", strength: "recommended", text: "grossesse, intervention potentiellement hémorragique", source: MANUAL_2020 },
      { code: "group", strength: "recommended", text: "grossesse, intervention potentiellement hémorragique", source: MANUAL_2020 },
    ],
  },
};

export interface ExamRecommendation {
  code: ExamCode;
  label: string;
  strength: ExamStrength;
  reasons: { text: string; source: ExamSource }[];
}

export interface ExamResult {
  recommendations: ExamRecommendation[];
  /** What must be filled for the suggestion to be complete. */
  missing: string[];
}

export interface ExamInput {
  consultation: ConsultationState;
  /** Chosen or suggested ASA class. */
  asa: number | null;
  /** METs from DASI when the questionnaire is complete. */
  mets?: number;
  /** Work-up profile of the planned procedure (catalogue), with its name for the reasons. */
  surgeryProfile?: SurgeryExamProfile;
  /** STOP-BANG score when complete. */
  stopBang?: number;
}

const isAnticoagulated = (t: PatientTreatment[]) => t.some((x) => treatmentMatches(x, "B01AA") || treatmentMatches(x, "B01AF") || treatmentMatches(x, "B01AE"));

/** Known cardiovascular disease (ESC 2022). */
function cardiovascularDisease(c: Conditions): boolean | undefined {
  return anyOf(c, ["coronary", "heart_failure", "stroke", "pad", "valve", "arrhythmia"]);
}

/** Cardiovascular risk factors (ESC 2022): hypertension, dyslipidaemia, diabetes, smoking, CKD. */
function riskFactors(c: Conditions, s: Substances): boolean | undefined {
  if (s.tobacco === "current") return true;
  return anyOf(c, ["hypertension", "dyslipidemia", "diabetes_oral", "diabetes_insulin", "ckd", "dialysis"]);
}

export function recommendExams({ consultation: c, asa, mets, surgeryProfile, stopBang }: ExamInput): ExamResult {
  const recs = new Map<ExamCode, ExamRecommendation>();
  const missing: string[] = [];
  const add = (code: ExamCode, strength: ExamStrength, text: string, source: ExamSource) => {
    const r = recs.get(code);
    if (!r) recs.set(code, { code, label: EXAM_LABELS[code], strength, reasons: [{ text, source }] });
    else {
      // The same reason from the same source, said again (profile + bleeding risk), adds nothing.
      if (r.reasons.some((x) => x.source === source && (x.text.includes(text) || text.includes(x.text)))) return;
      r.reasons.push({ text, source });
      if (strength === "recommended") r.strength = "recommended";
    }
  };

  const grade = c.surgery.kce;
  const risk = c.surgery.cardiacRisk;
  const age = c.patient.age;
  const cond = c.conditions;
  const diabetic = anyOf(cond, ["diabetes_oral", "diabetes_insulin"]);
  const cvd = cardiovascularDisease(cond);
  const rf = riskFactors(cond, c.substances);
  const renalDisease = anyOf(cond, ["ckd", "dialysis"]);
  const respiratory = anyOf(cond, ["copd", "asthma", "home_o2", "osa"]);
  // "At risk of acute kidney injury" (NICE): CKD, diabetes, heart failure, age ≥ 65, nephrotoxic drugs…
  const akiRisk = renalDisease === true || diabetic === true || has(cond, "heart_failure") === true || (age !== undefined && age >= 65);
  const high = asa !== null && asa >= 3;

  if (!grade) missing.push("Grade de la chirurgie (mineure, intermédiaire, majeure)");
  if (!risk) missing.push("Risque cardiaque de la chirurgie (ESC)");
  if (asa === null) missing.push("Classe ASA");

  // --- NICE NG45: surgery grade × ASA -----------------------------------------
  if (grade && asa !== null) {
    const g = grade === "minor" ? "mineure" : grade === "intermediate" ? "intermédiaire" : "majeure";
    const ctx = `chirurgie ${g}, ASA ${["I", "II", "III", "IV", "V"][asa - 1] ?? asa}`;
    if (grade === "minor") {
      if (high) {
        add("ecg", "consider", `${ctx} : si pas d'ECG dans les 12 derniers mois`, NICE_NG45);
        if (akiRisk) add("renal", "consider", `${ctx}, risque d'insuffisance rénale aiguë`, NICE_NG45);
      }
    } else if (grade === "intermediate") {
      if (high) {
        add("ecg", "recommended", ctx, NICE_NG45);
        add("renal", "recommended", ctx, NICE_NG45);
        if (cvd || renalDisease) add("fbc", "consider", `${ctx}, maladie cardiovasculaire ou rénale`, NICE_NG45);
        if (respiratory) add("lung", "consider", `${ctx}, pathologie respiratoire : avis d'un anesthésiste senior`, NICE_NG45);
      } else {
        if (asa === 2 && (cvd || renalDisease || diabetic)) add("ecg", "consider", `${ctx}, comorbidité cardiovasculaire, rénale ou diabète`, NICE_NG45);
        if (akiRisk) add("renal", "consider", `${ctx}, risque d'insuffisance rénale aiguë`, NICE_NG45);
      }
    } else {
      add("fbc", "recommended", ctx, NICE_NG45);
      if (asa >= 2) {
        add("renal", "recommended", ctx, NICE_NG45);
        add("ecg", "recommended", ctx, NICE_NG45);
      } else {
        if (akiRisk) add("renal", "consider", `${ctx}, risque d'insuffisance rénale aiguë`, NICE_NG45);
        if (age !== undefined && age > 65) add("ecg", "consider", `${ctx}, plus de 65 ans sans ECG dans les 12 derniers mois`, NICE_NG45);
      }
      if (high && respiratory) add("lung", "consider", `${ctx}, pathologie respiratoire : avis d'un anesthésiste senior`, NICE_NG45);
    }
    if (grade !== "minor" && high && (has(cond, "cirrhosis") || has(cond, "bleeding_disorder"))) add("haemostasis", "consider", `${ctx}, hépatopathie ou trouble de l'hémostase`, NICE_NG45);
  }
  if (has(cond, "bleeding_disorder")) add("haemostasis", "consider", "trouble de l'hémostase connu", NICE_NG45);
  if (isAnticoagulated(c.treatments)) add("haemostasis", "consider", "patient anticoagulé : selon la molécule et la gestion prévue", NICE_NG45);
  if (diabetic) add("hba1c", "recommended", "diabète, si pas d'HbA1c dans les 3 derniers mois", NICE_NG45);
  if (c.patient.sex === "F" && age !== undefined && age >= 12 && age <= 55 && has(cond, "pregnancy") !== true) add("pregnancy", "consider", "femme en âge de procréer : proposer, avec son accord", NICE_NG45);

  // --- ESC 2022 (non-cardiac surgery only: cardiac surgery has its own work-up, below) ---
  const nonCardiac = c.surgery.category !== "F";
  if (nonCardiac && (risk === "intermediate" || risk === "high")) {
    const r = risk === "high" ? "chirurgie à haut risque" : "chirurgie à risque intermédiaire";
    if (cvd || rf) add("ecg", "recommended", `${r}, ${cvd ? "maladie cardiovasculaire" : "facteurs de risque cardiovasculaire"}`, ESC_2022);
    const targeted = cvd || rf || (age !== undefined && age >= 65);
    if (targeted) {
      const who = cvd ? "maladie cardiovasculaire" : rf ? "facteurs de risque" : "65 ans ou plus";
      add("troponin", "recommended", `${r}, ${who}`, ESC_2022);
      add("bnp", "consider", `${r}, ${who}`, ESC_2022);
    }
    add("fbc", "recommended", `${r} : dosage de l'hémoglobine`, ESC_2022);
  }
  if (nonCardiac && risk === "high") {
    const poor = mets !== undefined && mets < 4;
    if (poor || has(cond, "murmur")) add("echo", "recommended", `chirurgie à haut risque${poor ? ", capacité fonctionnelle < 4 METs" : ""}${has(cond, "murmur") ? ", souffle" : ""}`, ESC_2022);
  }
  if (has(cond, "murmur") && (has(cond, "heart_failure") || risk !== "low")) add("echo", "consider", "souffle non exploré", ESC_2022);
  if (nonCardiac && risk === "high" && mets !== undefined && mets < 4 && (cvd || rf))
    add("stress", "recommended", "chirurgie à haut risque programmée, capacité fonctionnelle < 4 METs et risque clinique élevé", ESC_2022);
  if (nonCardiac && risk && risk !== "low" && (has(cond, "valve") || has(cond, "aortic_stenosis")))
    add("echo", "recommended", "valvulopathie connue ou suspectée avant chirurgie programmée à risque intermédiaire ou élevé", ESC_2022);
  if (has(cond, "heart_failure") && risk && risk !== "low") add("echo", "consider", "insuffisance cardiaque : fonction VG avant chirurgie à risque intermédiaire ou élevé, sans échographie récente", ESC_2022);
  // Sitting position (not the semi-seated beach chair): paradoxical air embolism through a patent foramen ovale.
  const position = fold(c.surgery.position ?? "");
  if (/(?<!semi-)assis/.test(position) || /position assise/.test(fold(c.surgery.name)))
    add("echo", /\bou\b|selon/.test(position) ? "consider" : "recommended", "position assise prévue : recherche d'un foramen ovale perméable (épreuve de contraste), risque d'embolie gazeuse paradoxale", MANUAL_2020_POSITION);
  if (has(cond, "pulmonary_hypertension")) add("echo", "recommended", "hypertension pulmonaire : pressions pulmonaires et fonction VD récentes ; avis du centre de référence", ESC_2022);

  // --- The procedure's own work-up (catalogue profile) ------------------------------
  if (surgeryProfile) {
    const profile = SURGERY_EXAM_PROFILES[surgeryProfile];
    for (const item of profile?.items ?? []) add(item.code, item.strength, `${profile.label} — ${item.text}`, item.source);
  }
  if (c.surgery.bleedingRisk === "high") {
    add("group", "recommended", "intervention potentiellement hémorragique", MANUAL_2020);
    add("fbc", "recommended", "risque hémorragique important", ESAIC_2018);
    if (!c.surgery.emergency) add("iron", "consider", "perte sanguine attendue importante : carence martiale à traiter avant", MUNOZ_2017);
  }

  // --- The patient's own conditions ----------------------------------------------------
  if (has(cond, "pacemaker")) add("device", "recommended", "stimulateur ou DAI : dernier contrôle (< 12 mois stimulateur, < 6 mois DAI), dépendance, conduite peropératoire (aimant, désactivation)", HRS_ASA_2011);
  if (has(cond, "anemia")) add("iron", "consider", "anémie : en rechercher la cause (carence martiale) et la traiter avant une chirurgie programmée", MUNOZ_2017);
  if (renalDisease) add("renal", "recommended", "insuffisance rénale : Na⁺, K⁺, créatinine", MANUAL_2020);
  if (c.treatments.some((t) => treatmentMatches(t, "C03"))) add("renal", "recommended", "traitement diurétique : Na⁺, K⁺, créatinine", MANUAL_2020);
  if (c.treatments.some((t) => treatmentMatches(t, "H02AB"))) add("renal", "consider", "corticothérapie : glycémie, Na⁺, K⁺", MANUAL_2020);
  if (has(cond, "cirrhosis")) {
    add("haemostasis", "recommended", "cirrhose", MANUAL_2020);
    add("fbc", "recommended", "cirrhose (plaquettes)", MANUAL_2020);
  }
  if (anyOf(cond, ["chemotherapy", "cancer", "sickle_cell"]) === true) add("fbc", "recommended", "néoplasie, chimiothérapie ou hémoglobinopathie", MANUAL_2020);
  if (has(cond, "malnutrition")) add("albumin", "recommended", "dénutrition : évaluation et prise en charge nutritionnelles avant chirurgie majeure", ESPEN_2017);
  if (has(cond, "bariatric_history")) add("micronutrients", "consider", "antécédent de chirurgie bariatrique : carences (fer, B12, folates, vitamine D)", ASMBS_2019);
  if (has(cond, "copd") && ((c.patient.spo2 !== undefined && c.patient.spo2 < 92) || has(cond, "home_o2"))) add("abg", "consider", "BPCO sévère ou hypoxémie", MANUAL_2020);
  if (anyOf(cond, ["myotonic_dystrophy", "duchenne"]) === true) {
    add("ecg", "recommended", "dystrophie myotonique ou myopathie de Duchenne : troubles conductifs, cardiomyopathie", MANUAL_2020_NEURO);
    add("echo", "consider", "dystrophie myotonique ou myopathie de Duchenne : cardiomyopathie", MANUAL_2020_NEURO);
    add("pft", "consider", "myopathie : syndrome restrictif", MANUAL_2020_NEURO);
  }
  if (has(cond, "myasthenia") && c.surgery.incision && c.surgery.incision !== "peripheral") add("pft", "consider", "myasthénie et chirurgie thoracique ou abdominale haute : capacité vitale (ventilation postopératoire si < 40 ml/kg)", MANUAL_2020_NEURO);
  if (has(cond, "preeclampsia")) {
    add("fbc", "recommended", "prééclampsie : plaquettes (HELLP), à contrôler avant toute ALR", MANUAL_2020_SPECIALTIES);
    add("haemostasis", "recommended", "prééclampsie : TP, TCA et fibrinogène avant toute ALR", MANUAL_2020_SPECIALTIES);
    add("renal", "recommended", "prééclampsie : fonction rénale, acide urique, tests hépatiques", MANUAL_2020_SPECIALTIES);
  }
  const surgeryName = fold(c.surgery.name);
  if (/col du femur|col femoral|fracture.*(hanche|femur)|pertrochanter|sous-trochanter|hemiarthroplast|prothese intermediaire|osteosynthese de la hanche|\bpih\b/.test(surgeryName)) {
    add("group", "recommended", "fracture du fémur proximal : deux concentrés érythrocytaires disponibles", MANUAL_2020_SPECIALTIES);
    add("fbc", "recommended", "fracture du fémur proximal : anémie (pertes de 500 à 1 000 ml)", MANUAL_2020_SPECIALTIES);
  }
  if (/scoliose/.test(surgeryName)) {
    add("pft", "consider", "scoliose : syndrome restrictif (complications pulmonaires si courbure > 60°)", MANUAL_2020_SPECIALTIES);
    add("echo", "consider", "scoliose : hypertension pulmonaire ou cardiomyopathie (myopathie associée)", MANUAL_2020_SPECIALTIES);
    add("group", "recommended", "correction de scoliose : pertes sanguines importantes", MANUAL_2020_SPECIALTIES);
  }
  if (has(cond, "osteogenesis_imperfecta")) add("haemostasis", "consider", "ostéogenèse imparfaite : fonction plaquettaire souvent diminuée", MANUAL_2020_SPECIALTIES);
  if (has(cond, "osa") !== true && stopBang !== undefined && stopBang >= 5)
    add("sleep", "consider", `STOP-BANG ${stopBang} : SAOS probable non diagnostiqué — examen du sommeil si la chirurgie peut attendre, sinon précautions comme pour un SAOS`, SASM_2016);

  const order: ExamCode[] = [
    "ecg",
    "fbc",
    "group",
    "renal",
    "haemostasis",
    "hba1c",
    "iron",
    "troponin",
    "bnp",
    "echo",
    "stress",
    "coronary",
    "carotid",
    "tavi_ct",
    "device",
    "pft",
    "cpet",
    "vq",
    "abg",
    "lung",
    "sleep",
    "albumin",
    "micronutrients",
    "larynx",
    "dental",
    "staph",
    "pregnancy",
  ];
  return { recommendations: order.filter((k) => recs.has(k)).map((k) => recs.get(k)!), missing };
}

/** A test whose result is already in the consultation counts as available, with its value. */
export function autoExamState(code: ExamCode, p: ConsultationState["patient"]): { status: "available"; note: string } | null {
  const n = (v: number) => String(v).replace(".", ",");
  switch (code) {
    case "fbc":
      return p.hb !== undefined ? { status: "available", note: [`Hb ${n(p.hb)} g/dL`, p.platelets !== undefined ? `plaquettes ${n(p.platelets)} G/L` : ""].filter(Boolean).join(", ") } : null;
    case "renal":
      return p.creatinineMgDl !== undefined
        ? { status: "available", note: [`créatinine ${n(p.creatinineMgDl)} mg/dL`, p.potassium !== undefined ? `K⁺ ${n(p.potassium)}` : "", p.sodium !== undefined ? `Na⁺ ${n(p.sodium)}` : ""].filter(Boolean).join(", ") }
        : null;
    case "haemostasis":
      return p.inr !== undefined ? { status: "available", note: `INR ${n(p.inr)}` } : null;
    case "hba1c":
      return p.hba1c !== undefined ? { status: "available", note: `HbA1c ${n(p.hba1c)} %` } : null;
    case "iron":
      return p.ferritin !== undefined ? { status: "available", note: `ferritine ${n(p.ferritin)} µg/L` } : null;
    case "bnp":
      return p.ntprobnp !== undefined ? { status: "available", note: `NT-proBNP ${n(p.ntprobnp)} ng/L` } : null;
    case "troponin":
      return p.troponin !== undefined ? { status: "available", note: `troponine hs ${n(p.troponin)} ng/L` } : null;
    case "albumin":
      return p.albumin !== undefined ? { status: "available", note: `albumine ${n(p.albumin)} g/L` } : null;
    default:
      return null;
  }
}

/** Suggested tests not yet requested, available or set aside. */
export function pendingExams(c: ConsultationState, result: ExamResult): ExamRecommendation[] {
  return result.recommendations.filter((r) => (c.exams[r.code]?.status ?? autoExamState(r.code, c.patient)?.status ?? "todo") === "todo");
}
