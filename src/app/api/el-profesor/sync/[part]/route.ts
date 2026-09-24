import { NextResponse, type NextRequest } from "next/server";
import {
  resolveSyncContext,
  getElProfesorDashboardSnapshot,
  loadSyncManifest,
  loadUserSyncData,
  loadReviewHistory,
  loadDashboardExtras,
  loadNotionViewData,
  loadAiConfigData,
  getElProfesorNotionsPageData,
  getElProfesorChapterContentBatch,
} from "@/lib/el-profesor/sync-data";
import { applyPendingWritesOnServer, MAX_WRITES_PER_FLUSH } from "@/lib/el-profesor/flush-writes";

// Every read the El Profesor local cache syncs, and the write queue's flush
// (piste 2026-09-24 — suite aux retours "synchronisation hyper lente" et
// "plus accès aux réglages IA"): plain HTTP endpoints instead of Server
// Actions, because Next.js runs a client's Server Actions strictly one at a
// time — its own docs say to use a Route Handler for reads — and every read
// the sync or the settings dialog made used to wait behind every other
// queued action. fetch() calls to this route run in parallel, never
// re-render a page, and get their own function duration. See sync-data.ts.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

async function run(label: string, load: () => Promise<unknown>) {
  try {
    return json(await load());
  } catch (err) {
    console.error(`[el-profesor/sync] ${label} failed:`, err);
    return json({ error: "Échec du chargement." }, 500);
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ part: string }> }) {
  const { part } = await params;
  // Outside run()'s try/catch on purpose: an expired session or a user
  // without access throws Next's redirect/notFound control-flow errors,
  // which the framework turns into a 307/404 for this request — the client
  // treats any non-JSON/non-2xx answer as a failed sync step.
  const ctx = await resolveSyncContext();

  switch (part) {
    case "snapshot":
      return run(part, () => getElProfesorDashboardSnapshot(ctx));
    case "manifest":
      return run(part, () => loadSyncManifest(ctx));
    case "user-data":
      return run(part, () => loadUserSyncData(ctx.profileId));
    case "review-history": {
      const since = request.nextUrl.searchParams.get("since");
      if (since && Number.isNaN(new Date(since).getTime())) return json({ error: "Paramètre since invalide." }, 400);
      return run(part, () => loadReviewHistory(ctx.profileId, since ? new Date(since).toISOString() : null));
    }
    case "extras":
      return run(part, () => loadDashboardExtras(ctx));
    case "notion-view":
      return run(part, () => loadNotionViewData(ctx.profileId));
    case "ai-config":
      return run(part, async () => (ctx.isAdmin ? loadAiConfigData() : null));
    case "notions-page":
      return run(part, async () => (ctx.isAdmin ? getElProfesorNotionsPageData() : null));
    default:
      return json({ error: "Introuvable." }, 404);
  }
}

/**
 * Cookie-authenticated POSTs need the CSRF protection Server Actions get for
 * free: only accept a same-origin JSON request. A cross-site page can't set
 * this Content-Type without a CORS preflight this route never answers, and
 * browsers always send Origin on a POST.
 */
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

const MAX_CHAPTERS_PER_REQUEST = 50;

export async function POST(request: NextRequest, { params }: { params: Promise<{ part: string }> }) {
  if (!isSameOriginJson(request)) return json({ error: "Requête refusée." }, 403);
  const { part } = await params;
  await resolveSyncContext();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corps de requête invalide." }, 400);
  }

  switch (part) {
    case "chapters": {
      const ids = (body as { chapterIds?: unknown })?.chapterIds;
      if (!Array.isArray(ids) || ids.length > MAX_CHAPTERS_PER_REQUEST || !ids.every((id) => typeof id === "string")) {
        return json({ error: "Liste de chapitres invalide." }, 400);
      }
      return run(part, () => getElProfesorChapterContentBatch(ids as string[]));
    }
    case "flush": {
      const writes = (body as { writes?: unknown })?.writes;
      if (!Array.isArray(writes) || writes.length > MAX_WRITES_PER_FLUSH) return json({ error: "Liste d'écritures invalide." }, 400);
      return run(part, async () => ({ results: await applyPendingWritesOnServer(writes) }));
    }
    default:
      return json({ error: "Introuvable." }, 404);
  }
}
