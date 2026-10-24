import { NextResponse, type NextRequest } from "next/server";
import { listCatalogOverrides, preopLibrary, requirePreopAccess, saveCatalogOverrides } from "@/lib/preop/dal";
import { isSameOrigin } from "@/lib/preop/same-origin";

// The changes to the Préop catalogues, common to everyone (preopLibrary): GET
// returns all of them; for an admin,
// PUT replaces one list's changes ({ kind, overrides }).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const { ownerId } = await preopLibrary(await requirePreopAccess());
  try {
    return NextResponse.json({ overrides: await listCatalogOverrides(ownerId) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/catalogs] list failed:", err);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request, true)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const { ownerId, canEdit } = await preopLibrary(await requirePreopAccess());
  if (!canEdit) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403, headers: NO_STORE });
  let body: { kind?: unknown; overrides?: unknown } | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400, headers: NO_STORE });
  }
  const result = await saveCatalogOverrides(ownerId, body?.kind, body?.overrides);
  return result.ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: result.error }, { status: 422, headers: NO_STORE });
}
