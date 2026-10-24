import { NextResponse, type NextRequest } from "next/server";
import { deleteProtocol, listProtocols, preopLibrary, requirePreopAccess, saveProtocol } from "@/lib/preop/dal";
import { isSameOrigin } from "@/lib/preop/same-origin";

// Protocol library of the "Préop" module, common to everyone (preopLibrary):
// GET lists its protocols; for an admin, POST
// creates or replaces one, DELETE removes one (?id=). Plain HTTP, same
// pattern as the carnet's sync endpoint.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const { ownerId } = await preopLibrary(await requirePreopAccess());
  try {
    return NextResponse.json({ protocols: await listProtocols(ownerId) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/protocols] list failed:", err);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, true)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const { ownerId, canEdit } = await preopLibrary(await requirePreopAccess());
  if (!canEdit) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403, headers: NO_STORE });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400, headers: NO_STORE });
  }
  const result = await saveProtocol(ownerId, (body as { protocol?: unknown })?.protocol);
  return result.ok ? NextResponse.json({ protocol: result.protocol }, { headers: NO_STORE }) : NextResponse.json({ error: result.error }, { status: 422, headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request, false)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const { ownerId, canEdit } = await preopLibrary(await requirePreopAccess());
  if (!canEdit) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403, headers: NO_STORE });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400, headers: NO_STORE });
  try {
    await deleteProtocol(ownerId, id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/protocols] delete failed:", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500, headers: NO_STORE });
  }
}
