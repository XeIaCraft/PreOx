import { NextResponse, type NextRequest } from "next/server";
import { getServicePrefs, requirePreopAccess, saveServicePrefs } from "@/lib/preop/dal";
import { isSameOrigin } from "@/lib/preop/same-origin";

// The service's preferences (volatile agent, FiO₂, fresh gas flow, setron,
// dexamethasone): GET returns them, PUT replaces them.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const profile = await requirePreopAccess();
  try {
    return NextResponse.json({ prefs: await getServicePrefs(profile.id) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/service] get failed:", err);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request, true)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const profile = await requirePreopAccess();
  let body: { prefs?: unknown } | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400, headers: NO_STORE });
  }
  const result = await saveServicePrefs(profile.id, body?.prefs);
  return result.ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: result.error }, { status: 422, headers: NO_STORE });
}
