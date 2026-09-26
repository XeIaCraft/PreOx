// A patient dossier: everything about one patient and one intervention,
// from the consultation to the handover. Identified by initials only, kept
// encrypted on the device (secure-store.ts) — never sent to the server.

import { penFast, type AriscatInput, type ElGanzouriInput, type PenFastItem, type Sex } from "./scores";
import type { APFEL_ITEMS, DASI_ITEMS, HAS_BLED_ITEMS, HEMSTOP_ITEMS, RCRI_ITEMS, STOP_BANG_ITEMS } from "./scores";
import type { PatientTreatment, Technique } from "./rules/types";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import type { Conditions, Substances } from "./history";
import type { SurgeryGrade } from "./surgeries";
import type { BleedingRisk } from "./catalog";

type YesNo<K extends string> = Partial<Record<K, boolean>>;

export interface ConsultationPatient {
  age?: number;
  sex?: Sex;
  weightKg?: number;
  heightCm?: number;
  creatinineMgDl?: number;
  hb?: number;
  platelets?: number;
  inr?: number;
  /** %. */
  hba1c?: number;
  /** mmol/L. */
  potassium?: number;
  /** mmol/L. */
  sodium?: number;
  /** mg/dL. */
  glucose?: number;
  /** g/L. */
  albumin?: number;
  /** ng/L (pg/mL). */
  ntprobnp?: number;
  /** High-sensitivity troponin, ng/L. */
  troponin?: number;
  /** µg/L. */
  ferritin?: number;
  spo2?: number;
  /** Blood pressure and heart rate at the consultation. */
  sbp?: number;
  dbp?: number;
  hr?: number;
  /** Free text about allergies (details, reactions). */
  allergies?: string;
  /** Allergies entered one by one (recognised allergen or free label). */
  allergyList?: AllergyEntry[];
  /** "Aucune allergie connue" confirmed. */
  noKnownAllergy?: boolean;
  /** Airway examination, feeding El-Ganzouri, Langeron and STOP-BANG. */
  neckCm?: number;
  /** Other antecedents, free text (the structured ones are in `conditions`). */
  history?: string;
  /** Previous operations and anaesthesias, free text. */
  surgicalHistory?: string;
  /** Basic clinical examination. */
  exam?: ClinicalExam;
}

/** The basic examination of the consultation — each finding feeds the deductions and points of attention. */
export interface ClinicalExam {
  heart?: "normal" | "murmur" | "irregular";
  lungs?: "normal" | "wheeze" | "crackles" | "diminished";
  /** Lower-limb oedema. */
  edema?: boolean;
  /** Jugular venous distension. */
  jvd?: boolean;
  veins?: "good" | "difficult";
  /** Spine for a neuraxial puncture. */
  spine?: "normal" | "difficult";
  /** Pre-existing neurological deficit (documented before a regional block). */
  neuroDeficit?: boolean;
  /** Skin infection or lesion at a planned puncture site. */
  punctureSite?: boolean;
  /** Resting ECG read at the consultation. */
  ecg?: EcgFindings;
  notes?: string;
}

export type EcgRhythm = "sinus" | "af" | "flutter" | "junctional" | "paced";
export type EcgFinding = "avb1" | "mobitz1" | "mobitz2" | "avb3" | "lafb" | "lpfb" | "rbbb" | "lbbb" | "delta" | "lvh" | "rvh" | "q_waves" | "st_depression" | "st_elevation" | "brugada" | "low_voltage" | "peaked_t" | "u_wave";

/** The ECG as read (manual, chap. 51): rhythm, intervals in ms, abnormalities. */
export interface EcgFindings {
  rhythm?: EcgRhythm;
  prMs?: number;
  qrsMs?: number;
  qtcMs?: number;
  findings?: EcgFinding[];
}

export const ECG_RHYTHMS: Record<EcgRhythm, string> = { sinus: "Sinusal", af: "Fibrillation auriculaire", flutter: "Flutter", junctional: "Jonctionnel", paced: "Électroentraîné" };
export const ECG_FINDINGS: Record<EcgFinding, string> = {
  avb1: "BAV 1er degré",
  mobitz1: "BAV 2 Mobitz 1",
  mobitz2: "BAV 2 Mobitz 2",
  avb3: "BAV 3e degré",
  lafb: "Hémibloc antérieur G",
  lpfb: "Hémibloc postérieur G",
  rbbb: "Bloc de branche D",
  lbbb: "Bloc de branche G",
  delta: "Onde delta (pré-excitation)",
  lvh: "HVG",
  rvh: "HVD",
  q_waves: "Ondes Q",
  st_depression: "Sous-décalage ST",
  st_elevation: "Sus-décalage ST",
  brugada: "Aspect de Brugada",
  low_voltage: "Microvoltage",
  peaked_t: "T pointues",
  u_wave: "Onde U",
};

/** « FA, QTc 480 ms, BBG » — the ECG in a few words. */
export function ecgSummary(e: EcgFindings | undefined): string {
  if (!e) return "";
  return [
    e.rhythm && e.rhythm !== "sinus" ? ECG_RHYTHMS[e.rhythm] : e.rhythm ? "rythme sinusal" : "",
    e.prMs ? `PR ${e.prMs} ms` : "",
    e.qrsMs ? `QRS ${e.qrsMs} ms` : "",
    e.qtcMs ? `QTc ${e.qtcMs} ms` : "",
    ...(e.findings ?? []).map((f) => ECG_FINDINGS[f]),
  ]
    .filter(Boolean)
    .join(", ");
}

export const EXAM_LABELS = {
  heart: { normal: "B1B2 réguliers, pas de souffle", murmur: "Souffle", irregular: "Rythme irrégulier" },
  lungs: { normal: "Murmure vésiculaire normal", wheeze: "Sibilants", crackles: "Crépitants", diminished: "Murmure diminué" },
  veins: { good: "Bon capital veineux", difficult: "Abord veineux difficile" },
  spine: { normal: "Repères rachidiens palpables", difficult: "Repères difficiles / déformation" },
} as const;

/** « Souffle, crépitants, OMI » — what the exam found (normal findings left out). */
export function examSummary(e: ClinicalExam | undefined): string {
  if (!e) return "";
  const parts = [
    e.heart ? EXAM_LABELS.heart[e.heart] : "",
    e.lungs ? EXAM_LABELS.lungs[e.lungs] : "",
    e.edema ? "œdèmes des membres inférieurs" : "",
    e.jvd ? "turgescence jugulaire" : "",
    e.veins ? EXAM_LABELS.veins[e.veins] : "",
    e.spine ? EXAM_LABELS.spine[e.spine] : "",
    e.neuroDeficit ? "déficit neurologique préexistant" : "",
    e.punctureSite ? "lésion ou infection au site de ponction" : "",
    ecgSummary(e.ecg) ? `ECG : ${ecgSummary(e.ecg)}` : "",
    e.notes?.trim() ?? "",
  ].filter(Boolean);
  return parts.join(", ");
}

export interface AllergyEntry {
  /** Allergen of the catalogue, when recognised. */
  allergenId?: string;
  label: string;
  reaction?: string;
  /** PEN-FAST answers, for a reported penicillin allergy. */
  penFast?: Partial<Record<PenFastItem, boolean>>;
  /** Immediate (< 1–6 h, IgE-type) or delayed (hours to days, T-cell) reaction. */
  timing?: "immediate" | "delayed";
  /** Severity of an immediate reaction, Ring and Messmer grade I–IV. */
  ringGrade?: 1 | 2 | 3 | 4;
  /** Year of the reaction. */
  year?: number;
  /** Allergy workup: not done, done and negative (tolerated), done and confirmed. */
  workup?: "none" | "negative" | "confirmed";
}

export type ExamStatus = "todo" | "requested" | "available" | "not_needed";

export interface ExamState {
  status: ExamStatus;
  /** Result or date, free text. */
  note?: string;
}

export type ConsultationDecision = "fit" | "optimise" | "postpone" | "";

export interface ConsultationConclusion {
  decision: ConsultationDecision;
  /** Anaesthesia proposed and discussed with the patient. */
  proposal: string;
  fastingGiven?: boolean;
  informationGiven?: boolean;
  consent?: boolean;
}

export interface ConsultationState {
  patient: ConsultationPatient;
  conditions: Conditions;
  /** Systems reviewed with nothing more to note (« RAS »): their unlisted antecedents count as absent. */
  historyReviewed?: string[];
  substances: Substances;
  surgery: Surgery;
  /** Chosen ASA class; when absent the suggestion (asa.ts) is shown. */
  asa?: number;
  mallampati?: 1 | 2 | 3 | 4;
  nyha?: number;
  frailty?: number;
  airway: ElGanzouriInput;
  maskVentilation: YesNo<"beard" | "bmiOver26" | "edentulous" | "ageOver55" | "snoring">;
  stopBang: YesNo<keyof typeof STOP_BANG_ITEMS>;
  rcri: YesNo<keyof typeof RCRI_ITEMS>;
  dasi: YesNo<keyof typeof DASI_ITEMS>;
  ariscat: AriscatInput;
  apfel: YesNo<keyof typeof APFEL_ITEMS>;
  hemstop: YesNo<keyof typeof HEMSTOP_ITEMS>;
  cha: { heartFailure?: boolean; hypertension?: boolean; diabetes?: boolean; strokeTiaThromboembolism?: boolean; vascularDisease?: boolean };
  hasBled: YesNo<keyof typeof HAS_BLED_ITEMS>;
  treatments: PatientTreatment[];
  /** « Aucun traitement » confirmed. */
  noTreatment?: boolean;
  techniques: Technique[];
  exams: Partial<Record<string, ExamState>>;
  conclusion: ConsultationConclusion;
  /** datetime-local value ("2026-10-08T08:00"), local time. */
  plannedAt: string;
  hospital: string;
  notes: string;
  /** Your own reminders before (or after) the intervention — see timeline.ts. */
  reminders?: Reminder[];
}

export interface Reminder {
  id: string;
  text: string;
  /** Days before the intervention (0: the day itself, -1: the day after). */
  daysBefore: number;
  done?: boolean;
}

export function emptySurgery(): Surgery {
  return { name: "", category: "", side: "", surgeon: "", position: "" };
}

export function emptyConsultation(): ConsultationState {
  return {
    patient: {},
    conditions: {},
    substances: {},
    surgery: emptySurgery(),
    exams: {},
    conclusion: { decision: "", proposal: "" },
    airway: {},
    maskVentilation: {},
    stopBang: {},
    rcri: {},
    dasi: {},
    ariscat: {},
    apfel: {},
    hemstop: {},
    cha: {},
    hasBled: {},
    treatments: [],
    techniques: [],
    plannedAt: "",
    hospital: "",
    notes: "",
  };
}

export type RiskGrade = "low" | "intermediate" | "high";

export interface Surgery {
  name: string;
  /** Carnet category A–L / X. */
  category: string;
  side: string;
  surgeon: string;
  /** Why the patient is operated: the indication and the history of the illness (said at the handover). */
  indication?: string;
  /** Severity grade of the procedure (minor / intermediate / major), as in the KCE / NICE preop testing grids. */
  kce?: SurgeryGrade;
  /** Surgical cardiac risk class (ESC 2022). */
  cardiacRisk?: RiskGrade;
  /** Minimal, low or high — see BLEEDING_RISKS (surgeries.ts). */
  bleedingRisk?: BleedingRisk;
  /** Lee index "high-risk surgery": intraperitoneal, intrathoracic or suprainguinal vascular. */
  rcriHighRisk?: boolean;
  incision?: "peripheral" | "upper_abdominal" | "intrathoracic";
  /** Kept in step with urgency (urgent ⇔ emergency) for the scores that use it. */
  emergency?: boolean;
  /** Programmed, semi-urgent (can't wait months: cancer, threatening aneurysm, disabling fracture), urgent (24–48 h). */
  urgency?: Urgency;
  /** Intracranial, spinal canal or posterior chamber of the eye. */
  closedSpace?: boolean;
  durationHours?: number;
  position: string;
  /** Catalogue entry it was picked from (Paramètres › Interventions): its protocol and usual technique. */
  catalogId?: string;
  setting?: "ambulatory" | "inpatient" | "icu";
  tourniquet?: boolean;
}

export type Urgency = "elective" | "semi_urgent" | "urgent";

export const URGENCIES: { code: Urgency; label: string; detail: string }[] = [
  { code: "elective", label: "Programmée", detail: "Peut être reportée sans perte de chance." },
  { code: "semi_urgent", label: "Semi-urgente", detail: "Ne peut pas attendre des mois (cancer, anévrisme menaçant, fracture invalidante…)." },
  { code: "urgent", label: "Urgente", detail: "À réaliser dans les 24–48 h." },
];

/** The urgency of an intervention, from the old « Urgence » toggle when not set. */
export function urgencyOf(s: Pick<Surgery, "urgency" | "emergency">): Urgency {
  return s.urgency ?? (s.emergency ? "urgent" : "elective");
}

export const KCE_SEVERITIES = [
  { code: "minor" as const, label: "Mineure" },
  { code: "intermediate" as const, label: "Intermédiaire" },
  { code: "major" as const, label: "Majeure" },
];

export const RISK_GRADES = [
  { code: "low" as const, label: "Faible" },
  { code: "intermediate" as const, label: "Intermédiaire" },
  { code: "high" as const, label: "Élevé" },
];

// ---------------------------------------------------------------------------
// In theatre
// ---------------------------------------------------------------------------

export type EventType =
  | "room_in"
  | "anaesthesia_start"
  | "alr_done"
  | "intubation"
  | "incision"
  | "tourniquet_on"
  | "tourniquet_off"
  | "surgery_end"
  | "extubation"
  | "room_out"
  | "note";

export const EVENT_TYPES: { code: EventType; label: string; short: string }[] = [
  { code: "room_in", label: "Entrée en salle", short: "Entrée" },
  { code: "anaesthesia_start", label: "Début de l'anesthésie", short: "Induction" },
  { code: "alr_done", label: "ALR réalisée", short: "ALR" },
  { code: "intubation", label: "Intubation / dispositif supraglottique", short: "Voies aériennes" },
  { code: "incision", label: "Incision", short: "Incision" },
  { code: "tourniquet_on", label: "Garrot gonflé", short: "Garrot ON" },
  { code: "tourniquet_off", label: "Garrot dégonflé", short: "Garrot OFF" },
  { code: "surgery_end", label: "Fin de chirurgie", short: "Fin chir." },
  { code: "extubation", label: "Extubation / retrait", short: "Extubation" },
  { code: "room_out", label: "Sortie de salle", short: "Sortie" },
  { code: "note", label: "Événement", short: "Note" },
];

export interface IntraopEvent {
  id: string;
  type: EventType;
  /** ISO date-time. */
  at: string;
  note: string;
}

export interface GivenDrug {
  id: string;
  name: string;
  /** Phase of the plan it came from ("antibio" drives the re-dosing timer). */
  phase: string;
  route: string;
  dose: string;
  at: string;
  /** Plan drug it corresponds to, if any. */
  planDrugId?: string;
}

export type FluidCategory = "crystalloid" | "colloid" | "blood" | "other_in" | "urine" | "blood_loss" | "other_out";

export const FLUID_CATEGORIES: { code: FluidCategory; label: string; direction: "in" | "out" }[] = [
  { code: "crystalloid", label: "Cristalloïdes", direction: "in" },
  { code: "colloid", label: "Colloïdes", direction: "in" },
  { code: "blood", label: "Produits sanguins", direction: "in" },
  { code: "other_in", label: "Autres entrées", direction: "in" },
  { code: "urine", label: "Diurèse", direction: "out" },
  { code: "blood_loss", label: "Saignement", direction: "out" },
  { code: "other_out", label: "Autres pertes", direction: "out" },
];

export interface FluidEntry {
  id: string;
  category: FluidCategory;
  volumeMl: number;
  at: string;
  note: string;
}

export const COMPLICATION_TYPES = [
  "Hypotension prolongée",
  "Bradycardie",
  "Hypertension",
  "Arythmie",
  "Désaturation",
  "Bronchospasme",
  "Laryngospasme",
  "Intubation difficile",
  "Ventilation au masque difficile",
  "Inhalation",
  "Réaction allergique / anaphylaxie",
  "Saignement majeur",
  "Hypothermie",
  "Échec d'ALR / conversion en AG",
  "Toxicité des anesthésiques locaux",
  "Réveil agité",
  "NVPO",
  "Autre",
];

export interface Complication {
  id: string;
  type: string;
  severity: "mild" | "moderate" | "severe";
  management: string;
  at: string;
}

export interface Intraop {
  events: IntraopEvent[];
  given: GivenDrug[];
  fluids: FluidEntry[];
  complications: Complication[];
  /** Cormack-Lehane grade at laryngoscopy. */
  cormack?: string;
  airwayDevice: string;
  airwayNote: string;
  /** Sensory level / block assessment. */
  alrAssessment: string;
  lastVitals: string;
  painScore?: number;
}

export interface Transmission {
  destination: "uspa" | "usi" | "ward" | "";
  prescriptions: string;
  callCriteria: string;
  contact: string;
  notes: string;
}

export type DossierStatus = "consultation" | "prepared" | "done" | "cancelled";

export interface Dossier {
  id: string;
  /** First letter of the surname + first letter of the first name. */
  initials: string;
  status: DossierStatus;
  /** Includes the intervention (consultation.surgery). */
  consultation: ConsultationState;
  plan: ProtocolContent;
  /** Protocol the plan was started from. */
  protocolId: string | null;
  protocolName: string;
  intraop: Intraop;
  transmission: Transmission;
  /** Planned case created in the carnet, if any. */
  carnetCaseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function emptyDossier(initials: string, consultation: ConsultationState = emptyConsultation()): Dossier {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    initials: initials.trim().toUpperCase().slice(0, 4),
    status: "consultation",
    consultation,
    plan: emptyProtocolContent(),
    protocolId: null,
    protocolName: "",
    intraop: { events: [], given: [], fluids: [], complications: [], airwayDevice: "", airwayNote: "", alrAssessment: "", lastVitals: "" },
    transmission: { destination: "", prescriptions: "", callCriteria: "", contact: "", notes: "" },
    carnetCaseId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function upgradeConsultation(c: Partial<ConsultationState> | undefined): ConsultationState {
  const base = emptyConsultation();
  return { ...base, ...c, surgery: { ...base.surgery, ...c?.surgery }, conclusion: { ...base.conclusion, ...c?.conclusion } };
}

/** Dossiers saved by an older version get the fields added since. */
export function upgradeDossier(d: Dossier): Dossier {
  const base = emptyDossier(d.initials);
  // The intervention used to live on the dossier itself.
  const legacy = d as Dossier & { surgery?: Surgery };
  const consultation = upgradeConsultation(legacy.surgery && !d.consultation?.surgery ? { ...d.consultation, surgery: legacy.surgery } : d.consultation);
  const next = {
    ...base,
    ...d,
    consultation,
    plan: { ...base.plan, ...d.plan },
    intraop: { ...base.intraop, ...d.intraop },
    transmission: { ...base.transmission, ...d.transmission },
  };
  delete (next as { surgery?: Surgery }).surgery;
  return next;
}

/** The planned date of a dossier (YYYY-MM-DD), from the consultation's planned date-time. */
export function dossierDate(d: Dossier): string {
  return d.consultation.plannedAt.slice(0, 10);
}

/**
 * Status follows the case by itself: a plan makes the dossier "prepared",
 * « Sortie de salle » makes it "done". Never the carnet: confirming the
 * case there stays an explicit « Fait ».
 */
export function withAutoStatus(d: Dossier, previous?: Dossier): Dossier {
  // A status chosen by hand in this change is kept as is.
  if (previous && previous.status !== d.status) return d;
  if (d.status === "cancelled" || d.status === "done") return d;
  const roomOut = (x: Dossier) => x.intraop.events.some((e) => e.type === "room_out");
  if (roomOut(d) && !(previous && roomOut(previous))) return { ...d, status: "done" };
  if (d.status === "consultation" && (d.plan.drugs.length > 0 || d.plan.techniques.length > 0 || d.protocolId)) return { ...d, status: "prepared" };
  return d;
}

/** "Latex, pénicilline (urticaire)", "aucune connue", or "" when not asked. */
export function allergySummary(p: ConsultationPatient): string {
  const list = (p.allergyList ?? []).map((a) => {
    const pf = a.penFast ? penFast(a.penFast) : null;
    const score = pf && pf.label ? ` — PEN-FAST ${pf.value}/5 : ${pf.label.charAt(0).toLowerCase()}${pf.label.slice(1)}` : "";
    const facts = [a.reaction, a.timing === "immediate" ? "immédiate" : a.timing === "delayed" ? "retardée" : "", a.ringGrade ? `grade ${["I", "II", "III", "IV"][a.ringGrade - 1]}` : "", a.year ? String(a.year) : "", a.workup === "confirmed" ? "bilan positif" : a.workup === "negative" ? "bilan négatif" : a.workup === "none" ? "pas de bilan" : ""].filter(Boolean);
    return `${a.label}${facts.length ? ` (${facts.join(", ")})` : ""}${score}`;
  });
  const text = p.allergies?.trim();
  const all = [...list, ...(text ? [text] : [])];
  if (all.length) return all.join(", ");
  return p.noKnownAllergy ? "aucune connue" : "";
}
