import { NextResponse, type NextRequest } from "next/server";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { exportVolume, listExports, type ExportFormat } from "@/lib/el-profesor/export/run";

// Export of a book as tomes, PDF and Word (for Google Docs), to share it
// outside the app — made from the book as it is at the moment of the click,
// so an illustration added or a fiche edited is in the next export. Admins
// only, like publishing. GET lists the tomes and the last exports, POST
// (re)makes one tome in one format.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  await requireElProfesorAdmin();
  const bookId = request.nextUrl.searchParams.get("bookId");
  if (!bookId) return NextResponse.json({ error: "Livre manquant." }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json(await listExports(bookId), { headers: NO_STORE });
  } catch (err) {
    console.error("[el-profesor/export] list failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Échec du chargement." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  await requireElProfesorAdmin();
  const body = (await request.json().catch(() => null)) as { bookId?: unknown; volume?: unknown; format?: unknown } | null;
  const bookId = typeof body?.bookId === "string" ? body.bookId : null;
  const volume = typeof body?.volume === "number" && Number.isInteger(body.volume) ? body.volume : null;
  const format = body?.format === "pdf" || body?.format === "docx" ? (body.format as ExportFormat) : null;
  if (!bookId || !volume || !format) return NextResponse.json({ error: "Requête incomplète." }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ files: await exportVolume(bookId, volume, format) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[el-profesor/export] export failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Échec de l'export." }, { status: 500, headers: NO_STORE });
  }
}
