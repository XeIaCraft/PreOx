"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanCell } from "@/lib/planning-tivoli/initials";

type Result = { ok: true; value: string } | { ok: false; error: string };

const input = z.object({ token: z.string().min(8).max(80), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().min(1).max(30), value: z.string().max(40) });

/**
 * A cell changed from the public link: anyone who holds the link may do it
 * (on purpose: the planning is kept up to date by whoever knows a change).
 * Each change is written to the history, which can be undone from the module.
 */
export async function savePublicCell(token: string, day: string, label: string, value: string): Promise<Result> {
  const parsed = input.safeParse({ token, day, label, value });
  if (!parsed.success) return { ok: false, error: "Case invalide." };
  const admin = createAdminClient();
  const { data: settings } = await admin.from("planning_tivoli_settings").select("share_token").eq("share_token", parsed.data.token).maybeSingle();
  if (!settings) return { ok: false, error: "Lien désactivé." };
  const { data: rooms } = await admin.from("planning_tivoli_rooms").select("image_label").eq("active", true).eq("image_label", parsed.data.label).limit(1);
  if (!rooms?.length) return { ok: false, error: "Salle inconnue." };
  const clean = cleanCell(parsed.data.value);
  const { data, error } = await admin.rpc("planning_tivoli_set_cell", { p_day: parsed.data.day, p_label: parsed.data.label, p_value: clean });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  if (!data) return { ok: false, error: "Ce jour n'est pas dans un planning validé." };
  return { ok: true, value: clean };
}
