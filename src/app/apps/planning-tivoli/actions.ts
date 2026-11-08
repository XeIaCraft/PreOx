"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlanningAccess } from "@/lib/planning-tivoli/dal";
import { planningDb } from "@/lib/planning-tivoli/access";
import { fetchPlanningImage } from "@/lib/planning-tivoli/fetch";
import { importPlanningImage, matchingData, mondayOf, proposedCells, type ImportResult } from "@/lib/planning-tivoli/import";
import { cleanCell, learnedFrom, normInitials } from "@/lib/planning-tivoli/initials";
import { generateExportToken, generateShareToken } from "@/lib/planning-tivoli/token";
import type { PlanningCells } from "@/lib/planning-tivoli/types";

const PATH = "/apps/planning-tivoli";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: unknown): { ok: false; error: string } => ({ ok: false, error: error instanceof Error ? error.message : String(error) });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cellsSchema = z.record(isoDate, z.record(z.string().max(40), z.string().max(40)));

/** « Mettre à jour depuis le planning »: the published image, read if it changed. */
export async function refreshFromWeb(token?: string): Promise<Result<ImportResult>> {
  const { db } = await planningDb(token);
  const now = new Date().toISOString();
  try {
    const { data: settings } = await db.from("planning_tivoli_settings").select("source_url").maybeSingle();
    const fetched = await fetchPlanningImage(settings?.source_url || undefined);
    const result = await importPlanningImage(db, fetched.image, "web");
    await db.from("planning_tivoli_settings").update({ last_checked_at: now, last_image_hash: fetched.hash, last_error: null }).eq("id", true);
    revalidatePath(PATH);
    return { ok: true, data: result };
  } catch (err) {
    await db.from("planning_tivoli_settings").update({ last_checked_at: now, last_error: err instanceof Error ? err.message : String(err) }).eq("id", true);
    return fail(err);
  }
}

/** An image imported by hand (the slide's image saved, or a capture of the published page). */
export async function importImage(base64: string, weekStart?: string, token?: string): Promise<Result<ImportResult>> {
  try {
    const { db } = await planningDb(token);
    const image = Buffer.from(base64, "base64");
    if (image.length < 1000 || image.length > 15_000_000) throw new Error("Image vide ou trop lourde (15 Mo au plus).");
    const result = await importPlanningImage(db, image, "upload", weekStart && isoDate.safeParse(weekStart).success ? weekStart : undefined);
    revalidatePath(PATH);
    return { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

/** The image of a week, for the cells shown next to what was read. */
export async function getWeekImage(weekId: string, token?: string): Promise<Result<{ type: string; base64: string }>> {
  const { db } = await planningDb(token);
  const { data, error } = await db.from("planning_tivoli_weeks").select("image_type, image_base64").eq("id", weekId).single();
  if (error || !data) return fail(error?.message ?? "Semaine introuvable.");
  return { ok: true, data: { type: data.image_type, base64: data.image_base64 } };
}

/** The week, when the title could not be read: the cells are proposed again for those dates. */
export async function setWeekStart(weekId: string, date: string, token?: string): Promise<Result> {
  const { db } = await planningDb(token);
  if (!isoDate.safeParse(date).success) return fail("Date invalide.");
  const start = mondayOf(date);
  const { data: week } = await db.from("planning_tivoli_weeks").select("ocr").eq("id", weekId).single();
  if (!week) return fail("Semaine introuvable.");
  const { rooms, people, learned } = await matchingData(db);
  const cells = proposedCells(
    week.ocr,
    start,
    rooms,
    people.map((p) => p.initials),
    learned
  );
  const { error } = await db.from("planning_tivoli_weeks").update({ week_start: start, cells }).eq("id", weekId);
  if (error) return fail(error.code === "23505" ? "Cette semaine existe déjà : supprimez l'une des deux." : error.message);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/** The cells as corrected so far (the week stays to validate). */
export async function saveWeekCells(weekId: string, cells: PlanningCells, token?: string): Promise<Result> {
  const { db } = await planningDb(token);
  const parsed = cellsSchema.safeParse(cells);
  if (!parsed.success) return fail("Cases invalides.");
  const clean = Object.fromEntries(Object.entries(parsed.data).map(([d, row]) => [d, Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cleanCell(v)]))]));
  const { error } = await db.from("planning_tivoli_weeks").update({ cells: clean }).eq("id", weekId);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

/**
 * The week validated: exported from now on. Each correction of an initial
 * the OCR misread (« Hc » → « He ») is remembered for the next readings.
 */
export async function validateWeek(weekId: string, cells: PlanningCells, corrections: { read: string; kept: string }[], token?: string): Promise<Result> {
  const { db, profileId } = await planningDb(token);
  const parsed = cellsSchema.safeParse(cells);
  if (!parsed.success) return fail("Cases invalides.");
  const clean = Object.fromEntries(Object.entries(parsed.data).map(([d, row]) => [d, Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cleanCell(v)]))]));
  const { error } = await db
    .from("planning_tivoli_weeks")
    .update({ cells: clean, status: "validated", changed_since_validation: false, validated_at: new Date().toISOString(), validated_by: profileId })
    .eq("id", weekId);
  if (error) return fail(error.message);

  const learned = Object.entries(Object.assign({}, ...corrections.slice(0, 200).map((c) => learnedFrom(c.read, c.kept))) as Record<string, string>);
  if (learned.length) {
    const { data: existing } = await db
      .from("planning_tivoli_ocr_fixes")
      .select("read, hits")
      .in(
        "read",
        learned.map(([r]) => r)
      );
    const hits = new Map((existing ?? []).map((e) => [e.read, e.hits]));
    await db.from("planning_tivoli_ocr_fixes").upsert(learned.map(([read, fixed]) => ({ read, fixed, hits: (hits.get(read) ?? 0) + 1 })));
  }
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function reopenWeek(weekId: string, token?: string): Promise<Result> {
  const { db } = await planningDb(token);
  const { error } = await db.from("planning_tivoli_weeks").update({ status: "draft" }).eq("id", weekId);
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

export async function deleteWeek(weekId: string, token?: string): Promise<Result> {
  const { db } = await planningDb(token);
  const { error } = await db.from("planning_tivoli_weeks").delete().eq("id", weekId);
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

// --- Initials → names ----------------------------------------------------------------

const personSchema = z.object({ id: z.uuid().optional(), initials: z.string().trim().min(1).max(8), name: z.string().trim().min(1).max(120), role: z.enum(["pg", "senior"]).nullable().optional() });

export async function savePerson(input: { id?: string; initials: string; name: string; role?: "pg" | "senior" | null }, token?: string): Promise<Result<{ id: string }>> {
  const { db } = await planningDb(token);
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return fail("Initiales (8 caractères au plus) et nom requis.");
  const row = { initials: parsed.data.initials.replace(/\s+/g, ""), name: parsed.data.name, role: parsed.data.role ?? null };
  const res = parsed.data.id ? await db.from("planning_tivoli_people").update(row).eq("id", parsed.data.id).select("id").single() : await db.from("planning_tivoli_people").insert(row).select("id").single();
  if (res.error || !res.data) return fail(res.error?.code === "23505" ? `Les initiales « ${row.initials} » existent déjà.` : (res.error?.message ?? "Enregistrement impossible."));
  revalidatePath(PATH);
  return { ok: true, data: { id: res.data.id } };
}

export async function deletePerson(id: string, token?: string): Promise<Result> {
  const { db } = await planningDb(token);
  const { error } = await db.from("planning_tivoli_people").delete().eq("id", id);
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

export async function deleteOcrFix(read: string, token?: string): Promise<Result> {
  const { db } = await planningDb(token);
  const { error } = await db.from("planning_tivoli_ocr_fixes").delete().eq("read", normInitials(read));
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

// --- Rooms ------------------------------------------------------------------------------

const roomSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  image_label: z.string().trim().max(30),
  sort_order: z.number().int().min(0).max(999),
  active: z.boolean(),
  solo: z.enum(["senior", "either"]),
  part: z.union([z.literal(1), z.literal(2)]).nullable(),
});

/** The whole list as edited (names, image columns, export order, active), and the rooms removed. */
export async function saveRooms(rooms: z.input<typeof roomSchema>[], removed: string[], token?: string): Promise<Result> {
  const { db } = await planningDb(token);
  const parsed = z.array(roomSchema).max(60).safeParse(rooms);
  if (!parsed.success) return fail("Salle invalide : un nom est requis.");
  for (const r of parsed.data) {
    const { error } = r.id ? await db.from("planning_tivoli_rooms").update(r).eq("id", r.id) : await db.from("planning_tivoli_rooms").insert(r);
    if (error) return fail(error.message);
  }
  if (removed.length) {
    const { error } = await db
      .from("planning_tivoli_rooms")
      .delete()
      .in("id", z.array(z.uuid()).parse(removed));
    if (error) return fail(error.message);
  }
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

// --- Export token -------------------------------------------------------------------

/** A new token (the previous one stops working): shown once, only its hash is kept. */
export async function generateToken(): Promise<Result<{ token: string }>> {
  await requirePlanningAccess();
  const { token, hash } = generateExportToken();
  const db = await createClient();
  const { error } = await db.from("planning_tivoli_settings").update({ export_token_hash: hash }).eq("id", true);
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: { token } };
}

export async function revokeToken(): Promise<Result> {
  await requirePlanningAccess();
  const db = await createClient();
  const { error } = await db.from("planning_tivoli_settings").update({ export_token_hash: null }).eq("id", true);
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

// --- Public link (read only) ------------------------------------------------------------

/** A new public link (the previous one stops working). */
export async function generateShareLink(): Promise<Result<{ token: string }>> {
  await requirePlanningAccess();
  const token = generateShareToken();
  const db = await createClient();
  const { error } = await db.from("planning_tivoli_settings").update({ share_token: token }).eq("id", true);
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: { token } };
}

export async function revokeShareLink(): Promise<Result> {
  await requirePlanningAccess();
  const db = await createClient();
  const { error } = await db.from("planning_tivoli_settings").update({ share_token: null }).eq("id", true);
  revalidatePath(PATH);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

/** A change made from the public link, undone: the cell gets its previous text back (and the undoing is logged too). */
export async function undoPublicEdit(editId: string): Promise<Result> {
  await requirePlanningAccess();
  const db = await createClient();
  const { data: edit } = await db.from("planning_tivoli_cell_edits").select("day, label, old_value").eq("id", editId).single();
  if (!edit) return fail("Modification introuvable.");
  const { data, error } = await createAdminClient().rpc("planning_tivoli_set_cell", { p_day: edit.day, p_label: edit.label, p_value: edit.old_value });
  revalidatePath(PATH);
  return error || !data ? fail(error?.message ?? "Ce jour n'est plus dans une semaine validée.") : { ok: true, data: undefined };
}

// --- One cell of the planning (from the Planning tab, with or without sign-in) -------------

/** A cell of a validated week changed, logged in the history. */
export async function setCell(day: string, label: string, value: string, token?: string): Promise<Result<{ value: string }>> {
  const { db } = await planningDb(token);
  const parsed = z.object({ day: isoDate, label: z.string().min(1).max(30), value: z.string().max(40) }).safeParse({ day, label, value });
  if (!parsed.success) return fail("Case invalide.");
  const { data: rooms } = await db.from("planning_tivoli_rooms").select("image_label").eq("active", true).eq("image_label", parsed.data.label).limit(1);
  if (!rooms?.length) return fail("Salle inconnue.");
  const clean = cleanCell(parsed.data.value);
  const { data, error } = await createAdminClient().rpc("planning_tivoli_set_cell", { p_day: parsed.data.day, p_label: parsed.data.label, p_value: clean });
  if (error) return fail("Enregistrement impossible.");
  if (!data) return fail("Ce jour n'est pas dans un planning validé.");
  return { ok: true, data: { value: clean } };
}
