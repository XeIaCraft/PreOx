// How a book is cut into volumes for export (choice made with the user: an
// airy « fiche » layout, so the merged book — 4,900 fiches, ~11,000 pages —
// is printed as a set of tomes rather than one file). Tomes are sized by
// their pages, estimated from each chapter's amount of text: the merged
// book's parts differ too much in density for the number of fiches to do.
// A tome ends at a part boundary when it can: small neighbouring parts share
// one, a part too big for one is cut between its sub-parts into tomes of
// similar size.

export type VolumeChapter = { id: string; partTitle: string | null; subPartTitle: string | null; ficheCount: number; pages: number };

export type VolumePlan = {
  number: number;
  /** « Pharmacologie générale… (1/2) », or the parts joined with « · ». */
  title: string;
  partTitles: string[];
  chapterIds: string[];
  ficheCount: number;
  pages: number;
};

/** Characters of block content (as stored, jsonb text) per page of the airy PDF — measured on two tomes of the merged book. */
export const CHARS_PER_PAGE = 2950;
/** Without text sizes (migration 105 not applied yet): the merged book's average. */
export const PAGES_PER_FICHE = 2.6;

/** Estimated pages of a chapter: its text, plus the page each chapter opens. */
export function chapterPages(chars: number | null, fiches: number): number {
  return (chars !== null ? chars / CHARS_PER_PAGE : fiches * PAGES_PER_FICHE) + 0.5;
}

/** A tome of about 500 pages. */
export const TARGET_PAGES = 500;
/** Up to this size a part stays whole, and neighbouring small parts share a tome, rather than leaving thin tomes. */
const MAX_PAGES = 640;
/** A tome thinner than this joins a neighbour… */
const THIN_PAGES = 300;
/** …as long as the two together stay under this. */
const MERGED_MAX_PAGES = 860;

type Group = { partTitle: string | null; subPartTitle: string | null; chapters: VolumeChapter[]; pages: number; fiches: number };

const group = (c: VolumeChapter): Group => ({ partTitle: c.partTitle, subPartTitle: c.subPartTitle, chapters: [c], pages: c.pages, fiches: c.ficheCount });
const sum = (groups: Group[], key: "pages" | "fiches") => groups.reduce((n, g) => n + g[key], 0);

export function planVolumes(chapters: VolumeChapter[]): VolumePlan[] {
  const parts: Group[][] = [];
  for (const c of chapters) {
    const part = parts.at(-1);
    if (!part || part[0].partTitle !== c.partTitle) parts.push([group(c)]);
    else {
      const sub = part.at(-1)!;
      if (sub.subPartTitle === c.subPartTitle) {
        sub.chapters.push(c);
        sub.pages += c.pages;
        sub.fiches += c.ficheCount;
      } else part.push(group(c));
    }
  }

  type Draft = { partTitles: string[]; groups: Group[]; piece?: [number, number] };
  const drafts: Draft[] = [];
  let open: Draft | null = null;
  for (const subParts of parts) {
    const title = subParts[0].partTitle ?? "Sans partie";
    const pages = sum(subParts, "pages");
    if (pages > MAX_PAGES) {
      open = null;
      const pieces = splitBalanced(subParts, Math.max(2, Math.round(pages / TARGET_PAGES)));
      pieces.forEach((groups, i) => drafts.push({ partTitles: [title], groups, piece: [i + 1, pieces.length] }));
      continue;
    }
    if (open && sum(open.groups, "pages") + pages <= MAX_PAGES) {
      open.partTitles.push(title);
      open.groups.push(...subParts);
    } else {
      open = { partTitles: [title], groups: [...subParts] };
      drafts.push(open);
    }
  }

  // A thin tome (one small part on its own) joins a neighbour holding whole parts, when the two stay readable.
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const pages = sum(d.groups, "pages");
    if (d.piece || pages >= THIN_PAGES) continue;
    const size = (o: Draft | undefined) => (o && !o.piece ? sum(o.groups, "pages") + pages : Infinity);
    const prev = size(drafts[i - 1]);
    const next = size(drafts[i + 1]);
    if (Math.min(prev, next) > MERGED_MAX_PAGES) continue;
    if (prev <= next) {
      drafts[i - 1].partTitles.push(...d.partTitles);
      drafts[i - 1].groups.push(...d.groups);
    } else {
      drafts[i + 1].partTitles.unshift(...d.partTitles);
      drafts[i + 1].groups.unshift(...d.groups);
    }
    drafts.splice(i, 1);
    i--;
  }

  return drafts.map((d, i) => ({
    number: i + 1,
    title: d.piece && d.piece[1] > 1 ? `${d.partTitles[0]} (${d.piece[0]}/${d.piece[1]})` : joinTitles(d.partTitles),
    partTitles: d.partTitles,
    chapterIds: d.groups.flatMap((g) => g.chapters.map((c) => c.id)),
    ficheCount: sum(d.groups, "fiches"),
    pages: Math.round(sum(d.groups, "pages")),
  }));
}

/** « Spécialité : tête, cou · Spécialité : thorax » reads « Spécialité : tête, cou · thorax ». */
export function joinTitles(titles: string[]): string {
  const prefixes = titles.map((t) => (t.includes(" : ") ? t.slice(0, t.indexOf(" : ")) : null));
  if (titles.length > 1 && prefixes[0] && prefixes.every((p) => p === prefixes[0])) return `${prefixes[0]} : ${titles.map((t) => t.slice(prefixes[0]!.length + 3)).join(" · ")}`;
  return titles.join(" · ");
}

/**
 * Cuts a part, in order, into `count` runs of similar size: each cut lands on
 * the sub-part boundary nearest its target when one is close enough,
 * otherwise between two chapters.
 */
function splitBalanced(subParts: Group[], count: number): Group[][] {
  const chapters = subParts.flatMap((s) => s.chapters.map((c, i) => ({ chapter: c, startsSubPart: i === 0 })));
  const total = chapters.reduce((n, c) => n + c.chapter.pages, 0);
  const window = (total / count) * 0.18;
  // Cumulative pages before each chapter (a possible cut).
  const before: number[] = [];
  chapters.reduce((n, c, i) => ((before[i] = n), n + c.chapter.pages), 0);
  const cuts: number[] = [];
  for (let k = 1; k < count; k++) {
    const target = (total * k) / count;
    const from = (cuts.at(-1) ?? 0) + 1;
    let best = -1;
    let bestSub = -1;
    for (let i = from; i < chapters.length - (count - k - 1); i++) {
      if (best === -1 || Math.abs(before[i] - target) < Math.abs(before[best] - target)) best = i;
      if (chapters[i].startsSubPart && Math.abs(before[i] - target) <= window && (bestSub === -1 || Math.abs(before[i] - target) < Math.abs(before[bestSub] - target))) bestSub = i;
    }
    if (best === -1) break;
    cuts.push(bestSub !== -1 ? bestSub : best);
  }
  const bounds = [0, ...cuts, chapters.length];
  return bounds.slice(0, -1).map((start, i) => chapters.slice(start, bounds[i + 1]).map((c) => group(c.chapter)));
}
