// Server-side validation of the user's catalogue changes
// (app/api/preop/catalogs). Items are validated per list; unknown keys are
// stripped.
import { z } from "zod";

const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(80);
const words = z.array(text(80)).max(60);
const level = z.enum(["high", "medium", "info"]);
const attention = z.object({ level, text: text(1000).min(1), material: z.array(text(120)).max(12).optional() });
const qualifier = z.enum(["poorlyControlled", "recent", "severe"]);
const asa = z.number().int().min(1).max(5);
const verifiable = { verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), source: text(300).optional() };
const detailOption = z.object({ code: text(40).min(1), label: text(120), asa: asa.optional(), attention: attention.optional(), qualifier: qualifier.optional() });
const detail = z.object({
  id: text(40).min(1),
  label: text(120),
  kind: z.enum(["choice", "number", "date", "text"]),
  options: z.array(detailOption).max(20).optional(),
  unit: text(20).optional(),
  hint: text(300).optional(),
});
const interaction = z.object({ with: text(160), words: words, effect: text(1000), level });

const condition = z.object({
  id,
  label: text(120).min(1),
  system: z.enum(["cardio", "resp", "endo", "renal", "digest", "neuro", "psy", "hemato", "other", "surgical", "anaes"]),
  keywords: words.optional(),
  qualifiers: z.partialRecord(qualifier, text(60)).optional(),
  asa: asa.optional(),
  asaIf: z.partialRecord(qualifier, asa).optional(),
  attention: attention.optional(),
  attentionIf: z.partialRecord(qualifier, attention).optional(),
  needsRule: z.boolean().optional(),
  female: z.boolean().optional(),
  details: z.array(detail).max(12).optional(),
  ...verifiable,
});

const allergen = z.object({ id, label: text(120).min(1), keywords: words, drugWords: words, attention, assessment: z.enum(["pen-fast"]).optional(), needsRule: z.boolean().optional(), ...verifiable });

const surgery = z.object({
  id,
  name: text(160).min(1),
  aka: words.optional(),
  category: text(4),
  grade: z.enum(["minor", "intermediate", "major"]),
  cardiacRisk: z.enum(["low", "intermediate", "high"]),
  bleedingRisk: z.enum(["minimal", "low", "high"]),
  rcriHighRisk: z.boolean(),
  incision: z.enum(["peripheral", "upper_abdominal", "intrathoracic"]),
  position: text(160).optional(),
  durationHours: z.number().min(0).max(48).optional(),
  techniques: z.array(z.enum(["neuraxial", "deep_block", "superficial_block", "general", "sedation"])).max(5).optional(),
  protocolId: z.uuid().optional(),
  setting: z.enum(["ambulatory", "inpatient", "icu"]).optional(),
  tourniquet: z.boolean().optional(),
  closedSpace: z.boolean().optional(),
  examProfile: z
    .enum(["cardiac_cpb", "cardiac_valve", "tavi", "lung_resection", "pneumonectomy", "major_vascular", "bariatric", "major_digestive", "hepatobiliary", "neurosurgery", "arthroplasty", "thyroid", "obstetric"])
    .optional(),
  notes: text(2000).optional(),
  ...verifiable,
});

const atc = z.string().regex(/^[A-Z]\d{0,2}[A-Z]{0,2}\d{0,2}$/i, "Code ATC invalide");

const medication = z.object({
  id,
  // CBIP products may have no ATC code.
  atc: z.union([z.literal(""), atc]),
  cbip: z.object({ chapter: text(12), pages: z.record(text(160), z.number().int().positive()) }).optional(),
  name: text(160).min(1),
  brands: words.optional(),
  components: z.array(atc).max(6).optional(),
  implies: id.optional(),
  attention: attention.optional(),
  needsRule: z.boolean().optional(),
  interactions: z.array(interaction).max(20).optional(),
  ...verifiable,
});

const drugClass = z.object({ id, atc, label: text(160).min(1), cbip: z.array(text(12)).max(20).optional(), implies: id.optional(), attention: attention.optional(), needsRule: z.boolean().optional(), interactions: z.array(interaction).max(20).optional(), ...verifiable });

const valueCheck = z.object({
  id,
  label: text(120).min(1),
  value: z.enum(["sbp", "dbp", "hr", "spo2", "hb", "platelets", "inr", "hba1c", "potassium", "sodium", "glucose", "albumin", "ntprobnp", "troponin", "ferritin", "egfr", "crcl", "bmi", "age"]),
  op: z.enum(["<", "<=", ">", ">="]),
  threshold: z.number().min(0).max(100_000),
  sex: z.enum(["M", "F"]).optional(),
  attention: attention.optional(),
  implies: id.optional(),
  qualifier: qualifier.optional(),
  group: text(40).optional(),
  ...verifiable,
});

function overrides<T extends z.ZodTypeAny>(item: T) {
  return z.object({ added: z.array(item).max(500), edited: z.record(id, item), hidden: z.array(id).max(1000) });
}

export const catalogOverridesSchema = {
  conditions: overrides(condition),
  allergens: overrides(allergen),
  surgeries: overrides(surgery),
  medications: overrides(medication),
  drugClasses: overrides(drugClass),
  values: overrides(valueCheck),
};

export const catalogKindSchema = z.enum(["conditions", "allergens", "surgeries", "medications", "drugClasses", "values"]);
