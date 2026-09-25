// Server-side validation of a rule sent by the client (app/api/preop/rules).
// z.object strips unknown keys: user_id is always set by the server.
import { z } from "zod";
import type { Rule } from "./types";

const comparator = z.enum(["<", "<=", ">", ">="]);
const technique = z.enum(["neuraxial", "deep_block", "superficial_block", "general", "sedation"]);
const indication = z.enum([
  "af",
  "vte",
  "mechanical_valve",
  "coronary_stent",
  "primary_prevention",
  "secondary_prevention_coronary",
  "secondary_prevention_stroke",
  "peripheral_arterial_disease",
  "other",
]);
const level = z.enum(["local", "be_inst", "be_soc", "eu", "int", "book", "article"]);
const text = (max: number) => z.string().max(max);

const condition = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("drug"),
    atc: z.string().regex(/^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$/i, "Code ATC invalide"),
    dailyDose: z.object({ op: comparator, mg: z.number().positive().max(100_000) }).optional(),
    indications: z.array(indication).min(1).max(9).optional(),
    monthsSinceEvent: z.object({ op: comparator, months: z.number().min(0).max(600) }).optional(),
  }),
  z.object({ kind: z.literal("technique"), in: z.array(technique).min(1).max(5) }),
  z.object({
    kind: z.literal("value"),
    value: z.enum(["age", "weight", "bmi", "crcl", "egfr", "hb", "platelets", "inr", "potassium", "sodium", "glucose", "hba1c"]),
    op: comparator,
    threshold: z.number().min(0).max(100_000),
  }),
  z.object({
    kind: z.literal("surgery"),
    attribute: z.enum(["bleedingRisk", "cardiacRisk", "grade", "urgency", "closedSpace"]),
    in: z.array(z.enum(["minimal", "low", "intermediate", "high", "minor", "major", "elective", "semi_urgent", "urgent", "yes", "no"])).min(1).max(3),
  }),
  z.object({ kind: z.literal("history"), condition: z.string().regex(/^[a-z0-9_-]{1,64}$/i, "Antécédent invalide"), present: z.boolean(), label: text(200).optional() }),
  z.object({
    kind: z.literal("allergy"),
    allergen: z.string().regex(/^[a-z0-9_-]{1,64}$/i, "Allergène invalide"),
    present: z.boolean(),
    label: text(200).optional(),
    penFast: z.enum(["low", "high"]).optional(),
  }),
]);

const hours = z.number().min(0).max(24 * 60);
const target = z.enum(["surgery", "anaesthesia", "both"]).optional();
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stop_before"), hours, target }),
  z.object({ type: z.literal("resume_after"), hours, target }),
  z.object({ type: z.literal("requirement"), text: text(1000).min(1), blocking: z.boolean(), target }),
  z.object({ type: z.literal("exam"), exam: text(300).min(1), withinDays: z.number().int().min(0).max(365).optional(), target }),
  z.object({ type: z.literal("info"), text: text(2000).min(1), target }),
]);

export const ruleSchema = z
  .object({
    id: z.uuid(),
    title: text(300),
    statement: text(2000).min(1, "Énoncé requis"),
    conditions: z.array(condition).max(12),
    action,
    source: z.object({
      organisation: text(300),
      title: text(600),
      year: z.number().int().min(1950).max(2100).nullable(),
      doi: text(200),
      pmid: z.string().regex(/^\d{0,9}$/, "PMID invalide"),
      quote: text(4000),
      grade: text(50),
      level,
      hospital: text(200).optional(),
    }),
    divergences: z.array(z.object({ summary: text(1000), source: text(300), level })).max(20),
    explanations: z.array(text(2000)).max(20),
    status: z.enum(["draft", "active", "archived"]),
    version: z.number().int().min(1).max(10_000),
    verified_at: z.string().max(40).nullable(),
    review_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    question: text(8000),
    tool: text(100),
  })
  .refine((r) => r.status !== "active" || r.verified_at !== null, "Une règle n'est appliquée qu'une fois vérifiée.")
  .refine((r) => r.action.type === "info" || r.conditions.length > 0, "Une règle appliquée automatiquement doit avoir au moins une condition.");

export type RuleInput = Omit<Rule, "created_at" | "updated_at">;
