import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExportDay } from "@/lib/planning-tivoli/csv";
import { addDays } from "@/lib/planning-tivoli/import";
import { PublicPlanning } from "./public-planning";

export const metadata: Metadata = { title: "Planning Tivoli", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DAYS_BEFORE = 7;
const DAYS_AFTER = 28;

/**
 * Public planning: anyone with the link sees the validated weeks and can
 * correct a cell (on purpose, so it stays up to date when the owner is away;
 * every change is logged and can be undone from the module). Names of staff
 * only, no patient data. Same opaque-token model as the shared vote link.
 */
export default async function PlanningSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: settings } = await admin.from("planning_tivoli_settings").select("share_token").eq("share_token", token).maybeSingle();
  if (!settings) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -DAYS_BEFORE);
  const to = addDays(today, DAYS_AFTER);
  const [weeks, rooms, people] = await Promise.all([
    admin.from("planning_tivoli_weeks").select("cells").eq("status", "validated").gte("week_start", addDays(from, -6)).lte("week_start", to),
    admin.from("planning_tivoli_rooms").select("name, image_label, solo, part").eq("active", true).neq("image_label", "").order("sort_order"),
    admin.from("planning_tivoli_people").select("initials, name, role"),
  ]);
  const days: ExportDay[] = (weeks.data ?? []).flatMap((w) => Object.entries(w.cells ?? {}).map(([date, cells]) => ({ date, cells }))).filter((d) => d.date >= from && d.date <= to);
  const byDate = new Map<string, Record<string, string>>();
  for (const d of days) byDate.set(d.date, { ...(byDate.get(d.date) ?? {}), ...d.cells });

  return (
    <PublicPlanning
      token={token}
      today={today}
      initialDays={[...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, cells]) => ({ date, cells }))}
      rooms={(rooms.data ?? []).map((r) => ({ name: r.name, label: r.image_label, solo: r.solo, part: r.part }))}
      people={(people.data ?? []).map((p) => ({ initials: p.initials, name: p.name, role: p.role ?? null }))}
    />
  );
}
