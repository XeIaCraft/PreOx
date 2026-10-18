// Pure steps of the fusion between two AI stages: numbering the plan,
// resolving the model's aliases back to ids, and — the guarantee the whole
// feature rests on — placing whatever the model forgot somewhere, so that
// no source fiche, block or card is ever left out of the merged book.

import type { Citation } from "../types";
import { stableUuid } from "./ids";
import type { RawPlan } from "./schemas";
import type { MergePlan, MergePlanChapter, SourceFicheRef } from "./types";

/** Chapters get keys C1…Cn in reading order and an id stable for this job. */
export function numberPlan(raw: RawPlan, jobId: string): MergePlan {
  let n = 0;
  return {
    parts: raw.parts
      .map((part) => ({
        title: part.title,
        subParts: part.sub_parts
          .map((sub) => ({
            title: sub.title,
            chapters: sub.chapters.map((c): MergePlanChapter => {
              const key = `C${++n}`;
              return { key, title: c.title, scope: c.scope, chapterId: stableUuid(jobId, "chapter", key) };
            }),
          }))
          .filter((sub) => sub.chapters.length > 0),
      }))
      .filter((part) => part.subParts.length > 0),
  };
}

export interface FlatPlanChapter extends MergePlanChapter {
  partTitle: string;
  subPartTitle: string | null;
  orderIndex: number;
}

export function flattenPlan(plan: MergePlan): FlatPlanChapter[] {
  const out: FlatPlanChapter[] = [];
  for (const part of plan.parts)
    for (const sub of part.subParts)
      for (const c of sub.chapters) out.push({ ...c, partTitle: part.title, subPartTitle: sub.title || null, orderIndex: out.length });
  return out;
}

export function chapterPath(c: FlatPlanChapter): string {
  return [c.partTitle, c.subPartTitle].filter(Boolean).join(" > ");
}

/**
 * Chapter of every source fiche. A fiche the model left out (or sent to a
 * key that doesn't exist) follows its siblings: the chapter most fiches of
 * the same source chapter went to, else the chapter of the fiche just before
 * it in reading order, else the first chapter.
 */
export function resolveAssignments(
  chapterKeys: string[],
  fiches: SourceFicheRef[],
  answers: { aliasToFiche: Record<string, string>; assignments: { fiche: string; chapter: string }[] }[]
): { byChapter: Map<string, string[]>; fallbackCount: number } {
  const valid = new Set(chapterKeys);
  const chapterOf = new Map<string, string>();
  for (const answer of answers)
    for (const a of answer.assignments) {
      const ficheId = answer.aliasToFiche[a.fiche.toUpperCase()] ?? answer.aliasToFiche[a.fiche];
      const key = a.chapter.toUpperCase();
      if (ficheId && valid.has(key) && !chapterOf.has(ficheId)) chapterOf.set(ficheId, key);
    }

  let fallbackCount = 0;
  for (let i = 0; i < fiches.length; i++) {
    const f = fiches[i];
    if (chapterOf.has(f.ficheId)) continue;
    fallbackCount++;
    const votes = new Map<string, number>();
    for (const g of fiches) {
      const key = g.chapterId === f.chapterId ? chapterOf.get(g.ficheId) : undefined;
      if (key) votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    let best: string | undefined = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    for (let j = i - 1; !best && j >= 0; j--) best = chapterOf.get(fiches[j].ficheId);
    chapterOf.set(f.ficheId, best ?? chapterKeys[0]);
  }

  const byChapter = new Map<string, string[]>(chapterKeys.map((k) => [k, []]));
  for (const f of fiches) byChapter.get(chapterOf.get(f.ficheId)!)!.push(f.ficheId);
  return { byChapter, fallbackCount };
}

export interface PlannedFiche {
  title: string;
  objective: string;
  sourceFicheIds: string[];
}

/** Merged fiches of one chapter, with every source fiche of the chapter used at least once (a forgotten one gets a fiche of its own). */
export function resolveChapterPlan(
  planned: { title: string; objective: string; sources: string[] }[],
  aliasToFiche: Record<string, string>,
  chapterFiches: SourceFicheRef[]
): { fiches: PlannedFiche[]; fallbackCount: number } {
  const inChapter = new Set(chapterFiches.map((f) => f.ficheId));
  const used = new Set<string>();
  const fiches: PlannedFiche[] = [];
  for (const p of planned) {
    const ids = [...new Set(p.sources.map((a) => aliasToFiche[a.toUpperCase()] ?? aliasToFiche[a]).filter((id): id is string => Boolean(id && inChapter.has(id))))];
    if (ids.length === 0) continue;
    ids.forEach((id) => used.add(id));
    fiches.push({ title: p.title, objective: p.objective, sourceFicheIds: ids });
  }
  let fallbackCount = 0;
  for (const f of chapterFiches) {
    if (used.has(f.ficheId)) continue;
    fallbackCount++;
    fiches.push({ title: f.title, objective: f.summary, sourceFicheIds: [f.ficheId] });
  }
  return { fiches, fallbackCount };
}

/** A source fiche feeding several merged fiches gives its cards to the first one only — the same card never lands in two review queues. */
export function cardOwners(fiches: { key: string; sourceFicheIds: string[] }[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const f of fiches) for (const id of f.sourceFicheIds) if (!owner.has(id)) owner.set(id, f.key);
  return owner;
}

/** Ids given to the model but claimed by no merged block/card, across the whole book. */
export function uncovered(given: Iterable<string>, claimed: Iterable<string>): string[] {
  const seen = new Set(claimed);
  return [...new Set(given)].filter((id) => !seen.has(id));
}

/**
 * Citations of a merged block: those of every source block it draws from,
 * each pointing at its own source chapter (whose PDF the reader opens),
 * without duplicates. A source block with no citation still leaves a trace
 * (page 0 = "no page to show") so the reader sees which book it came from.
 */
export function mergeCitations(
  sources: { id: string; chapterId: string; bookTitle: string; chapterTitle: string; citations: Citation[] }[],
  limit = 12
): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const list = s.citations.length ? s.citations : [{ page: 0, quote: "" }];
    for (const c of list) {
      const key = `${s.chapterId}|${c.page}|${c.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ page: c.page, quote: c.quote, chapterId: s.chapterId, bookTitle: s.bookTitle, chapterTitle: s.chapterTitle, sourceBlockId: s.id });
    }
  }
  return out.slice(0, limit);
}

/** Number of fiches per assignment request: small enough for a short answer, large enough to keep the request count low. */
export const ASSIGN_CHUNK = 200;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
