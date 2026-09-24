// Server-side validation of every row the client sends (route handler
// app/api/carnet/sync/route.ts). z.object strips unknown keys, so a client
// can never smuggle a user_id or another column in — the server sets
// user_id itself.
import { z } from "zod";
import { OPERATION_CATEGORIES, REGIONAL_TYPES, TECHNICAL_ACTS, ABSENCE_CATEGORIES, ACTIVITY_COUNTERS, OTHER_CODES } from "./referentiel";
import { DRUG_ROUTES } from "./pharmaco";
import type { CarnetCollection } from "./types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optionalDate = date.nullable();
const text = (max = 2000) => z.string().max(max);
const id = z.uuid();
const timestamp = z.string().max(40);

// PNG data URL of a drawn signature — bounded to keep one row reasonable.
const pngDataUrl = z.string().startsWith("data:image/png;base64,").max(400_000);

const codes = (options: { code: string }[]) => z.enum(options.map((o) => o.code) as [string, ...string[]]);
const counts = (keys: string[]) => z.record(z.string(), z.number().min(0).max(100000)).refine((r) => Object.keys(r).every((k) => keys.includes(k)), "Clé inconnue");

export const profileSchema = z.object({
  last_name: text(200),
  first_name: text(200),
  nationality: text(200),
  birth_place: text(200),
  birth_date: optionalDate,
  addresses: z.array(z.object({ address: text(500), since: optionalDate })).max(50),
  email: text(320),
  phone: text(50),
  university: text(300),
  graduation_year: z.number().int().min(1950).max(2100).nullable(),
  pre_training_activities: text(10000),
  signature: z.union([z.literal(""), pngDataUrl]),
});

const supervisorSchema = z.object({
  id,
  last_name: text(200).min(1, "Nom requis"),
  first_name: text(200),
  role: text(200),
  usual_hospital: text(300),
  archived: z.boolean(),
  created_at: timestamp,
});

const stageSchema = z.object({
  id,
  hospital: text(300).min(1, "Lieu requis"),
  city: text(200),
  sector: text(200),
  coordinator_id: id.nullable(),
  supervisor_id: id.nullable(),
  training_year: z.number().int().min(1).max(8),
  start_date: date,
  end_date: optionalDate,
  created_at: timestamp,
});

const score = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

const stageReviewSchema = z.object({
  id,
  stage_id: id,
  global_impression: text(10000),
  liked: text(10000),
  disliked: text(10000),
  would_change: text(10000),
  would_return: z.boolean().nullable(),
  score_interest: score(0, 10),
  score_clinical_guidance: score(0, 10),
  score_atmosphere: score(0, 10),
  score_theoretical_guidance: score(0, 10),
  score_responsibilities: score(-5, 5),
});

const signatureSchema = z.object({
  id,
  supervisor_id: id.nullable(),
  supervisor_name: text(300).min(1),
  image: pngDataUrl,
  signed_at: timestamp,
});

const unique = (list: string[]) => new Set(list).size === list.length;

const caseDetailsSchema = z.object({
  drugs: z.array(z.object({ name: text(120).min(1), route: codes(DRUG_ROUTES), dose: text(120) })).max(60).optional(),
  procedures: z.array(text(60)).max(80).optional(),
});

const caseBase = z.object({
    id,
    stage_id: id,
    case_date: date,
    patient_initials: text(20),
    operation: text(300).min(1, "Opération requise"),
    operation_category: codes(OPERATION_CATEGORIES),
    pediatric_under_4: z.boolean(),
    general_anesthesia: z.boolean(),
    regional_types: z.array(codes(REGIONAL_TYPES)).max(REGIONAL_TYPES.length).refine(unique, "Doublon"),
    technical_acts: z.array(codes(TECHNICAL_ACTS)).max(TECHNICAL_ACTS.length).refine(unique, "Doublon"),
    // partialRecord: z.record with enum keys requires every key (zod 4); here each precision is optional.
    other_labels: z.partialRecord(codes(OTHER_CODES.map((code) => ({ code }))), text(300)),
    details: caseDetailsSchema,
    // Optional so older clients' rows and partial patches never flip it; the column defaults to false.
    planned: z.boolean().optional(),
    participation: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    tutor_id: id.nullable(),
    signature_id: id.nullable(),
    notes: text(2000),
    created_at: timestamp,
  });
const caseSchema = caseBase.refine((c) => c.general_anesthesia || c.regional_types.length > 0 || c.technical_acts.length > 0, "Technique d'anesthésie requise");

const dutySchema = z.object({
  id,
  stage_id: id,
  duty_date: date,
  duty_type: z.enum(["on_site", "on_call"]),
  institution: text(300),
  city: text(200),
  head_of_department: text(300),
  supervisor_id: id.nullable(),
  signature_id: id.nullable(),
  notes: text(2000),
  created_at: timestamp,
});

const relatedActivitySchema = z.object({
  id,
  nature: text(500).min(1, "Nature requise"),
  institution: text(300),
  city: text(200),
  start_date: optionalDate,
  end_date: optionalDate,
  appraisal: text(10000),
  responsible: text(300),
  created_at: timestamp,
});

const courseSchema = z.object({
  id,
  kind: z.enum(["course", "seminar"]),
  start_date: optionalDate,
  end_date: optionalDate,
  city: text(200),
  institution: text(300),
  subject: text(1000).min(1, "Sujet requis"),
  exam_result: text(500),
  teacher: text(300),
  created_at: timestamp,
});

const publicationSchema = z.object({
  id,
  title: text(2000).min(1, "Titre requis"),
  details: text(5000),
  pub_date: optionalDate,
  created_at: timestamp,
});

const yearSchema = z.object({
  id,
  training_year: z.number().int().min(1).max(8),
  absences: counts(ABSENCE_CATEGORIES.map((c) => c.code)),
  activity_counts: counts(ACTIVITY_COUNTERS.map((c) => c.code)),
});

/** Full-row schema per collection ("put"). */
export const ROW_SCHEMAS: Record<CarnetCollection, z.ZodType<Record<string, unknown>>> = {
  supervisors: supervisorSchema,
  stages: stageSchema,
  stage_reviews: stageReviewSchema,
  signatures: signatureSchema,
  cases: caseSchema,
  duties: dutySchema,
  related_activities: relatedActivitySchema,
  courses: courseSchema,
  publications: publicationSchema,
  years: yearSchema,
};

/** Partial schema per collection ("patch") — never allowed to change the id. */
export const PATCH_SCHEMAS: Record<CarnetCollection, z.ZodType<Record<string, unknown>>> = {
  supervisors: supervisorSchema.omit({ id: true }).partial(),
  stages: stageSchema.omit({ id: true }).partial(),
  stage_reviews: stageReviewSchema.omit({ id: true }).partial(),
  signatures: signatureSchema.omit({ id: true }).partial(),
  // The "at least one technique" rule is also a check constraint in the database, which covers patched rows.
  cases: caseBase.omit({ id: true }).partial(),
  duties: dutySchema.omit({ id: true }).partial(),
  related_activities: relatedActivitySchema.omit({ id: true }).partial(),
  courses: courseSchema.omit({ id: true }).partial(),
  publications: publicationSchema.omit({ id: true }).partial(),
  years: yearSchema.omit({ id: true }).partial(),
};
