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

const condition = z.object({
  id,
  label: text(120).min(1),
  system: z.enum(["cardio", "resp", "endo", "renal", "digest", "neuro", "psy", "hemato", "other", "anaes"]),
  keywords: words.optional(),
  qualifiers: z.partialRecord(qualifier, text(60)).optional(),
  asa: asa.optional(),
  asaIf: z.partialRecord(qualifier, asa).optional(),
  attention: attention.optional(),
  attentionIf: z.partialRecord(qualifier, attention).optional(),
  needsRule: z.boolean().optional(),
  female: z.boolean().optional(),
});

const allergen = z.object({ id, label: text(120).min(1), keywords: words, drugWords: words, attention });

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
});

const atc = z.string().regex(/^[A-Z]\d{0,2}[A-Z]{0,2}\d{0,2}$/i, "Code ATC invalide");

const medication = z.object({
  id,
  atc,
  name: text(160).min(1),
  brands: words.optional(),
  implies: id.optional(),
  attention: attention.optional(),
  needsRule: z.boolean().optional(),
});

const drugClass = z.object({ id, atc, label: text(160).min(1), implies: id.optional(), attention: attention.optional(), needsRule: z.boolean().optional() });

function overrides<T extends z.ZodTypeAny>(item: T) {
  return z.object({ added: z.array(item).max(500), edited: z.record(id, item), hidden: z.array(id).max(1000) });
}

export const catalogOverridesSchema = {
  conditions: overrides(condition),
  allergens: overrides(allergen),
  surgeries: overrides(surgery),
  medications: overrides(medication),
  drugClasses: overrides(drugClass),
};

export const catalogKindSchema = z.enum(["conditions", "allergens", "surgeries", "medications", "drugClasses"]);
