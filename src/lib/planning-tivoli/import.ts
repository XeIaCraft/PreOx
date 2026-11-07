import "server-only";

// A planning image becomes a week to verify: read by the OCR, its initials
// matched to the known ones (and to the misreadings learned), its columns
// to the configured rooms. The same image read again changes nothing; a new
// image of a week already validated is kept for review without touching
// what is exported until it is validated again.

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "@/lib/supabase/types";
export { addDays, mondayOf, proposedCells } from "./match";
import { sha256 } from "./fetch";
import { mondayOf, proposedCells } from "./match";
import { PlanningOcr, type PlanningRead } from "./ocr";

type Db = SupabaseClient<Database>;

/** What the screen and the matching need: rooms, known initials, learned misreadings. */
export async function matchingData(db: Db) {
  const [rooms, people, fixes] = await Promise.all([
    db.from("planning_tivoli_rooms").select("*").order("sort_order"),
    db.from("planning_tivoli_people").select("*").order("initials"),
    db.from("planning_tivoli_ocr_fixes").select("*"),
  ]);
  return {
    rooms: rooms.data ?? [],
    people: people.data ?? [],
    learned: Object.fromEntries((fixes.data ?? []).map((f) => [f.read, f.fixed])),
  };
}

/** A large image kept as JPEG (the screen only shows it, cell by cell). */
async function forStorage(image: Buffer): Promise<{ data: Buffer; type: string; width: number; height: number }> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (image.length <= 1_500_000 && (meta.format === "png" || meta.format === "jpeg")) return { data: image, type: `image/${meta.format}`, width, height };
  return { data: await sharp(image).jpeg({ quality: 88 }).toBuffer(), type: "image/jpeg", width, height };
}

export interface ImportResult {
  weekId: string;
  outcome: "unchanged" | "new" | "updated" | "changed_after_validation";
  weekStart: string | null;
  warnings: string[];
}

export async function importPlanningImage(db: Db, image: Buffer, source: "web" | "upload", weekStart?: string): Promise<ImportResult> {
  const hash = sha256(image);
  const same = await db.from("planning_tivoli_weeks").select("id, week_start").eq("image_hash", hash).maybeSingle();
  if (same.data) return { weekId: same.data.id, outcome: "unchanged", weekStart: same.data.week_start, warnings: [] };

  const ocr = await PlanningOcr.start();
  let read: PlanningRead;
  try {
    read = await ocr.read(image);
  } finally {
    await ocr.stop();
  }
  const start = weekStart ? mondayOf(weekStart) : read.period ? mondayOf(read.period.from) : null;
  const { rooms, people, learned } = await matchingData(db);
  const cells = proposedCells(
    read,
    start,
    rooms,
    people.map((p) => p.initials),
    learned
  );
  const stored = await forStorage(image);
  const row = {
    image_hash: hash,
    image_type: stored.type,
    image_base64: stored.data.toString("base64"),
    image_width: stored.width,
    image_height: stored.height,
    ocr: read,
    source,
  };

  const existing = start ? (await db.from("planning_tivoli_weeks").select("id, status").eq("week_start", start).maybeSingle()).data : null;
  if (existing?.status === "validated") {
    // What is exported stays the validated version until it is validated again.
    const { error } = await db.from("planning_tivoli_weeks").update({ ...row, changed_since_validation: true }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { weekId: existing.id, outcome: "changed_after_validation", weekStart: start, warnings: read.warnings };
  }
  if (existing) {
    const { error } = await db.from("planning_tivoli_weeks").update({ ...row, cells }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { weekId: existing.id, outcome: "updated", weekStart: start, warnings: read.warnings };
  }
  const { data, error } = await db
    .from("planning_tivoli_weeks")
    .insert({ ...row, week_start: start, cells, status: "draft" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Enregistrement impossible.");
  return { weekId: data.id, outcome: "new", weekStart: start, warnings: read.warnings };
}
