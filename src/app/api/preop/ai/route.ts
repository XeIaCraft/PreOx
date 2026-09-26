import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePreopAccess } from "@/lib/preop/dal";
import { isSameOrigin } from "@/lib/preop/same-origin";
import { aiStatus, consensusSearch, geminiDraft, saveAiSettings } from "@/lib/preop/ai/server";

// The Préop AI assistant: GET the configuration (never the keys), PUT the
// keys and quota, POST a general question to Consensus (sources) or Gemini
// (draft answer). No patient data: the question is checked on the server.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const paper = z.object({
  title: z.string().max(600),
  authors: z.array(z.string().max(120)).max(6),
  year: z.number().int().nullable(),
  journal: z.string().max(300),
  doi: z.string().max(200),
  url: z.string().max(500),
  studyType: z.string().max(80),
  citations: z.number().int().nullable(),
  takeaway: z.string().max(1500),
  abstract: z.string().max(1500),
});

const post = z.discriminatedUnion("action", [
  z.object({ action: z.literal("consensus"), query: z.string().min(1).max(6000) }),
  z.object({ action: z.literal("gemini"), prompt: z.string().min(1).max(6000), papers: z.array(paper).max(10).default([]), mode: z.enum(["rule", "protocol"]).default("rule") }),
]);

const put = z.object({
  geminiKey: z.string().max(300).optional(),
  geminiModel: z.string().max(60).optional(),
  consensusKey: z.string().max(300).optional(),
  consensusLimit: z.number().int().min(0).max(100000).optional(),
});

async function body(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const profile = await requirePreopAccess();
  try {
    return NextResponse.json({ status: await aiStatus(profile.id) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[preop/ai] status failed:", err);
    return NextResponse.json({ error: "Réglages de l'assistant indisponibles (la migration 088 est-elle appliquée ?)." }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request, true)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const profile = await requirePreopAccess();
  const parsed = put.safeParse(await body(request));
  if (!parsed.success) return NextResponse.json({ error: "Réglages invalides." }, { status: 400, headers: NO_STORE });
  const result = await saveAiSettings(profile.id, parsed.data);
  return result.ok ? NextResponse.json({ status: result.value }, { headers: NO_STORE }) : NextResponse.json({ error: result.error }, { status: 422, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, true)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const profile = await requirePreopAccess();
  const parsed = post.safeParse(await body(request));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400, headers: NO_STORE });
  const result = parsed.data.action === "consensus" ? await consensusSearch(profile.id, parsed.data.query) : await geminiDraft(profile.id, parsed.data.prompt, parsed.data.papers, parsed.data.mode);
  return result.ok
    ? NextResponse.json(result.value, { headers: NO_STORE })
    : NextResponse.json({ error: result.error, issues: result.issues ?? [] }, { status: result.issues ? 422 : 502, headers: NO_STORE });
}
