import { NextResponse, type NextRequest } from "next/server";
import { deleteRule, listRules, requirePreopAccess, saveRule } from "@/lib/preop/dal";

// Rule library of the "Préop" module: GET lists this user's rules, POST
// creates or replaces one, DELETE removes one (?id=). Plain HTTP, same
// pattern as the carnet's sync endpoint.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Same-origin JSON only — the CSRF protection Server Actions get for free. */
function isSameOrigin(request: NextRequest, requireJson: boolean): boolean {
  if (requireJson && !request.headers.get("content-type")?.startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET() {
  const profile = await requirePreopAccess();
  try {
    return NextResponse.json({ rules: await listRules(profile.id) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/rules] list failed:", err);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, true)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const profile = await requirePreopAccess();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400, headers: NO_STORE });
  }
  const result = await saveRule(profile.id, (body as { rule?: unknown })?.rule);
  return result.ok ? NextResponse.json({ rule: result.rule }, { headers: NO_STORE }) : NextResponse.json({ error: result.error }, { status: 422, headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request, false)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const profile = await requirePreopAccess();
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400, headers: NO_STORE });
  try {
    await deleteRule(profile.id, id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/rules] delete failed:", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500, headers: NO_STORE });
  }
}
