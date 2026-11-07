import { createAdminClient } from "@/lib/supabase/admin";
import { tokenMatches } from "@/lib/planning-tivoli/token";
import { nameResolver, planningCsv, roleResolver, type ExportDay } from "@/lib/planning-tivoli/csv";
import { addDays } from "@/lib/planning-tivoli/import";

export const dynamic = "force-dynamic";

/** Days exported around today. */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 28;

/**
 * The validated weeks as CSV for the Google Sheet:
 * =IMPORTDATA("https://<domaine>/api/planning-tivoli/export?token=<jeton>")
 * in A3 of the « Planning » tab. IMPORTDATA cannot log in, hence the token in
 * the address (only its hash is stored); without a valid one: 401. Only
 * names of staff, no patient data.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const admin = createAdminClient();
  const { data: settings } = await admin.from("planning_tivoli_settings").select("export_token_hash").maybeSingle();
  if (!tokenMatches(token, settings?.export_token_hash ?? null)) {
    return new Response("Jeton invalide ou révoqué.\n", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -DAYS_BEFORE);
  const to = addDays(today, DAYS_AFTER);
  const [weeks, rooms, people] = await Promise.all([
    admin.from("planning_tivoli_weeks").select("cells").eq("status", "validated").gte("week_start", addDays(from, -6)).lte("week_start", to),
    admin.from("planning_tivoli_rooms").select("image_label, solo").eq("active", true).order("sort_order"),
    admin.from("planning_tivoli_people").select("initials, name, role"),
  ]);
  const days: ExportDay[] = (weeks.data ?? []).flatMap((w) => Object.entries(w.cells ?? {}).map(([date, cells]) => ({ date, cells }))).filter((d) => d.date >= from && d.date <= to);
  const csv = planningCsv(
    days,
    (rooms.data ?? []).map((r) => ({ label: r.image_label, solo: r.solo })),
    nameResolver(people.data ?? []),
    roleResolver(people.data ?? [])
  );
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
}
