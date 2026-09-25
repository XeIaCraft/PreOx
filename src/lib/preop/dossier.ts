// A patient dossier: everything about one patient and one intervention,
// from the consultation to the handover. Identified by initials only, kept
// encrypted on the device (secure-store.ts) — never sent to the server.

import type { AriscatInput, ElGanzouriInput, Sex } from "./scores";
import type { APFEL_ITEMS, DASI_ITEMS, HAS_BLED_ITEMS, HEMSTOP_ITEMS, RCRI_ITEMS, STOP_BANG_ITEMS } from "./scores";
import type { PatientTreatment, Technique } from "./rules/types";
import { emptyProtocolContent, type ProtocolContent } from "./protocols";
import type { Conditions, Substances } from "./history";
import type { SurgeryGrade } from "./surgeries";

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
  spo2?: number;
  /** Blood pressure and heart rate at the consultation. */
  sbp?: number;
  dbp?: number;
  hr?: number;
  allergies?: string;
  /** Other antecedents, free text (the structured ones are in `conditions`). */
  history?: string;
  /** Previous operations and anaesthesias, free text. */
  surgicalHistory?: string;
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
  techniques: Technique[];
  exams: Partial<Record<string, ExamState>>;
  conclusion: ConsultationConclusion;
  /** datetime-local value ("2026-10-08T08:00"), local time. */
  plannedAt: string;
  hospital: string;
  notes: string;
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
  /** Severity grade of the procedure (minor / intermediate / major), as in the KCE / NICE preop testing grids. */
  kce?: SurgeryGrade;
  /** Surgical cardiac risk class (ESC 2022). */
  cardiacRisk?: RiskGrade;
  bleedingRisk?: RiskGrade;
  /** Lee index "high-risk surgery": intraperitoneal, intrathoracic or suprainguinal vascular. */
  rcriHighRisk?: boolean;
  incision?: "peripheral" | "upper_abdominal" | "intrathoracic";
  emergency?: boolean;
  durationHours?: number;
  position: string;
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
