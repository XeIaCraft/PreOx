import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { toFicheBlock, resolveFicheContexts } from "./shared";
import { findDuplicateFlashcards } from "../dedupe";
import type {
  FicheBlock,
  Notion,
  NotionLinkedFiche,
  NotionSummary,
  NotionRecommendation,
  DoseCalculator,
  CaseJournalEntry,
  Contradiction,
  ContradictionStatus,
  CrossBookDuplicateFlashcards,
  SupersededFicheEntry,
  FlashcardSide,
  NotionUpdateProposal,
  NotionUpdateProposalStatus,
  ExtractedFicheBlock,
  ExtractedFlashcard,
} from "../types";
import type { Database } from "@/lib/supabase/types";

export async function getAllNotionNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_notions").select("name").order("name", { ascending: true });
  return (data ?? []).map((n) => n.name);
}

/**
 * Reuses an existing notion by case-insensitive name match, or creates a
 * new one. Race-safe enough for admin-only, low-frequency use. `client`
 * defaults to the request-scoped client — pass the service-role admin
 * client when calling with no user session (writes here are admin-only via
 * RLS, and an unauthenticated request is silently rejected, not errored).
 */
export async function findOrCreateNotion(name: string, client?: SupabaseClient<Database>): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const supabase = client ?? (await createClient());

  const { data: all } = await supabase.from("el_profesor_notions").select("id, name");
  const existing = (all ?? []).find((n) => n.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing.id;

  const { data: created, error } = await supabase.from("el_profesor_notions").insert({ name: trimmed }).select("id").maybeSingle();
  if (error || !created) {
    // Likely a race on the unique constraint — re-fetch and use whichever won.
    const { data: retry } = await supabase.from("el_profesor_notions").select("id, name").ilike("name", trimmed).maybeSingle();
    return retry?.id ?? null;
  }
  return created.id;
}

export async function linkFicheToNotion(notionId: string, ficheId: string, client?: SupabaseClient<Database>): Promise<void> {
  const supabase = client ?? (await createClient());
  await supabase.from("el_profesor_notion_links").upsert({ notion_id: notionId, fiche_id: ficheId }, { onConflict: "notion_id,fiche_id" });
}

export interface EmergencyBlockEntry {
  block: FicheBlock;
  ficheId: string;
  ficheTitle: string;
  chapterId: string;
  chapterTitle: string;
  bookId: string;
  bookTitle: string;
}

/**
 * Piste d'amélioration 2026-08-24 ("mode urgence / bloc") — every
 * published, admin-flagged emergency block across the whole library, for
 * the user-facing quick-reference view. Reads only already-published,
 * already-reviewed content — this function never generates or selects
 * anything an admin hasn't explicitly hand-flagged.
 */
export async function getEmergencyBlocks(): Promise<EmergencyBlockEntry[]> {
  const supabase = await createClient();
  const { data: blockRows } = await supabase
    .from("el_profesor_fiche_blocks")
    .select("*")
    .eq("is_emergency", true)
    .eq("status", "published");
  const rows = blockRows ?? [];
  if (rows.length === 0) return [];

  const ficheIds = [...new Set(rows.map((r) => r.fiche_id))];
  const contexts = await resolveFicheContexts(ficheIds);

  return rows
    .map((row) => {
      const ctx = contexts.get(row.fiche_id);
      if (!ctx) return null;
      return { block: toFicheBlock(row), ...ctx };
    })
    .filter((e): e is EmergencyBlockEntry => Boolean(e));
}

/** Every notion with only its *published* linked fiches (cross-book context included) — the user-facing transversal glossary. Notions left with no published fiche after filtering are omitted. */
export async function getGlossary(): Promise<NotionSummary[]> {
  const supabase = await createClient();
  const [{ data: notions }, { data: links }] = await Promise.all([
    supabase.from("el_profesor_notions").select("*").order("name", { ascending: true }),
    supabase.from("el_profesor_notion_links").select("notion_id, fiche_id"),
  ]);
  if (!notions || notions.length === 0 || !links || links.length === 0) return [];

  const ficheIds = [...new Set(links.map((l) => l.fiche_id))];
  const { data: publishedFiches } = await supabase
    .from("el_profesor_fiches")
    .select("id")
    .in("id", ficheIds)
    .eq("status", "published");
  const publishedIds = new Set((publishedFiches ?? []).map((f) => f.id));

  const ficheContexts = await resolveFicheContexts([...publishedIds]);

  return (notions as { id: string; name: string; created_at: string }[])
    .map((n) => ({
      notion: { id: n.id, name: n.name, createdAt: n.created_at } as Notion,
      fiches: links
        .filter((l) => l.notion_id === n.id && publishedIds.has(l.fiche_id))
        .map((l) => ficheContexts.get(l.fiche_id))
        .filter((f): f is NotionLinkedFiche => Boolean(f)),
    }))
    .filter((s) => s.fiches.length > 0);
}

/**
 * Other published fiches that share at least one notion with this one —
 * inline cross-links shown directly on a fiche, rather than only reachable
 * through the admin notions page. Item 4 of the backlog.
 */
export async function getRelatedFiches(ficheId: string): Promise<NotionLinkedFiche[]> {
  const supabase = await createClient();
  const { data: myLinks } = await supabase.from("el_profesor_notion_links").select("notion_id").eq("fiche_id", ficheId);
  const notionIds = (myLinks ?? []).map((l) => l.notion_id);
  if (notionIds.length === 0) return [];

  const { data: otherLinks } = await supabase
    .from("el_profesor_notion_links")
    .select("fiche_id")
    .in("notion_id", notionIds)
    .neq("fiche_id", ficheId);
  const otherFicheIds = [...new Set((otherLinks ?? []).map((l) => l.fiche_id))];
  if (otherFicheIds.length === 0) return [];

  const { data: publishedFiches } = await supabase
    .from("el_profesor_fiches")
    .select("id")
    .in("id", otherFicheIds)
    .eq("status", "published");
  const publishedIds = (publishedFiches ?? []).map((f) => f.id);
  if (publishedIds.length === 0) return [];

  const contexts = await resolveFicheContexts(publishedIds);
  return [...contexts.values()];
}

/**
 * Piste d'amélioration 2026-08-24 ("recommandations officielles rattachées
 * aux notions") — manual links to official guideline sources per notion,
 * grouped for however many notion ids the caller already has in hand
 * (glossary, admin notions screen). Never AI-generated: only an admin ever
 * writes to this table (see the migration).
 */
export async function getNotionRecommendations(notionIds: string[]): Promise<Record<string, NotionRecommendation[]>> {
  const result: Record<string, NotionRecommendation[]> = {};
  if (notionIds.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_notion_recommendations")
    .select("id, notion_id, title, url, source, note, created_at")
    .in("notion_id", notionIds)
    .order("created_at", { ascending: true });

  for (const row of data ?? []) {
    const list = result[row.notion_id] ?? [];
    list.push({ id: row.id, notionId: row.notion_id, title: row.title, url: row.url, source: row.source, note: row.note, createdAt: row.created_at });
    result[row.notion_id] = list;
  }
  return result;
}

/**
 * Piste d'amélioration 2026-08-24 ("calculateur de doses contextuel") —
 * admin-authored weight-based dosing entries per notion. Never AI-written:
 * only an admin ever inserts into this table (see the migration).
 */
export async function getDoseCalculators(notionIds: string[]): Promise<Record<string, DoseCalculator[]>> {
  const result: Record<string, DoseCalculator[]> = {};
  if (notionIds.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_dose_calculators")
    .select("id, notion_id, label, dose_per_kg, dose_unit, max_dose, frequency, note, created_at")
    .in("notion_id", notionIds)
    .order("created_at", { ascending: true });

  for (const row of data ?? []) {
    const list = result[row.notion_id] ?? [];
    list.push({
      id: row.id,
      notionId: row.notion_id,
      label: row.label,
      dosePerKg: row.dose_per_kg,
      doseUnit: row.dose_unit,
      maxDose: row.max_dose,
      frequency: row.frequency,
      note: row.note,
      createdAt: row.created_at,
    });
    result[row.notion_id] = list;
  }
  return result;
}

export interface CaseJournalEntryWithNotion extends CaseJournalEntry {
  notionName: string | null;
}

/**
 * Piste d'amélioration 2026-08-24 ("journal de cas relié aux notions") —
 * this user's own private case-journal entries, newest first, with the
 * tagged notion's name resolved for display. RLS already scopes this to
 * the caller's own rows — userId is only used for the notion-count
 * sibling function below, not as a filter here.
 */
export async function getCaseJournalEntries(): Promise<CaseJournalEntryWithNotion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_case_journal_entries")
    .select("id, notion_id, title, body, created_at, updated_at")
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const notionIds = [...new Set(rows.map((r) => r.notion_id).filter((id): id is string => Boolean(id)))];
  const { data: notions } = notionIds.length > 0 ? await supabase.from("el_profesor_notions").select("id, name").in("id", notionIds) : { data: [] };
  const nameById = new Map((notions ?? []).map((n) => [n.id, n.name]));

  return rows.map((r) => ({
    id: r.id,
    notionId: r.notion_id,
    notionName: r.notion_id ? (nameById.get(r.notion_id) ?? null) : null,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Case count per notion for this user — the glossary's "X cas liés" badge. */
export async function getCaseJournalCountsByNotion(userId: string, notionIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (notionIds.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_case_journal_entries")
    .select("notion_id")
    .eq("user_id", userId)
    .in("notion_id", notionIds);

  for (const row of data ?? []) {
    if (!row.notion_id) continue;
    result[row.notion_id] = (result[row.notion_id] ?? 0) + 1;
  }
  return result;
}

/** Every notion with the fiches linked to it (cross-book context included), for the admin notions/contradictions screen. */
export async function getNotionSummaries(): Promise<NotionSummary[]> {
  const supabase = await createClient();
  const [{ data: notions }, { data: links }] = await Promise.all([
    supabase.from("el_profesor_notions").select("*").order("name", { ascending: true }),
    supabase.from("el_profesor_notion_links").select("notion_id, fiche_id"),
  ]);
  if (!notions || notions.length === 0) return [];

  const ficheIds = [...new Set((links ?? []).map((l) => l.fiche_id))];
  const ficheContexts = await resolveFicheContexts(ficheIds);

  return (notions as { id: string; name: string; created_at: string }[]).map((n) => ({
    notion: { id: n.id, name: n.name, createdAt: n.created_at } as Notion,
    fiches: (links ?? [])
      .filter((l) => l.notion_id === n.id)
      .map((l) => ficheContexts.get(l.fiche_id))
      .filter((f): f is NotionLinkedFiche => Boolean(f)),
  }));
}

export interface NotionReadiness {
  total: number;
  acquired: number;
  learning: number;
  /** 0 when the notion has no flashcards at all yet — distinct from "not started" in the UI, which reads acquired === 0 && total > 0. */
  readinessPct: number;
}

/**
 * Piste d'amélioration 2026-08-24 ("estimation de préparation par
 * notion") — for each cross-book notion, what fraction of its linked
 * fiches' published flashcards this user has actually mastered (FSRS
 * "review" state, same definition as getMasteryCountsByChapter's
 * "acquired"), live-computed from the same review state already used
 * everywhere else rather than a separate tracked stat.
 */
export async function getNotionReadiness(userId: string, notionSummaries: NotionSummary[]): Promise<Record<string, NotionReadiness>> {
  const result: Record<string, NotionReadiness> = {};
  const allFicheIds = [...new Set(notionSummaries.flatMap((n) => n.fiches.map((f) => f.ficheId)))];
  if (allFicheIds.length === 0) return result;

  const supabase = await createClient();
  const { data: cardRows } = await supabase
    .from("el_profesor_flashcards")
    .select("id, fiche_id")
    .in("fiche_id", allFicheIds)
    .eq("status", "published");
  const cards = cardRows ?? [];

  const cardsByFiche = new Map<string, string[]>();
  for (const c of cards) {
    const list = cardsByFiche.get(c.fiche_id) ?? [];
    list.push(c.id);
    cardsByFiche.set(c.fiche_id, list);
  }

  const { data: states } =
    cards.length > 0
      ? await supabase
          .from("el_profesor_review_state")
          .select("flashcard_id, state")
          .eq("user_id", userId)
          .in(
            "flashcard_id",
            cards.map((c) => c.id)
          )
      : { data: [] };
  const stateByCard = new Map((states ?? []).map((s) => [s.flashcard_id, s.state]));

  for (const { notion, fiches } of notionSummaries) {
    const cardIds = fiches.flatMap((f) => cardsByFiche.get(f.ficheId) ?? []);
    const total = cardIds.length;
    let acquired = 0;
    let learning = 0;
    for (const id of cardIds) {
      const state = stateByCard.get(id);
      if (state === "review") acquired++;
      else if (state === "learning" || state === "relearning") learning++;
    }
    result[notion.id] = { total, acquired, learning, readinessPct: total > 0 ? Math.round((acquired / total) * 100) : 0 };
  }

  return result;
}

/**
 * Near-duplicate flashcards across two different books' fiches, for every
 * notion that links fiches from more than one book — item 53 of the
 * backlog. Reuses the same deterministic bigram similarity as the existing
 * per-book duplicate detection (item 45), just sourced across the notion's
 * fiches instead of one book's, and only reports pairs that actually cross
 * a book boundary (same-book duplicates are already covered by item 45).
 */
export async function getCrossBookFlashcardDuplicates(): Promise<CrossBookDuplicateFlashcards[]> {
  const summaries = await getNotionSummaries();
  const supabase = await createClient();
  const results: CrossBookDuplicateFlashcards[] = [];

  for (const { notion, fiches } of summaries) {
    const distinctBooks = new Set(fiches.map((f) => f.bookId));
    if (fiches.length < 2 || distinctBooks.size < 2) continue;

    const { data: cardRows } = await supabase
      .from("el_profesor_flashcards")
      .select("id, front, fiche_id")
      .in(
        "fiche_id",
        fiches.map((f) => f.ficheId)
      )
      .eq("status", "published");
    const cards = (cardRows ?? []) as { id: string; front: FlashcardSide; fiche_id: string }[];
    if (cards.length < 2) continue;

    const byFiche = new Map<string, NotionLinkedFiche>(fiches.map((f) => [f.ficheId, f]));
    const flat = cards.map((c) => ({ id: c.id, front: c.front.text, ficheId: c.fiche_id }));
    const pairs = findDuplicateFlashcards(flat.map(({ id, front }) => ({ id, front })));

    const byFichePair = new Map<string, { ficheA: NotionLinkedFiche; ficheB: NotionLinkedFiche; pairs: { frontA: string; frontB: string; similarity: number }[] }>();
    for (const pair of pairs) {
      const cardA = flat.find((c) => c.id === pair.a.id);
      const cardB = flat.find((c) => c.id === pair.b.id);
      if (!cardA || !cardB || cardA.ficheId === cardB.ficheId) continue;
      const ficheA = byFiche.get(cardA.ficheId);
      const ficheB = byFiche.get(cardB.ficheId);
      if (!ficheA || !ficheB || ficheA.bookId === ficheB.bookId) continue;

      const key = [ficheA.ficheId, ficheB.ficheId].sort().join("|");
      const entry = byFichePair.get(key) ?? { ficheA, ficheB, pairs: [] };
      entry.pairs.push({ frontA: pair.a.front, frontB: pair.b.front, similarity: pair.similarity });
      byFichePair.set(key, entry);
    }

    for (const entry of byFichePair.values()) {
      results.push({ notionId: notion.id, notionName: notion.name, ...entry });
    }
  }

  return results;
}

/** Every currently merged/replaced fiche, for the admin "fusions & obsolescences" oversight list (with a way back via clearFicheSuperseded). */
export async function getSupersededFiches(): Promise<SupersededFicheEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_fiches")
    .select("id, superseded_by_fiche_id, superseded_reason, superseded_note")
    .not("superseded_by_fiche_id", "is", null);
  const rows = (data ?? []) as { id: string; superseded_by_fiche_id: string; superseded_reason: "duplicate" | "outdated"; superseded_note: string }[];
  if (rows.length === 0) return [];

  const contexts = await resolveFicheContexts([...rows.map((r) => r.id), ...rows.map((r) => r.superseded_by_fiche_id)]);

  return rows
    .map((row) => {
      const fiche = contexts.get(row.id);
      const supersededBy = contexts.get(row.superseded_by_fiche_id);
      if (!fiche || !supersededBy) return null;
      return { fiche, supersededBy, reason: row.superseded_reason, note: row.superseded_note } satisfies SupersededFicheEntry;
    })
    .filter((e): e is SupersededFicheEntry => Boolean(e));
}

/** Pending/resolved/dismissed contradiction findings, most recent first. */
export async function getContradictions(status?: ContradictionStatus): Promise<Contradiction[]> {
  const supabase = await createClient();
  let query = supabase.from("el_profesor_contradictions").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  if (!data || data.length === 0) return [];

  const ficheIds = [...new Set(data.flatMap((c) => [c.fiche_id_a, c.fiche_id_b]))];
  const ficheContexts = await resolveFicheContexts(ficheIds);

  const notionIds = [...new Set(data.map((c) => c.notion_id).filter((id): id is string => Boolean(id)))];
  const { data: notions } = notionIds.length
    ? await supabase.from("el_profesor_notions").select("id, name").in("id", notionIds)
    : { data: [] as { id: string; name: string }[] };
  const notionNameById = new Map((notions ?? []).map((n) => [n.id, n.name]));

  return data
    .map((c) => {
      const ficheA = ficheContexts.get(c.fiche_id_a);
      const ficheB = ficheContexts.get(c.fiche_id_b);
      if (!ficheA || !ficheB) return null;
      return {
        id: c.id,
        notionId: c.notion_id,
        notionName: c.notion_id ? (notionNameById.get(c.notion_id) ?? null) : null,
        ficheA,
        ficheB,
        explanation: c.explanation,
        status: c.status,
        resolutionNote: c.resolution_note,
        createdAt: c.created_at,
      } satisfies Contradiction;
    })
    .filter((c): c is Contradiction => Boolean(c));
}

/** Notion-update proposals for the admin review list on /notions — pending by default, or a specific status when passed. */
export async function getNotionUpdateProposals(status?: NotionUpdateProposalStatus): Promise<NotionUpdateProposal[]> {
  const supabase = await createClient();
  let query = supabase.from("el_profesor_notion_update_proposals").select("*").order("created_at", { ascending: false });
  query = status ? query.eq("status", status) : query.eq("status", "pending");
  const { data } = await query;
  if (!data || data.length === 0) return [];

  const ficheIds = [...new Set(data.map((p) => p.fiche_id))];
  const ficheContexts = await resolveFicheContexts(ficheIds);

  const notionIds = [...new Set(data.map((p) => p.notion_id))];
  const { data: notions } = await supabase.from("el_profesor_notions").select("id, name").in("id", notionIds);
  const notionNameById = new Map((notions ?? []).map((n) => [n.id, n.name]));

  return data
    .map((p) => {
      const fiche = ficheContexts.get(p.fiche_id);
      if (!fiche) return null;
      const additions = p.additions as unknown as { blocks: ExtractedFicheBlock[]; flashcards: ExtractedFlashcard[] };
      return {
        id: p.id,
        notionId: p.notion_id,
        notionName: notionNameById.get(p.notion_id) ?? "",
        fiche,
        sourceKind: p.source_kind,
        sourceExcerpt: p.source_excerpt,
        explanation: p.explanation,
        additions,
        status: p.status,
        createdAt: p.created_at,
      } satisfies NotionUpdateProposal;
    })
    .filter((p): p is NotionUpdateProposal => Boolean(p));
}
