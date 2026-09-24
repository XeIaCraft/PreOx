// Row shapes of the "Carnet de stage" tables, exactly as stored (snake_case,
// see supabase/migrations/20260101000081_carnet_de_stage.sql) minus
// user_id, which the server always sets itself and never sends back. The
// client store works on these rows directly — no mapping layer between the
// database and the screens.

export interface CarnetAddress {
  address: string;
  since: string | null;
}

export interface CarnetProfile {
  last_name: string;
  first_name: string;
  nationality: string;
  birth_place: string;
  birth_date: string | null;
  addresses: CarnetAddress[];
  email: string;
  phone: string;
  university: string;
  graduation_year: number | null;
  pre_training_activities: string;
  /** Signature du candidat (PNG en data URL, "" si pas encore dessinée). */
  signature: string;
}

export interface CarnetSupervisor {
  id: string;
  last_name: string;
  first_name: string;
  role: string;
  usual_hospital: string;
  archived: boolean;
  created_at: string;
}

export interface CarnetStage {
  id: string;
  hospital: string;
  city: string;
  /** Secteur / activité du stage (ex. « Anesthésie – bloc opératoire », « Soins intensifs »). */
  sector: string;
  /** Maître de stage coordinateur — le même pendant toute la formation, sauf changement (repris du stage précédent). */
  coordinator_id: string | null;
  /** Maître de stage du stage — dépend de l'hôpital et du service. */
  supervisor_id: string | null;
  training_year: number;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

export interface CarnetStageReview {
  id: string;
  stage_id: string;
  global_impression: string;
  liked: string;
  disliked: string;
  would_change: string;
  would_return: boolean | null;
  score_interest: number | null;
  score_clinical_guidance: number | null;
  score_atmosphere: number | null;
  score_theoretical_guidance: number | null;
  score_responsibilities: number | null;
}

export interface CarnetSignature {
  id: string;
  supervisor_id: string | null;
  supervisor_name: string;
  image: string;
  signed_at: string;
}

export interface CarnetCase {
  id: string;
  stage_id: string;
  case_date: string;
  patient_initials: string;
  operation: string;
  operation_category: string;
  pediatric_under_4: boolean;
  general_anesthesia: boolean;
  /** Codes de REGIONAL_TYPES — plusieurs possibles (ex. rachianesthésie + bloc). */
  regional_types: string[];
  /** Codes de TECHNICAL_ACTS — plusieurs possibles. */
  technical_acts: string[];
  /** Précision libre facultative des choix « Autre », par code (autre_alr, autre_acte, intubation_difficile_autre). */
  other_labels: Partial<Record<string, string>>;
  /** Détail facultatif : produits administrés et procédures (pour soi, jamais exporté dans le carnet officiel). */
  details: CaseDetails;
  /** Prepared the day before in Préop: not counted anywhere (relevé, report, export, signatures) until confirmed as done. */
  planned: boolean;
  participation: 1 | 2 | 3;
  tutor_id: string | null;
  signature_id: string | null;
  notes: string;
  created_at: string;
}

export interface CaseDrug {
  /** Nom du produit (catalogue ou saisie libre). */
  name: string;
  /** Code de DRUG_ROUTES : bolus IV, PSE, AIVOC, périnerveux… */
  route: string;
  /** Dose / concentration, texte libre facultatif (ex. « 2 mg/kg », « 0,5 % 20 ml »). */
  dose: string;
}

export interface CaseDetails {
  drugs?: CaseDrug[];
  /** Codes de PROCEDURES (induction, voies aériennes, entretien, monitorage, ALR…). */
  procedures?: string[];
}

export type DutyType = "on_site" | "on_call";

export interface CarnetDuty {
  id: string;
  stage_id: string;
  duty_date: string;
  duty_type: DutyType;
  institution: string;
  city: string;
  head_of_department: string;
  supervisor_id: string | null;
  signature_id: string | null;
  notes: string;
  created_at: string;
}

export interface CarnetRelatedActivity {
  id: string;
  nature: string;
  institution: string;
  city: string;
  start_date: string | null;
  end_date: string | null;
  appraisal: string;
  responsible: string;
  created_at: string;
}

export interface CarnetCourse {
  id: string;
  kind: "course" | "seminar";
  start_date: string | null;
  end_date: string | null;
  city: string;
  institution: string;
  subject: string;
  exam_result: string;
  teacher: string;
  created_at: string;
}

export interface CarnetPublication {
  id: string;
  title: string;
  details: string;
  pub_date: string | null;
  created_at: string;
}

export interface CarnetYear {
  id: string;
  training_year: number;
  /** Jours par catégorie A..F (0,5 par demi-journée). */
  absences: Partial<Record<string, number>>;
  /** Compteurs des "autres domaines d'activité" du rapport d'activité, clés de ACTIVITY_COUNTERS. */
  activity_counts: Partial<Record<string, number>>;
}

/** Everything the module shows — small enough to live entirely on the device. */
export interface CarnetData {
  profile: CarnetProfile | null;
  supervisors: CarnetSupervisor[];
  stages: CarnetStage[];
  stage_reviews: CarnetStageReview[];
  signatures: CarnetSignature[];
  cases: CarnetCase[];
  duties: CarnetDuty[];
  related_activities: CarnetRelatedActivity[];
  courses: CarnetCourse[];
  publications: CarnetPublication[];
  years: CarnetYear[];
}

/** Collections that are plain lists of rows with an `id` (everything except the singleton profile). */
export type CarnetCollection = Exclude<keyof CarnetData, "profile">;

export type CarnetRow<C extends CarnetCollection> = CarnetData[C][number];

/**
 * One queued local change. `put` inserts or fully replaces a row, `patch`
 * merges fields into an existing row, `delete` removes it. The profile is
 * addressed as collection "profile" (no id).
 */
export type CarnetMutation =
  | { id: string; createdAt: string; collection: CarnetCollection; op: "put"; row: { id: string } & Record<string, unknown> }
  | { id: string; createdAt: string; collection: CarnetCollection; op: "patch"; rowId: string; patch: Record<string, unknown> }
  | { id: string; createdAt: string; collection: CarnetCollection; op: "delete"; rowId: string }
  | { id: string; createdAt: string; collection: "profile"; op: "put"; row: CarnetProfile };

export interface CarnetMutationResult {
  id: string;
  ok: boolean;
  /** Only when !ok: whether retrying later could succeed (network/server trouble) or the change is refused for good (invalid data, constraint). */
  retryable?: boolean;
  error?: string;
}

export function emptyCarnetData(): CarnetData {
  return {
    profile: null,
    supervisors: [],
    stages: [],
    stage_reviews: [],
    signatures: [],
    cases: [],
    duties: [],
    related_activities: [],
    courses: [],
    publications: [],
    years: [],
  };
}
