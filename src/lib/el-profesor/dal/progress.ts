import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getChapterContent } from "./shared";
import type { Database } from "@/lib/supabase/types";
import type { Chapter } from "../types";

/**
 * Persisted reading + mastery progress for fiches and notion syntheses
 * (requested 2026-08-29). "Read" progress is the highest scroll
 * percentage ever reached in a fiche/synthesis (el_profesor_fiche_read_
 * progress / el_profesor_notion_read_progress — see that migration's own
 * doc comment for why it never regresses). "Mastery" progress is derived
 * on the fly from the same FSRS review state the dashboard's mastery
 * counts already use (state: new/learning/review) — no separate storage,
 * just scoped down to one fiche's or one notion's own flashcards instead
 * of a whole chapter's.
 */
export interface MasteryProgress {
  total: number;
  acquired: number;
  learning: number;
}

const EMPTY_MASTERY: MasteryProgress = { total: 0, acquired: 0, learning: 0 };

const IN_CHUNK_SIZE = 150;

/**
 * Supabase's .in() filter is serialized straight into the request's query
 * string. This library is easily into the hundreds of fiches/flashcards
 * (1500+ flashcards isn't unusual), and a single .in() over an id list
 * that size can exceed the request's URL-length limit — failing (or
 * silently coming back empty) rather than erroring loudly, which zeroes
 * out whatever library-wide aggregate depends on it. Every function below
 * that filters by a library-wide id list (as opposed to one chapter's or
 * one notion's own, small handful of ids) goes through this instead of a
 * single unbounded .in().
 */
async function selectInChunks<T>(
  ids: string[],
  runQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) chunks.push(ids.slice(i, i + IN_CHUNK_SIZE));
  const results = await Promise.all(chunks.map((chunk) => runQuery(chunk)));
  for (const r of results) if (r.error) console.error("[el-profesor/progress] chunked query failed:", r.error.message);
  return results.flatMap((r) => r.data ?? []);
}

/** Batched for a whole chapter's fiches at once — mirrors getBlockReviewStates' batching so the chapter page fetches every fiche's progress in one pass instead of one query per sub-entity. */
export async function getFicheReadProgressBatch(userId: string, ficheIds: string[]): Promise<Record<string, number>> {
  if (ficheIds.length === 0) return {};
  const supabase = await createClient();
  const rows = await selectInChunks(ficheIds, (chunk) =>
    supabase.from("el_profesor_fiche_read_progress").select("fiche_id, progress_pct").eq("user_id", userId).in("fiche_id", chunk)
  );
  const result: Record<string, number> = {};
  for (const row of rows) result[row.fiche_id] = row.progress_pct;
  return result;
}

export async function getNotionReadProgress(userId: string, notionId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_notion_read_progress")
    .select("progress_pct")
    .eq("user_id", userId)
    .eq("notion_id", notionId)
    .maybeSingle();
  return data?.progress_pct ?? 0;
}

async function masteryForFlashcardIds(supabase: SupabaseClient<Database>, userId: string, flashcardIds: string[]): Promise<MasteryProgress> {
  if (flashcardIds.length === 0) return EMPTY_MASTERY;
  const states = await selectInChunks(flashcardIds, (chunk) =>
    supabase.from("el_profesor_review_state").select("flashcard_id, state").eq("user_id", userId).in("flashcard_id", chunk)
  );
  let acquired = 0;
  let learning = 0;
  for (const s of states) {
    if (s.state === "review") acquired++;
    else if (s.state === "learning" || s.state === "relearning") learning++;
  }
  return { total: flashcardIds.length, acquired, learning };
}

/** Batched per-fiche mastery breakdown for a whole chapter — one flashcard fetch + one state fetch instead of one round trip per sub-entity. */
export async function getFicheMasteryProgressBatch(userId: string, ficheIds: string[]): Promise<Record<string, MasteryProgress>> {
  const result: Record<string, MasteryProgress> = {};
  for (const id of ficheIds) result[id] = { total: 0, acquired: 0, learning: 0 };
  if (ficheIds.length === 0) return result;

  const supabase = await createClient();
  const rows = await selectInChunks(ficheIds, (chunk) =>
    supabase.from("el_profesor_flashcards").select("id, fiche_id").in("fiche_id", chunk).eq("status", "published")
  );
  if (rows.length === 0) return result;

  const states = await selectInChunks(
    rows.map((c) => c.id),
    (chunk) => supabase.from("el_profesor_review_state").select("flashcard_id, state").eq("user_id", userId).in("flashcard_id", chunk)
  );
  const stateByCard = new Map(states.map((s) => [s.flashcard_id, s.state]));

  for (const c of rows) {
    const entry = result[c.fiche_id];
    entry.total++;
    const state = stateByCard.get(c.id);
    if (state === "review") entry.acquired++;
    else if (state === "learning" || state === "relearning") entry.learning++;
  }
  return result;
}

/** Every published flashcard across every non-superseded fiche linked to this notion — same "active" scope as the synthesis itself. */
export async function getNotionMasteryProgress(userId: string, notionId: string): Promise<MasteryProgress> {
  const supabase = await createClient();
  const { data: links } = await supabase.from("el_profesor_notion_links").select("fiche_id").eq("notion_id", notionId);
  const linkedIds = [...new Set((links ?? []).map((l) => l.fiche_id))];
  if (linkedIds.length === 0) return EMPTY_MASTERY;

  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id, superseded_by_fiche_id").in("id", linkedIds);
  const activeIds = (fiches ?? []).filter((f) => !f.superseded_by_fiche_id).map((f) => f.id);
  if (activeIds.length === 0) return EMPTY_MASTERY;

  const { data: cards } = await supabase.from("el_profesor_flashcards").select("id").in("fiche_id", activeIds).eq("status", "published");
  return masteryForFlashcardIds(
    supabase,
    userId,
    (cards ?? []).map((c) => c.id)
  );
}

/**
 * Average read % across each published chapter's own fiches (piste
 * 2026-08-29 — "visible directement depuis la vue principale"). Reuses the
 * same request-memoized getChapterContent already called by
 * getMasteryCountsByChapter (free via React's cache()), but — unlike a
 * first version of this function — fetches read progress for every
 * chapter's fiches in ONE getFicheReadProgressBatch call instead of one
 * query per chapter: with this in the dashboard's eager (awaited) block
 * alongside masteryCounts, a per-chapter query added a real N+1 (one extra
 * round trip per published chapter) that measurably delayed the page shell
 * and, transitively, every promise streamed after it — exactly what the
 * eager/deferred split exists to avoid.
 */
export async function getReadProgressByChapter(userId: string, chapters: Chapter[]): Promise<Record<string, number>> {
  const published = chapters.filter((c) => c.status === "published");
  const contentByChapter = await Promise.all(published.map((c) => getChapterContent(c.id, false)));

  const ficheIdsByChapter = new Map<string, string[]>();
  const allFicheIds = new Set<string>();
  published.forEach((chapter, i) => {
    const ficheIds = contentByChapter[i].flatMap((s) => (s.fiche ? [s.fiche.id] : []));
    ficheIdsByChapter.set(chapter.id, ficheIds);
    for (const id of ficheIds) allFicheIds.add(id);
  });

  const progress = await getFicheReadProgressBatch(userId, [...allFicheIds]);

  const result: Record<string, number> = {};
  for (const chapter of published) {
    const ficheIds = ficheIdsByChapter.get(chapter.id) ?? [];
    if (ficheIds.length === 0) {
      result[chapter.id] = 0;
      continue;
    }
    const sum = ficheIds.reduce((acc, id) => acc + (progress[id] ?? 0), 0);
    result[chapter.id] = Math.round(sum / ficheIds.length);
  }
  return result;
}

export interface NotionProgressEntry {
  readPct: number;
  mastery: MasteryProgress;
}

/**
 * Read % + mastery for every given notion in one pass (piste 2026-08-29 —
 * for the "Par notion" dashboard list, where showing this per card with
 * getNotionMasteryProgress's one-notion-at-a-time queries would mean N
 * round trips for N notions). Same "active" scope (non-superseded fiche,
 * published flashcard) as getNotionMasteryProgress.
 */
export async function getNotionProgressBatch(userId: string, notionIds: string[]): Promise<Record<string, NotionProgressEntry>> {
  const result: Record<string, NotionProgressEntry> = {};
  if (notionIds.length === 0) return result;
  const supabase = await createClient();

  const [readRows, links] = await Promise.all([
    selectInChunks(notionIds, (chunk) =>
      supabase.from("el_profesor_notion_read_progress").select("notion_id, progress_pct").eq("user_id", userId).in("notion_id", chunk)
    ),
    selectInChunks(notionIds, (chunk) => supabase.from("el_profesor_notion_links").select("notion_id, fiche_id").in("notion_id", chunk)),
  ]);
  const readByNotion = new Map(readRows.map((r) => [r.notion_id, r.progress_pct]));

  const ficheIdsByNotion = new Map<string, string[]>();
  const allFicheIds = new Set<string>();
  for (const l of links) {
    const list = ficheIdsByNotion.get(l.notion_id) ?? [];
    list.push(l.fiche_id);
    ficheIdsByNotion.set(l.notion_id, list);
    allFicheIds.add(l.fiche_id);
  }

  const fiches = await selectInChunks([...allFicheIds], (chunk) => supabase.from("el_profesor_fiches").select("id, superseded_by_fiche_id").in("id", chunk));
  const activeFicheIds = new Set(fiches.filter((f) => !f.superseded_by_fiche_id).map((f) => f.id));

  const cardRows = await selectInChunks([...activeFicheIds], (chunk) =>
    supabase.from("el_profesor_flashcards").select("id, fiche_id").in("fiche_id", chunk).eq("status", "published")
  );
  const allCardIds = cardRows.map((c) => c.id);
  const states = await selectInChunks(allCardIds, (chunk) =>
    supabase.from("el_profesor_review_state").select("flashcard_id, state").eq("user_id", userId).in("flashcard_id", chunk)
  );
  const stateByCard = new Map(states.map((s) => [s.flashcard_id, s.state]));

  const cardIdsByFiche = new Map<string, string[]>();
  for (const c of cardRows) {
    const list = cardIdsByFiche.get(c.fiche_id) ?? [];
    list.push(c.id);
    cardIdsByFiche.set(c.fiche_id, list);
  }

  for (const notionId of notionIds) {
    const ficheIds = (ficheIdsByNotion.get(notionId) ?? []).filter((id) => activeFicheIds.has(id));
    let total = 0;
    let acquired = 0;
    let learning = 0;
    for (const ficheId of ficheIds) {
      for (const cardId of cardIdsByFiche.get(ficheId) ?? []) {
        total++;
        const state = stateByCard.get(cardId);
        if (state === "review") acquired++;
        else if (state === "learning" || state === "relearning") learning++;
      }
    }
    result[notionId] = { readPct: readByNotion.get(notionId) ?? 0, mastery: { total, acquired, learning } };
  }
  return result;
}

export interface GlobalProgressSummary {
  readPct: number;
  mastery: MasteryProgress;
}

/**
 * Library-wide read % + mastery across every published, non-superseded
 * fiche (piste 2026-08-29 — the "barre globale" under the book list and
 * under the notion list). Same numbers in both places on purpose: it's
 * the same underlying set of fiches/flashcards either way, just a
 * different lens (by book vs. by notion) above it.
 */
export async function getGlobalProgressSummary(userId: string): Promise<GlobalProgressSummary> {
  const supabase = await createClient();
  const { data: fiches } = await supabase.from("el_profesor_fiches").select("id").eq("status", "published").is("superseded_by_fiche_id", null);
  const ficheIds = (fiches ?? []).map((f) => f.id);
  if (ficheIds.length === 0) return { readPct: 0, mastery: EMPTY_MASTERY };

  const [readRows, cards] = await Promise.all([
    selectInChunks(ficheIds, (chunk) => supabase.from("el_profesor_fiche_read_progress").select("progress_pct").eq("user_id", userId).in("fiche_id", chunk)),
    selectInChunks(ficheIds, (chunk) => supabase.from("el_profesor_flashcards").select("id").in("fiche_id", chunk).eq("status", "published")),
  ]);
  const readPct = Math.round(readRows.reduce((sum, r) => sum + r.progress_pct, 0) / ficheIds.length);
  const mastery = await masteryForFlashcardIds(
    supabase,
    userId,
    cards.map((c) => c.id)
  );
  return { readPct, mastery };
}
