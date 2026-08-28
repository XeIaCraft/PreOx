export interface ChapterSplitRangeInput {
  title: string;
  startPage: number;
  endPage: number;
}

/**
 * Validates that `ranges` forms an EXACT contiguous partition of pages
 * 1..pageCount — every page assigned to exactly one part, no gaps, no
 * overlaps, first part starts at 1, last part ends at pageCount. Stricter
 * than split-book.ts's row validation (a whole-book split may legitimately
 * skip front matter/appendices); splitting one existing chapter must never
 * silently drop content. Returns null when valid, else a French, user-facing
 * message naming the offending part.
 */
export function validateChapterSplitRanges(ranges: ChapterSplitRangeInput[], pageCount: number): string | null {
  if (ranges.length < 2) return "Il faut au moins 2 parties pour diviser ce chapitre.";
  for (const r of ranges) {
    if (!r.title.trim()) return "Chaque partie doit avoir un titre.";
    if (!Number.isInteger(r.startPage) || !Number.isInteger(r.endPage)) return "Les pages doivent être des nombres entiers.";
    if (r.startPage < 1 || r.endPage < r.startPage) return `Plage de pages invalide pour « ${r.title} ».`;
  }

  const sorted = [...ranges].sort((a, b) => a.startPage - b.startPage);
  if (sorted[0].startPage !== 1) return "La première partie doit commencer à la page 1.";
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startPage !== sorted[i - 1].endPage + 1) {
      return `Les pages doivent se suivre sans trou ni chevauchement (partie « ${sorted[i].title} »).`;
    }
  }
  const last = sorted[sorted.length - 1];
  if (last.endPage !== pageCount) {
    return `La dernière partie doit finir à la page ${pageCount} (fin du chapitre, ${pageCount} page${pageCount > 1 ? "s" : ""}).`;
  }
  return null;
}
