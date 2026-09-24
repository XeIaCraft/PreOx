// Server-side validation of a protocol sent by the client
// (app/api/preop/protocols). z.object strips unknown keys: user_id and the
// timestamps are always set by the server/database.
import { z } from "zod";

const text = (max: number) => z.string().max(max);
const technique = z.enum(["neuraxial", "deep_block", "superficial_block", "general", "sedation"]);
const amount = z.number().min(0).max(100_000).nullable();

const drug = z.object({
  id: text(64).min(1),
  name: text(120).min(1, "Nom du produit manquant"),
  route: text(40),
  phase: z.enum(["premed", "induction", "maintenance", "alr", "antibio", "analgesia", "ponv", "haemodynamic", "other"]),
  doseMode: z.enum(["fixed", "per_kg"]),
  amount,
  unit: z.enum(["mg", "µg", "g", "mL", "UI"]),
  weightBasis: z.enum(["total", "ideal", "lean", "adjusted"]),
  maxAmount: amount,
  redoseEveryMin: z.number().int().min(0).max(24 * 60).nullable(),
  note: text(400),
});

export const protocolContentSchema = z.object({
  techniques: z.array(technique).max(5),
  drugs: z.array(drug).max(60),
  targets: z.array(text(200)).max(40),
  material: z.array(text(200)).max(60),
  risks: z.array(z.object({ title: text(200), conduct: text(2000) })).max(40),
  postop: z.array(text(400)).max(40),
  tourniquetAlertMin: z.number().int().min(0).max(600).nullable(),
  notes: text(4000),
});

export const protocolSchema = z.object({
  id: z.uuid(),
  name: text(160).trim().min(1, "Nom du protocole manquant"),
  surgery: text(200),
  operation_category: text(4),
  hospital: text(120),
  content: protocolContentSchema,
  source: text(2000),
});
