import "server-only";

import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { matchingData } from "./import";

export const PLANNING_SLUG = "planning-tivoli";

export async function requirePlanningAccess(): Promise<Profile> {
  const profile = await requireProfile();
  const app = await getAppBySlugForProfile(PLANNING_SLUG, profile);
  if (!app || !app.hasAccess) notFound();
  return profile;
}

/** The weeks (without their images), rooms, initials, learned misreadings and settings. */
export async function getPlanningData() {
  const db = await createClient();
  const [weeks, settings, matching, edits] = await Promise.all([
    db
      .from("planning_tivoli_weeks")
      .select("id, week_start, status, source, image_hash, image_width, image_height, ocr, cells, changed_since_validation, validated_at, created_at, updated_at")
      .order("week_start", { ascending: false, nullsFirst: true })
      .limit(12),
    db.from("planning_tivoli_settings").select("source_url, export_token_hash, share_token, last_checked_at, last_error").maybeSingle(),
    matchingData(db),
    db.from("planning_tivoli_cell_edits").select("id, day, label, old_value, new_value, created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  return {
    weeks: weeks.data ?? [],
    settings: {
      sourceUrl: settings.data?.source_url ?? "",
      hasToken: !!settings.data?.export_token_hash,
      shareToken: settings.data?.share_token ?? null,
      lastCheckedAt: settings.data?.last_checked_at ?? null,
      lastError: settings.data?.last_error ?? null,
    },
    edits: edits.data ?? [],
    ...matching,
  };
}

export type PlanningData = Awaited<ReturnType<typeof getPlanningData>>;
export type PlanningWeekSummary = PlanningData["weeks"][number];
