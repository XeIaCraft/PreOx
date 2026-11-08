import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanningData } from "@/lib/planning-tivoli/dal";
import { PlanningApp } from "@/components/planning-tivoli/planning-app";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Planning Tivoli", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
// The OCR of a planning (server actions of this page) takes a few seconds; the fetch of the published page too.
export const maxDuration = 60;

/**
 * The whole module behind a link: anyone who holds it sees and updates the
 * same data (import, check, validate, initials, rooms) without signing in,
 * on purpose — the planning is kept up to date by whoever knows a change.
 * Only the export to the Sheet and the link itself stay in the dashboard.
 * Same opaque-token model as the shared vote link; names of staff only, no
 * patient data.
 */
export default async function PlanningSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: settings } = await admin.from("planning_tivoli_settings").select("share_token").eq("share_token", token).maybeSingle();
  if (!settings) notFound();
  const data = await getPlanningData(admin);
  return (
    <ToastProvider>
      <PlanningApp data={{ ...data, edits: [], settings: { ...data.settings, shareToken: null } }} today={new Date().toISOString().slice(0, 10)} token={token} />
    </ToastProvider>
  );
}
