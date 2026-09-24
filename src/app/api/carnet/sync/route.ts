import { NextResponse, type NextRequest } from "next/server";
import { requireCarnetAccess, loadCarnetData, applyCarnetMutations, MAX_MUTATIONS_PER_REQUEST } from "@/lib/carnet/dal";
import type { CarnetMutation } from "@/lib/carnet/types";

// Sync endpoint of the local-first "Carnet de stage": GET returns this
// user's whole carnet, POST applies a batch of queued local changes. Plain
// HTTP (not Server Actions) so it runs in parallel with anything else and
// never re-renders a page — see src/lib/carnet/dal.ts.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  // Outside the try on purpose: an expired session / no access throws
  // Next's redirect/notFound, turned into a 307/404 for this request.
  const profile = await requireCarnetAccess();
  try {
    return NextResponse.json(await loadCarnetData(profile.id), { headers: NO_STORE });
  } catch (err) {
    console.error("[carnet/sync] load failed:", err);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500, headers: NO_STORE });
  }
}

/** Same-origin JSON only — the CSRF protection Server Actions get for free. */
function isSameOriginJson(request: NextRequest): boolean {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const profile = await requireCarnetAccess();
  let mutations: unknown;
  try {
    mutations = ((await request.json()) as { mutations?: unknown })?.mutations;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400, headers: NO_STORE });
  }
  if (!Array.isArray(mutations) || mutations.length > MAX_MUTATIONS_PER_REQUEST) {
    return NextResponse.json({ error: "Liste de modifications invalide." }, { status: 400, headers: NO_STORE });
  }
  const valid = mutations.filter(
    (m): m is CarnetMutation => !!m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string" && typeof (m as { op?: unknown }).op === "string"
  );
  const results = await applyCarnetMutations(profile.id, valid);
  return NextResponse.json({ results }, { headers: NO_STORE });
}
