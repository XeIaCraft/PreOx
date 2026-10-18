// Pure steps of the fusion between two AI stages: numbering the plan,
// resolving the model's aliases back to ids, sharing out the content of a
// source fiche that feeds several merged fiches, keeping each merged fiche
// to a size one answer can hold, and — the guarantee the whole feature
// rests on — placing whatever the model forgot somewhere, so that no source
// fiche, block, card or value is ever left out of the merged book.

import type { Citation } from "../types";
import { stableUuid } from "./ids";
import type { RawPlan } from "./schemas";
import type { MergePlan, SourceFicheRef } from "./types";

/** Number of fiches per assignment request: small enough for a short answer, large enough to keep the request count low. */
export const ASSIGN_CHUNK = 200;
/** Source fiches per sub-part the plan aims for: what one request can organise into chapters and fiches with care. */
export const FICHES_PER_SUB_PART = 90;
/**
 * Above this many characters of sources, a merged fiche is split: one
 * answer must hold the whole rewritten fiche and its cards, and a Gemini
 * call must end within one run of the queue (≈ 17 k tokens written at most).
 */
export const MAX_FICHE_SOURCE_CHARS = 55_000;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function targetSubPartCount(ficheCount: number): number {
  return Math.max(2, Math.min(150, Math.round(ficheCount / FICHES_PER_SUB_PART)));
}

/** Sub-parts get keys S1…Sn in reading order; their chapters come later (chapters stage). */
export function numberPlan(raw: RawPlan): MergePlan {
  let n = 0;
  return {
    parts: raw.parts
      .map((part) => ({
        title: part.title,
        subParts: part.sub_parts.filter((s) => s.title || s.scope).map((s) => ({ key: `S${++n}`, title: s.title, scope: s.scope, chapters: [] })),
      }))
      .filter((part) => part.subParts.length > 0),
  };
}

export interface FlatSubPart {
  key: string;
  title: string;
  scope: string;
  partTitle: string;
  orderIndex: number;
}

export function flattenSubParts(plan: MergePlan): FlatSubPart[] {
  const out: FlatSubPart[] = [];
  for (const part of plan.parts) for (const s of part.subParts) out.push({ key: s.key, title: s.title, scope: s.scope, partTitle: part.title, orderIndex: out.length });
  return out;
}

export interface FlatPlanChapter {
  key: string;
  title: string;
  chapterId: string;
  subPartKey: string;
  partTitle: string;
  subPartTitle: string | null;
  orderIndex: number;
}

export function flattenChapters(plan: MergePlan): FlatPlanChapter[] {
  const out: FlatPlanChapter[] = [];
  for (const part of plan.parts)
    for (const s of part.subParts)
      for (const c of s.chapters) out.push({ ...c, subPartKey: s.key, partTitle: part.title, subPartTitle: s.title || null, orderIndex: out.length });
  return out;
}

export function subPartPath(s: { partTitle: string; title: string }): string {
  return [s.partTitle, s.title].filter(Boolean).join(" > ");
}

export function chapterPath(c: FlatPlanChapter): string {
  return [c.partTitle, c.subPartTitle].filter(Boolean).join(" > ");
}

/** Plan with each sub-part's chapters filled in, ids stable for the job (a transition run twice upserts the same rows). */
export function withChapters(plan: MergePlan, jobId: string, titlesBySubPart: Map<string, string[]>): MergePlan {
  return {
    parts: plan.parts.map((p) => ({
      ...p,
      subParts: p.subParts.map((s) => ({
        ...s,
        chapters: (titlesBySubPart.get(s.key) ?? []).map((title, i) => {
          const key = `${s.key}.C${i + 1}`;
          return { key, title, chapterId: stableUuid(jobId, "chapter", key) };
        }),
      })),
    })),
  };
}

/**
 * Sub-part of every source fiche. A fiche the model left out (or sent to a
 * key that doesn't exist) follows its siblings: where most fiches of the
 * same source chapter went, else where the fiche just before it in reading
 * order went, else the first sub-part.
 */
export function resolveAssignments(
  keys: string[],
  fiches: SourceFicheRef[],
  answers: { aliasToFiche: Record<string, string>; assignments: { fiche: string; chapter: string }[] }[]
): { byKey: Map<string, string[]>; fallbackCount: number } {
  const valid = new Set(keys);
  const keyOf = new Map<string, string>();
  for (const answer of answers)
    for (const a of answer.assignments) {
      const ficheId = answer.aliasToFiche[a.fiche.toUpperCase()] ?? answer.aliasToFiche[a.fiche];
      const key = a.chapter.toUpperCase();
      if (ficheId && valid.has(key) && !keyOf.has(ficheId)) keyOf.set(ficheId, key);
    }

  let fallbackCount = 0;
  const votesBySourceChapter = new Map<string, Map<string, number>>();
  for (const f of fiches) {
    const key = keyOf.get(f.ficheId);
    if (!key) continue;
    const votes = votesBySourceChapter.get(f.chapterId) ?? new Map<string, number>();
    votes.set(key, (votes.get(key) ?? 0) + 1);
    votesBySourceChapter.set(f.chapterId, votes);
  }
  for (let i = 0; i < fiches.length; i++) {
    const f = fiches[i];
    if (keyOf.has(f.ficheId)) continue;
    fallbackCount++;
    let best: string | undefined = [...(votesBySourceChapter.get(f.chapterId)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
    for (let j = i - 1; !best && j >= 0; j--) best = keyOf.get(fiches[j].ficheId);
    keyOf.set(f.ficheId, best ?? keys[0]);
  }

  const byKey = new Map<string, string[]>(keys.map((k) => [k, []]));
  for (const f of fiches) byKey.get(keyOf.get(f.ficheId)!)!.push(f.ficheId);
  return { byKey, fallbackCount };
}

export interface PlannedFiche {
  title: string;
  objective: string;
  sourceFicheIds: string[];
}

export interface PlannedChapter {
  title: string;
  fiches: PlannedFiche[];
}

/**
 * Chapters and merged fiches of one sub-part, as the model organised them,
 * made safe: unknown aliases dropped, every source fiche of the sub-part
 * used at least once (a forgotten one becomes its own fiche, in the chapter
 * where its source-chapter siblings went), and every merged fiche kept to a
 * size one answer can hold (split in consecutive parts otherwise).
 */
export function resolveOutline(
  planned: { title: string; fiches: { title: string; objective: string; sources: string[] }[] }[],
  aliasToFiche: Record<string, string>,
  subFiches: SourceFicheRef[],
  fallbackChapterTitle: string,
  maxChars = MAX_FICHE_SOURCE_CHARS
): { chapters: PlannedChapter[]; fallbackCount: number; splitCount: number } {
  const refById = new Map(subFiches.map((f) => [f.ficheId, f]));
  const resolve = (a: string) => aliasToFiche[a.toUpperCase()] ?? aliasToFiche[a];
  const chapters: PlannedChapter[] = [];
  for (const c of planned) {
    const fiches: PlannedFiche[] = [];
    for (const f of c.fiches) {
      const ids = [...new Set(f.sources.map(resolve).filter((id): id is string => Boolean(id && refById.has(id))))];
      if (ids.length) fiches.push({ title: f.title, objective: f.objective, sourceFicheIds: ids });
    }
    if (fiches.length) chapters.push({ title: c.title || fallbackChapterTitle, fiches });
  }

  const used = new Set(chapters.flatMap((c) => c.fiches.flatMap((f) => f.sourceFicheIds)));
  let fallbackCount = 0;
  for (const f of subFiches) {
    if (used.has(f.ficheId)) continue;
    fallbackCount++;
    // The chapter holding most fiches of the same source chapter, else the last one.
    let target = chapters[chapters.length - 1];
    let bestScore = 0;
    for (const c of chapters) {
      const score = c.fiches.reduce((s, x) => s + x.sourceFicheIds.filter((id) => refById.get(id)?.chapterId === f.chapterId).length, 0);
      if (score > bestScore) {
        bestScore = score;
        target = c;
      }
    }
    if (!target) {
      target = { title: fallbackChapterTitle, fiches: [] };
      chapters.push(target);
    }
    target.fiches.push({ title: f.title, objective: f.summary, sourceFicheIds: [f.ficheId] });
    used.add(f.ficheId);
  }

  // A source fiche shared by several merged fiches only weighs its share on each.
  const shares = new Map<string, number>();
  for (const c of chapters) for (const f of c.fiches) for (const id of f.sourceFicheIds) shares.set(id, (shares.get(id) ?? 0) + 1);
  const weight = (id: string) => (refById.get(id)?.chars ?? 0) / (shares.get(id) ?? 1);
  let splitCount = 0;
  for (const c of chapters) {
    c.fiches = c.fiches.flatMap((f) => {
      const parts = splitBySize(f.sourceFicheIds, weight, maxChars);
      if (parts.length === 1) return [f];
      splitCount++;
      return parts.map((ids, i) => ({ title: `${f.title} (${i + 1}/${parts.length})`, objective: f.objective, sourceFicheIds: ids }));
    });
  }
  return { chapters, fallbackCount, splitCount };
}

/** Consecutive groups each under `max` (a single source larger than `max` stays alone). */
export function splitBySize(ids: string[], weight: (id: string) => number, max: number): string[][] {
  const total = ids.reduce((s, id) => s + weight(id), 0);
  if (total <= max || ids.length < 2) return [ids];
  const groups: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const id of ids) {
    const w = weight(id);
    if (current.length && size + w > max) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(id);
    size += w;
  }
  if (current.length) groups.push(current);
  return groups;
}

// -- Sharing out a source fiche that feeds several merged fiches ------------

const STOPWORDS = new Set(
  "avec dans pour plus moins chez sans sous entre leur leurs cette ceux celle celles donc ainsi alors aussi mais comme être sont était étant fait faire peut peuvent tout tous toute toutes très plus selon lors après avant pendant depuis vers contre elle elles nous vous dont quand quel quelle quels quelles autre autres même mêmes encore lorsque parce chaque certains certaines effet effets patient patients cas fiche fiches".split(
    " "
  ).map((w) => w.normalize("NFD").replace(/[̀-ͯ]/g, ""))
);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    out.add(raw.length > 6 ? raw.slice(0, 6) : raw);
  }
  return out;
}

/**
 * Sends each block or card of a shared source fiche to the merged fiche it
 * is about (word overlap with that fiche's title, objective and the content
 * of its other sources, rarer words counting more, longer profiles
 * weighed down): Albrecht's single fiche on
 * sugammadex gives its dosing to the dosing fiche and its side effects to
 * the side-effects fiche, instead of everything landing in the first one.
 * Ties and items with nothing in common go to the first target.
 */
export function routeItems(items: { id: string; text: string }[], targets: { key: string; profile: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  if (targets.length === 0) return out;
  const profiles = targets.map((t) => tokens(t.profile));
  const df = new Map<string, number>();
  for (const p of profiles) for (const tok of p) df.set(tok, (df.get(tok) ?? 0) + 1);
  for (const item of items) {
    const words = tokens(item.text);
    let best = 0;
    let bestScore = 0;
    profiles.forEach((p, i) => {
      let score = 0;
      for (const w of words) if (p.has(w)) score += Math.log(1 + targets.length / (df.get(w) ?? 1));
      // A long profile (a fiche with lots of content) mustn't win just by having more words.
      score /= Math.sqrt(Math.max(8, p.size));
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = i;
      }
    });
    out.set(item.id, targets[best].key);
  }
  return out;
}

// -- Coverage ---------------------------------------------------------------

/** Ids given to the model but claimed by no merged block/card, across the whole book. */
export function uncovered(given: Iterable<string>, claimed: Iterable<string>): string[] {
  const seen = new Set(claimed);
  return [...new Set(given)].filter((id) => !seen.has(id));
}

const UNIT = String.raw`(?:%|‰|mg|µg|μg|mcg|ng|g|kg|ml|mL|dl|dL|l|L|µl|mmol|µmol|mEq|mOsm|UI|U|min|h|s|sec|ms|mmHg|cmH2O|cmH₂O|kPa|bpm|Hz|mA|J|kcal|cm|mm|°C|°|ans?|mois|jours?|semaines?)`;
const FACT = new RegExp(String.raw`(\d+(?:[.,]\d+)?)(\s?${UNIT}(?![a-zA-Zµμ]))?`, "g");

function normalizeNumber(n: string): string {
  let v = n.replace(",", ".");
  if (v.includes(".")) v = v.replace(/0+$/, "").replace(/\.$/, "");
  return v.replace(/^0+(?=\d)/, "");
}

/**
 * The numbers a text states — doses, thresholds, percentages, durations —
 * as comparable keys ("0.6mg", "90%", "1044"). A bare single digit
 * ("étape 2", "T4/T1") says nothing on its own and is left out; with a unit
 * it counts ("2 mg/kg" → "2mg"). Thousands separators are ignored.
 */
export function numericFacts(text: string): Set<string> {
  const out = new Set<string>();
  const flat = text.replace(/(\d)[\s  ](\d{3})(?!\d)/g, "$1$2");
  for (const m of flat.matchAll(FACT)) {
    const number = normalizeNumber(m[1]);
    const unit = m[2]?.trim().replace(/^(ans?|jours?|semaines?)$/, (u) => u.replace(/s$/, ""));
    if (unit) out.add(`${number}${unit.toLowerCase()}`);
    else if (number.length >= 2) out.add(number);
  }
  return out;
}

/**
 * Values of the source that the merged text no longer states. A distinctive
 * number (two digits or more: "1044", "0.6", "16") counts as kept wherever
 * it appears, whatever unit is written next to it ("1044 s" / "1044
 * secondes"); a single digit only counts with the same unit ("2 mg").
 */
export function missingFacts(sourceText: string, mergedFacts: Set<string>): string[] {
  const numberOf = (f: string) => f.match(/^[\d.]+/)?.[0] ?? f;
  const bare = new Set([...mergedFacts].map(numberOf));
  return [...numericFacts(sourceText)].filter((f) => {
    if (mergedFacts.has(f)) return false;
    const n = numberOf(f);
    return !(n.replace(".", "").length >= 2 && bare.has(n));
  });
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
