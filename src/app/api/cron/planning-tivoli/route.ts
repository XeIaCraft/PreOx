import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPlanningImage } from "@/lib/planning-tivoli/fetch";
import { importPlanningImage } from "@/lib/planning-tivoli/import";

export const maxDuration = 60;

/**
 * Every morning (vercel.json): the published planning is fetched; when its
 * image changed since the last check, it is read by the OCR and kept as a
 * week to verify in the module — nothing reaches the Google Sheet before it
 * is validated there. Same CRON_SECRET check as the other cron routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: settings } = await admin.from("planning_tivoli_settings").select("*").maybeSingle();
  const now = new Date().toISOString();
  try {
    const fetched = await fetchPlanningImage(settings?.source_url || undefined);
    if (fetched.hash === settings?.last_image_hash) {
      await admin.from("planning_tivoli_settings").update({ last_checked_at: now, last_error: null }).eq("id", true);
      return NextResponse.json({ outcome: "unchanged" });
    }
    const result = await importPlanningImage(admin, fetched.image, "web");
    await admin.from("planning_tivoli_settings").update({ last_checked_at: now, last_image_hash: fetched.hash, last_error: null }).eq("id", true);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("planning_tivoli_settings").update({ last_checked_at: now, last_error: message }).eq("id", true);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
