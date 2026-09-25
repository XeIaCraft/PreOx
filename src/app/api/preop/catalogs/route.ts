import { NextResponse, type NextRequest } from "next/server";
import { listCatalogOverrides, requirePreopAccess, saveCatalogOverrides } from "@/lib/preop/dal";
import { isSameOrigin } from "@/lib/preop/same-origin";

// The user's changes to the Préop catalogues: GET returns all of them,
// PUT replaces one list's changes ({ kind, overrides }).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const profile = await requirePreopAccess();
  try {
    return NextResponse.json({ overrides: await listCatalogOverrides(profile.id) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/catalogs] list failed:", err);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request, true)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const profile = await requirePreopAccess();
  let body: { kind?: unknown; overrides?: unknown } | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400, headers: NO_STORE });
  }
  const result = await saveCatalogOverrides(profile.id, body?.kind, body?.overrides);
  return result.ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: result.error }, { status: 422, headers: NO_STORE });
}
