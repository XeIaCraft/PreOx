// The guidelines the procedure sheet cites (« Protocole anesthésique »),
// each looked up on PubMed with its identifier and DOI — what the sheet says
// is a summary of the abstract or of the full text when it is open; the
// guideline itself prevails, and so does the hospital's protocol. A newer
// version replaces its entry here and the sheet follows.

export interface GuidelineRef {
  /** Short label shown inline (« ESAIC curarisation 2023 »). */
  short: string;
  /** Authors, title, journal. */
  label: string;
  year?: number;
  pmid?: string;
  doi?: string;
}

export const GUIDELINES = {
  ponv2025: {
    short: "Consensus NVPO 2025",
    label: "Gan TJ et al. Fifth Consensus Guidelines for the Management of Postoperative Nausea and Vomiting: Executive Summary. Anesth Analg 2025;143:497-513",
    year: 2025,
    pmid: "41237407",
    doi: "10.1213/ANE.0000000000007816",
  },
  nmbEsaic2023: {
    short: "ESAIC curarisation 2023",
    label: "Fuchs-Buder T et al. Peri-operative management of neuromuscular blockade: a guideline from the ESAIC. Eur J Anaesthesiol 2023;40:82-94",
    year: 2023,
    pmid: "36377554",
    doi: "10.1097/EJA.0000000000001769",
  },
  nmbAsa2023: {
    short: "ASA curarisation 2023",
    label: "Thilen SR et al. 2023 ASA Practice Guidelines for Monitoring and Antagonism of Neuromuscular Blockade. Anesthesiology 2023;138:13-41",
    year: 2023,
    pmid: "36520073",
    doi: "10.1097/ALN.0000000000004379",
  },
  delirium2023: {
    short: "ESAIC délirium 2023",
    label: "Aldecoa C et al. Update of the ESAIC evidence-based and consensus-based guideline on postoperative delirium in adult patients. Eur J Anaesthesiol 2024;41:81-108",
    year: 2023,
    pmid: "37599617",
    doi: "10.1097/EJA.0000000000001876",
  },
  alrEsaic2022: {
    short: "ESAIC/ESRA 2022",
    label: "Kietaibl S et al. Regional anaesthesia in patients on antithrombotic drugs: Joint ESAIC/ESRA guidelines. Eur J Anaesthesiol 2022;39:100-132",
    year: 2022,
    pmid: "34980845",
    doi: "10.1097/EJA.0000000000001600",
  },
  alrAsra2025: {
    short: "ASRA 2025",
    label: "Kopp SL et al. Regional anesthesia in the patient receiving antithrombotic or thrombolytic therapy: ASRA Evidence-Based Guidelines (fifth edition). Reg Anesth Pain Med 2025",
    year: 2025,
    pmid: "39880411",
    doi: "10.1136/rapm-2024-105766",
  },
  ventilation2019: {
    short: "Consensus ventilation protectrice 2019",
    label: "Young CC et al. Lung-protective ventilation for the surgical patient: international expert panel-based consensus recommendations. Br J Anaesth 2019;123:898-913",
    year: 2019,
    pmid: "31587835",
    doi: "10.1016/j.bja.2019.08.017",
  },
  obesity2015: {
    short: "AAGBI/SOBA obésité 2015",
    label: "Nightingale CE et al. Peri-operative management of the obese surgical patient 2015. Anaesthesia 2015;70:859-76",
    year: 2015,
    pmid: "25950621",
    doi: "10.1111/anae.13101",
  },
  osa2018: {
    short: "SASM SAOS 2018",
    label: "Memtsoudis SG et al. Society of Anesthesia and Sleep Medicine Guideline on Intraoperative Management of Adult Patients With Obstructive Sleep Apnea. Anesth Analg 2018;127:967-987",
    year: 2018,
    pmid: "29944522",
    doi: "10.1213/ANE.0000000000003434",
  },
  mh2021: {
    short: "EMHG 2021",
    label: "Rüffert H et al. Consensus guidelines on perioperative management of malignant hyperthermia suspected or susceptible patients from the European Malignant Hyperthermia Group. Br J Anaesth 2021;126:120-130",
    year: 2021,
    pmid: "33131754",
    doi: "10.1016/j.bja.2020.09.029",
  },
  monitoring2021: {
    short: "Association of Anaesthetists 2021",
    label: "Klein AA et al. Recommendations for standards of monitoring during anaesthesia and recovery 2021. Anaesthesia 2021;76:1212-1223",
    year: 2021,
    pmid: "34013531",
    doi: "10.1111/anae.15501",
  },
  tiva2019: {
    short: "AIVOC AoA/SIVA 2019",
    label: "Nimmo AF et al. Guidelines for the safe practice of total intravenous anaesthesia (TIVA). Anaesthesia 2019;74:211-224",
    year: 2019,
    pmid: "30378102",
    doi: "10.1111/anae.14428",
  },
  bp2019: {
    short: "POQI 2019",
    label: "Sessler DI et al. Perioperative Quality Initiative consensus statement on intraoperative blood pressure, risk and outcomes for elective surgery. Br J Anaesth 2019;122:563-574",
    year: 2019,
    pmid: "30916004",
    doi: "10.1016/j.bja.2019.01.013",
  },
  postopBp2019: {
    short: "POQI postopératoire 2019",
    label: "McEvoy MD et al. Perioperative Quality Initiative consensus statement on postoperative blood pressure, risk and outcomes for elective surgery. Br J Anaesth 2019;122:575-586",
    year: 2019,
    pmid: "30916008",
    doi: "10.1016/j.bja.2019.01.019",
  },
  das2015: {
    short: "DAS 2015",
    label: "Frerk C et al. Difficult Airway Society 2015 guidelines for management of unanticipated difficult intubation in adults. Br J Anaesth 2015;115:827-48",
    year: 2015,
    pmid: "26556848",
    doi: "10.1093/bja/aev371",
  },
  airwayAsa2022: {
    short: "ASA voies aériennes 2022",
    label: "Apfelbaum JL et al. 2022 American Society of Anesthesiologists Practice Guidelines for Management of the Difficult Airway. Anesthesiology 2022;136:31-81",
    year: 2022,
    pmid: "34762729",
    doi: "10.1097/ALN.0000000000004002",
  },
  nap4: {
    short: "NAP4 2011",
    label: "Cook TM et al. Major complications of airway management in the UK: results of the Fourth National Audit Project (NAP4). Part 1: anaesthesia. Br J Anaesth 2011;106:617-31",
    year: 2011,
    pmid: "21447488",
    doi: "10.1093/bja/aer058",
  },
  glp1_2024: {
    short: "Multisociétés GLP-1 2024",
    label: "Kindel TL et al. Multi-society clinical practice guidance for the safe use of glucagon-like peptide-1 receptor agonists in the perioperative period. Surg Endosc 2025;39:180-183",
    year: 2024,
    pmid: "39370500",
    doi: "10.1007/s00464-024-11263-2",
  },
  fasting2011: {
    short: "ESA jeûne 2011",
    label: "Smith I et al. Perioperative fasting in adults and children: guidelines from the European Society of Anaesthesiology. Eur J Anaesthesiol 2011;28:556-69",
    year: 2011,
    pmid: "21712716",
    doi: "10.1097/EJA.0b013e3283495ba1",
  },
  fasting2026: {
    short: "Consensus jeûne 2026",
    label: "Rüggeberg A et al. Peri-operative fasting in adults: an international, multidisciplinary consensus statement. Anaesthesia 2026;81:840-851",
    year: 2026,
    pmid: "41657234",
    doi: "10.1111/anae.70130",
  },
  fastingChildren2022: {
    short: "ESAIC jeûne de l'enfant 2022",
    label: "Frykholm P et al. Pre-operative fasting in children: a guideline from the ESAIC. Eur J Anaesthesiol 2022;39:4-25",
    year: 2022,
    pmid: "34857683",
    doi: "10.1097/EJA.0000000000001599",
  },
  fastingAsa2023: {
    short: "ASA jeûne 2023",
    label: "Joshi GP et al. 2023 ASA Practice Guidelines for Preoperative Fasting: carbohydrate-containing clear liquids, chewing gum, and pediatric fasting duration. Anesthesiology 2023;138:132-151",
    year: 2023,
    pmid: "36629465",
    doi: "10.1097/ALN.0000000000004381",
  },
  pregnancy2019: {
    short: "ACOG 775 (2019)",
    label: "ACOG Committee Opinion No. 775: Nonobstetric Surgery During Pregnancy. Obstet Gynecol 2019;133:e285-e286",
    year: 2019,
    pmid: "30913200",
    doi: "10.1097/AOG.0000000000003174",
  },
  cied2011: {
    short: "HRS/ASA 2011",
    label: "Crossley GH et al. HRS/ASA Expert Consensus Statement on the perioperative management of patients with implantable defibrillators, pacemakers and arrhythmia monitors. Heart Rhythm 2011;8:1114-54",
    year: 2011,
    pmid: "21722856",
    doi: "10.1016/j.hrthm.2010.12.023",
  },
  phrenic2017: {
    short: "El-Boghdadly 2017",
    label: "El-Boghdadly K et al. Phrenic nerve palsy and regional anesthesia for shoulder surgery: anatomical, physiologic, and clinical considerations. Anesthesiology 2017;127:173-191",
    year: 2017,
    pmid: "28514241",
    doi: "10.1097/ALN.0000000000001668",
  },
  platelets2021: {
    short: "SOAP 2021",
    label: "Bauer ME et al. The Society for Obstetric Anesthesia and Perinatology Interdisciplinary Consensus Statement on Neuraxial Procedures in Obstetric Patients With Thrombocytopenia. Anesth Analg 2021;132:1531-1544",
    year: 2021,
    pmid: "33861047",
    doi: "10.1213/ANE.0000000000005355",
  },
  last2020: {
    short: "ASRA LAST 2020",
    label: "Neal JM et al. ASRA Local Anesthetic Systemic Toxicity checklist: 2020 version. Reg Anesth Pain Med 2021;46:81-82",
    year: 2020,
    pmid: "33148630",
    doi: "10.1136/rapm-2020-101986",
  },
  fire2013: {
    short: "ASA feu au bloc 2013",
    label: "Apfelbaum JL et al. Practice advisory for the prevention and management of operating room fires. Anesthesiology 2013;118:271-90",
    year: 2013,
    pmid: "23287706",
    doi: "10.1097/ALN.0b013e31827773d2",
  },
  pneumoperitoneum2002: {
    short: "EAES pneumopéritoine",
    label: "Neudecker J et al. The European Association for Endoscopic Surgery clinical practice guideline on the pneumoperitoneum for laparoscopic surgery. Surg Endosc 2002;16:1121-43",
    year: 2002,
    pmid: "12015619",
    doi: "10.1007/s00464-001-9166-7",
  },
  bleeding2022: {
    short: "ESAIC saignement 2022",
    label: "Kietaibl S et al. Management of severe peri-operative bleeding: guidelines from the ESAIC, second update 2022. Eur J Anaesthesiol 2023;40:226-304",
    year: 2022,
    pmid: "36855941",
    doi: "10.1097/EJA.0000000000001803",
  },
  esc2022: {
    short: "ESC 2022",
    label: "Halvorsen S et al. 2022 ESC Guidelines on cardiovascular assessment and management of patients undergoing non-cardiac surgery. Eur Heart J 2022;43:3826-3924",
    year: 2022,
    pmid: "36017553",
    doi: "10.1093/eurheartj/ehac270",
  },
  antibio2024: {
    short: "SFAR antibioprophylaxie 2024",
    label: "Garnier M et al. Guidelines on Antibiotic Prophylaxis in Surgery 2024. Anaesth Crit Care Pain Med 2026",
    year: 2024,
    pmid: "41628822",
    doi: "10.1016/j.accpm.2026.101749",
  },
  allergy2022: {
    short: "AAAAI/ACAAI 2022",
    label: "Khan DA et al. Drug allergy: a 2022 practice parameter update. J Allergy Clin Immunol 2022;150:1333-1393",
    year: 2022,
    pmid: "36122788",
    doi: "10.1016/j.jaci.2022.08.028",
  },
  vpop2014: {
    short: "Score VPOP 2014",
    label: "Bourdaud N et al. Development and validation of a risk score to predict the probability of postoperative vomiting in pediatric patients: the VPOP score. Paediatr Anaesth 2014;24:945-52",
    year: 2014,
    pmid: "24823626",
    doi: "10.1111/pan.12428",
  },
  eras2025: {
    short: "ERAS® 2025",
    label: "Grant MC, Engelman DT. Enhanced recovery after surgery: overarching themes of the ERAS® Society Guidelines & Consensus Statements for Adult Specialty Surgery. Perioper Med 2025;14:120",
    year: 2025,
    pmid: "41168801",
    doi: "10.1186/s13741-025-00590-0",
  },
  glasgow2023: { short: "Déclaration de Glasgow (ESAIC 2023)", label: "ESAIC : déclaration de Glasgow sur la durabilité environnementale en anesthésie et réanimation (2023)", year: 2023 },
  rcp: { short: "RCP (CBIP)", label: "Résumés des caractéristiques du produit, Centre belge d'information pharmacothérapeutique" },
  manual: { short: "Manuel 2020", label: "Manuel pratique d'anesthésie, 4e éd. (Elsevier Masson, 2020)", year: 2020 },
} satisfies Record<string, GuidelineRef>;

export type GuidelineId = keyof typeof GUIDELINES;

/** A sourced statement: what it says and where it comes from (« Manuel 2020, chap. 17 » or a guideline). */
export interface Sourced {
  text: string;
  /** Guidelines it rests on. */
  refs: GuidelineId[];
  /** Chapter of the manual, when it is one of the refs (« chap. 17 »). */
  chapter?: string;
}

export const doiUrl = (doi: string) => `https://doi.org/${doi}`;
export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

/** « ESAIC curarisation 2023 ; Manuel 2020, chap. 8 ». */
export function sourceLabel(s: Pick<Sourced, "refs" | "chapter">): string {
  return s.refs.map((id) => (id === "manual" && s.chapter ? `${GUIDELINES.manual.short}, ${s.chapter}` : GUIDELINES[id].short)).join(" ; ");
}
