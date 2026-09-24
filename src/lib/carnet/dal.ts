import "server-only";

// Server side of the "Carnet de stage" module: access check, full snapshot
// read, and application of the client's queued changes. The browser reaches
// it through app/api/carnet/sync/route.ts with plain fetch() calls — never
// Server Actions, which Next.js runs one at a time per client.
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, ROW_SCHEMAS, PATCH_SCHEMAS } from "./schemas";
import { upgradePatch, upgradeProfile, upgradeRow } from "./compat";
import { emptyCarnetData, type CarnetCollection, type CarnetData, type CarnetMutation, type CarnetMutationResult } from "./types";
import type { Profile } from "@/lib/supabase/types";

export const CARNET_SLUG = "carnet-de-stage";

export async function requireCarnetAccess(): Promise<Profile> {
  const profile = await requireProfile();
  const app = await getAppBySlugForProfile(CARNET_SLUG, profile);
  if (!app || !app.hasAccess) notFound();
  return profile;
}

const TABLES = {
  supervisors: "carnet_supervisors",
  stages: "carnet_stages",
  stage_reviews: "carnet_stage_reviews",
  signatures: "carnet_signatures",
  cases: "carnet_cases",
  duties: "carnet_duties",
  related_activities: "carnet_related_activities",
  courses: "carnet_courses",
  publications: "carnet_publications",
  years: "carnet_years",
} as const satisfies Record<CarnetCollection, string>;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Table = (typeof TABLES)[CarnetCollection];

const PAGE = 1000;

/** Every row of one of this user's tables, paged past PostgREST's max_rows cap (1000 by default — a few years of cases exceed it). */
async function selectAll(supabase: Supabase, table: Table, userId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", userId).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

function stripOwner(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  delete rest.user_id;
  delete rest.updated_at;
  return rest;
}

/** The whole carnet of this user, in one go — small enough (thousands of rows at most) to be cached entirely on the device. */
export async function loadCarnetData(userId: string): Promise<CarnetData> {
  const supabase = await createClient();
  const collections = Object.keys(TABLES) as CarnetCollection[];
  const [profileRes, ...lists] = await Promise.all([
    supabase.from("carnet_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ...collections.map((c) => selectAll(supabase, TABLES[c], userId)),
  ]);
  if (profileRes.error) throw new Error(`carnet_profiles: ${profileRes.error.message}`);

  const data = emptyCarnetData();
  data.profile = profileRes.data ? (stripOwner(profileRes.data as unknown as Record<string, unknown>) as unknown as CarnetData["profile"]) : null;
  collections.forEach((c, i) => {
    (data as unknown as Record<string, unknown[]>)[c] = lists[i].map(stripOwner);
  });
  return data;
}

/** Constraint violations, bad data, permission refusals — retrying the same change can never succeed. */
function isPermanent(code: string | undefined): boolean {
  return !!code && (code.startsWith("22") || code.startsWith("23") || code === "42501" || code.startsWith("PGRST1"));
}

function failure(m: CarnetMutation, error: string, retryable: boolean): CarnetMutationResult {
  return { id: m.id, ok: false, error, retryable };
}

async function applyOne(supabase: Supabase, userId: string, m: CarnetMutation): Promise<CarnetMutationResult> {
  if (m.collection === "profile") {
    const parsed = profileSchema.safeParse(upgradeProfile(m.row));
    if (!parsed.success) return failure(m, parsed.error.issues[0]?.message ?? "Profil invalide", false);
    const { error } = await supabase.from("carnet_profiles").upsert({ ...parsed.data, user_id: userId }, { onConflict: "user_id" });
    return error ? failure(m, error.message, !isPermanent(error.code)) : { id: m.id, ok: true };
  }

  const table = TABLES[m.collection];
  if (!table) return failure(m, "Collection inconnue", false);

  if (m.op === "put") {
    const parsed = ROW_SCHEMAS[m.collection].safeParse(upgradeRow(m.collection, m.row));
    if (!parsed.success) return failure(m, parsed.error.issues[0]?.message ?? "Données invalides", false);
    const onConflict = m.collection === "years" ? "user_id,training_year" : "id";
    const { error } = await supabase.from(table).upsert({ ...parsed.data, user_id: userId } as never, { onConflict });
    return error ? failure(m, error.message, !isPermanent(error.code)) : { id: m.id, ok: true };
  }

  if (m.op === "patch") {
    const parsed = PATCH_SCHEMAS[m.collection].safeParse(upgradePatch(m.collection, m.patch));
    if (!parsed.success) return failure(m, parsed.error.issues[0]?.message ?? "Données invalides", false);
    if (Object.keys(parsed.data).length === 0) return { id: m.id, ok: true };
    const { error } = await supabase.from(table).update(parsed.data as never).eq("id", m.rowId).eq("user_id", userId);
    return error ? failure(m, error.message, !isPermanent(error.code)) : { id: m.id, ok: true };
  }

  if (m.op === "delete") {
    const { error } = await supabase.from(table).delete().eq("id", m.rowId).eq("user_id", userId);
    return error ? failure(m, error.message, !isPermanent(error.code)) : { id: m.id, ok: true };
  }

  return failure(m, "Opération inconnue", false);
}

export const MAX_MUTATIONS_PER_REQUEST = 100;

/**
 * Applies the client's queued changes in order. A change refused for good
 * (invalid data, constraint) is reported and skipped — it must never block
 * everything queued after it. A transient failure stops the batch there, so
 * later changes can't overtake it; the client retries from that point.
 */
export async function applyCarnetMutations(userId: string, mutations: CarnetMutation[]): Promise<CarnetMutationResult[]> {
  const supabase = await createClient();
  const results: CarnetMutationResult[] = [];
  for (const m of mutations.slice(0, MAX_MUTATIONS_PER_REQUEST)) {
    let result: CarnetMutationResult;
    try {
      result = await applyOne(supabase, userId, m);
    } catch (err) {
      result = failure(m, err instanceof Error ? err.message : "Erreur serveur", true);
    }
    results.push(result);
    if (!result.ok && result.retryable) break;
  }
  return results;
}
